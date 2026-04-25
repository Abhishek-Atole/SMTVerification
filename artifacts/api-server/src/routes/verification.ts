import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { changeoverSessionsTable, feederScansTable } from "@workspace/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { getSessionProgress, verifyFeederScan } from "../services/verificationService";
import { generateSessionId } from "../lib/generateSessionId";
import {
  attachActor,
  requireOperatorSessionOwnership,
  requireSessionReadAccess,
  type AuthRequest,
} from "../middleware/auth";

const router: IRouter = Router();

router.use("/verification", attachActor);

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

    // Generate new session ID in format SMT_YYYYMMDD_NNNNNN
    const sessionId = await generateSessionId();

    const [session] = await db
      .insert(changeoverSessionsTable)
      .values({
        id: sessionId,
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

router.get("/verification/sessions", async (req: AuthRequest, res) => {
  try {
    const actor = req.actor!;
    const requestedRole = String(req.query.role ?? "").trim().toLowerCase();

    if (requestedRole === "qa" || requestedRole === "engineer") {
      if (actor.role !== "qa" && actor.role !== "engineer") {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      const sessions = await db
        .select()
        .from(changeoverSessionsTable)
        .orderBy(desc(changeoverSessionsTable.startedAt));

      res.json(sessions);
      return;
    }

    const sessions = await db
      .select()
      .from(changeoverSessionsTable)
      .where(and(eq(changeoverSessionsTable.operatorId, actor.id), eq(changeoverSessionsTable.status, "active")))
      .orderBy(desc(changeoverSessionsTable.startedAt));

    res.json(sessions);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list verification sessions" });
  }
});

router.get("/verification/sessions/mine", async (req: AuthRequest, res) => {
  try {
    const actor = req.actor!;
    const sessions = await db
      .select()
      .from(changeoverSessionsTable)
      .where(and(eq(changeoverSessionsTable.operatorId, actor.id), eq(changeoverSessionsTable.status, "active")))
      .orderBy(desc(changeoverSessionsTable.startedAt));

    res.json(sessions);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list operator sessions" });
  }
});

router.get("/verification/sessions/:sessionId/progress", requireSessionReadAccess, async (req, res) => {
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

router.post("/verification/scan", requireOperatorSessionOwnership, async (req, res) => {
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

    let verifyResult: Awaited<ReturnType<typeof verifyFeederScan>>;

    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT 1 FROM changeover_sessions WHERE id = ${sessionId} FOR UPDATE`);

      verifyResult = await verifyFeederScan(feederNumber, scannedValue, sessionId);

      await tx.insert(feederScansTable).values({
        sessionId,
        feederNumber: verifyResult.feederNumber,
        scannedValue,
        matchedField: verifyResult.matchedField,
        matchedMake: verifyResult.matchedMake,
        lotCode,
        status: verifyResult.valid ? "verified" : verifyResult.errorCode === "ALREADY_SCANNED" ? "duplicate" : "failed",
        operatorId: session.operatorId,
      });
    });

    if (!verifyResult) {
      res.status(500).json({ error: "Failed to process feeder scan" });
      return;
    }

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

router.get("/verification/sessions/:sessionId/scans", requireSessionReadAccess, async (req, res) => {
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