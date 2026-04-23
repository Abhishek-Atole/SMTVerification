import { db } from "@workspace/db";
import { bomItemsTable, changeoverSessionsTable, feederScansTable } from "@workspace/db/schema";
import { and, eq, sql } from "drizzle-orm";

export type VerifyMatchedField = "internalPartNumber" | "mpn1" | "mpn2" | "mpn3";
export type VerifyErrorCode = "FEEDER_NOT_FOUND" | "COMPONENT_MISMATCH" | "ALREADY_SCANNED";

export interface VerifyResult {
  valid: boolean;
  feederNumber: string;
  matchedField: VerifyMatchedField | null;
  matchedMake: string | null;
  hasAlternates: boolean;
  alternateCount: number;
  errorCode: VerifyErrorCode | null;
}

interface BomItemForVerification {
  feederNumber: string;
  internalPartNumber: string | null;
  mpn1: string | null;
  mpn2: string | null;
  mpn3: string | null;
  make1: string | null;
  make2: string | null;
  make3: string | null;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function isNonEmpty(value: string | null | undefined): value is string {
  return Boolean(value && value.trim());
}

function tokenizeInternalPartNumber(value: string | null): string[] {
  if (!isNonEmpty(value)) return [];
  return value
    .replace(/[\r\n]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function buildBaseResult(feederNumber: string, item: BomItemForVerification): Omit<VerifyResult, "valid" | "errorCode"> {
  const mpnValues = [item.mpn1, item.mpn2, item.mpn3].filter(isNonEmpty);
  return {
    feederNumber,
    matchedField: null,
    matchedMake: null,
    hasAlternates: isNonEmpty(item.mpn2) || isNonEmpty(item.mpn3),
    alternateCount: mpnValues.length,
  };
}

export async function verifyFeederScan(
  feederNumber: string,
  scannedValue: string,
  sessionId: number,
): Promise<VerifyResult> {
  const normalizedFeederNumber = feederNumber.trim();
  const normalizedScannedValue = normalize(scannedValue);

  const [session] = await db
    .select({ bomId: changeoverSessionsTable.bomId })
    .from(changeoverSessionsTable)
    .where(eq(changeoverSessionsTable.id, sessionId));

  if (!session) {
    return {
      valid: false,
      feederNumber: normalizedFeederNumber,
      matchedField: null,
      matchedMake: null,
      hasAlternates: false,
      alternateCount: 0,
      errorCode: "FEEDER_NOT_FOUND",
    };
  }

  const [item] = await db
    .select({
      feederNumber: bomItemsTable.feederNumber,
      internalPartNumber: bomItemsTable.internalPartNumber,
      mpn1: bomItemsTable.mpn1,
      mpn2: bomItemsTable.mpn2,
      mpn3: bomItemsTable.mpn3,
      make1: bomItemsTable.make1,
      make2: bomItemsTable.make2,
      make3: bomItemsTable.make3,
    })
    .from(bomItemsTable)
    .where(
      and(
        eq(bomItemsTable.bomId, session.bomId),
        eq(bomItemsTable.feederNumber, normalizedFeederNumber),
      ),
    );

  if (!item) {
    return {
      valid: false,
      feederNumber: normalizedFeederNumber,
      matchedField: null,
      matchedMake: null,
      hasAlternates: false,
      alternateCount: 0,
      errorCode: "FEEDER_NOT_FOUND",
    };
  }

  const base = buildBaseResult(normalizedFeederNumber, item);

  const [existingVerifiedScan] = await db
    .select({ id: feederScansTable.id })
    .from(feederScansTable)
    .where(
      and(
        eq(feederScansTable.sessionId, sessionId),
        eq(feederScansTable.feederNumber, normalizedFeederNumber),
        eq(feederScansTable.status, "verified"),
      ),
    )
    .limit(1);

  if (existingVerifiedScan) {
    return {
      ...base,
      valid: false,
      errorCode: "ALREADY_SCANNED",
    };
  }

  const internalTokens = tokenizeInternalPartNumber(item.internalPartNumber).map(normalize);
  if (internalTokens.includes(normalizedScannedValue)) {
    return {
      ...base,
      valid: true,
      matchedField: "internalPartNumber",
      matchedMake: null,
      errorCode: null,
    };
  }

  if (isNonEmpty(item.mpn1) && normalize(item.mpn1) === normalizedScannedValue) {
    return {
      ...base,
      valid: true,
      matchedField: "mpn1",
      matchedMake: isNonEmpty(item.make1) ? item.make1.trim() : null,
      errorCode: null,
    };
  }

  if (isNonEmpty(item.mpn2) && normalize(item.mpn2) === normalizedScannedValue) {
    return {
      ...base,
      valid: true,
      matchedField: "mpn2",
      matchedMake: isNonEmpty(item.make2) ? item.make2.trim() : null,
      errorCode: null,
    };
  }

  if (isNonEmpty(item.mpn3) && normalize(item.mpn3) === normalizedScannedValue) {
    return {
      ...base,
      valid: true,
      matchedField: "mpn3",
      matchedMake: isNonEmpty(item.make3) ? item.make3.trim() : null,
      errorCode: null,
    };
  }

  return {
    ...base,
    valid: false,
    errorCode: "COMPONENT_MISMATCH",
  };
}

export async function getSessionProgress(
  sessionId: number,
): Promise<{ verified: number; total: number; percent: number }> {
  const [session] = await db
    .select({ bomId: changeoverSessionsTable.bomId })
    .from(changeoverSessionsTable)
    .where(eq(changeoverSessionsTable.id, sessionId));

  if (!session) {
    return { verified: 0, total: 0, percent: 0 };
  }

  const [totalRow] = await db
    .select({ count: sql<number>`count(distinct ${bomItemsTable.feederNumber})` })
    .from(bomItemsTable)
    .where(eq(bomItemsTable.bomId, session.bomId));

  const [verifiedRow] = await db
    .select({ count: sql<number>`count(distinct ${feederScansTable.feederNumber})` })
    .from(feederScansTable)
    .where(
      and(
        eq(feederScansTable.sessionId, sessionId),
        eq(feederScansTable.status, "verified"),
      ),
    );

  const total = Number(totalRow?.count ?? 0);
  const verified = Number(verifiedRow?.count ?? 0);
  const percent = total > 0 ? Math.round((verified / total) * 100) : 0;

  return { verified, total, percent };
}
