/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@workspace/db";
import { sessionsTable, scanRecordsTable } from "@workspace/db/schema";
import { sql, gte, lte, and, count, eq, desc } from "drizzle-orm";
import { FilterService } from "./filter-service";

export interface FPYReportData {
  date: string;
  lineId?: string | null;
  pcbId?: string | null;
  totalFeeders: number;
  passCount: number;
  mismatchCount: number;
  alternatePassCount: number;
  fpy: number;
}

export interface OEEReportData {
  sessionId: number;
  operatorName: string;
  startTime: Date;
  endTime?: Date | null;
  durationMinutes: number;
  totalScans: number;
  passCount: number;
  passRate: number;
  availability: number;
  efficiency: number;
  quality: number;
  oee: number;
}

export interface OperatorReportData {
  operatorName: string;
  sessionsCount: number;
  totalScans: number;
  passRate: number;
  feedersPerMinute: number;
  avgScanTime: number;
}

export interface OperatorComparisonData {
  operators: Array<{
    operatorName: string;
    accuracy: number;
    speed: number;
    totalErrors: number;
  }>;
}

export interface FeederReportData {
  feederNumber: string;
  usageCount: number;
  failCount: number;
  passCount: number;
  errorRate: number;
}

export interface FeederReliabilityData {
  feederNumber: string;
  repeatFailures: number;
  warningCount: number;
  lastFailureDate: Date;
}

export interface AlarmReportData {
  totalAlarms: number;
  alarmType: string;
  count: number;
  severity: "high" | "medium" | "low";
  firstOccurrence: Date;
  lastOccurrence: Date;
}

export interface ErrorAnalysisData {
  topFailedFeeders: Array<{
    feederNumber: string;
    failCount: number;
    percentage: number;
  }>;
  topFailedComponents: Array<{
    partNumber: string;
    failCount: number;
    percentage: number;
  }>;
  errorFrequency: Record<string, number>;
}

export interface ComponentUsageData {
  partNumber: string;
  componentCount: number;
  pcbUsageCount?: number;
  frequency: number;
}

export interface LotTraceabilityData {
  lotNumber: string;
  dateCode: string;
  usageCount: number;
  passCount: number;
  failCount: number;
  failureRate: number;
  firstUsedAt: Date;
  lastUsedAt: Date;
}

/**
 * ReportService - Generates all analytics reports
 */
export class ReportService {
  /**
   * Generate FPY (First Pass Yield) Report
   * FPY = PASS / Total Feeders Verified
   */
  static async generateFPYReport(filters: {
    startDate: Date;
    endDate: Date;
    lineId?: string;
    pcbId?: string;
    shiftId?: string;
  }): Promise<FPYReportData[]> {
    // Build raw SQL query for better performance
    const query = sql<FPYReportData>`
      SELECT 
        DATE(sr.scanned_at)::text as date,
        s.company_name as "lineId",
        ${filters.pcbId ? sql`${filters.pcbId}` : sql`null`}::text as "pcbId",
        COUNT(*) as "totalFeeders",
        COUNT(CASE WHEN sr.validation_result = 'pass' THEN 1 END) as "passCount",
        COUNT(CASE WHEN sr.validation_result = 'mismatch' THEN 1 END) as "mismatchCount",
        COUNT(CASE WHEN sr.validation_result = 'alternate_pass' THEN 1 END) as "alternatePassCount",
        ROUND(100.0 * COUNT(CASE WHEN sr.validation_result = 'pass' THEN 1 END) / COUNT(*), 2) as fpy
      FROM scan_records sr
      JOIN sessions s ON sr.session_id = s.id
      WHERE sr.scanned_at >= ${filters.startDate}
        AND sr.scanned_at <= ${filters.endDate}
        ${filters.lineId ? sql`AND s.company_name = ${filters.lineId}` : sql``}
      GROUP BY DATE(sr.scanned_at), s.company_name
      ORDER BY date DESC
    `;

    const results = await db.execute(query);
    return (results.rows as any) as FPYReportData[];
  }

