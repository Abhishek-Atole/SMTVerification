import { pgTable, serial, text, integer, timestamp, index, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sessionsTable } from "./sessions";
import { bomsTable } from "./bom";

// Enum for report types
export const REPORT_TYPES = {
  FPY: "fpy",
  OEE: "oee",
  OPERATOR: "operator",
  OPERATOR_COMPARISON: "operator_comparison",
  FEEDER: "feeder",
  FEEDER_RELIABILITY: "feeder_reliability",
  ALARM: "alarm",
  ERROR_ANALYSIS: "error_analysis",
  COMPONENT: "component",
  LOT_TRACEABILITY: "lot_traceability",
} as const;

export const reportTypesEnum = z.enum(Object.values(REPORT_TYPES));

export const reportsTable = pgTable(
  "reports",
  {
    id: serial("id").primaryKey(),
    reportType: text("report_type").notNull(), // enum: 'fpy', 'oee', 'operator', etc.
    sessionId: integer("session_id"),
    bomId: integer("bom_id").references(() => bomsTable.id, { onDelete: "set null" }),
    filters: jsonb("filters").notNull(), // { startDate, endDate, lineId?, pcbId?, operatorId?, shiftId? }
    format: text("format").notNull(), // 'pdf', 'xlsx', 'csv'
    filePath: text("file_path"), // Path to generated file (/exports/reports/...)
    generatedAt: timestamp("generated_at").defaultNow().notNull(),
    generatedBy: text("generated_by").notNull(), // User ID or name who generated
    expiresAt: timestamp("expires_at"), // Optional: when report expires/can be deleted
    queryTime: integer("query_time"), // milliseconds taken to generate
    recordCount: integer("record_count"), // number of records in report
    createdAt: timestamp("created_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"), // Soft delete timestamp
    deletedBy: text("deleted_by"), // User who soft-deleted
  },
  (table) => ({
    reportTypeIdx: index("reports_report_type_idx").on(table.reportType),
    generatedAtIdx: index("reports_generated_at_idx").on(table.generatedAt),
    generatedByIdx: index("reports_generated_by_idx").on(table.generatedBy),
    createdAtIdx: index("reports_created_at_idx").on(table.createdAt),
  })
);

export const reportExportsTable = pgTable(
  "report_exports",
  {
    id: serial("id").primaryKey(),
    reportId: integer("report_id")
      .notNull()
      .references(() => reportsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(), // User who exported
    format: text("format").notNull(), // 'pdf', 'xlsx', 'csv'
    downloadedAt: timestamp("downloaded_at").defaultNow().notNull(),
    ipAddress: text("ip_address"), // IP address of requester
    userAgent: text("user_agent"), // Browser user agent
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    reportIdIdx: index("report_exports_report_id_idx").on(table.reportId),
    userIdIdx: index("report_exports_user_id_idx").on(table.userId),
    downloadedAtIdx: index("report_exports_downloaded_at_idx").on(table.downloadedAt),
  })
);

// Zod schemas for validation
export const insertReportSchema = createInsertSchema(reportsTable).omit({
  id: true,
}).extend({
  generatedAt: z.date().optional(),
  createdAt: z.date().optional(),
  reportType: reportTypesEnum,
  filters: z.record(z.any()),
});

export const insertReportExportSchema = createInsertSchema(reportExportsTable).omit({
  id: true,
}).extend({
  downloadedAt: z.date().optional(),
  createdAt: z.date().optional(),
});

// TypeScript types
export type Report = typeof reportsTable.$inferSelect;
export type InsertReport = z.infer<typeof insertReportSchema>;
export type ReportExport = typeof reportExportsTable.$inferSelect;
export type InsertReportExport = z.infer<typeof insertReportExportSchema>;
