import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sessionsTable, scanRecordsTable, bomItemsTable, bomsTable } from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/sessions", async (req, res) => {
  try {
    const sessions = await db.select().from(sessionsTable).orderBy(sessionsTable.createdAt);
    const bomIds = [...new Set(sessions.map((s) => s.bomId))];
    let bomMap = new Map<number, string>();
    if (bomIds.length > 0) {
      const boms = await db.select().from(bomsTable);
      bomMap = new Map(boms.map((b) => [b.id, b.name]));
    }
    const result = sessions.map((s) => ({
      ...s,
      bomName: bomMap.get(s.bomId) ?? "",
    }));
    res.json(result);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list sessions" });
  }
});

router.post("/sessions", async (req, res) => {
  try {
    const {
      bomId, companyName, customerName, panelName, supervisorName,
      operatorName, shiftName, shiftDate, logoUrl, productionCount,
    } = req.body;

    if (!bomId || !companyName || !panelName || !supervisorName || !operatorName || !shiftName || !shiftDate) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    const [session] = await db
      .insert(sessionsTable)
      .values({
        bomId, companyName, customerName, panelName, supervisorName,
        operatorName, shiftName, shiftDate, logoUrl, productionCount: productionCount ?? 0,
        status: "active",
      })
      .returning();

    const [bom] = await db.select().from(bomsTable).where(eq(bomsTable.id, bomId));
    res.status(201).json({ ...session, bomName: bom?.name ?? "" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to create session" });
  }
});

router.get("/sessions/:sessionId", async (req, res) => {
  try {
    const sessionId = Number(req.params.sessionId);
    const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const scans = await db.select().from(scanRecordsTable).where(eq(scanRecordsTable.sessionId, sessionId)).orderBy(scanRecordsTable.scannedAt);
    const [bom] = await db.select().from(bomsTable).where(eq(bomsTable.id, session.bomId));
    res.json({ ...session, bomName: bom?.name ?? "", scans });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get session" });
  }
});

router.patch("/sessions/:sessionId", async (req, res) => {
  try {
    const sessionId = Number(req.params.sessionId);
    const { endTime, productionCount, status, logoUrl } = req.body;
    const updates: Record<string, unknown> = {};
    if (endTime !== undefined) updates.endTime = new Date(endTime);
    if (productionCount !== undefined) updates.productionCount = productionCount;
    if (status !== undefined) updates.status = status;
    if (logoUrl !== undefined) updates.logoUrl = logoUrl;

    const [updated] = await db
      .update(sessionsTable)
      .set(updates)
      .where(eq(sessionsTable.id, sessionId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const [bom] = await db.select().from(bomsTable).where(eq(bomsTable.id, updated.bomId));
    res.json({ ...updated, bomName: bom?.name ?? "" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update session" });
  }
});

router.post("/sessions/:sessionId/scans", async (req, res) => {
  try {
    const sessionId = Number(req.params.sessionId);
    const { feederNumber } = req.body;

    if (!feederNumber) {
      res.status(400).json({ error: "feederNumber is required" });
      return;
    }

    const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const bomItems = await db.select().from(bomItemsTable).where(eq(bomItemsTable.bomId, session.bomId));
    const matched = bomItems.find(
      (item) => item.feederNumber.trim().toLowerCase() === feederNumber.trim().toLowerCase()
    );

    const scanStatus = matched ? "ok" : "reject";
    const [scan] = await db
      .insert(scanRecordsTable)
      .values({
        sessionId,
        feederNumber: feederNumber.trim(),
        status: scanStatus,
        partNumber: matched?.partNumber ?? null,
        description: matched?.description ?? null,
        location: matched?.location ?? null,
      })
      .returning();

    const message = matched
      ? `Feeder ${feederNumber} verified OK — Part: ${matched.partNumber}`
      : `Feeder ${feederNumber} NOT in BOM — REJECTED`;

    res.json({ scan, status: scanStatus, message });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to scan feeder" });
  }
});

router.get("/sessions/:sessionId/summary", async (req, res) => {
  try {
    const sessionId = Number(req.params.sessionId);
    const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const bomItems = await db.select().from(bomItemsTable).where(eq(bomItemsTable.bomId, session.bomId));
    const scans = await db.select().from(scanRecordsTable).where(eq(scanRecordsTable.sessionId, sessionId));

    const totalBomItems = bomItems.length;
    const scannedCount = scans.length;
    const okCount = scans.filter((s) => s.status === "ok").length;
    const rejectCount = scans.filter((s) => s.status === "reject").length;

    const scannedFeederNumbers = new Set(
      scans.filter((s) => s.status === "ok").map((s) => s.feederNumber.trim().toLowerCase())
    );
    const missingCount = bomItems.filter(
      (item) => !scannedFeederNumbers.has(item.feederNumber.trim().toLowerCase())
    ).length;

    const completionPercent = totalBomItems > 0 ? Math.round((okCount / totalBomItems) * 100) : 0;

    const now = new Date();
    const start = new Date(session.startTime);
    const end = session.endTime ? new Date(session.endTime) : now;
    const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);

    res.json({
      sessionId,
      totalBomItems,
      scannedCount,
      okCount,
      rejectCount,
      missingCount,
      completionPercent,
      durationMinutes,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get session summary" });
  }
});

router.get("/sessions/:sessionId/report", async (req, res) => {
  try {
    const sessionId = Number(req.params.sessionId);
    const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const scans = await db.select().from(scanRecordsTable).where(eq(scanRecordsTable.sessionId, sessionId)).orderBy(scanRecordsTable.scannedAt);
    const bomItems = await db.select().from(bomItemsTable).where(eq(bomItemsTable.bomId, session.bomId));
    const [bom] = await db.select().from(bomsTable).where(eq(bomsTable.id, session.bomId));

    const totalBomItems = bomItems.length;
    const okCount = scans.filter((s) => s.status === "ok").length;
    const rejectCount = scans.filter((s) => s.status === "reject").length;
    const scannedFeederNumbers = new Set(scans.filter((s) => s.status === "ok").map((s) => s.feederNumber.trim().toLowerCase()));
    const missingCount = bomItems.filter((item) => !scannedFeederNumbers.has(item.feederNumber.trim().toLowerCase())).length;
    const completionPercent = totalBomItems > 0 ? Math.round((okCount / totalBomItems) * 100) : 0;
    const start = new Date(session.startTime);
    const end = session.endTime ? new Date(session.endTime) : new Date();
    const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);

    res.json({
      session: { ...session, bomName: bom?.name ?? "", scans },
      summary: {
        sessionId,
        totalBomItems,
        scannedCount: scans.length,
        okCount,
        rejectCount,
        missingCount,
        completionPercent,
        durationMinutes,
      },
      bomItems,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get session report" });
  }
});

export default router;
