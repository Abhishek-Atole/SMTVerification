import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sessionsTable, scanRecordsTable, spliceRecordsTable, bomItemsTable, bomsTable } from "@workspace/db/schema";
import { eq, and, sql, isNull, isNotNull } from "drizzle-orm";

const router: IRouter = Router();

// Static routes
router.get("/sessions", async (req, res) => {
  try {
    // Only show non-deleted sessions (where deletedAt is null)
    const sessions = await db
      .select()
      .from(sessionsTable)
      .where(isNull(sessionsTable.deletedAt))
      .orderBy(sessionsTable.createdAt);
    
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
    const errorMessage = err instanceof Error ? err.message : String(err);
    req.log.error({ error: err, message: errorMessage });
    res.status(500).json({ 
      error: "Failed to list sessions",
      details: errorMessage,
      type: err instanceof Error ? err.constructor.name : typeof err,
      isDrizzle: errorMessage.includes("Failed query")
    });
  }
});

router.post("/sessions", async (req, res) => {
  try {
    const {
      bomId, companyName, customerName, panelName, supervisorName,
      operatorName, qaName, shiftName, shiftDate, logoUrl, productionCount,
    } = req.body;

    // Allow bomId to be 0 (free scan) or a valid BOM ID, but not null/undefined
    if (bomId == null || !companyName || !panelName || !supervisorName || !operatorName || !shiftName || !shiftDate) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    // Convert bomId = 0 (free scan mode) to null for database storage
    const finalBomId = bomId === 0 ? null : bomId;

    const [session] = await db
      .insert(sessionsTable)
      .values({
        bomId: finalBomId, companyName, customerName, panelName, supervisorName,
        operatorName, qaName, shiftName, shiftDate, logoUrl,
        productionCount: productionCount ?? 0,
        status: "active",
      })
      .returning();

    let bomName = "";
    if (finalBomId !== null) {
      const [bom] = await db.select().from(bomsTable).where(eq(bomsTable.id, finalBomId));
      bomName = bom?.name ?? "";
    }
    res.status(201).json({ ...session, bomName });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to create session" });
  }
});

// Trash bin routes (must be before parametric routes to avoid :sessionId shadowing)
router.get("/sessions/trash/all", async (req, res) => {
  try {
    const deletedSessions = await db
      .select()
      .from(sessionsTable)
      .where((sess) => sql`${sess.deletedAt} IS NOT NULL`)
      .orderBy(sessionsTable.deletedAt);

    const bomIds = [...new Set(deletedSessions.map((s) => s.bomId).filter(Boolean))];
    let bomMap = new Map<number, string>();
    if (bomIds.length > 0) {
      const boms = await db.select().from(bomsTable);
      bomMap = new Map(boms.map((b) => [b.id, b.name]));
    }

    const result = deletedSessions.map((s) => ({
      ...s,
      bomName: bomMap.get(s.bomId ?? 0) ?? "",
    }));
    res.json(result);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list deleted sessions" });
  }
});

