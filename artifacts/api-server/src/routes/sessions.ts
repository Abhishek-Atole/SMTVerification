// @ts-nocheck
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sessionsTable, scanRecordsTable, spliceRecordsTable, bomItemsTable, bomsTable, auditLogsTable } from "@workspace/db/schema";
import { eq, and, sql, isNull, isNotNull } from "drizzle-orm";
import { ValidationService } from "../services/validation-service";
import { TimestampService } from "../services/timestamp-service";

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

router.patch("/sessions/:sessionId", async (req, res) => {
  try {
    const sessionId = Number(req.params.sessionId);
    const { endTime, productionCount, status, logoUrl } = req.body;
    const updates: Record<string, unknown> = {};
    if (endTime !== undefined) updates.endTime = new Date(endTime);
    if (productionCount !== undefined) updates.productionCount = productionCount;
    if (status !== undefined) updates.status = status;
    if (logoUrl !== undefined) updates.logoUrl = logoUrl;

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

// Utility function for case normalization
function normalizeInput(input?: string | null): string | undefined {
  return input ? input.trim().toUpperCase() : undefined;
}

router.post("/sessions/:sessionId/scans", async (req, res) => {
  try {
    const sessionId = Number(req.params.sessionId);
    const { 
      feederNumber, 
      mpnOrInternalId,
      internalIdType = "mpn",
      verificationMode = "manual",
      spoolBarcode, 
      selectedItemId 
    } = req.body;

    if (!feederNumber) {
      res.status(400).json({ error: "feederNumber is required" });
      return;
    }

    if (!verificationMode || !["manual", "auto"].includes(verificationMode)) {
      res.status(400).json({ error: "verificationMode must be 'manual' or 'auto'" });
      return;
    }

    const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

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
        message: `❌ DUPLICATE ENTRY: Feeder ${normalizedFeeder} already scanned and PASSED in this session. Cannot re-scan.`,
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
    let fuzzyMatchResult: any = { score: 0, matches: false };
    let matchingAlgorithm = "exact";
    let expectedValue = "";
    let suggestions: any[] = [];

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
        // Check if BOM item has expected validation requirements
        const hasExpectedMpn = !!selectedItem.expectedMpn?.trim();
        const hasExpectedInternalId = !!selectedItem.internalId?.trim();

        // Step 2: Validate MPN/Internal ID based on what's provided and required
        if (normalizedMpnId) {
          // User provided an MPN or Internal ID
          const expectedMpn = selectedItem.expectedMpn?.trim().toUpperCase();
          const expectedInternalId = selectedItem.internalId?.trim().toUpperCase();
          
          let userInputMatches = false;
          
          if (internalIdType === "mpn") {
            // User provided an MPN - compare to expectedMpn with fuzzy matching
            expectedValue = expectedMpn || "";
            if (hasExpectedMpn && expectedMpn) {
              // Use fuzzy matching instead of exact match
              fuzzyMatchResult = ValidationService.fuzzyMatchValue(
                normalizedMpnId,
                expectedMpn,
                0.95 // 95% threshold
              );
              userInputMatches = fuzzyMatchResult.matches;
              matchingAlgorithm = fuzzyMatchResult.score === 100 ? "exact" : "fuzzy";
              if (fuzzyMatchResult.suggestions && fuzzyMatchResult.suggestions.length > 0) {
                suggestions = fuzzyMatchResult.suggestions;
              }
            } else {
              // No fuzzy match needed, accept as provided
              userInputMatches = true;
            }
            mpnMatched = userInputMatches;
          } else if (internalIdType === "internal_id") {
            // User provided an Internal ID - compare to expectedInternalId with fuzzy matching
            expectedValue = expectedInternalId || "";
            if (hasExpectedInternalId && expectedInternalId) {
              // Use fuzzy matching instead of exact match
              fuzzyMatchResult = ValidationService.fuzzyMatchValue(
                normalizedMpnId,
                expectedInternalId,
                0.95 // 95% threshold
              );
              userInputMatches = fuzzyMatchResult.matches;
              matchingAlgorithm = fuzzyMatchResult.score === 100 ? "exact" : "fuzzy";
              if (fuzzyMatchResult.suggestions && fuzzyMatchResult.suggestions.length > 0) {
                suggestions = fuzzyMatchResult.suggestions;
              }
            } else {
              // No fuzzy match needed, accept as provided
              userInputMatches = true;
            }
            internalIdMatched = userInputMatches;
          }

          // Determine scan status based on mode
          if (verificationMode === "auto") {
            // AUTO mode: MUST match if BOM has expected value
            if (hasExpectedMpn || hasExpectedInternalId) {
              if (!userInputMatches) {
                scanStatus = "reject";
                message = `❌ AUTO MODE REJECTED: ${internalIdType === "mpn" ? "MPN" : "Internal ID"} '${normalizedMpnId}' (${fuzzyMatchResult.score}% match) does NOT meet 95% threshold. Expected: '${expectedValue}'${suggestions.length > 0 ? ` — Did you mean: ${suggestions.join(", ")}?` : ""}`;
              } else {
                scanStatus = "ok";
                const matchType = matchingAlgorithm === "exact" ? "VERIFIED (EXACT)" : `VERIFIED (${fuzzyMatchResult.score}% MATCH)`;
                message = `✅ ${matchType}: Feeder ${normalizedFeeder} with ${internalIdType} ${normalizedMpnId} PASSED validation`;
              }
            } else {
              // BOM doesn't require validation, but user provided value - accept it
              scanStatus = "ok";
              message = `✅ Feeder ${normalizedFeeder} with ${internalIdType} ${normalizedMpnId} ACCEPTED`;
            }
          } else if (verificationMode === "manual") {
            // MANUAL mode: Strict validation - REJECT if provided MPN doesn't meet threshold
            if (userInputMatches) {
              scanStatus = "ok";
              const matchType = matchingAlgorithm === "exact" ? "VERIFIED (EXACT)" : `VERIFIED (${fuzzyMatchResult.score}% MATCH)`;
              message = `✅ ${matchType}: Feeder ${normalizedFeeder} with ${internalIdType} ${normalizedMpnId} PASSED`;
            } else {
              // STRICT: Reject if user provided insufficient/incorrect MPN/ID but BOM requires validation
              if (hasExpectedMpn || hasExpectedInternalId) {
                scanStatus = "reject";
                message = `❌ VALIDATION FAILED: Feeder ${normalizedFeeder} - ${internalIdType === "mpn" ? "MPN" : "Internal ID"} '${normalizedMpnId}' (${fuzzyMatchResult.score}% match) does NOT meet 95% threshold. Required: '${expectedValue}'${suggestions.length > 0 ? ` — Did you mean: ${suggestions.join(", ")}?` : ""}`;
              } else {
                // BOM doesn't require validation, so accept the provided value
                scanStatus = "ok";
                message = `✅ Feeder ${normalizedFeeder} with provided ${internalIdType} '${normalizedMpnId}' ACCEPTED (no validation required in BOM)`;
              }
            }
          }
        } else {
          // No MPN/Internal ID provided - check if validation was required
          if (hasExpectedMpn || hasExpectedInternalId) {
            // BOM requires validation but user didn't provide it
            if (verificationMode === "auto") {
              // AUTO mode: REJECT if required but not provided
              scanStatus = "reject";
              const expectedLabel = hasExpectedMpn ? "MPN" : "Internal ID";
              message = `❌ AUTO MODE REJECTED: ${expectedLabel} REQUIRED for feeder ${normalizedFeeder} but not provided. Expected: ${hasExpectedMpn ? selectedItem.expectedMpn : selectedItem.internalId}`;
            } else if (verificationMode === "manual") {
              // MANUAL mode: WARN and record for operator review
              scanStatus = "ok";
              const expectedLabel = hasExpectedMpn ? "MPN" : "Internal ID";
              message = `⚠️ WARNING: Feeder ${normalizedFeeder} - ${expectedLabel} NOT provided but required. Expected: ${hasExpectedMpn ? selectedItem.expectedMpn : selectedItem.internalId}. OPERATOR REVIEW REQUIRED.`;
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
        verificationMode: verificationMode,
        matchScore: fuzzyMatchResult.score > 0 ? fuzzyMatchResult.score : null,
        matchingAlgorithm: matchingAlgorithm,
        expectedValue: expectedValue || null,
        suggestions: suggestions.length > 0 ? JSON.stringify(suggestions) : null,
        scannedAt: TimestampService.createScanTimestamp(),
      })
      .returning();

    // === NEW: AUDIT LOGGING ===
    const operatorName = session.operatorName || "UNKNOWN";
    const auditDescription = `${verificationMode.toUpperCase()} mode scan: Feeder ${normalizedFeeder} - Status: ${scanStatus === "ok" ? "PASSED" : "REJECTED"}${normalizedMpnId ? ` - ${internalIdType}: ${normalizedMpnId}` : ""}`;
    
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
    res.json({
      // @ts-ignore - scan object properties
      scan,
      status: scanStatus,
      isDuplicate: existingScan.length > 0,
      caseConverted,
      message,
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
        splicedAt: TimestampService.createOperationTimestamp(),
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
    const sessions = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
    const [session] = sessions;
    
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const scans = await db.select().from(scanRecordsTable).where(eq(scanRecordsTable.sessionId, sessionId)).orderBy(scanRecordsTable.scannedAt);
    const bomItems = await db.select().from(bomItemsTable).where(eq(bomItemsTable.bomId, session.bomId!));
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

    // Map scans to serializable format
    const mappedScans = scans.map((scan: any) => ({
      id: scan.id,
      sessionId: scan.sessionId,
      feederNumber: scan.feederNumber,
      spoolBarcode: scan.spoolBarcode,
      status: scan.status,
      message: scan.message,
      scannedAt: scan.scannedAt,
      processedAt: scan.processedAt,
    }));

    // Map BOM items to serializable format
    const mappedBomItems = bomItems.map((item: any) => ({
      id: item.id,
      bomId: item.bomId,
      srNo: item.srNo,
      feederNumber: item.feederNumber,
      itemName: item.itemName,
      rdeplyPartNo: item.rdeplyPartNo,
      referenceDesignator: item.referenceDesignator,
      values: item.values,
      packageDescription: item.packageDescription,
      dnpParts: item.dnpParts,
      supplier1: item.supplier1,
      partNo1: item.partNo1,
      supplier2: item.supplier2,
      partNo2: item.partNo2,
      supplier3: item.supplier3,
      partNo3: item.partNo3,
      remarks: item.remarks,
      partNumber: item.partNumber,
      feederId: item.feederId,
      componentId: item.componentId,
      mpn: item.mpn,
      manufacturer: item.manufacturer,
      packageSize: item.packageSize,
      expectedMpn: item.expectedMpn,
      description: item.description,
      location: item.location,
      quantity: item.quantity,
      leadTime: item.leadTime,
      cost: item.cost ? String(item.cost) : null,
      isAlternate: item.isAlternate,
      parentItemId: item.parentItemId,
    }));

    // Map session to serializable format
    const mappedSession = {
      id: session.id,
      bomId: session.bomId,
      bomName: bom?.name ?? "",
      machineId: session.machineId,
      machineName: session.machineName,
      operatorName: session.operatorName,
      supervisorName: session.supervisorName,
      qaOfficerName: session.qaOfficerName,
      productionLineId: session.productionLineId,
      verificationMode: session.verificationMode,
      startTime: session.startTime,
      endTime: session.endTime,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      deletedAt: session.deletedAt,
      scans: mappedScans,
    };

    res.json({
      session: mappedSession,
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
      bomItems: mappedBomItems,
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
