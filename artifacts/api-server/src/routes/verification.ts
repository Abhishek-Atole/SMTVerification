import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { changeoverSessionsTable, feederScansTable } from "@workspace/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { getSessionProgress, verifyFeederScan } from "../services/verificationService";

const router: IRouter = Router();

function toNumber(value: unknown): number {
  return Number(value);
}

router.post("/verification/sessions", async (req, res) => {
  try {
    const operatorId = toNumber(req.body?.operatorId);
    const bomId = toNumber(req.body?.bomId);

    if (!Number.isFinite(operatorId) || !Number.isFinite(bomId)) {
      res.status(400).json({ error: "operatorId and bomId are required" });
      return;
    }

    const [session] = await db
      .insert(changeoverSessionsTable)
      .values({
        operatorId,
        bomId,
        status: "active",
      })
      .returning();

    res.status(201).json(session);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to create verification session" });
  }
});

router.get("/verification/sessions/:sessionId/progress", async (req, res) => {
  try {
    const sessionId = Number(req.params.sessionId);
    if (!Number.isFinite(sessionId)) {
      res.status(400).json({ error: "Invalid sessionId" });
      return;
    }

    const [session] = await db
      .select({ id: changeoverSessionsTable.id })
      .from(changeoverSessionsTable)
      .where(eq(changeoverSessionsTable.id, sessionId));

    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const progress = await getSessionProgress(sessionId);
    const verifiedRows = await db
      .select({ feederNumber: feederScansTable.feederNumber })
      .from(feederScansTable)
      .where(
        and(
          eq(feederScansTable.sessionId, sessionId),
          eq(feederScansTable.status, "verified"),
        ),
      )
      .groupBy(feederScansTable.feederNumber);

    res.json({
      ...progress,
      verifiedFeeders: verifiedRows.map((row) => row.feederNumber),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get session progress" });
  }
});

router.post("/verification/scan", async (req, res) => {
  try {
    const sessionId = toNumber(req.body?.sessionId);
    const feederNumber = String(req.body?.feederNumber ?? "").trim();
    const scannedValue = String(req.body?.scannedValue ?? "").trim();
    const lotCode = req.body?.lotCode == null ? null : String(req.body.lotCode);

    if (!Number.isFinite(sessionId) || !feederNumber || !scannedValue) {
      res.status(400).json({ error: "sessionId, feederNumber, and scannedValue are required" });
      return;
    }

    const [session] = await db
      .select({ id: changeoverSessionsTable.id, operatorId: changeoverSessionsTable.operatorId })
      .from(changeoverSessionsTable)
      .where(eq(changeoverSessionsTable.id, sessionId));

    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const verifyResult = await verifyFeederScan(feederNumber, scannedValue, sessionId);

    await db.transaction(async (tx) => {
      await tx.insert(feederScansTable).values({
        sessionId,
        feederNumber: verifyResult.feederNumber,
        scannedValue,
        matchedField: verifyResult.matchedField,
        matchedMake: verifyResult.matchedMake,
        lotCode,
        status: verifyResult.valid ? "verified" : "failed",
        operatorId: session.operatorId,
      });
    });

    if (!verifyResult.valid) {
      res.json(verifyResult);
      return;
    }

    const progress = await getSessionProgress(sessionId);
    res.json({ ...verifyResult, progress });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to process feeder scan" });
  }
});

router.get("/verification/sessions/:sessionId/scans", async (req, res) => {
  try {
    const sessionId = Number(req.params.sessionId);
    if (!Number.isFinite(sessionId)) {
      res.status(400).json({ error: "Invalid sessionId" });
      return;
    }

    const [session] = await db
      .select({ id: changeoverSessionsTable.id })
      .from(changeoverSessionsTable)
      .where(eq(changeoverSessionsTable.id, sessionId));

    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const scans = await db
      .select()
      .from(feederScansTable)
      .where(eq(feederScansTable.sessionId, sessionId))
      .orderBy(desc(feederScansTable.scannedAt));

    res.json(scans);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list feeder scans" });
  }
});

export default router;