router.patch("/sessions/:sessionId/recover", async (req, res) => {
  try {
    const sessionId = Number(req.params.sessionId);

    // Check if session exists and is deleted
    const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    if (!session.deletedAt) {
      res.status(400).json({ error: "Session is not deleted" });
      return;
    }

    // Restore: set deletedAt to null
    const [restored] = await db
      .update(sessionsTable)
      .set({ deletedAt: null })
      .where(eq(sessionsTable.id, sessionId))
      .returning();

    const [bom] = await db.select().from(bomsTable).where(eq(bomsTable.id, restored.bomId));
    res.json({ ...restored, bomName: bom?.name ?? "" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to recover session" });
  }
});

// Parametric routes
router.get("/sessions/:sessionId", async (req, res) => {
  try {
    const sessionId = Number(req.params.sessionId);
    const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const scans = await db.select().from(scanRecordsTable).where(eq(scanRecordsTable.sessionId, sessionId)).orderBy(scanRecordsTable.scannedAt);
    
    // Only query BOM if not in free scan mode (bomId is not NULL)
    let bomName = "";
    if (session.bomId !== null) {
      const [bom] = await db.select().from(bomsTable).where(eq(bomsTable.id, session.bomId));
      bomName = bom?.name ?? "";
    }
    
    res.json({ ...session, bomName, scans });
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
    const { feederNumber, spoolBarcode, selectedItemId } = req.body;

    if (!feederNumber) {
      res.status(400).json({ error: "feederNumber is required" });
      return;
    }

    const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    // Check if this is Free Scan Mode (bomId is NULL)
    const isFreeScanMode = session.bomId === null;

    let scanStatus = "ok";
    let selectedItem = null;
    let primaryItems: any[] = [];
    let alternateItems: any[] = [];
    let message = "";

    if (isFreeScanMode) {
      // Free Scan Mode: Accept any feeder, no BOM validation
      scanStatus = "ok";
      message = `Feeder ${feederNumber} scanned (Free Scan Mode — no BOM validation)`;
    } else {
      // BOM Validation Mode: Check against BOM
      const bomItems = await db.select().from(bomItemsTable).where(eq(bomItemsTable.bomId, session.bomId));

      // Find primary item and alternates
      primaryItems = bomItems.filter(
        (item) =>
          item.feederNumber.trim().toLowerCase() === feederNumber.trim().toLowerCase() &&
          !item.isAlternate
      );

      alternateItems = bomItems.filter(
        (item) =>
          item.feederNumber.trim().toLowerCase() === feederNumber.trim().toLowerCase() &&
          item.isAlternate
      );

      // Determine which item was selected
      selectedItem = primaryItems[0];
      let usedAlternate = false;

      if (selectedItemId) {
        const specified = bomItems.find((item) => item.id === selectedItemId);
        if (specified && specified.feederNumber.trim().toLowerCase() === feederNumber.trim().toLowerCase()) {
          selectedItem = specified;
          usedAlternate = specified.isAlternate ?? false;
        }
      }

      scanStatus = selectedItem ? "ok" : "reject";
      message = selectedItem
        ? `Feeder ${feederNumber} verified OK — Part: ${selectedItem.partNumber}${usedAlternate ? " (ALTERNATE)" : ""}`
        : `Feeder ${feederNumber} NOT in BOM — REJECTED`;
    }

    const [scan] = await db
      .insert(scanRecordsTable)
      .values({
        sessionId,
        feederNumber: feederNumber.trim(),
        spoolBarcode: spoolBarcode?.trim() ?? null,
        status: scanStatus,
        partNumber: selectedItem?.partNumber ?? null,
        description: selectedItem?.description ?? null,
        location: selectedItem?.location ?? null,
      })
      .returning();

    res.json({
      scan,
      status: scanStatus,
      message,
      availableOptions: {
        primary: primaryItems.map((item) => ({
          id: item.id,
          mpn: item.mpn,
          partNumber: item.partNumber,
          manufacturer: item.manufacturer,
          packageSize: item.packageSize,
          cost: item.cost,
          leadTime: item.leadTime,
          description: item.description,
        })),
        alternates: alternateItems.map((item) => ({
          id: item.id,
          mpn: item.mpn,
          partNumber: item.partNumber,
          manufacturer: item.manufacturer,
          packageSize: item.packageSize,
          cost: item.cost,
          leadTime: item.leadTime,
          description: item.description,
          isAlternate: true,
        })),
      },
      selectedId: selectedItem?.id,
      selectedIsAlternate: selectedItem?.isAlternate ?? false,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to scan feeder" });
  }
});

router.get("/sessions/:sessionId/splices", async (req, res) => {
  try {
    const sessionId = Number(req.params.sessionId);
    const splices = await db
      .select()
      .from(spliceRecordsTable)
      .where(eq(spliceRecordsTable.sessionId, sessionId))
      .orderBy(spliceRecordsTable.splicedAt);
    res.json(splices);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list splices" });
  }
});

router.post("/sessions/:sessionId/splices", async (req, res) => {
  try {
    const sessionId = Number(req.params.sessionId);
    const { feederNumber, oldSpoolBarcode, newSpoolBarcode, durationSeconds } = req.body;

    if (!feederNumber || !oldSpoolBarcode || !newSpoolBarcode) {
      res.status(400).json({ error: "feederNumber, oldSpoolBarcode, and newSpoolBarcode are required" });
      return;
    }

    const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const [splice] = await db
      .insert(spliceRecordsTable)
      .values({
        sessionId,
        feederNumber: feederNumber.trim(),
        oldSpoolBarcode: oldSpoolBarcode.trim(),
        newSpoolBarcode: newSpoolBarcode.trim(),
        durationSeconds: durationSeconds ?? null,
      })
      .returning();

    res.status(201).json(splice);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to record splice" });
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

router.delete("/sessions/:sessionId", async (req: any, res) => {
  try {
    const sessionId = Number(req.params.sessionId);
    const userId = req.user?.username || "unknown";

    // Check if session exists
    const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    // Soft delete: set deletedAt timestamp and deletedBy instead of hard deleting
    await db
      .update(sessionsTable)
      .set({ deletedAt: new Date(), deletedBy: userId })
      .where(eq(sessionsTable.id, sessionId));

    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete session" });
  }
});

export default router;
