/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { insertReportSchema, reportsTable, reportExportsTable } from "@workspace/db/schema";
import { sql, eq, desc, and, lte } from "drizzle-orm";
import { ReportService } from "../services/report-service";
import { FilterService } from "../services/filter-service";
import { ExportService } from "../services/export-service";

const router: IRouter = Router();

/**
 * Shared middleware to validate date filters
 */
const validateDateFilter = (req: Request, res: Response, next: any) => {
  try {
    const { dateFilter = "today", ...otherFilters } = req.query;
    const parsedDateFilter =
      dateFilter === "today" || dateFilter === "yesterday" || dateFilter === "last7" || dateFilter === "last30"
        ? dateFilter
        : { start: String(req.query.startDate), end: String(req.query.endDate) };

    const dateRange = FilterService.parseDateFilter(parsedDateFilter);
    (req as any).filters = {
      dateFilter: parsedDateFilter,
      ...dateRange,
      lineId: req.query.lineId ? String(req.query.lineId) : undefined,
      pcbId: req.query.pcbId ? String(req.query.pcbId) : undefined,
      operatorId: req.query.operatorId ? String(req.query.operatorId) : undefined,
      shiftId: req.query.shiftId ? String(req.query.shiftId) : undefined,
    };
    next();
  } catch (error) {
    req.log.error(error);
    return res.status(400).json({ error: "Invalid date filter" });
  }
};

/**
 * Role-based access control middleware (only QA/Engineer can export)
 */
const requireExportRole = (req: Request, res: Response, next: any) => {
  const userRole = (req.headers["x-user-role"] as string) || "operator";
  if (!["qa", "engineer", "admin"].includes(userRole.toLowerCase())) {
    return res.status(403).json({ error: "Only QA and Engineer roles can export reports" });
  }
  next();
};

// ============================================================================
// REPORT GENERATION ENDPOINTS
// ============================================================================

/**
 * GET /api/reports/fpy - First Pass Yield Report
 */
router.get("/reports/fpy", validateDateFilter, async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    const filters = (req as any).filters;

    const reportData = await ReportService.generateFPYReport(filters);

    const queryTime = Date.now() - startTime;
    res.json({
      report: reportData,
      metadata: {
        reportType: "fpy",
        generatedAt: new Date(),
        queryTime,
        recordCount: reportData.length,
      },
    });
  } catch (error) {
    req.log.error(error);
    return res.status(500).json({ error: "Failed to generate FPY report" });
  }
});

/**
 * GET /api/reports/oee - Overall Equipment Effectiveness Report
 */
router.get("/reports/oee", validateDateFilter, async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    const filters = (req as any).filters;

    const reportData = await ReportService.generateOEEReport(filters);

    const queryTime = Date.now() - startTime;
    res.json({
      report: reportData,
      metadata: {
        reportType: "oee",
        generatedAt: new Date(),
        queryTime,
        recordCount: reportData.length,
      },
    });
  } catch (error) {
    req.log.error(error);
    return res.status(500).json({ error: "Failed to generate OEE report" });
  }
});

/**
 * GET /api/reports/operator - Operator Performance Report
 */
router.get("/reports/operator", validateDateFilter, async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    const filters = (req as any).filters;
    filters.operatorName = req.query.operatorName ? String(req.query.operatorName) : undefined;

    const reportData = await ReportService.generateOperatorReport(filters);

    const queryTime = Date.now() - startTime;
    res.json({
      report: reportData,
      metadata: {
        reportType: "operator",
        generatedAt: new Date(),
        queryTime,
        recordCount: reportData.length,
      },
    });
  } catch (error) {
    req.log.error(error);
    return res.status(500).json({ error: "Failed to generate operator report" });
  }
});

/**
 * GET /api/reports/operator-comparison - Operator Comparison Report
 */
router.get("/reports/operator-comparison", validateDateFilter, async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    const filters = (req as any).filters;

    const reportData = await ReportService.generateOperatorComparisonReport(filters);

    const queryTime = Date.now() - startTime;
    res.json({
      report: reportData,
      metadata: {
        reportType: "operator_comparison",
        generatedAt: new Date(),
        queryTime,
        recordCount: reportData.operators.length,
      },
    });
  } catch (error) {
    req.log.error(error);
    return res.status(500).json({ error: "Failed to generate operator comparison report" });
  }
});

/**
 * GET /api/reports/feeder - Feeder Performance Report
 */