  /**
   * Generate OEE (Overall Equipment Effectiveness) Report
   * OEE = Availability × Efficiency × Quality
   */
  static async generateOEEReport(filters: {
    startDate: Date;
    endDate: Date;
    lineId?: string;
    pcbId?: string;
    shiftId?: string;
  }): Promise<OEEReportData[]> {
    const query = sql<OEEReportData>`
      SELECT 
        s.id as "sessionId",
        s.operator_name as "operatorName",
        s.start_time as "startTime",
        s.end_time as "endTime",
        EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 60 as "durationMinutes",
        COUNT(sr.id) as "totalScans",
        COUNT(CASE WHEN sr.validation_result IN ('pass', 'alternate_pass') THEN 1 END) as "passCount",
        ROUND((100.0 * COUNT(CASE WHEN sr.validation_result IN ('pass', 'alternate_pass') THEN 1 END) / COUNT(*))::numeric, 2) as "passRate",
        CASE WHEN s.end_time IS NOT NULL THEN 1.0 ELSE 0.5 END as availability,
        ROUND((COUNT(sr.id)::float / NULLIF(EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 60, 0) * 60)::numeric, 2) as efficiency,
        ROUND((100.0 * COUNT(CASE WHEN sr.validation_result IN ('pass', 'alternate_pass') THEN 1 END) / COUNT(*))::numeric, 2) as quality
      FROM scan_records sr
      JOIN sessions s ON sr.session_id = s.id
      WHERE sr.scanned_at >= ${filters.startDate}
        AND sr.scanned_at <= ${filters.endDate}
        ${filters.lineId ? sql`AND s.company_name = ${filters.lineId}` : sql``}
      GROUP BY s.id, s.operator_name, s.start_time, s.end_time
      ORDER BY s.start_time DESC
    `;

    const results = await db.execute(query);
    const data = (results.rows as any) as Omit<OEEReportData, "oee">[];
    
    // Calculate OEE = Availability × Efficiency × Quality
    return data.map((row) => ({
      ...row,
      oee: Math.round((row.availability * (row.efficiency / 100) * (row.quality / 100)) * 10000) / 100,
    }));
  }

  /**
   * Generate Operator Performance Report
   */
  static async generateOperatorReport(filters: {
    startDate: Date;
    endDate: Date;
    operatorName?: string;
    lineId?: string;
    pcbId?: string;
  }): Promise<OperatorReportData[]> {
    const query = sql<OperatorReportData>`
      SELECT 
        s.operator_name as "operatorName",
        COUNT(DISTINCT s.id) as "sessionsCount",
        COUNT(sr.id) as "totalScans",
        ROUND((100.0 * COUNT(CASE WHEN sr.validation_result = 'pass' THEN 1 END) / COUNT(*))::numeric, 2) as "passRate",
        ROUND((COUNT(sr.id)::float / NULLIF(SUM(EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 60), 0))::numeric, 2) as "feedersPerMinute",
        COUNT(sr.id) as "avgScanTime"
      FROM scan_records sr
      JOIN sessions s ON sr.session_id = s.id
      WHERE sr.scanned_at >= ${filters.startDate}
        AND sr.scanned_at <= ${filters.endDate}
        ${filters.operatorName ? sql`AND s.operator_name = ${filters.operatorName}` : sql``}
        ${filters.lineId ? sql`AND s.company_name = ${filters.lineId}` : sql``}
      GROUP BY s.operator_name
      ORDER BY "passRate" DESC
    `;

    const results = await db.execute(query);
    return (results.rows as any) as OperatorReportData[];
  }

