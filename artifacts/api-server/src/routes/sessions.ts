// @ts-nocheck
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sessionsTable, scanRecordsTable, spliceRecordsTable, bomItemsTable, bomsTable, auditLogsTable } from "@workspace/db/schema";
import { eq, and, sql, desc, isNull, isNotNull } from "drizzle-orm";
import { TimestampService } from "../services/timestamp-service";

const router: IRouter = Router();

type BomRowForMPN = {
  internalPartNumber?: string | null;
  mpn1?: string | null;
  mpn2?: string | null;
  mpn3?: string | null;
  make1?: string | null;
  make2?: string | null;
  make3?: string | null;
};

type MatchResult = {
  matchedField: "internalPartNumber" | "mpn1" | "mpn2" | "mpn3";
  matchedMake: string | null;
} | null;

function normalizeExact(value: string | null | undefined): string {
  return String(value ?? "").trim().toUpperCase();
}

function tokenizeInternalPartNumber(value: string | null | undefined): string[] {
  return String(value ?? "")
    .split(/\s+/)
    .map((token) => token.trim().toUpperCase())
    .filter(Boolean);
}

function verifyMPN(scanned: string, bomRow: BomRowForMPN): MatchResult {
  const s = scanned.trim().toUpperCase();

  const internalTokens = tokenizeInternalPartNumber(bomRow.internalPartNumber);
  if (internalTokens.includes(s)) {
    return { matchedField: "internalPartNumber", matchedMake: null };
  }

  if (normalizeExact(bomRow.mpn1) === s) {
    return { matchedField: "mpn1", matchedMake: bomRow.make1 ?? null };
  }

  if (normalizeExact(bomRow.mpn2) === s) {
    return { matchedField: "mpn2", matchedMake: bomRow.make2 ?? null };
  }

  if (normalizeExact(bomRow.mpn3) === s) {
    return { matchedField: "mpn3", matchedMake: bomRow.make3 ?? null };
  }

  return null;
}

function buildExpectedMpnValues(bomRow: BomRowForMPN): string[] {
  const values = [
    ...tokenizeInternalPartNumber(bomRow.internalPartNumber),
    normalizeExact(bomRow.mpn1),
    normalizeExact(bomRow.mpn2),
    normalizeExact(bomRow.mpn3),
  ].filter(Boolean);

  return Array.from(new Set(values));
}