router.get("/reports/feeder", validateDateFilter, async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    const filters = (req as any).filters;

    const reportData = await ReportService.generateFeederReport(filters);

    const queryTime = Date.now() - startTime;
    res.json({
      report: reportData,
      metadata: {
        reportType: "feeder",
        generatedAt: new Date(),
        queryTime,
        recordCount: reportData.length,
      },
    });
  } catch (error) {
    req.log.error(error);
    return res.status(500).json({ error: "Failed to generate feeder report" });
  }
});

/**
 * GET /api/reports/feeder-reliability - Feeder Reliability Report
 */
router.get("/reports/feeder-reliability", validateDateFilter, async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    const filters = (req as any).filters;

    const reportData = await ReportService.generateFeederReliabilityReport(filters);

    const queryTime = Date.now() - startTime;
    res.json({
      report: reportData,
      metadata: {
        reportType: "feeder_reliability",
        generatedAt: new Date(),
        queryTime,
        recordCount: reportData.length,
      },
    });
  } catch (error) {
    req.log.error(error);
    return res.status(500).json({ error: "Failed to generate feeder reliability report" });
  }
});

/**
 * GET /api/reports/alarm - Alarm Report
 */
router.get("/reports/alarm", validateDateFilter, async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    const filters = (req as any).filters;

    const reportData = await ReportService.generateAlarmReport(filters);

    const queryTime = Date.now() - startTime;
    res.json({
      report: reportData,
      metadata: {
        reportType: "alarm",
        generatedAt: new Date(),
        queryTime,
        recordCount: reportData.length,
      },
    });
  } catch (error) {
    req.log.error(error);
    return res.status(500).json({ error: "Failed to generate alarm report" });
  }
});

/**
 * GET /api/reports/error-analysis - Error Analysis Report
 */
router.get("/reports/error-analysis", validateDateFilter, async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    const filters = (req as any).filters;

    const reportData = await ReportService.generateErrorAnalysisReport(filters);

    const queryTime = Date.now() - startTime;
    res.json({
      report: reportData,
      metadata: {
        reportType: "error_analysis",
        generatedAt: new Date(),
        queryTime,
        recordCount: Object.keys(reportData).length,
      },
    });
  } catch (error) {
    req.log.error(error);
    return res.status(500).json({ error: "Failed to generate error analysis report" });
  }
});

/**
 * GET /api/reports/component - Component Usage Report
 */
router.get("/reports/component", validateDateFilter, async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    const filters = (req as any).filters;

    const reportData = await ReportService.generateComponentUsageReport(filters);

    const queryTime = Date.now() - startTime;
    res.json({
      report: reportData,
      metadata: {
        reportType: "component",
        generatedAt: new Date(),
        queryTime,
        recordCount: reportData.length,
      },
    });
  } catch (error) {
    req.log.error(error);
    return res.status(500).json({ error: "Failed to generate component report" });
  }
});

/**
 * GET /api/reports/lot-traceability - Lot Traceability Report
 */
router.get("/reports/lot-traceability", validateDateFilter, async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    const filters = (req as any).filters;
    filters.lotNumber = req.query.lotNumber ? String(req.query.lotNumber) : undefined;

    const reportData = await ReportService.generateLotTraceabilityReport(filters);

    const queryTime = Date.now() - startTime;
    res.json({
      report: reportData,
      metadata: {
        reportType: "lot_traceability",
        generatedAt: new Date(),
        queryTime,
        recordCount: reportData.length,
      },
    });
  } catch (error) {
    req.log.error(error);
    return res.status(500).json({ error: "Failed to generate lot traceability report" });
  }
});

/**
 * GET /api/reports/trend - Trend Report
 */
router.get("/reports/trend", validateDateFilter, async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    const filters = (req as any).filters;
    filters.interval = (req.query.interval as "daily" | "weekly" | "monthly") || "daily";

    const reportData = await ReportService.generateTrendReport(filters);

    const queryTime = Date.now() - startTime;
    res.json({
      report: reportData,
      metadata: {
        reportType: "trend",
        generatedAt: new Date(),
        queryTime,
        recordCount: reportData.length,
      },
    });
  } catch (error) {
    req.log.error(error);
    return res.status(500).json({ error: "Failed to generate trend report" });
  }
});

// ============================================================================
// EXPORT ENDPOINTS
// ============================================================================

/**
 * POST /api/reports/export/:reportType - Export a report
 */