  /**
   * Generate Operator Comparison Report
   */
  static async generateOperatorComparisonReport(filters: {
    startDate: Date;
    endDate: Date;
    lineId?: string;
  }): Promise<OperatorComparisonData> {
    const query = sql<{ operatorName: string; accuracy: number; speed: number; totalErrors: number }>`
      SELECT 
        s.operator_name as "operatorName",
        ROUND((100.0 * COUNT(CASE WHEN sr.validation_result IN ('pass', 'alternate_pass') THEN 1 END) / COUNT(*))::numeric, 2) as accuracy,
        ROUND((COUNT(sr.id)::float / NULLIF(SUM(EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 60), 0))::numeric, 2) as speed,
        COUNT(CASE WHEN sr.validation_result IN ('mismatch', 'feeder_not_found') THEN 1 END) as "totalErrors"
      FROM scan_records sr
      JOIN sessions s ON sr.session_id = s.id
      WHERE sr.scanned_at >= ${filters.startDate}
        AND sr.scanned_at <= ${filters.endDate}
        ${filters.lineId ? sql`AND s.company_name = ${filters.lineId}` : sql``}
      GROUP BY s.operator_name
      ORDER BY accuracy DESC
    `;

    const results = await db.execute(query);
    return { operators: (results.rows as any) as any[] };
  }

  /**
   * Generate Feeder Performance Report
   */
  static async generateFeederReport(filters: {
    startDate: Date;
    endDate: Date;
    lineId?: string;
    pcbId?: string;
  }): Promise<FeederReportData[]> {
    const query = sql<FeederReportData>`
      SELECT 
        sr.feeder_number as "feederNumber",
        COUNT(*) as "usageCount",
        COUNT(CASE WHEN sr.validation_result IN ('mismatch', 'feeder_not_found') THEN 1 END) as "failCount",
        COUNT(CASE WHEN sr.validation_result IN ('pass', 'alternate_pass') THEN 1 END) as "passCount",
        ROUND(100.0 * COUNT(CASE WHEN sr.validation_result IN ('mismatch', 'feeder_not_found') THEN 1 END) / COUNT(*), 2) as "errorRate"
      FROM scan_records sr
      JOIN sessions s ON sr.session_id = s.id
      WHERE sr.scanned_at >= ${filters.startDate}
        AND sr.scanned_at <= ${filters.endDate}
        ${filters.lineId ? sql`AND s.company_name = ${filters.lineId}` : sql``}
      GROUP BY sr.feeder_number
      ORDER BY "errorRate" DESC, "usageCount" DESC
    `;

    const results = await db.execute(query);
    return (results.rows as any) as FeederReportData[];
  }

  /**
   * Generate Feeder Reliability Report
   */
  static async generateFeederReliabilityReport(filters: {
    startDate: Date;
    endDate: Date;
    lineId?: string;
  }): Promise<FeederReliabilityData[]> {
    const query = sql<FeederReliabilityData>`
      SELECT 
        sr.feeder_number as "feederNumber",
        COUNT(CASE WHEN sr.validation_result IN ('mismatch', 'feeder_not_found') THEN 1 END) as "repeatFailures",
        COUNT(CASE WHEN sr.validation_result = 'alternate_pass' THEN 1 END) as "warningCount",
        MAX(sr.scanned_at) as "lastFailureDate"
      FROM scan_records sr
      JOIN sessions s ON sr.session_id = s.id
      WHERE sr.scanned_at >= ${filters.startDate}
        AND sr.scanned_at <= ${filters.endDate}
        ${filters.lineId ? sql`AND s.company_name = ${filters.lineId}` : sql``}
        AND sr.validation_result IN ('mismatch', 'feeder_not_found', 'alternate_pass')
      GROUP BY sr.feeder_number
      HAVING COUNT(CASE WHEN sr.validation_result IN ('mismatch', 'feeder_not_found') THEN 1 END) > 0
      ORDER BY "repeatFailures" DESC
    `;

    const results = await db.execute(query);
    return (results.rows as any) as FeederReliabilityData[];
  }