// Static routes
router.get("/sessions", async (req, res) => {
  try {
    // Only show non-deleted sessions (where deletedAt is null)
    const sessions = await db
      .select()
      .from(sessionsTable)
      .where(isNull(sessionsTable.deletedAt))
      .orderBy(sessionsTable.createdAt);
    
    const bomIds = [...new Set(sessions.map((s) => s.bomId).filter((id): id is number => id !== null))];
    let bomMap = new Map<number, string>();
    if (bomIds.length > 0) {
      const boms = await db.select().from(bomsTable);
      bomMap = new Map(boms.map((b) => [b.id, b.name]));
    }
    const result = sessions.map((s) => ({
      ...s,
      bomName: s.bomId ? (bomMap.get(s.bomId) ?? "") : "",
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

    // Use server timestamp for session creation
    const timestamps = TimestampService.createSessionTimestamps();

    const [session] = await db
      .insert(sessionsTable)
      .values({
        bomId: finalBomId, companyName, customerName, panelName, supervisorName,
        operatorName, qaName, shiftName, shiftDate, logoUrl,
        productionCount: productionCount ?? 0,
        status: "active",
        startTime: timestamps.startTime,
        createdAt: timestamps.createdAt,
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

    let bomName = "";
    if (restored && restored.bomId) {
      const [bom] = await db.select().from(bomsTable).where(eq(bomsTable.id, restored.bomId));
      bomName = bom?.name ?? "";
    }
    res.json({ ...restored, bomName });
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

router.get("/sessions/:sessionId/scans", async (req, res) => {
  try {
    const sessionId = Number(req.params.sessionId);
    if (!Number.isFinite(sessionId)) {
      res.status(400).json({ error: "Invalid sessionId" });
      return;
    }

    const [session] = await db
      .select({ id: sessionsTable.id, bomId: sessionsTable.bomId })
      .from(sessionsTable)
      .where(eq(sessionsTable.id, sessionId));

    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const scans = await db
      .select({
        id: scanRecordsTable.id,
        feederNumber: scanRecordsTable.feederNumber,
        scannedValue: scanRecordsTable.spoolBarcode,
        matchedField: scanRecordsTable.validationResult,
        matchedMake: scanRecordsTable.description,
        lotCode: scanRecordsTable.lotNumber,
        status: scanRecordsTable.status,
        verificationMode: scanRecordsTable.verificationMode,
        scannedAt: scanRecordsTable.scannedAt,
        refDes: bomItemsTable.referenceLocation,
        componentDesc: bomItemsTable.description,
        packageSize: bomItemsTable.packageDescription,
        internalPartNumber: bomItemsTable.internalPartNumber,
        mpn1: bomItemsTable.mpn1,
        make1: bomItemsTable.make1,
        mpn2: bomItemsTable.mpn2,
        make2: bomItemsTable.make2,
        mpn3: bomItemsTable.mpn3,
        make3: bomItemsTable.make3,
      })
      .from(scanRecordsTable)
      .leftJoin(
        bomItemsTable,
        session.bomId === null
          ? sql`1 = 0`
          : and(
              eq(bomItemsTable.feederNumber, scanRecordsTable.feederNumber),
              eq(bomItemsTable.bomId, session.bomId),
            ),
      )
      .where(eq(scanRecordsTable.sessionId, sessionId))
      .orderBy(desc(scanRecordsTable.scannedAt));

    res.json({
      sessionId,
      scans: scans.map((row) => ({
        id: row.id,
        feederNumber: row.feederNumber,
        scannedValue: row.scannedValue ?? row.feederNumber,
        matchedField: row.matchedField,
        matchedMake: row.matchedMake,
        lotCode: row.lotCode,
        status: row.status,
        verificationMode: row.verificationMode,
        scannedAt: new Date(row.scannedAt).toISOString(),
        bom: {
          refDes: row.refDes ?? null,
          componentDesc: row.componentDesc ?? null,
          packageSize: row.packageSize ?? null,
          internalPartNumber: row.internalPartNumber ?? null,
          expectedMpns: [row.internalPartNumber, row.mpn1, row.mpn2, row.mpn3].filter(
            (value): value is string => Boolean(value && value.trim()),
          ),
          makes: [row.make1, row.make2, row.make3].filter(
            (value): value is string => Boolean(value && value.trim()),
          ),
        },
      })),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list session scans" });
  }
});

router.patch("/sessions/:sessionId", async (req, res) => {
  try {
    const sessionId = Number(req.params.sessionId);
    const { endTime, productionCount, status, logoUrl, verificationMode } = req.body;
    const updates: Record<string, unknown> = {};
    if (endTime !== undefined) updates.endTime = new Date(endTime);
    if (productionCount !== undefined) updates.productionCount = productionCount;
    if (status !== undefined) updates.status = status;
    if (logoUrl !== undefined) updates.logoUrl = logoUrl;
    if (verificationMode !== undefined) {
      const normalizedMode = String(verificationMode).trim().toUpperCase();
      if (!['AUTO', 'MANUAL'].includes(normalizedMode)) {
        res.status(400).json({ error: "verificationMode must be 'AUTO' or 'MANUAL'" });
        return;
      }
      updates.verificationMode = normalizedMode;
    }

    const updated = await db
      .update(sessionsTable)
      .set(updates)
      .where(eq(sessionsTable.id, sessionId))
      .returning();

    if (!updated || updated.length === 0) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const session = updated[0];
    let bomName = "";
    if (session.bomId) {
      const [bom] = await db.select().from(bomsTable).where(eq(bomsTable.id, session.bomId));
      bomName = bom?.name ?? "";
    }
    res.json({ ...session, bomName });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update session" });
  }
});

router.patch("/sessions/:sessionId/mode", async (req, res) => {
  try {
    const sessionId = Number(req.params.sessionId);
    const mode = String(req.body?.mode ?? req.body?.verificationMode ?? "").trim().toUpperCase();

    if (!Number.isFinite(sessionId)) {
      res.status(400).json({ error: "Invalid sessionId" });
      return;
    }

    if (!['AUTO', 'MANUAL'].includes(mode)) {
      res.status(400).json({ error: "mode must be 'AUTO' or 'MANUAL'" });
      return;
    }

    const [updated] = await db
      .update(sessionsTable)
      .set({ verificationMode: mode })
      .where(eq(sessionsTable.id, sessionId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    res.json({ sessionId, mode, session: updated });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update verification mode" });
  }
});

// Utility function for case normalization
function normalizeInput(input?: string | null): string | undefined {
  return input ? input.trim().toUpperCase() : undefined;
}

router.post("/sessions/:sessionId/scans", async (req, res) => {
  try {
    // === PERFORMANCE: Track validation time ===
    const validationStartTime = Date.now();
    
    const sessionId = Number(req.params.sessionId);
    const { 
      feederNumber, 
      mpnOrInternalId,
      internalIdType = "mpn",
      verificationMode: requestedVerificationMode,
      spoolBarcode, 
      selectedItemId 
    } = req.body;

    if (!feederNumber) {
      res.status(400).json({ error: "feederNumber is required" });
      return;
    }

    const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const verificationMode = String(session.verificationMode ?? requestedVerificationMode ?? "AUTO").trim().toUpperCase() === "MANUAL"
      ? "MANUAL"
      : "AUTO";

    // === STEP 1: CASE NORMALIZATION ===
    const normalizedFeeder = normalizeInput(feederNumber);
    const normalizedMpnId = normalizeInput(mpnOrInternalId);
    const normalizedSpool = normalizeInput(spoolBarcode);

    // Track if case was converted for UI feedback
    const caseConverted = 
      (feederNumber !== normalizedFeeder) || 
      (mpnOrInternalId && mpnOrInternalId !== normalizedMpnId);

    // === STEP 2: DUPLICATE DETECTION ===
    const existingScan = await db
      .select()
      .from(scanRecordsTable)
      .where(
        and(
          eq(scanRecordsTable.sessionId, sessionId),
          eq(scanRecordsTable.feederNumber, normalizedFeeder!),
          eq(scanRecordsTable.status, "ok")
        )
      );

    if (existingScan.length > 0) {
      return res.status(400).json({
        status: "reject",
        isDuplicate: true,
        message: `⚠️ Feeder ${normalizedFeeder} already scanned`,
        validationDetails: {
          isDuplicate: true,
          feederNumberMatched: true,
          mpnMatched: false,
          internalIdMatched: false,
          caseConverted: false,
        },
      });
    }

    // === STEP 3: BOM VALIDATION ===
    const isFreeScanMode = session.bomId === null;
    let scanStatus = "ok";
    let selectedItem = null;
    let primaryItems: any[] = [];
    let alternateItems: any[] = [];
    let message = "";
    let mpnMatched = false;
    let internalIdMatched = false;
    let verificationMatch: ReturnType<typeof verifyMPN> | null = null;
    let expectedMpnValues: string[] = [];

    if (isFreeScanMode) {
      // Free Scan Mode: Accept any feeder, no BOM validation
      scanStatus = "ok";
      message = `Feeder ${normalizedFeeder} scanned (Free Scan Mode — no BOM validation)`;
    } else {
      // BOM Validation Mode: Check against BOM
      const bomItems = await db.select().from(bomItemsTable).where(eq(bomItemsTable.bomId, session.bomId));

      // Find primary item and alternates
      primaryItems = bomItems.filter(
        (item) =>
          item.feederNumber.trim().toUpperCase() === normalizedFeeder &&
          !item.isAlternate
      );

      alternateItems = bomItems.filter(
        (item) =>
          item.feederNumber.trim().toUpperCase() === normalizedFeeder &&
          item.isAlternate
      );

      // Determine which item was selected
      selectedItem = primaryItems[0];
      let usedAlternate = false;

      if (selectedItemId) {
        const specified = bomItems.find((item) => item.id === selectedItemId);
        if (specified && specified.feederNumber.trim().toUpperCase() === normalizedFeeder) {
          selectedItem = specified;
          usedAlternate = specified.isAlternate ?? false;
        }
      }

      // Step 1: Check if feeder exists in BOM
      if (!selectedItem) {
        scanStatus = "reject";
        message = `❌ FEEDER NOT FOUND: ${normalizedFeeder} NOT in BOM — REJECTED`;
      } else {
        expectedMpnValues = buildExpectedMpnValues(selectedItem);
        const hasExpectedMpn = expectedMpnValues.length > 0;
        verificationMatch = normalizedMpnId ? verifyMPN(normalizedMpnId, selectedItem) : null;

        // Step 2: Validate MPN/Internal ID using strict exact matching only
        if (normalizedMpnId) {
          mpnMatched = verificationMatch !== null;
          internalIdMatched = verificationMatch?.matchedField === "internalPartNumber";

          // Determine scan status based on mode
          if (verificationMode === "AUTO") {
            // AUTO mode: MUST match if BOM has expected value
            if (hasExpectedMpn) {
              if (!verificationMatch) {
                scanStatus = "reject";
                message = `❌ MPN mismatch for feeder ${normalizedFeeder}.\nScanned: ${normalizedMpnId}\nExpected one of: ${expectedMpnValues.join(" | ")}`;
              } else {
                scanStatus = "ok";
                message = `✅ VERIFIED (EXACT): Feeder ${normalizedFeeder} with ${internalIdType} ${normalizedMpnId} PASSED validation`;
              }
            } else {
              // BOM doesn't require validation, but user provided value - accept it
              scanStatus = "ok";
              message = `✅ Feeder ${normalizedFeeder} with ${internalIdType} ${normalizedMpnId} ACCEPTED`;
            }
          } else if (verificationMode === "MANUAL") {
            // MANUAL mode: Strict exact validation
            if (verificationMatch) {
              scanStatus = "ok";
              message = `✅ VERIFIED (EXACT): Feeder ${normalizedFeeder} with ${internalIdType} ${normalizedMpnId} PASSED`;
            } else {
              // STRICT: Reject if user provided insufficient/incorrect MPN/ID but BOM requires validation
              if (hasExpectedMpn) {
                scanStatus = "reject";
                message = `❌ MPN mismatch for feeder ${normalizedFeeder}.\nScanned: ${normalizedMpnId}\nExpected one of: ${expectedMpnValues.join(" | ")}`;
              } else {
                // BOM doesn't require validation, so accept the provided value
                scanStatus = "ok";
                message = `✅ Feeder ${normalizedFeeder} with provided ${internalIdType} '${normalizedMpnId}' ACCEPTED (no validation required in BOM)`;
              }
            }
          }
        } else {
          // No MPN/Internal ID provided - check if validation was required
          if (hasExpectedMpn) {
            // BOM requires validation but user didn't provide it
            if (verificationMode === "AUTO" || verificationMode === "MANUAL") {
              scanStatus = "reject";
              message = `❌ MPN mismatch for feeder ${normalizedFeeder}.\nScanned: ${normalizedMpnId ?? ""}\nExpected one of: ${expectedMpnValues.join(" | ")}`;
            }
          } else {
            // No expected validation in BOM for this feeder - accept as is
            scanStatus = "ok";
            message = `✅ Feeder ${normalizedFeeder} VERIFIED${usedAlternate ? " (ALTERNATE)" : ""} — No validation required`;
          }
        }
      }
    }

    // === STEP 4: SAVE TO DATABASE ===
    // @ts-ignore - Drizzle returning type inference issue
    const [scan] = await db
      .insert(scanRecordsTable)
      .values({
        sessionId,
        feederNumber: normalizedFeeder!,
        spoolBarcode: normalizedSpool ?? null,
        internalIdScanned: normalizedMpnId ?? null,
        status: scanStatus,
        partNumber: selectedItem?.partNumber ?? null,
        description: selectedItem?.description ?? null,
        location: selectedItem?.location ?? null,
        verificationMode,
        matchScore: verificationMatch ? 100 : null,
        matchingAlgorithm: verificationMatch ? "exact" : null,
        expectedValue: expectedMpnValues.length > 0 ? expectedMpnValues.join(" | ") : null,
        suggestions: null,
        scannedAt: TimestampService.createScanTimestamp(),
      })
      .returning();

    // === NEW: AUDIT LOGGING ===
    const operatorName = session.operatorName || "UNKNOWN";
    const auditDescription = `${verificationMode} mode scan: Feeder ${normalizedFeeder} - Status: ${scanStatus === "ok" ? "PASSED" : "REJECTED"}${normalizedMpnId ? ` - ${internalIdType}: ${normalizedMpnId}` : ""}`;
    
    await db.insert(auditLogsTable).values({
      entityType: "feeder_scan",
      entityId: `session_${sessionId}_feeder_${normalizedFeeder}`,
      action: scanStatus === "ok" ? "verify" : "reject",
      oldValue: null,
      newValue: JSON.stringify({
        sessionId,
        feederNumber: normalizedFeeder,
        mpnOrInternalId: normalizedMpnId || null,
        internalIdType,
        status: scanStatus,
        verificationMode,
        isDuplicate: existingScan.length > 0,
        caseConverted,
      }),
      changedBy: operatorName,
      description: auditDescription,
      createdAt: TimestampService.createAuditTimestamp(),
    });

    // === STEP 5: PREPARE RESPONSE ===
    const validationTimeMs = Date.now() - validationStartTime;
    
    res.json({
      // @ts-ignore - scan object properties
      scan,
      status: scanStatus,
      isDuplicate: existingScan.length > 0,
      caseConverted,
      message,
      validationTimeMs,
      performanceOk: validationTimeMs < 200, // Track if under 200ms threshold
      validationDetails: {
        isDuplicate: existingScan.length > 0,
        feederNumberMatched: !!selectedItem,
        mpnMatched,
        internalIdMatched,
        verificationMode,
        internalIdType,
        caseConverted,
        normalizedFeeder,
        normalizedMpnId: normalizedMpnId || null,
      },
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
    const { feederNumber, operatorId, oldSpoolBarcode, newSpoolBarcode, durationSeconds } = req.body;

    if (!feederNumber || !operatorId || !oldSpoolBarcode || !newSpoolBarcode) {
      res.status(400).json({ error: "feederNumber, operatorId, oldSpoolBarcode, and newSpoolBarcode are required" });
      return;
    }

    // === STEP 1: Validate Session Exists ===
    const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    // === STEP 2: Verify Feeder Was Scanned & Verified ===
    const normalizedFeeder = feederNumber.trim().toUpperCase();
    const feederScans = await db
      .select()
      .from(scanRecordsTable)
      .where(
        and(
          eq(scanRecordsTable.sessionId, sessionId),
          eq(scanRecordsTable.feederNumber, normalizedFeeder),
          eq(scanRecordsTable.status, "ok")
        )
      );

    if (feederScans.length === 0) {
      // Feeder not verified - log attempted splice on unverified feeder
      const operatorName = session.operatorName || "UNKNOWN";
      await db.insert(auditLogsTable).values({
        entityType: "feeder_splice",
        entityId: `session_${sessionId}_feeder_${normalizedFeeder}`,
        action: "splice_rejected",
        oldValue: null,
        newValue: JSON.stringify({
          sessionId,
          feederNumber: normalizedFeeder,
          oldSpoolBarcode: oldSpoolBarcode.trim(),
          newSpoolBarcode: newSpoolBarcode.trim(),
          reason: "Feeder not verified before splicing",
        }),
        changedBy: operatorName,
        description: `Splice attempt REJECTED: Feeder ${normalizedFeeder} not verified before splicing attempt`,
        createdAt: TimestampService.createAuditTimestamp(),
      });

      return res.status(400).json({
        error: `❌ Feeder ${normalizedFeeder} has not been verified. Please complete verification before splicing.`,
        feederVerified: false,
      });
    }

    // === STEP 3: Record Splice with Audit Log ===
    const [splice] = await db
      .insert(spliceRecordsTable)
      .values({
        sessionId,
        feederNumber: normalizedFeeder,
        operatorId: operatorId.trim(),
        oldMpn: oldSpoolBarcode.trim(),
        newMpn: newSpoolBarcode.trim(),
        oldSpoolBarcode: oldSpoolBarcode.trim(),
        newSpoolBarcode: newSpoolBarcode.trim(),
        durationSeconds: durationSeconds ?? null,
        splicedAt: TimestampService.createOperationTimestamp(),
      })
      .returning();

    // === STEP 4: Create Comprehensive Audit Log for Splice ===
    const operatorName = session.operatorName || "UNKNOWN";
    const feederScan = feederScans[0];
    
    await db.insert(auditLogsTable).values({
      entityType: "feeder_splice",
      entityId: `session_${sessionId}_feeder_${normalizedFeeder}`,
      action: "splice_recorded",
      oldValue: JSON.stringify({
        feederNumber: normalizedFeeder,
        spoolBarcode: oldSpoolBarcode.trim(),
        scannedComponent: feederScan.internalIdScanned || feederScan.partNumber || "UNKNOWN",
      }),
      newValue: JSON.stringify({
        feederNumber: normalizedFeeder,
        spoolBarcode: newSpoolBarcode.trim(),
        replacementTime: new Date().toISOString(),
        durationSeconds: durationSeconds ?? null,
      }),
      changedBy: operatorName,
      description: `Feeder ${normalizedFeeder} spool replaced: Old spool ${oldSpoolBarcode.trim()} → New spool ${newSpoolBarcode.trim()}${durationSeconds ? ` (Duration: ${durationSeconds}s)` : ""}`,
      createdAt: TimestampService.createAuditTimestamp(),
    });

    // === STEP 5: Return Response ===
    res.status(201).json({
      splice,
      message: `✅ Feeder ${normalizedFeeder} spool successfully replaced`,
      feederVerified: true,
      auditLogged: true,
    });
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
    const changeoverJoinResult = await db.execute(sql`
      SELECT
        cs.id,
        cs.started_at AS "startedAt",
        cs.completed_at AS "completedAt",
        cs.status,
        COALESCE(to_jsonb(cs)->>'verification_mode', 'manual') AS "verificationMode",
        COALESCE(to_jsonb(bh)->>'panel_id', bh.name) AS "panelId",
        to_jsonb(bh)->>'shift' AS shift,
        to_jsonb(bh)->>'customer' AS customer,
        to_jsonb(bh)->>'machine' AS machine,
        COALESCE(to_jsonb(bh)->>'pcb_part_number', to_jsonb(bh)->>'pcbPartNumber') AS "pcbPartNumber",
        to_jsonb(bh)->>'line' AS line,
        COALESCE(to_jsonb(bh)->>'bom_version', bh.name) AS "bomVersion",
        operator_user.display_name AS "operatorName",
        qa_user.display_name AS "qaName",
        supervisor_user.display_name AS "supervisorName",
        fs.feeder_number AS "feederNumber",
        fs.scanned_value AS "scannedValue",
        fs.matched_field AS "matchedField",
        fs.matched_make AS "matchedMake",
        fs.lot_code AS "lotCode",
        fs.status::text AS "scanStatus",
        fs.scanned_at AS "scannedAt",
        bi.reference_location AS "referenceLocation",
        bi.description,
        bi.package_description AS "packageDescription",
        bi.internal_part_number AS "internalPartNumber",
        bi.make_1 AS make1,
        bi.mpn_1 AS mpn1,
        bi.make_2 AS make2,
        bi.mpn_2 AS mpn2,
        bi.make_3 AS make3,
        bi.mpn_3 AS mpn3
      FROM changeover_sessions cs
      LEFT JOIN boms bh ON cs.bom_id = bh.id
      LEFT JOIN users operator_user ON cs.operator_id = operator_user.id
      LEFT JOIN users qa_user ON qa_user.id = NULLIF(to_jsonb(cs)->>'qa_id', '')::int
      LEFT JOIN users supervisor_user ON supervisor_user.id = NULLIF(to_jsonb(cs)->>'supervisor_id', '')::int
      LEFT JOIN feeder_scans fs ON fs.session_id = cs.id
      LEFT JOIN bom_items bi ON bi.feeder_number = fs.feeder_number AND bi.bom_id = cs.bom_id
      WHERE cs.id = ${sessionId}
      ORDER BY fs.scanned_at ASC NULLS LAST
    `);

    const joinedRows: any[] = Array.isArray(changeoverJoinResult?.rows)
      ? changeoverJoinResult.rows
      : (Array.isArray(changeoverJoinResult) ? changeoverJoinResult : []);

    if (joinedRows.length > 0) {
      const first = joinedRows[0];
      const scansOnly = joinedRows.filter((r) => r.feederNumber != null);
      const passCount = scansOnly.filter((r) => String(r.scanStatus).toLowerCase() === "verified").length;
      const failCount = scansOnly.filter((r) => String(r.scanStatus).toLowerCase() === "failed").length;
      const warnCount = scansOnly.filter((r) => String(r.scanStatus).toLowerCase() === "duplicate").length;
      const durationMinutes = first.completedAt
        ? Math.round((new Date(first.completedAt).getTime() - new Date(first.startedAt).getTime()) / 60000)
        : 0;

      res.json({
        session: {
          id: first.id,
          startedAt: first.startedAt,
          completedAt: first.completedAt,
          status: first.status,
          verificationMode: first.verificationMode,
          panelId: first.panelId,
          shift: first.shift,
          customer: first.customer,
          machine: first.machine,
          pcbPartNumber: first.pcbPartNumber,
          line: first.line,
          bomVersion: first.bomVersion,
          operatorName: first.operatorName,
          qaName: first.qaName,
          supervisorName: first.supervisorName,
          durationMinutes,
        },
        summary: {
          sessionId,
          totalBomItems: scansOnly.length,
          scannedCount: scansOnly.length,
          okCount: passCount,
          rejectCount: failCount,
          warningCount: warnCount,
          missingCount: 0,
          completionPercent: scansOnly.length > 0 ? Math.round((passCount / scansOnly.length) * 100) : 0,
          durationMinutes,
        },
        reportRows: scansOnly,
      });
      return;
    }

    const sessions = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
    const [session] = sessions;

    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const scans = await db
      .select()
      .from(scanRecordsTable)
      .where(eq(scanRecordsTable.sessionId, sessionId))
      .orderBy(scanRecordsTable.scannedAt);
    const bomItems = await db
      .select()
      .from(bomItemsTable)
      .where(eq(bomItemsTable.bomId, session.bomId!));
    const boms = await db.select().from(bomsTable).where(eq(bomsTable.id, session.bomId!));
    const [bom] = boms;

    const totalBomItems = bomItems.length;
    const okCount = scans.filter((s) => s.status === "ok").length;
    const rejectCount = scans.filter((s) => s.status === "reject").length;
    const scannedFeederNumbers = new Set(scans.filter((s) => s.status === "ok").map((s) => s.feederNumber.trim().toLowerCase()));
    const missingCount = bomItems.filter((item) => !scannedFeederNumbers.has(item.feederNumber.trim().toLowerCase())).length;
    const completionPercent = totalBomItems > 0 ? Math.round((okCount / totalBomItems) * 100) : 0;
    const start = new Date(session.startTime);
    const end = session.endTime ? new Date(session.endTime) : new Date();
    const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);

    const reportRows = bomItems.map((item: any) => {
      const feederScan = scans.find((s: any) => s.feederNumber?.trim()?.toUpperCase() === item.feederNumber?.trim()?.toUpperCase());
      return {
        id: sessionId,
        startedAt: session.startTime,
        completedAt: session.endTime,
        status: session.status,
        verificationMode: session.verificationMode ?? "manual",
        panelId: session.panelName,
        shift: session.shiftName,
        customer: session.customerName,
        machine: session.machineName ?? null,
        pcbPartNumber: session.panelName,
        line: session.supervisorName,
        bomVersion: bom?.name ?? null,
        operatorName: session.operatorName,
        qaName: session.qaName ?? null,
        supervisorName: session.supervisorName,
        feederNumber: item.feederNumber,
        scannedValue: feederScan?.spoolBarcode ?? feederScan?.scannedMpn ?? null,
        matchedField: null,
        matchedMake: null,
        lotCode: feederScan?.lotNumber ?? null,
        scanStatus: feederScan?.status === "ok" ? "verified" : feederScan?.status === "reject" ? "failed" : null,
        scannedAt: feederScan?.scannedAt ?? null,
        referenceLocation: item.referenceLocation,
        description: item.description ?? item.itemName,
        packageDescription: item.packageDescription,
        internalPartNumber: item.internalPartNumber,
        make1: item.make1,
        mpn1: item.mpn1,
        make2: item.make2,
        mpn2: item.mpn2,
        make3: item.make3,
        mpn3: item.mpn3,
      };
    });

    res.json({
      session: {
        id: session.id,
        startedAt: session.startTime,
        completedAt: session.endTime,
        status: session.status,
        verificationMode: session.verificationMode ?? "manual",
        panelId: session.panelName,
        shift: session.shiftName,
        customer: session.customerName,
        machine: session.machineName,
        pcbPartNumber: session.panelName,
        line: session.supervisorName,
        bomVersion: bom?.name ?? null,
        operatorName: session.operatorName,
        qaName: session.qaName ?? null,
        supervisorName: session.supervisorName,
        durationMinutes,
      },
      summary: {
        sessionId,
        totalBomItems,
        scannedCount: scans.length,
        okCount,
        rejectCount,
        warningCount: 0,
        missingCount,
        completionPercent,
        durationMinutes,
      },
      reportRows,
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
