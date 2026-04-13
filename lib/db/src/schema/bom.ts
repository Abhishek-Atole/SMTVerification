import { pgTable, serial, text, integer, timestamp, index, boolean, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const bomsTable = pgTable("boms", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"), // Soft delete timestamp
  deletedBy: text("deleted_by"), // User who deleted
});

export const bomItemsTable = pgTable(
  "bom_items",
  {
    id: serial("id").primaryKey(),
    bomId: integer("bom_id")
      .notNull()
      .references(() => bomsTable.id, { onDelete: "cascade" }),
    feederNumber: text("feeder_number").notNull(),
    feederId: integer("feeder_id"),
    partNumber: text("part_number").notNull(),
    componentId: integer("component_id"),
    mpn: text("mpn"),
    manufacturer: text("manufacturer"),
    packageSize: text("package_size"),
    expectedMpn: text("expected_mpn"),
    description: text("description"),
    location: text("location"),
    quantity: integer("quantity").notNull().default(1),
    leadTime: integer("lead_time"),
    cost: numeric("cost", { precision: 10, scale: 4 }),
    isAlternate: boolean("is_alternate").default(false),
    parentItemId: integer("parent_item_id") as any,
    deletedAt: timestamp("deleted_at"),
    deletedBy: text("deleted_by"),
  } as any,
  (table: any) => ({
    bomIdIdx: index("bom_items_bom_id_idx").on(table.bomId),
    parentItemIdx: index("bom_items_parent_item_id_idx").on(table.parentItemId),
  })
) as any;

export const insertBomSchema = createInsertSchema(bomsTable).omit({ id: true, createdAt: true });
export const insertBomItemSchema = createInsertSchema(bomItemsTable).omit({ id: true });

export type Bom = typeof bomsTable.$inferSelect;
export type InsertBom = z.infer<typeof insertBomSchema>;
export type BomItem = typeof bomItemsTable.$inferSelect;
export type InsertBomItem = z.infer<typeof insertBomItemSchema>;