router.post("/reports/export/:reportType", requireExportRole, validateDateFilter, async (req: Request, res: Response) => {
  try {
    const { reportType } = req.params;
    const format = (req.query.format as "pdf" | "xlsx" | "csv") || "pdf";
    const filters = (req as any).filters;
    const userId = (req.headers["x-user-id"] as string) || "system";

    // Generate report data
    let reportData: any;
    switch (reportType) {
      case "fpy":
        reportData = await ReportService.generateFPYReport(filters);
        break;
      case "oee":
        reportData = await ReportService.generateOEEReport(filters);
        break;
      case "operator":
        reportData = await ReportService.generateOperatorReport(filters);
        break;
      case "operator-comparison":
        reportData = await ReportService.generateOperatorComparisonReport(filters);
        break;
      case "feeder":
        reportData = await ReportService.generateFeederReport(filters);
        break;
      case "feeder-reliability":
        reportData = await ReportService.generateFeederReliabilityReport(filters);
        break;
      case "alarm":
        reportData = await ReportService.generateAlarmReport(filters);
        break;
      case "error-analysis":
        reportData = await ReportService.generateErrorAnalysisReport(filters);
        break;
      case "component":
        reportData = await ReportService.generateComponentUsageReport(filters);
        break;
      case "lot-traceability":
        reportData = await ReportService.generateLotTraceabilityReport(filters);
        break;
      case "trend":
        reportData = await ReportService.generateTrendReport(filters);
        break;
      default:
        return res.status(400).json({ error: "Unknown report type" });
    }

    // Export to file
    let exportResult: { filePath: string; filename: string };
    switch (format) {
      case "pdf":
        exportResult = await ExportService.exportToPdf(reportType, reportData, filters);
        break;
      case "xlsx":
        exportResult = await ExportService.exportToExcel(reportType, reportData, filters);
        break;
      case "csv":
        exportResult = await ExportService.exportToCsv(reportType, reportData, filters);
        break;
      default:
        return res.status(400).json({ error: "Unknown export format" });
    }

    // Save report metadata to database (non-blocking)
    let reportId = 1;
    try {
      const report = await db.insert(reportsTable).values({
        reportType,
        // sessionId intentionally omitted to leave as NULL
        format,
        filePath: exportResult.filePath,
        filters: filters,
        generatedBy: userId,
        recordCount: Array.isArray(reportData) ? reportData.length : 0,
      });
      reportId = report[0]?.id || 1;

      // Log export (non-blocking)
      await db.insert(reportExportsTable).values({
        reportId,
        userId,
        format,
        ipAddress: (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress,
        userAgent: req.headers["user-agent"],
      }).catch(() => {
        // Silently fail if export logging fails
      });
    } catch (dbError) {
      // Log error but continue with export
      req.log.warn({ dbError }, "Failed to log export to database");
    }

    return res.json({
      filename: exportResult.filename,
      downloadUrl: `/api/reports/exports/${reportId}/download`,
      format,
    });
  } catch (error) {
    req.log.error(error);
    return res.status(500).json({ error: "Failed to export report" });
  }
});

/**
 * GET /api/reports/exports/:reportId/download - Download exported report
 */
router.get("/reports/exports/:reportId/download", async (req: Request, res: Response) => {
  try {
    const { reportId } = req.params;

    // Fetch report metadata
    const report = await db.select().from(reportsTable).where(eq(reportsTable.id, Number(reportId)));

    if (!report || report.length === 0) {
      return res.status(404).json({ error: "Report not found" });
    }

    const reportRecord = report[0];

    // Get file stream and send
    const filename = reportRecord.filePath?.split("/").pop() || "report";
    res.setHeader("Content-Type", `application/${reportRecord.format}`);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const stream = ExportService.getFileStream(filename);
    stream.pipe(res);
  } catch (error) {
    req.log.error(error);
    return res.status(500).json({ error: "Failed to download report" });
  }
});

/**
 * GET /api/reports/exports/user/history - Get user's export history
 */
router.get("/reports/exports/user/history", async (req: Request, res: Response) => {
  try {
    const userId = (req.headers["x-user-id"] as string) || "system";

    const exports = await db
      .select({
        id: reportExportsTable.id,
        reportType: reportsTable.reportType,
        format: reportExportsTable.format,
        downloadedAt: reportExportsTable.downloadedAt,
        recordCount: reportsTable.recordCount,
      })
      .from(reportExportsTable)
      .innerJoin(reportsTable, eq(reportExportsTable.reportId, reportsTable.id))
      .where(eq(reportExportsTable.userId, userId))
      .orderBy(desc(reportExportsTable.downloadedAt))
      .limit(50);

    return res.json({ exports });
  } catch (error) {
    req.log.error(error);
    return res.status(500).json({ error: "Failed to get export history" });
  }
});

export default router;
