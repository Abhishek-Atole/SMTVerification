import { pgTable, serial, text, integer, timestamp, boolean, index, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { bomsTable } from "./bom";
import { usersTable } from "./users";

export const changeoverSessionStatusEnum = pgEnum("changeover_session_status", ["active", "completed", "cancelled"]);
export const feederScanStatusEnum = pgEnum("feeder_scan_status", ["verified", "failed", "duplicate"]);

export const sessionsTable = pgTable("sessions", {
  id: serial("id").primaryKey(),
  bomId: integer("bom_id").references(() => bomsTable.id),
  companyName: text("company_name").notNull(),
  customerName: text("customer_name"),
  panelName: text("panel_name").notNull(),
  supervisorName: text("supervisor_name").notNull(),
  operatorName: text("operator_name").notNull(),
  qaName: text("qa_name"), // QA personnel name
  shiftName: text("shift_name").notNull(),
  shiftDate: text("shift_date").notNull(),
  logoUrl: text("logo_url"),
  productionCount: integer("production_count").default(0),
  verificationMode: text("verification_mode").notNull().default("AUTO"),
  status: text("status").notNull().default("active"),
  startTime: timestamp("start_time").defaultNow().notNull(),
  endTime: timestamp("end_time"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"), // Soft delete timestamp
  deletedBy: text("deleted_by"), // User who deleted
});

export const scanRecordsTable = pgTable(
  "scan_records",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => sessionsTable.id, { onDelete: "cascade" }),
    feederNumber: text("feeder_number").notNull(), // Legacy
    feederId: integer("feeder_id"), // New: Reference to feeders table
    spoolBarcode: text("spool_barcode"),
    status: text("status").notNull(),
    partNumber: text("part_number"),
    componentId: integer("component_id"), // New: Reference to components table
    scannedMpn: text("scanned_mpn"), // New: Actual MPN scanned
    lotNumber: text("lot_number"), // New: Component lot
    dateCode: text("date_code"), // New: Manufacturing date code
    reelId: text("reel_id"), // New: Physical reel ID
    alternateUsed: boolean("alternate_used").default(false), // New: Was this an alternate?
    validationResult: text("validation_result"), // 'pass', 'alternate_pass', 'mismatch', 'alternate_not_found'
    internalIdScanned: text("internal_id_scanned"), // NEW: Internal ID scanned (optional)
    verificationMode: text("verification_mode").notNull().default("AUTO"), // 'AUTO' or 'MANUAL'
    matchScore: integer("match_score"), // NEW: 0-100 percentage match score from fuzzy matching
    matchingAlgorithm: text("matching_algorithm"), // NEW: 'exact' | 'fuzzy' | 'normalized'
    expectedValue: text("expected_value"), // NEW: What the system expected to match
    suggestions: text("suggestions"), // NEW: JSON array of alternative matches
    description: text("description"),
    location: text("location"),
    scannedAt: timestamp("scanned_at").defaultNow().notNull(),
  },
  (table) => ({
    sessionIdIdx: index("scan_records_session_id_idx").on(table.sessionId),
    feederIdIdx: index("scan_records_feeder_id_idx").on(table.feederId),
    scannedMpnIdx: index("scan_records_scanned_mpn_idx").on(table.scannedMpn),
    verificationModeIdx: index("scan_records_verification_mode_idx").on(table.verificationMode), // NEW
  })
);

export const spliceRecordsTable = pgTable("splice_records", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .notNull()
    .references(() => sessionsTable.id, { onDelete: "cascade" }),
  feederNumber: text("feeder_number").notNull(),
  operatorId: text("operator_id").notNull(),
  oldMpn: text("old_mpn"),
  newMpn: text("new_mpn"),
  oldSpoolBarcode: text("old_spool_barcode").notNull(),
  newSpoolBarcode: text("new_spool_barcode").notNull(),
  durationSeconds: integer("duration_seconds"),
  splicedAt: timestamp("spliced_at").defaultNow().notNull(),
});

export const changeoverSessionsTable = pgTable(
  "changeover_sessions",
  {
    id: text("id").primaryKey(), // Format: SMT_YYYYMMDD_NNNNNN
    operatorId: integer("operator_id")
      .notNull()
      .references(() => usersTable.id),
    bomId: integer("bom_id")
      .notNull()
      .references(() => bomsTable.id, { onDelete: "cascade" }),
    verificationMode: text("verification_mode").notNull().default("AUTO"),
    status: changeoverSessionStatusEnum("status").notNull().default("active"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    operatorIdIdx: index("changeover_sessions_operator_id_idx").on(table.operatorId),
    bomIdIdx: index("changeover_sessions_bom_id_idx").on(table.bomId),
    verificationModeIdx: index("changeover_sessions_verification_mode_idx").on(table.verificationMode),
    statusIdx: index("changeover_sessions_status_idx").on(table.status),
  })
);

export const feederScansTable = pgTable(
  "feeder_scans",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => changeoverSessionsTable.id, { onDelete: "cascade" }),
    feederNumber: text("feeder_number").notNull(),
    scannedValue: text("scanned_value").notNull(),
    matchedField: text("matched_field"),
    matchedMake: text("matched_make"),
    lotCode: text("lot_code"),
    verificationMode: text("verification_mode").notNull().default("AUTO"),
    status: feederScanStatusEnum("status").notNull(),
    scannedAt: timestamp("scanned_at").defaultNow().notNull(),
    operatorId: integer("operator_id")
      .notNull()
      .references(() => usersTable.id),
  },
  (table) => ({
    sessionIdIdx: index("feeder_scans_session_id_idx").on(table.sessionId),
    feederNumberIdx: index("feeder_scans_feeder_number_idx").on(table.feederNumber),
    verificationModeIdx: index("feeder_scans_verification_mode_idx").on(table.verificationMode),
    statusIdx: index("feeder_scans_status_idx").on(table.status),
    operatorIdIdx: index("feeder_scans_operator_id_idx").on(table.operatorId),
  })
);

export const insertSessionSchema = createInsertSchema(sessionsTable).omit({ id: true }).extend({
  createdAt: z.date().optional(),
  startTime: z.date().optional(),
});
export const insertScanRecordSchema = createInsertSchema(scanRecordsTable).omit({ id: true }).extend({
  scannedAt: z.date().optional(),
});
export const insertSpliceRecordSchema = createInsertSchema(spliceRecordsTable).omit({ id: true }).extend({
  splicedAt: z.date().optional(),
});
export const insertChangeoverSessionSchema = createInsertSchema(changeoverSessionsTable).omit({ id: true }).extend({
  startedAt: z.date().optional(),
  createdAt: z.date().optional(),
});
export const insertFeederScanSchema = createInsertSchema(feederScansTable).omit({ id: true }).extend({
  scannedAt: z.date().optional(),
});

export type Session = typeof sessionsTable.$inferSelect;
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type ScanRecord = typeof scanRecordsTable.$inferSelect;
export type InsertScanRecord = z.infer<typeof insertScanRecordSchema>;
export type SpliceRecord = typeof spliceRecordsTable.$inferSelect;
export type InsertSpliceRecord = z.infer<typeof insertSpliceRecordSchema>;
export type ChangeoverSession = typeof changeoverSessionsTable.$inferSelect;
export type InsertChangeoverSession = z.infer<typeof insertChangeoverSessionSchema>;
export type FeederScan = typeof feederScansTable.$inferSelect;
export type InsertFeederScan = z.infer<typeof insertFeederScanSchema>;
