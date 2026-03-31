import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const bomsTable = pgTable("boms", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const bomItemsTable = pgTable("bom_items", {
  id: serial("id").primaryKey(),
  bomId: integer("bom_id").notNull().references(() => bomsTable.id, { onDelete: "cascade" }),
  feederNumber: text("feeder_number").notNull(),
  partNumber: text("part_number").notNull(),
  description: text("description"),
  location: text("location"),
  quantity: integer("quantity").notNull().default(1),
});

export const insertBomSchema = createInsertSchema(bomsTable).omit({ id: true, createdAt: true });
export const insertBomItemSchema = createInsertSchema(bomItemsTable).omit({ id: true });

export type Bom = typeof bomsTable.$inferSelect;
export type InsertBom = z.infer<typeof insertBomSchema>;
export type BomItem = typeof bomItemsTable.$inferSelect;
export type InsertBomItem = z.infer<typeof insertBomItemSchema>;
