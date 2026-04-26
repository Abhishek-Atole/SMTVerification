import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { bomsTable, changeoverSessionsTable, feederScansTable, sessionsTable } from "@workspace/db/schema";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
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

async function getEnrichedScansForSession(sessionId: string, limit?: number) {
  const [session] = await db
    .select({ id: changeoverSessionsTable.id, bomId: changeoverSessionsTable.bomId })
    .from(changeoverSessionsTable)
    .where(eq(changeoverSessionsTable.id, sessionId));

  if (!session) {
    return null;
  }

  const query = db
    .select()
    .from(feederScansTable)
    .where(eq(feederScansTable.sessionId, sessionId))
    .orderBy(desc(feederScansTable.scannedAt));

  const scans = limit ? await query.limit(limit) : await query;

  const feederNumbers = Array.from(new Set(scans.map((scan) => scan.feederNumber).filter(Boolean)));
  const bomMap = new Map<string, {
    internalPartNumber: string | null;
    mpn1: string | null;
    mpn2: string | null;
    mpn3: string | null;
    make1: string | null;
    make2: string | null;
    make3: string | null;
    description: string | null;
    packageDescription: string | null;
  }>();

  if (feederNumbers.length > 0) {
    const { bomItemsTable } = await import("@workspace/db/schema");
    const bomItems = await db
      .select({
        feederNumber: bomItemsTable.feederNumber,
        internalPartNumber: bomItemsTable.internalPartNumber,
        mpn1: bomItemsTable.mpn1,
        mpn2: bomItemsTable.mpn2,
        mpn3: bomItemsTable.mpn3,
        make1: bomItemsTable.make1,
        make2: bomItemsTable.make2,
        make3: bomItemsTable.make3,
        description: bomItemsTable.itemName,
        packageDescription: bomItemsTable.packageDescription,
      })
      .from(bomItemsTable)
      .where(
        and(
          eq(bomItemsTable.bomId, session.bomId),
          inArray(bomItemsTable.feederNumber, feederNumbers),
        ),
      );

    for (const item of bomItems) {
      if (!bomMap.has(item.feederNumber)) {
        bomMap.set(item.feederNumber, {
          internalPartNumber: item.internalPartNumber,
          mpn1: item.mpn1,
          mpn2: item.mpn2,
          mpn3: item.mpn3,
          make1: item.make1,
          make2: item.make2,
          make3: item.make3,
          description: item.description,
          packageDescription: item.packageDescription,
        });
      }
    }
  }

  const enrichedScans = scans.map((scan) => {
    const bom = bomMap.get(scan.feederNumber) ?? null;
    return {
      ...scan,
      approvedBy: scan.matchedField === "manual_override" ? scan.matchedMake : null,
      bom: {
        internalPartNumber: bom?.internalPartNumber ?? null,
        mpn1: bom?.mpn1 ?? null,
        mpn2: bom?.mpn2 ?? null,
        mpn3: bom?.mpn3 ?? null,
        make1: bom?.make1 ?? null,
        make2: bom?.make2 ?? null,
        make3: bom?.make3 ?? null,
        description: bom?.description ?? null,
        packageDescription: bom?.packageDescription ?? null,
      },
    };
  });

  return { session, scans: enrichedScans };
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

router.get("/verification/sessions/active", async (req: AuthRequest, res) => {
  try {
    const actor = req.actor!;

    // Primary source: main sessions table used by session pages.
    const [legacySession] = await db
      .select({
        id: sessionsTable.id,
        bomId: sessionsTable.bomId,
        status: sessionsTable.status,
        startedAt: sessionsTable.startTime,
        bomName: bomsTable.name,
      })
      .from(sessionsTable)
      .leftJoin(bomsTable, eq(sessionsTable.bomId, bomsTable.id))
      .where(and(eq(sessionsTable.status, "active"), isNull(sessionsTable.endTime), isNull(sessionsTable.deletedAt)))
      .orderBy(desc(sessionsTable.startTime))
      .limit(1);

    if (legacySession) {
      res.json({
        session: {
          id: String(legacySession.id),
          bomId: legacySession.bomId ?? 0,
          bomName: legacySession.bomName ?? "Unknown BOM",
          operatorId: actor.id,
          status: "active",
          startedAt: legacySession.startedAt,
        },
      });
      return;
    }

    // Fallback: changeover sessions table.
    const [session] = await db
      .select({
        id: changeoverSessionsTable.id,
        bomId: changeoverSessionsTable.bomId,
        operatorId: changeoverSessionsTable.operatorId,
        status: changeoverSessionsTable.status,
        startedAt: changeoverSessionsTable.startedAt,
        bomName: bomsTable.name,
      })
      .from(changeoverSessionsTable)
      .leftJoin(bomsTable, eq(changeoverSessionsTable.bomId, bomsTable.id))
      .where(and(eq(changeoverSessionsTable.operatorId, actor.id), eq(changeoverSessionsTable.status, "active")))
      .orderBy(desc(changeoverSessionsTable.startedAt))
      .limit(1);

    if (!session) {
      res.json({ session: null });
      return;
    }

    res.json({
      session: {
        id: session.id,
        bomId: session.bomId,
        bomName: session.bomName ?? "Unknown BOM",
        operatorId: session.operatorId,
        status: session.status,
        startedAt: session.startedAt,
      },
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to load active session" });
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
    const sessionId = String(req.params.sessionId ?? "").trim();
    if (!sessionId) {
      res.status(400).json({ error: "sessionId is required" });
      return;
    }

    const payload = await getEnrichedScansForSession(sessionId, 20);
    if (!payload) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    res.json({ scans: payload.scans });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list feeder scans" });
  }
});

router.get("/verification/sessions/:sessionId/final-report", requireSessionReadAccess, async (req, res) => {
  try {
    const sessionId = String(req.params.sessionId ?? "").trim();
    if (!sessionId) {
      res.status(400).json({ error: "sessionId is required" });
      return;
    }

    const payload = await getEnrichedScansForSession(sessionId);
    if (!payload) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const scans = payload.scans;
    const summary = {
      totalScans: scans.length,
      verified: scans.filter((scan) => scan.status === "verified").length,
      failed: scans.filter((scan) => scan.status === "failed").length,
      duplicate: scans.filter((scan) => scan.status === "duplicate").length,
      manualOverride: scans.filter((scan) => scan.verificationMode === "MANUAL_OVERRIDE").length,
      auto: scans.filter((scan) => scan.verificationMode !== "MANUAL_OVERRIDE").length,
    };

    res.json({
      reportType: "VERIFICATION_FINAL_REPORT",
      sessionId,
      generatedAt: new Date().toISOString(),
      summary,
      scans,
      splices: [],
      notes: ["Splicing rows are tracked in UI for now and are not persisted in verification API yet."],
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to generate final report" });
  }
});

// ── PHASE 1: STRICT AUTO FEEDER VERIFICATION ────────────────────────────────

/**
 * POST /api/verification/check-feeder
 * Step 1: Validate feeder number exists in BOM for current session
 */
router.post("/verification/check-feeder", attachActor, async (req: AuthRequest, res) => {
  try {
    const sessionId = String(req.body?.sessionId ?? "").trim();
    const feederNumber = String(req.body?.feederNumber ?? "").trim();

    if (!sessionId || !feederNumber) {
      res.status(400).json({ error: "sessionId and feederNumber are required" });
      return;
    }

    // Get session and BOM
    const session = await db.query.changeoverSessionsTable.findFirst({
      where: eq(changeoverSessionsTable.id, sessionId),
    });

    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    // Check if feeder already scanned in this session
    const existingScan = await db.query.feederScansTable.findFirst({
      where: and(
        eq(feederScansTable.sessionId, sessionId),
        eq(feederScansTable.feederNumber, feederNumber),
        eq(feederScansTable.status, "verified")
      ),
    });

    if (existingScan) {
      return res.json({
        found: true,
        alreadyScanned: true,
        message: `Feeder ${feederNumber} already verified`,
      });
    }

    // Look up feeder in BOM
    const { bomItemsTable } = await import("@workspace/db/schema");
    const bomItem = await db.query.bomItemsTable.findFirst({
      where: and(
        eq(bomItemsTable.bomId, session.bomId),
        eq(bomItemsTable.feederNumber, feederNumber)
      ),
    });

    if (!bomItem) {
      return res.json({
        found: false,
        message: `Feeder ${feederNumber} not in BOM`,
      });
    }

    // Return BOM data for this feeder
    res.json({
      found: true,
      alreadyScanned: false,
      bomData: {
        feederNumber: bomItem.feederNumber,
        internalPartNumber: bomItem.internalPartNumber,
        mpn1: bomItem.mpn1,
        mpn2: bomItem.mpn2,
        mpn3: bomItem.mpn3,
        make1: bomItem.make1,
        make2: bomItem.make2,
        make3: bomItem.make3,
        description: bomItem.itemName,
        packageDescription: bomItem.packageDescription,
      },
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

/**
 * POST /api/verification/validate-mpn
 * Step 2: Validate scanned MPN matches one of the BOM options
 */
router.post("/verification/validate-mpn", attachActor, async (req: AuthRequest, res) => {
  try {
    const sessionId = String(req.body?.sessionId ?? "").trim();
    const feederNumber = String(req.body?.feederNumber ?? "").trim();
    const scannedValue = String(req.body?.scannedValue ?? "").trim();

    if (!sessionId || !feederNumber || !scannedValue) {
      res.status(400).json({ error: "sessionId, feederNumber, and scannedValue are required" });
      return;
    }

    const session = await db.query.changeoverSessionsTable.findFirst({
      where: eq(changeoverSessionsTable.id, sessionId),
    });

    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const { bomItemsTable } = await import("@workspace/db/schema");
    const bomItem = await db.query.bomItemsTable.findFirst({
      where: and(
        eq(bomItemsTable.bomId, session.bomId),
        eq(bomItemsTable.feederNumber, feederNumber)
      ),
    });

    if (!bomItem) {
      res.status(404).json({ error: "Feeder not in BOM" });
      return;
    }

    // STRICT EXACT MATCH — case-insensitive, trimmed
    const scanned = scannedValue.toUpperCase();
    const mpn1 = bomItem.mpn1?.trim().toUpperCase() ?? "";
    const mpn2 = bomItem.mpn2?.trim().toUpperCase() ?? "";
    const mpn3 = bomItem.mpn3?.trim().toUpperCase() ?? "";

    // Also check internal part number tokens
    const internalTokens = (bomItem.internalPartNumber || "")
      .split(/\s+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);

    let matchedField: string | null = null;
    let matchedMake: string | null = null;
    let isAlternate = false;

    if (mpn1 && scanned === mpn1) {
      matchedField = "mpn1";
      matchedMake = bomItem.make1;
      isAlternate = false;
    } else if (mpn2 && scanned === mpn2) {
      matchedField = "mpn2";
      matchedMake = bomItem.make2;
      isAlternate = true;
    } else if (mpn3 && scanned === mpn3) {
      matchedField = "mpn3";
      matchedMake = bomItem.make3;
      isAlternate = true;
    } else if (internalTokens.includes(scanned)) {
      matchedField = "internalPartNumber";
      matchedMake = null;
      isAlternate = false;
    } else {
      // NO MATCH
      return res.json({
        valid: false,
        error: "MPN_MISMATCH",
        scanned: scannedValue,
        expected: [mpn1, mpn2, mpn3].filter(Boolean),
      });
    }

    // MATCH FOUND
    const alternateCount = [mpn1, mpn2, mpn3].filter(Boolean).length;

    res.json({
      valid: true,
      matchedField,
      matchedMake,
      isAlternate,
      alternateCount,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Validation error" });
  }
});

/**
 * POST /api/verification/save-scan
 * Step 3: Save the complete scan record to database
 */
router.post("/verification/save-scan", attachActor, async (req: AuthRequest, res) => {
  try {
    const {
      sessionId,
      feederNumber,
      scannedValue,
      lotCode,
      matchedField,
      matchedMake,
      status,
      verificationMode,
    } = req.body;

    if (!sessionId || !feederNumber || !scannedValue) {
      res.status(400).json({ error: "sessionId, feederNumber, and scannedValue are required" });
      return;
    }

    const actor = req.actor!;

    await db.transaction(async (tx) => {
      // Insert scan record
      await tx.insert(feederScansTable).values({
        sessionId,
        feederNumber,
        scannedValue,
        lotCode: lotCode || null,
        matchedField,
        matchedMake,
        status: status || "verified",
        verificationMode: verificationMode || "AUTO",
        operatorId: actor.id,
        scannedAt: new Date(),
      });

      // Get updated progress
      const progress = await getSessionProgress(sessionId);

      res.json({ success: true, progress });
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to save scan" });
  }
});

/**
 * POST /api/verification/sessions/:sessionId/reset
 * Reset all scans and splices for a session
 */
router.post("/verification/sessions/:sessionId/reset", attachActor, async (req: AuthRequest, res) => {
  try {
    const sessionId = String(req.params.sessionId ?? "").trim();

    if (!sessionId) {
      res.status(400).json({ error: "sessionId is required" });
      return;
    }

    await db.transaction(async (tx) => {
      // Delete all scans for this session
      await tx.delete(feederScansTable).where(eq(feederScansTable.sessionId, sessionId));

      // TODO: Delete all splices for this session when added

      // Update session status back to active
      await tx
        .update(changeoverSessionsTable)
        .set({ status: "active", completedAt: null })
        .where(eq(changeoverSessionsTable.id, sessionId));
    });

    res.json({ success: true, message: "Session reset" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to reset session" });
  }
});

export default router;