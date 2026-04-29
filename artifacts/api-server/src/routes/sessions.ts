// @ts-nocheck
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sessionsTable, scanRecordsTable, spliceRecordsTable, bomItemsTable, bomsTable, auditLogsTable } from "@workspace/db/schema";
import { eq, and, sql, desc, isNull, isNotNull, count, inArray } from "drizzle-orm";
import { TimestampService } from "../services/timestamp-service";
import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";

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

type SpliceMatch = {
  matchedField: "mpn1" | "mpn2" | "mpn3" | "internalPartNumber";
  matchedAs: string;
  matchedMake: string;
  status: "verified" | "alternate";
};

type SpliceAuditPayload = {
  feederNumber: string;
  scannedValue: string;
  matchedAs: string;
  matchedField: string;
  lotCode: string | null;
  status: "verified" | "alternate" | "failed";
  verificationMode: string;
  operatorId: number | string;
  splicedAt: string;
};

function normalizeExact(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (["", "N/A", "NA", "-", "NONE"].includes(normalized)) {
    return "";
  }
  return normalized;
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

function verifySpliceMpn(scanned: string, bomRow: BomRowForMPN): SpliceMatch | null {
  const s = normalizeExact(scanned);

  const mpn1 = normalizeExact(bomRow.mpn1);
  if (mpn1 && mpn1 === s) {
    return {
      matchedField: "mpn1",
      matchedAs: `MPN 1${bomRow.make1 ? ` (${bomRow.make1})` : ""}`,
      matchedMake: bomRow.make1 ?? "",
      status: "verified",
    };
  }

  const mpn2 = normalizeExact(bomRow.mpn2);
  if (mpn2 && mpn2 === s) {
    return {
      matchedField: "mpn2",
      matchedAs: `MPN 2${bomRow.make2 ? ` (${bomRow.make2})` : ""}`,
      matchedMake: bomRow.make2 ?? "",
      status: "alternate",
    };
  }

  const mpn3 = normalizeExact(bomRow.mpn3);
  if (mpn3 && mpn3 === s) {
    return {
      matchedField: "mpn3",
      matchedAs: `MPN 3${bomRow.make3 ? ` (${bomRow.make3})` : ""}`,
      matchedMake: bomRow.make3 ?? "",
      status: "alternate",
    };
  }

  const tokens = tokenizeInternalPartNumber(bomRow.internalPartNumber);
  if (tokens.includes(s)) {
    return {
      matchedField: "internalPartNumber",
      matchedAs: "Internal ID",
      matchedMake: "",
      status: "alternate",
    };
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

function parseSpliceAuditPayload(value: string | null | undefined): SpliceAuditPayload | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<SpliceAuditPayload>;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return {
      feederNumber: String(parsed.feederNumber ?? ""),
      scannedValue: String(parsed.scannedValue ?? ""),
      matchedAs: String(parsed.matchedAs ?? ""),
      matchedField: String(parsed.matchedField ?? ""),
      lotCode: parsed.lotCode != null ? String(parsed.lotCode) : null,
      status: parsed.status === "verified" || parsed.status === "alternate" ? parsed.status : "failed",
      verificationMode: String(parsed.verificationMode ?? "AUTO"),
      operatorId: parsed.operatorId ?? "",
      splicedAt: String(parsed.splicedAt ?? ""),
    };
  } catch {
    return null;
  }
}

function buildSpliceResponse(
  splice: {
    id: number;
    sessionId: number;
    feederNumber: string;
    operatorId: string;
    oldMpn: string | null;
    newMpn: string | null;
    oldSpoolBarcode: string;
    newSpoolBarcode: string;
    durationSeconds: number | null;
    splicedAt: Date;
  },
  bomItem: any,
  payload: SpliceAuditPayload | null,
) {
  const matchedField = payload?.matchedField ?? normalizeExact(splice.oldSpoolBarcode) ?? null;
  const matchedAs = payload?.matchedAs ?? splice.oldMpn ?? "";
  const scannedValue = payload?.scannedValue ?? splice.newMpn ?? splice.newSpoolBarcode ?? "";
  const lotCode = payload?.lotCode ?? null;
  const status = payload?.status ?? (matchedField === "mpn1" ? "verified" : matchedField ? "alternate" : "failed");
  const verificationMode = payload?.verificationMode ?? "AUTO";

  return {
    ...splice,
    bomItem,
    expectedMpns: bomItem
      ? [bomItem.mpn1, bomItem.mpn2, bomItem.mpn3].map((value: string | null | undefined) => normalizeExact(value)).filter(Boolean)
      : [],
    scannedValue,
    matchedAs,
    matchedField,
    lotCode,
    status,
    verificationMode,
  };
}

function formatMatchedAs(matchedField: string | null | undefined, matchedMake: string | null | undefined): string {
  const field = String(matchedField ?? "").toLowerCase();
  if (field === "mpn1") return `MPN 1${matchedMake ? ` (${matchedMake})` : ""}`;
  if (field === "mpn2") return `MPN 2${matchedMake ? ` (${matchedMake})` : ""}`;
  if (field === "mpn3") return `MPN 3${matchedMake ? ` (${matchedMake})` : ""}`;
  if (field === "internalpartnumber") return "Internal P/N";
  return "—";
}

type SessionReportPayload = {
  session: {
    id: number;
    startedAt: string | Date | null;
    completedAt: string | Date | null;
    status: string | null;
    verificationMode: string | null;
    panelId: string | null;
    shift: string | null;
    customer: string | null;
    machine: string | null;
    pcbPartNumber: string | null;
    line: string | null;
    bomVersion: string | null;
    operatorName: string | null;
    qaName: string | null;
    supervisorName: string | null;
    durationMinutes: number;
  };
  summary: {
    sessionId: number;
    totalBomItems: number;
    scannedCount: number;
    okCount: number;
    rejectCount: number;
    warningCount: number;
    missingCount: number;
    completionPercent: number;
    durationMinutes: number;
  };
  reportRows: any[];
};

async function buildSessionReportPayload(sessionId: number): Promise<SessionReportPayload | null> {
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
        bi.values AS "value",
        bi.package_description AS "packageDescription",
        bi.package_description AS "packageType",
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
    const scansOnly = joinedRows
      .filter((r) => r.feederNumber != null)
      .map((r) => {
        const normalizedScanStatus = String(r.scanStatus ?? "").toLowerCase();
        const status = normalizedScanStatus === "verified"
          ? "verified"
          : normalizedScanStatus === "failed"
            ? "failed"
            : "missing";

        return {
          ...r,
          status,
          matchedAs: formatMatchedAs(r.matchedField, r.matchedMake),
          verificationMode: r.verificationMode,
          packageType: r.packageType ?? r.packageDescription ?? null,
        };
      });
    const passCount = scansOnly.filter((r) => String(r.scanStatus).toLowerCase() === "verified").length;
    const failCount = scansOnly.filter((r) => String(r.scanStatus).toLowerCase() === "failed").length;
    const warnCount = scansOnly.filter((r) => String(r.scanStatus).toLowerCase() === "duplicate").length;
    const durationMinutes = first.completedAt
      ? Math.round((new Date(first.completedAt).getTime() - new Date(first.startedAt).getTime()) / 60000)
      : 0;

    return {
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
    };
  }

  const sessions = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
  const [session] = sessions;
  if (!session) return null;

  const scans = await db
    .select()
    .from(scanRecordsTable)
    .where(eq(scanRecordsTable.sessionId, sessionId))
    .orderBy(scanRecordsTable.scannedAt);
  const bomItems = session.bomId
    ? await db.select().from(bomItemsTable).where(eq(bomItemsTable.bomId, session.bomId))
    : [];
  const [bom] = session.bomId
    ? await db.select().from(bomsTable).where(eq(bomsTable.id, session.bomId))
    : [null];

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
    
    // Determine scanned value and matched field
    const scannedVal = feederScan?.spoolBarcode ?? feederScan?.internalIdScanned ?? feederScan?.scannedMpn ?? null;
    
    // Match the scanned value against BOM MPNs to determine matched field and make
    let matchedField = null;
    let matchedMake = null;
    
    if (scannedVal && feederScan?.status === "ok") {
      const normalizedScanned = String(scannedVal).trim().toUpperCase();
      
      // Check internal part number
      if (item.internalPartNumber) {
        const internalTokens = String(item.internalPartNumber)
          .split(/\s+/)
          .map((t: string) => t.trim().toUpperCase())
          .filter(Boolean);
        if (internalTokens.includes(normalizedScanned)) {
          matchedField = "internalPartNumber";
          matchedMake = null;
        }
      }
      
      // Check MPN1 (primary)
      if (!matchedField && item.mpn1 && String(item.mpn1).trim().toUpperCase() === normalizedScanned) {
        matchedField = "mpn1";
        matchedMake = item.make1 ?? null;
      }
      
      // Check MPN2 (alternate)
      if (!matchedField && item.mpn2 && String(item.mpn2).trim().toUpperCase() === normalizedScanned) {
        matchedField = "mpn2";
        matchedMake = item.make2 ?? null;
      }
      
      // Check MPN3 (alternate)
      if (!matchedField && item.mpn3 && String(item.mpn3).trim().toUpperCase() === normalizedScanned) {
        matchedField = "mpn3";
        matchedMake = item.make3 ?? null;
      }
    }
    
    return {
      id: sessionId,
      startedAt: session.startTime,
      completedAt: session.endTime,
      status: feederScan?.status === "ok" ? "verified" : feederScan?.status === "reject" ? "failed" : "missing",
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
      scannedValue: scannedVal,
      matchedField: matchedField,
      matchedMake: matchedMake,
      matchedAs: formatMatchedAs(matchedField, matchedMake),
      lotCode: feederScan?.lotNumber ?? null,
      scanStatus: feederScan?.status === "ok" ? "verified" : feederScan?.status === "reject" ? "failed" : null,
      scannedAt: feederScan?.scannedAt ?? null,
      referenceLocation: item.referenceLocation,
      description: item.description ?? item.itemName,
      value: item.values ?? item.value ?? null,
      packageDescription: item.packageDescription,
      packageType: item.packageDescription,
      internalPartNumber: item.internalPartNumber,
      make1: item.make1,
      mpn1: item.mpn1,
      make2: item.make2,
      mpn2: item.mpn2,
      make3: item.make3,
      mpn3: item.mpn3,
    };
  });

  return {
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
  };
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

