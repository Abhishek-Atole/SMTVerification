import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { bomsTable } from "./bom";

export const sessionsTable = pgTable("sessions", {
  id: serial("id").primaryKey(),
  bomId: integer("bom_id").notNull().references(() => bomsTable.id),
  companyName: text("company_name").notNull(),
  customerName: text("customer_name"),
  panelName: text("panel_name").notNull(),
  supervisorName: text("supervisor_name").notNull(),
  operatorName: text("operator_name").notNull(),
  shiftName: text("shift_name").notNull(),
  shiftDate: text("shift_date").notNull(),
  logoUrl: text("logo_url"),
  productionCount: integer("production_count").default(0),
  status: text("status").notNull().default("active"),
  startTime: timestamp("start_time").defaultNow().notNull(),
  endTime: timestamp("end_time"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const scanRecordsTable = pgTable("scan_records", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => sessionsTable.id, { onDelete: "cascade" }),
  feederNumber: text("feeder_number").notNull(),
  status: text("status").notNull(),
  partNumber: text("part_number"),
  description: text("description"),
  location: text("location"),
  scannedAt: timestamp("scanned_at").defaultNow().notNull(),
});

export const insertSessionSchema = createInsertSchema(sessionsTable).omit({ id: true, createdAt: true, startTime: true });
export const insertScanRecordSchema = createInsertSchema(scanRecordsTable).omit({ id: true, scannedAt: true });

export type Session = typeof sessionsTable.$inferSelect;
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type ScanRecord = typeof scanRecordsTable.$inferSelect;
export type InsertScanRecord = z.infer<typeof insertScanRecordSchema>;