  /**
   * Generate Alarm Report
   */
  static async generateAlarmReport(filters: {
    startDate: Date;
    endDate: Date;
    lineId?: string;
  }): Promise<AlarmReportData[]> {
    const query = sql<Omit<AlarmReportData, "severity"> & { severity: string }>`
      SELECT 
        COUNT(*) as "totalAlarms",
        sr.validation_result as "alarmType",
        COUNT(*) as count,
        MIN(sr.scanned_at) as "firstOccurrence",
        MAX(sr.scanned_at) as "lastOccurrence"
      FROM scan_records sr
      JOIN sessions s ON sr.session_id = s.id
      WHERE sr.scanned_at >= ${filters.startDate}
        AND sr.scanned_at <= ${filters.endDate}
        AND sr.validation_result IN ('mismatch', 'feeder_not_found')
        ${filters.lineId ? sql`AND s.company_name = ${filters.lineId}` : sql``}
      GROUP BY sr.validation_result
      ORDER BY count DESC
    `;

    const results = await db.execute(query);
    return (results.rows as any).map((row: any) => ({
      ...row,
      severity: row.count > 10 ? "high" : row.count > 5 ? "medium" : "low",
    })) as AlarmReportData[];
  }

  /**
   * Generate Error Analysis Report
   */
  static async generateErrorAnalysisReport(filters: {
    startDate: Date;
    endDate: Date;
    lineId?: string;
  }): Promise<ErrorAnalysisData> {
    const feederQuery = sql<{ feederNumber: string; failCount: number }>`
      SELECT 
        sr.feeder_number as "feederNumber",
        COUNT(*) as "failCount"
      FROM scan_records sr
      JOIN sessions s ON sr.session_id = s.id
      WHERE sr.scanned_at >= ${filters.startDate}
        AND sr.scanned_at <= ${filters.endDate}
        AND sr.validation_result IN ('mismatch', 'feeder_not_found')
        ${filters.lineId ? sql`AND s.company_name = ${filters.lineId}` : sql``}
      GROUP BY sr.feeder_number
      ORDER BY "failCount" DESC
      LIMIT 10
    `;

    const componentQuery = sql<{ partNumber: string; failCount: number }>`
      SELECT 
        sr.part_number as "partNumber",
        COUNT(*) as "failCount"
      FROM scan_records sr
      JOIN sessions s ON sr.session_id = s.id
      WHERE sr.scanned_at >= ${filters.startDate}
        AND sr.scanned_at <= ${filters.endDate}
        AND sr.validation_result IN ('mismatch', 'feeder_not_found')
        ${filters.lineId ? sql`AND s.company_name = ${filters.lineId}` : sql``}
      GROUP BY sr.part_number
      ORDER BY "failCount" DESC
      LIMIT 10
    `;

    const feederResults = await db.execute(feederQuery);
    const componentResults = await db.execute(componentQuery);

    const totalErrors = (feederResults.rows as any).reduce((sum: number, row: any) => sum + row.failCount, 0);

    return {
      topFailedFeeders: (feederResults.rows as any).map((row: any) => ({
        feederNumber: row.feederNumber,
        failCount: row.failCount,
        percentage: Math.round((row.failCount / totalErrors) * 100),
      })),
      topFailedComponents: (componentResults.rows as any).map((row: any) => ({
        partNumber: row.partNumber,
        failCount: row.failCount,
        percentage: Math.round((row.failCount / totalErrors) * 100),
      })),
      errorFrequency: {
        mismatch: feederResults.rows.length,
        feederNotFound: 0,
      },
    };
  }