// Deleted sessions route (must be before parametric routes to avoid :sessionId shadowing)
router.get("/sessions/deleted", async (req, res) => {
  try {
    const deleted = await db
      .select()
      .from(sessionsTable)
      .where(isNotNull(sessionsTable.deletedAt))
      .orderBy(desc(sessionsTable.deletedAt));

    return res.json(deleted);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to fetch deleted sessions" });
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
    let bomItemCount = 0;
    if (session.bomId !== null) {
      const [bom] = await db.select().from(bomsTable).where(eq(bomsTable.id, session.bomId));
      bomName = bom?.name ?? "";
      
      const [{ count: itemCount }] = await db
        .select({ count: count() })
        .from(bomItemsTable)
        .where(and(eq(bomItemsTable.bomId, session.bomId), isNull(bomItemsTable.deletedAt)));
      bomItemCount = Number(itemCount ?? 0);
    }
    
    res.json({ ...session, bomName, bomItemCount, scans });
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
        internalIdScanned: scanRecordsTable.internalIdScanned,
        scannedMpn: scanRecordsTable.scannedMpn,
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
        scannedValue: row.scannedValue ?? row.internalIdScanned ?? row.scannedMpn ?? "—",
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

function formatSmtSessionId(sourceDate: Date | string | null | undefined, sequence: number): string {
  const date = sourceDate ? new Date(sourceDate) : new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const seq = String(sequence).padStart(6, "0");
  return `SMT_${y}${m}${d}_${seq}`;
}

router.post("/sessions/:sessionId/scans", async (req, res) => {
  try {
    // === PERFORMANCE: Track validation time ===
    const validationStartTime = Date.now();
    
    const sessionId = Number(req.params.sessionId);
    const { 
      feederNumber, 
      mpnOrInternalId,
      lotCode,
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
    const normalizedLotCode = normalizeInput(lotCode);
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
        lotNumber: normalizedLotCode ?? null,
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
    const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const splices = await db
      .select()
      .from(spliceRecordsTable)
      .where(eq(spliceRecordsTable.sessionId, sessionId))
      .orderBy(spliceRecordsTable.splicedAt);

    const spliceEntityIds = splices.map((splice) => `splice_${splice.id}`);
    const auditLogs = spliceEntityIds.length > 0
      ? await db
          .select()
          .from(auditLogsTable)
          .where(
            and(
              eq(auditLogsTable.entityType, "feeder_splice"),
              inArray(auditLogsTable.entityId, spliceEntityIds),
            ),
          )
      : [];

    const auditPayloadMap = new Map<string, SpliceAuditPayload>();
    for (const auditLog of auditLogs) {
      const payload = parseSpliceAuditPayload(auditLog.newValue ?? auditLog.oldValue ?? null);
      if (payload) {
        auditPayloadMap.set(auditLog.entityId, payload);
      }
    }

    const bomItems = session.bomId
      ? await db
          .select()
          .from(bomItemsTable)
          .where(and(eq(bomItemsTable.bomId, session.bomId), isNull(bomItemsTable.deletedAt)))
      : [];

    const bomItemMap = new Map<string, (typeof bomItems)[number]>();
    for (const item of bomItems) {
      bomItemMap.set(normalizeExact(item.feederNumber), item);
    }

    res.json(
      splices.map((splice) => {
        const bomItem = bomItemMap.get(normalizeExact(splice.feederNumber)) ?? null;
        const payload = auditPayloadMap.get(`splice_${splice.id}`) ?? null;

        return buildSpliceResponse(splice, bomItem, payload);
      })
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list splices" });
  }
});

router.post("/sessions/:sessionId/splices", async (req, res) => {
  try {
    const sessionId = Number(req.params.sessionId);
    const {
      feederNumber,
      operatorId,
      newSpoolBarcode,
      scannedValue,
      lotCode,
      verificationMode,
      oldSpoolBarcode,
      durationSeconds,
      matchedAs,
      matchedField,
      status,
    } = req.body;

    const scannedSpool = String(scannedValue ?? newSpoolBarcode ?? "").trim();
    if (!feederNumber || !operatorId || !scannedSpool) {
      res.status(400).json({ error: "feederNumber, operatorId, and scannedValue/newSpoolBarcode are required" });
      return;
    }

    // === STEP 1: Validate Session Exists ===
    const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    // === STEP 2: Verify Feeder Was Scanned & Verified ===
    const normalizedFeeder = String(feederNumber).trim().toUpperCase();
    const normalizedOperatorId = String(operatorId).trim();
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

    const [bomItem] = await db
      .select()
      .from(bomItemsTable)
      .where(and(eq(bomItemsTable.bomId, session.bomId), eq(bomItemsTable.feederNumber, normalizedFeeder), isNull(bomItemsTable.deletedAt)));

    if (!bomItem) {
      return res.status(404).json({ error: `Feeder ${normalizedFeeder} not found in BOM` });
    }

    const match = verifySpliceMpn(scannedSpool, {
      internalPartNumber: bomItem.internalPartNumber,
      mpn1: bomItem.mpn1,
      mpn2: bomItem.mpn2,
      mpn3: bomItem.mpn3,
      make1: bomItem.make1,
      make2: bomItem.make2,
      make3: bomItem.make3,
    });

    if (!match) {
      return res.status(400).json({
        error: `Wrong part. Expected: ${[bomItem.mpn1, bomItem.mpn2, bomItem.mpn3].filter(Boolean).join(" / ") || "No MPNs configured"}`,
        status: "failed",
        expectedMpns: [bomItem.mpn1, bomItem.mpn2, bomItem.mpn3].filter(Boolean),
      });
    }

    const feederWasVerified = feederScans.length > 0;
    const verificationModeValue = String(verificationMode ?? session.verificationMode ?? "AUTO").toUpperCase() === "MANUAL" ? "MANUAL" : "AUTO";
    const splicedAt = TimestampService.createOperationTimestamp();

    // === STEP 3: Record Splice with Audit Log ===
    const [splice] = await db
      .insert(spliceRecordsTable)
      .values({
        sessionId,
        feederNumber: normalizedFeeder,
        operatorId: normalizedOperatorId,
        oldMpn: String(matchedAs ?? match.matchedAs).trim(),
        newMpn: scannedSpool,
        oldSpoolBarcode: String(matchedField ?? match.matchedField).trim(),
        newSpoolBarcode: String(lotCode ?? scannedSpool).trim(),
        durationSeconds: durationSeconds ?? null,
        splicedAt,
      })
      .returning();

    // === STEP 4: Create Comprehensive Audit Log for Splice ===
    const operatorName = session.operatorName || "UNKNOWN";
    const feederScan = feederScans[0];
    const auditPayload: SpliceAuditPayload = {
      feederNumber: normalizedFeeder,
      scannedValue: scannedSpool,
      matchedAs: match.matchedAs,
      matchedField: match.matchedField,
      lotCode: lotCode ?? null,
      status: match.status,
      verificationMode: verificationModeValue,
      operatorId: normalizedOperatorId,
      splicedAt: new Date(splicedAt).toISOString(),
    };
    
    await db.insert(auditLogsTable).values({
      entityType: "feeder_splice",
      entityId: `splice_${splice.id}`,
      action: "splice_recorded",
      oldValue: JSON.stringify({
        feederNumber: normalizedFeeder,
        scannedValue: scannedSpool,
      }),
      newValue: JSON.stringify(auditPayload),
      changedBy: operatorName,
      description: `Feeder ${normalizedFeeder} splice recorded: ${match.matchedAs} (${match.status.toUpperCase()})${feederWasVerified ? "" : " [before feeder verification]"}${durationSeconds ? ` (Duration: ${durationSeconds}s)` : ""}`,
      createdAt: TimestampService.createAuditTimestamp(),
    });

    // === STEP 5: Return Response ===
    res.status(201).json({
      ...buildSpliceResponse(splice, bomItem, auditPayload),
      message: feederWasVerified
        ? `✅ Splice Approved — ${match.matchedAs}`
        : `⚠ Splice Approved — ${match.matchedAs} (feeder not previously verified)`,
      feederVerified: feederWasVerified,
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
    if (!Number.isFinite(sessionId)) {
      res.status(400).json({ error: "Invalid sessionId" });
      return;
    }

    const reportPayload = await buildSessionReportPayload(sessionId);
    if (!reportPayload) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    res.json(reportPayload);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get session report" });
  }
});

router.get("/sessions/:sessionId/report/pdf", async (req, res) => {
  try {
    const sessionId = Number(req.params.sessionId);
    if (!Number.isFinite(sessionId)) {
      res.status(400).json({ error: "Invalid sessionId" });
      return;
    }

    const reportPayload = await buildSessionReportPayload(sessionId);
    if (!reportPayload) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const [baseSession] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
    const [bom] = baseSession?.bomId
      ? await db.select().from(bomsTable).where(eq(bomsTable.id, baseSession.bomId))
      : [null];

    const { session: reportSession, summary, reportRows } = reportPayload;

    const safeText = (value: any): string => String(value ?? "").trim() || "—";

    const rows = reportRows.map((row: any, rowIndex: number) => {
      const scanStatus = String(row.scanStatus ?? row.status ?? "").toLowerCase();
      const status = scanStatus === "verified" || scanStatus === "pass" || scanStatus === "ok"
        ? "verified"
        : scanStatus === "failed" || scanStatus === "reject"
          ? "failed"
          : scanStatus === "duplicate"
            ? "duplicate"
            : "missing";

      const matchedField = String(row.matchedField ?? "").toLowerCase();
      const matchedLabel = matchedField === "mpn1"
        ? `MPN 1 (${row.make1 ?? ""})`
        : matchedField === "mpn2"
          ? `MPN 2 (${row.make2 ?? ""})`
          : matchedField === "mpn3"
            ? `MPN 3 (${row.make3 ?? ""})`
            : matchedField === "internalpartnumber"
              ? "Internal P/N"
              : "—";

      const expectedParts = [row.mpn1, row.mpn2, row.mpn3]
        .filter((val: any) => val && String(val).trim())
        .map((val: any) => String(val).trim());
      const expectedMpns = expectedParts.length > 0 ? expectedParts.join("\n") : "—";

      const scannedValue = safeText(row.scannedValue);
      const isAlternate = matchedField === "mpn2" || matchedField === "mpn3";
      const isFailed = status === "failed";

      const scannedText = isFailed
        ? `${scannedValue} ✗`
        : isAlternate
          ? `${scannedValue} ▲`
          : scannedValue;

      return {
        rowIndex,
        feederNumber: safeText(row.feederNumber),
        refDes: safeText(row.referenceLocation),
        component: safeText(row.description),
        value: safeText(row.value),
        pkgSize: safeText(row.packageDescription ?? row.packageType),
        internalPartNo: safeText(row.internalPartNumber),
        expectedMpns,
        scannedText,
        matchedLabel,
        lotCode: safeText(row.lotCode),
        modeText: String(row.verificationMode ?? reportSession.verificationMode ?? "AUTO").toUpperCase() === "MANUAL" ? "MAN" : "AUTO",
        status: status === "verified" ? "PASS" : status === "failed" ? "FAIL" : status === "duplicate" ? "DUP" : "MISS",
        scannedAt: row.scannedAt ? new Date(row.scannedAt).toLocaleTimeString("en-US", { hour12: true }) : "—",
        isAlternate,
        isFailed,
      };
    });

    const totalFeeders = Number(summary.totalBomItems ?? rows.length);
    const passCount = Number(summary.okCount ?? rows.filter((r) => r.status === "VERIFIED").length);
    const failCount = Number(summary.rejectCount ?? rows.filter((r) => r.status === "FAILED").length);
    const warnCount = Number(summary.warningCount ?? rows.filter((r) => r.status === "DUPLICATE").length);
    const passRate = totalFeeders > 0 ? Math.round((passCount / totalFeeders) * 100) : 0;
    const reportSessionId = formatSmtSessionId(
      reportSession.startedAt ? new Date(reportSession.startedAt) : new Date(),
      reportSession.id,
    );

    const CO_NAME = process.env.COMPANY_NAME ?? process.env.VITE_COMPANY_NAME ?? baseSession?.companyName ?? "Your Company";
    const CO_SHORT = process.env.COMPANY_SHORT ?? process.env.VITE_COMPANY_SHORT ?? "CO";
    const CO_LOGO = process.env.COMPANY_LOGO_PATH ?? process.env.VITE_LOGO_URL ?? null;
    const SYS_TITLE = process.env.SYSTEM_TITLE ?? process.env.VITE_SYSTEM_TITLE ?? "SMT Verification";

    const getLogoPath = () => {
      const candidates = [
        CO_LOGO,
        CO_LOGO ? path.resolve(process.cwd(), CO_LOGO) : null,
        path.resolve(process.cwd(), "artifacts/api-server/assets/ucal-logo.png"),
        path.resolve(process.cwd(), "artifacts/feeder-scanner/public/assets/ucal-logo.png"),
      ].filter((candidate): candidate is string => Boolean(candidate));

      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }

      return null;
    };

    const C = {
      NAVY: "#1A3557",
      BLUE: "#1D4ED8",
      BLUE_DARK: "#1E40AF",
      BLUE_LIGHT: "#EFF6FF",
      WHITE: "#FFFFFF",
      BLACK: "#0F172A",
      GREY_DARK: "#374151",
      GREY_MID: "#6B7280",
      GREY_MUTED: "#9CA3AF",
      GREY_LIGHT: "#F3F4F6",
      CARD_LIGHT: "#F8FAFC",
      GREY_BORDER: "#D1D5DB",
      GREEN: "#15803D",
      GREEN_BG: "#F0FDF4",
      RED: "#B91C1C",
      RED_BG: "#FEF2F2",
      AMBER: "#B45309",
      AMBER_BG: "#FFFBEB",
      BLUE_ACCENT: "#2563EB",
    } as const;

    const toRgb = (hex: string): [number, number, number] => {
      const value = hex.replace("#", "");
      return [
        Number.parseInt(value.slice(0, 2), 16),
        Number.parseInt(value.slice(2, 4), 16),
        Number.parseInt(value.slice(4, 6), 16),
      ];
    };

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="SMT_Report_${reportSessionId}.pdf"`);

    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margins: { top: 20, bottom: 20, left: 20, right: 20 },
    });
    doc.pipe(res);

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const left = 20;
    const right = pageW - 20;
    const usable = right - left;
    let y = 20;

    const getModeLabel = () => `Mode: ${String(reportSession.verificationMode ?? baseSession?.verificationMode ?? "AUTO").toUpperCase()} — STRICT`;

    const drawHeader = () => {
      const bandH = 56;
      doc.fillColor(C.NAVY).rect(left, y, right - left, bandH).fill();

      const logoPath = getLogoPath();
      if (logoPath) {
        doc.image(logoPath, left + 6, y + 8, { fit: [64, 32] });
      } else {
        doc.fillColor(C.WHITE).font("Helvetica-Bold").fontSize(18).text(CO_SHORT, left + 8, y + 10, { width: 64 });
        doc.fillColor("#CBD5E1").font("Helvetica").fontSize(6.5).text(CO_NAME, left + 8, y + 31, { width: 76 });
      }

      const centerX = left + 80;
      const centerW = usable - 240;
      doc.fillColor(C.WHITE).font("Helvetica-Bold").fontSize(14).text("SMT CHANGEOVER VERIFICATION REPORT", centerX, y + 9, {
        width: centerW,
        align: "center",
      });
      doc.fillColor("#BFDBFE").font("Helvetica").fontSize(8).text(CO_NAME, centerX, y + 27, {
        width: centerW,
        align: "center",
      });
      doc.fillColor("#93C5FD").font("Helvetica").fontSize(7).text("SMT Manufacturing Quality System", centerX, y + 38, {
        width: centerW,
        align: "center",
      });

      const statusBoxX = right - 160;
      const statusBoxW = 154;
      doc.lineWidth(1).strokeColor(C.WHITE).roundedRect(statusBoxX, y + 8, statusBoxW, 38, 6).stroke();
      doc.fillColor("#93C5FD").font("Helvetica").fontSize(6.5).text("Changeover ID", statusBoxX + 6, y + 10, {
        width: statusBoxW - 12,
        align: "right",
      });
      const idFontSize = doc.font("Helvetica-Bold").fontSize(10).widthOfString(reportSessionId) > statusBoxW - 14 ? 9 : 10;
      doc.fillColor(C.WHITE).font("Helvetica-Bold").fontSize(idFontSize).text(reportSessionId, statusBoxX + 6, y + 18, {
        width: statusBoxW - 12,
        align: "right",
      });
      doc.fillColor("#FCA5A5").font("Helvetica").fontSize(6.5).text(getModeLabel(), statusBoxX + 6, y + 31, {
        width: statusBoxW - 12,
        align: "right",
      });

      doc.fillColor(C.NAVY).rect(left, y + bandH + 2, right - left, 3).fill();
      y += bandH + 10;
    };

    const drawInfoGrid = () => {
      const infoCards = [
        { label: "Changeover ID", value: reportSessionId },
        { label: "Panel ID", value: String(reportSession.panelId ?? baseSession?.panelName ?? "—") },
        { label: "Shift", value: String(reportSession.shift ?? baseSession?.shiftName ?? "—") },
        { label: "Date", value: reportSession.startedAt ? new Date(reportSession.startedAt).toLocaleDateString("en-GB") : String(baseSession?.shiftDate ?? "—") },
        { label: "Duration", value: `${Number(reportSession.durationMinutes ?? summary.durationMinutes ?? 0)} min` },
        { label: "Customer", value: String(reportSession.customer ?? baseSession?.customerName ?? "—") },
        { label: "Machine", value: String(reportSession.machine ?? baseSession?.machineName ?? "—") },
        { label: "Operator", value: String(reportSession.operatorName ?? baseSession?.operatorName ?? "—") },
        { label: "Start Time", value: reportSession.startedAt ? new Date(reportSession.startedAt).toLocaleTimeString("en-US", { hour12: true }) : "—" },
        { label: "BOM Version", value: String(reportSession.bomVersion ?? bom?.name ?? "—") },
        { label: "PCB / Part No.", value: String(reportSession.pcbPartNumber ?? reportSession.panelId ?? baseSession?.panelName ?? "—") },
        { label: "Line", value: String(reportSession.line ?? "—") },
        { label: "QA Engineer", value: String(reportSession.qaName ?? baseSession?.qaName ?? "—") },
        { label: "End Time", value: reportSession.completedAt ? new Date(reportSession.completedAt).toLocaleTimeString("en-US", { hour12: true }) : "In Progress" },
        { label: "Supervisor", value: String(reportSession.supervisorName ?? baseSession?.supervisorName ?? "—") },
      ];

      const cols = 5;
      const rows = 3;
      const gap = 3;
      const cardW = (usable - gap * (cols - 1)) / cols;
      const cardH = 22;

      for (let index = 0; index < infoCards.length; index += 1) {
        const card = infoCards[index];
        const col = index % cols;
        const row = Math.floor(index / cols);
        const x = left + col * (cardW + gap);
        const yy = y + row * (cardH + gap);

        doc.fillColor(C.CARD_LIGHT).rect(x, yy, cardW, cardH).fill();
        doc.lineWidth(0.45).strokeColor(C.GREY_BORDER).rect(x, yy, cardW, cardH).stroke();

        doc.fillColor(C.GREY_MID).font("Helvetica-Bold").fontSize(6).text(card.label.toUpperCase(), x + 3, yy + 3, { width: cardW - 6 });
        const valueText = safeText(card.value);
        const valueFontSize = doc.font("Helvetica-Bold").fontSize(8).widthOfString(valueText) > cardW - 6 ? 7 : 8;
        doc.fillColor(C.BLACK).font("Helvetica-Bold").fontSize(valueFontSize).text(valueText, x + 3, yy + 10, {
          width: cardW - 6,
          align: "left",
        });
      }

      y += rows * cardH + (rows - 1) * gap + 10;
    };

    const colWeights = [5.5, 4.5, 9.5, 8.0, 4.0, 9.0, 14.0, 13.0, 9.0, 7.5, 3.5, 4.5, 7.5];
    const getColWidths = (usableWidth: number) => {
      const sum = colWeights.reduce((a, b) => a + b, 0);
      return colWeights.map((p) => usableWidth * (p / sum));
    };

    const widths = getColWidths(usable);
    const drawTableHeaderRow = () => {
      const headers = [
        "Feeder No.",
        "Ref/Des",
        "Description",
        "Value",
        "Pkg",
        "Internal P/N",
        "Expected MPN",
        "Scanned Spool",
        "Matched As",
        "Lot Code",
        "Mode",
        "Status",
        "Time",
      ];
      const headerHeight = 22;
      let x = left;

      headers.forEach((header, index) => {
        const bg = index === 6 ? C.BLUE : index === 7 ? C.BLUE_DARK : C.NAVY;
        doc.fillColor(bg).rect(x, y, widths[index], headerHeight).fill();
        doc.strokeColor(C.GREY_BORDER).lineWidth(0.45).rect(x, y, widths[index], headerHeight).stroke();
        doc.fillColor(C.WHITE).font("Helvetica-Bold").fontSize(6.5).text(header, x + 2, y + 3, {
          width: widths[index] - 4,
          align: "center",
        });
        x += widths[index];
      });

      y += headerHeight;
    };

    const drawTableSectionHeader = () => {
      doc.fillColor(C.NAVY).font("Helvetica-Bold").fontSize(10).text("Component Verification Details", left, y);
      y += 16;
      drawTableHeaderRow();
    };

    const measureCellHeight = (text: string, width: number, fontSize: number, bold = false) => {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(fontSize);
      return doc.heightOfString(text, { width: width - 4 });
    };

    const drawTable = () => {
      drawTableSectionHeader();

      rows.forEach((row) => {
        const values = [
          row.feederNumber,
          row.refDes,
          row.component,
          row.value,
          row.pkgSize,
          row.internalPartNo,
          row.expectedMpns,
          row.scannedText,
          row.matchedLabel,
          row.lotCode,
          row.modeText,
          row.status,
          row.scannedAt,
        ];

        const rowHeights = values.map((value, index) => {
          const text = String(value ?? "—");
          if (index === 6) return measureCellHeight(text, widths[index], 6, false);
          if (index === 7) return measureCellHeight(text, widths[index], 6.5, true);
          return measureCellHeight(text, widths[index], 7, index === 10 || index === 11);
        });
        const rowH = Math.max(16, Math.ceil(Math.max(...rowHeights) + 6));

        if (y + rowH > pageH - 80) {
          doc.addPage({ size: "A4", layout: "landscape", margins: { top: 20, bottom: 20, left: 20, right: 20 } });
          y = 20;
          drawHeader();
          drawInfoGrid();
          drawTableSectionHeader();
        }

        const rowBg = row.isFailed ? C.RED_BG : row.isAlternate ? C.AMBER_BG : row.rowIndex % 2 === 0 ? C.WHITE : C.BLUE_LIGHT;
        let x = left;

        values.forEach((value, idx) => {
          const cellBg = idx === 6 ? C.BLUE_LIGHT : rowBg;
          doc.fillColor(cellBg).rect(x, y, widths[idx], rowH).fill();

          const textColor = idx === 7
            ? row.isFailed ? C.RED : row.isAlternate ? C.AMBER : C.GREEN
            : idx === 6 ? C.BLUE
              : idx === 11 ? (row.status === "PASS" ? C.GREEN : row.status === "FAIL" ? C.RED : C.AMBER)
                : idx === 10 ? (row.modeText === "MAN" ? C.AMBER : C.BLUE)
                  : C.BLACK;

          const cellFontSize = idx === 6 ? 6 : idx === 7 ? 6.5 : 7;
          doc.fillColor(textColor).font(idx === 7 || idx === 10 || idx === 11 ? "Helvetica-Bold" : "Helvetica").fontSize(cellFontSize).text(String(value ?? "—"), x + 2, y + 3, {
            width: widths[idx] - 4,
            align: idx >= 10 ? "center" : "left",
          });

          doc.strokeColor(C.GREY_BORDER).lineWidth(0.4).rect(x, y, widths[idx], rowH).stroke();
          x += widths[idx];
        });

        y += rowH;
      });

      y += 7;
      doc.fillColor(C.GREY_MID).font("Helvetica").fontSize(6).text(
        "Legend — Scanned Spool: Green = Primary MPN matched | Amber ▲ = Alternate MPN (BOM-approved) | Red ✗ = Mismatch (rejected) | Blue = Expected BOM options | AUTO STRICT: exact match only",
        left,
        y,
        { width: usable },
      );
      y += 11;
    };

    const drawSummary = () => {
      doc.fillColor(C.NAVY).font("Helvetica-Bold").fontSize(10).text("Verification Summary", left, y);
      y += 13;
      const labels = ["Total Feeders", "PASS", "FAIL", "WARNING", "Pass Rate", "Status"];
      const values = [String(totalFeeders), String(passCount), String(failCount), String(warnCount), `${passRate}%`, passRate === 100 ? "COMPLETE" : "FAILED"];
      const colors = [C.NAVY, C.GREEN, C.RED, C.AMBER, C.BLUE, passRate === 100 ? C.GREEN : C.RED];
      const cellW = usable / 6;
      const cellH = 30;

      for (let i = 0; i < 6; i += 1) {
        const x = left + i * cellW;
        doc.fillColor(colors[i]).rect(x, y, cellW, cellH).fill();
        doc.fillColor(C.WHITE).font("Helvetica").fontSize(7).text(labels[i], x, y + 5, { width: cellW, align: "center" });
        doc.fillColor(C.WHITE).font("Helvetica-Bold").fontSize(16).text(values[i], x, y + 13, { width: cellW, align: "center" });
      }

      doc.strokeColor(C.NAVY).lineWidth(1).rect(left, y, usable, cellH).stroke();
      y += 38;
    };

    const drawApprovals = () => {
      doc.fillColor(C.NAVY).font("Helvetica-Bold").fontSize(9).text("Approvals & Sign-off", left, y);
      y += 12;
      const roles = ["SUPERVISOR", "OPERATOR", "QA ENGINEER", "PRODUCTION MANAGER"];
      const names = [
        reportSession.supervisorName ?? baseSession?.supervisorName ?? "",
        reportSession.operatorName ?? baseSession?.operatorName ?? "",
        reportSession.qaName ?? baseSession?.qaName ?? "",
        "________________________",
      ];
      const cellW = usable / 4;
      const cellH = 46;

      for (let i = 0; i < 4; i += 1) {
        const x = left + i * cellW;
        doc.fillColor(C.CARD_LIGHT).rect(x, y, cellW, cellH).fill();
        doc.strokeColor(C.GREY_BORDER).lineWidth(0.5).rect(x, y, cellW, cellH).stroke();
        doc.fillColor(C.GREY_DARK).font("Helvetica-Bold").fontSize(8).text(roles[i], x, y + 5, { width: cellW, align: "center" });
        doc.strokeColor(C.GREY_BORDER).lineWidth(0.75).moveTo(x + cellW * 0.15, y + 28).lineTo(x + cellW * 0.85, y + 28).stroke();
        doc.fillColor(C.BLACK).font("Helvetica-Bold").fontSize(9).text(names[i] || "—", x, y + 30, { width: cellW, align: "center" });
        doc.fillColor(C.GREY_MUTED).font("Helvetica").fontSize(6).text("Name / Signature / Date", x, y + 39, { width: cellW, align: "center" });
      }

      y += 54;
    };

    const drawFooter = () => {
      const now = new Date();
      doc.strokeColor(C.GREY_BORDER).lineWidth(0.5).moveTo(left, pageH - 24).lineTo(right, pageH - 24).stroke();
      doc.fillColor(C.GREY_MUTED).font("Helvetica").fontSize(5.5).text(
        `${SYS_TITLE} — Electronically Generated Report | Changeover: ${reportSessionId} | Date: ${now.toLocaleDateString("en-GB")} | BOM Version: ${reportSession.bomVersion ?? bom?.name ?? "—"} | Mode: ${String(reportSession.verificationMode ?? baseSession?.verificationMode ?? "AUTO").toUpperCase()} — STRICT | This document is valid without physical signature when QR-verified.`,
        left,
        pageH - 18,
        { width: usable, align: "center" },
      );
    };

    drawHeader();
    drawInfoGrid();
    drawTable();
    drawSummary();
    drawApprovals();
    drawFooter();

    doc.end();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to generate session report PDF" });
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