  /**
   * Generate Component Usage Report
   */
  static async generateComponentUsageReport(filters: {
    startDate: Date;
    endDate: Date;
    lineId?: string;
  }): Promise<ComponentUsageData[]> {
    const query = sql<ComponentUsageData>`
      SELECT 
        sr.part_number as "partNumber",
        COUNT(*) as "componentCount",
        COUNT(DISTINCT s.id) as "pcbUsageCount",
        COUNT(DISTINCT DATE(sr.scanned_at)) as frequency
      FROM scan_records sr
      JOIN sessions s ON sr.session_id = s.id
      WHERE sr.scanned_at >= ${filters.startDate}
        AND sr.scanned_at <= ${filters.endDate}
        ${filters.lineId ? sql`AND s.company_name = ${filters.lineId}` : sql``}
      GROUP BY sr.part_number
      ORDER BY "componentCount" DESC
    `;

    const results = await db.execute(query);
    return (results.rows as any) as ComponentUsageData[];
  }

  /**
   * Generate Lot Traceability Report
   */
  static async generateLotTraceabilityReport(filters: {
    startDate: Date;
    endDate: Date;
    lineId?: string;
    lotNumber?: string;
  }): Promise<LotTraceabilityData[]> {
    const query = sql<LotTraceabilityData>`
      SELECT 
        sr.lot_number as "lotNumber",
        sr.date_code as "dateCode",
        COUNT(*) as "usageCount",
        COUNT(CASE WHEN sr.validation_result IN ('pass', 'alternate_pass') THEN 1 END) as "passCount",
        COUNT(CASE WHEN sr.validation_result IN ('mismatch', 'feeder_not_found') THEN 1 END) as "failCount",
        ROUND(100.0 * COUNT(CASE WHEN sr.validation_result IN ('mismatch', 'feeder_not_found') THEN 1 END) / COUNT(*), 2) as "failureRate",
        MIN(sr.scanned_at) as "firstUsedAt",
        MAX(sr.scanned_at) as "lastUsedAt"
      FROM scan_records sr
      JOIN sessions s ON sr.session_id = s.id
      WHERE sr.scanned_at >= ${filters.startDate}
        AND sr.scanned_at <= ${filters.endDate}
        AND sr.lot_number IS NOT NULL
        ${filters.lineId ? sql`AND s.company_name = ${filters.lineId}` : sql``}
        ${filters.lotNumber ? sql`AND sr.lot_number = ${filters.lotNumber}` : sql``}
      GROUP BY sr.lot_number, sr.date_code
      ORDER BY "usageCount" DESC
    `;

    const results = await db.execute(query);
    return (results.rows as any) as LotTraceabilityData[];
  }

  /**
   * Generate Trend Report (daily aggregations for visualization)
   */
  static async generateTrendReport(filters: {
    startDate: Date;
    endDate: Date;
    lineId?: string;
    interval?: "daily" | "weekly" | "monthly";
  }): Promise<Array<{
    date: string;
    sessions: number;
    totalScans: number;
    okCount: number;
    rejectCount: number;
    passRate: number;
  }>> {
    const query = sql<{
      date: string;
      sessions: number;
      totalScans: number;
      okCount: number;
      rejectCount: number;
      passRate: number;
    }>`
      SELECT 
        DATE(sr.scanned_at)::text as date,
        COUNT(DISTINCT sr.session_id) as sessions,
        COUNT(*) as "totalScans",
        COUNT(CASE WHEN sr.validation_result IN ('pass', 'alternate_pass') THEN 1 END) as "okCount",
        COUNT(CASE WHEN sr.validation_result IN ('mismatch', 'feeder_not_found') THEN 1 END) as "rejectCount",
        ROUND(100.0 * COUNT(CASE WHEN sr.validation_result IN ('pass', 'alternate_pass') THEN 1 END) / COUNT(*), 2) as "passRate"
      FROM scan_records sr
      JOIN sessions s ON sr.session_id = s.id
      WHERE sr.scanned_at >= ${filters.startDate}
        AND sr.scanned_at <= ${filters.endDate}
        ${filters.lineId ? sql`AND s.company_name = ${filters.lineId}` : sql``}
      GROUP BY DATE(sr.scanned_at)
      ORDER BY date DESC
    `;

    const results = await db.execute(query);
    return (results.rows as any) as any[];
  }
}
