import { pgTable, serial, text, integer, timestamp, index, boolean, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const bomsTable = pgTable("boms", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const bomItemsTable = pgTable(
  "bom_items",
  {
    id: serial("id").primaryKey(),
    bomId: integer("bom_id")
      .notNull()
      .references(() => bomsTable.id, { onDelete: "cascade" }),
    feederNumber: text("feeder_number").notNull(), // Legacy: "F001", "F002", etc.
    feederId: integer("feeder_id"), // New: Reference to feeders table
    partNumber: text("part_number").notNull(),
    componentId: integer("component_id"), // New: Reference to components table
    mpn: text("mpn"), // Manufacturer Part Number
    manufacturer: text("manufacturer"), // Component manufacturer
    packageSize: text("package_size"), // Package type (0805, 1206, SOT-23, DIP, etc.)
    expectedMpn: text("expected_mpn"), // Cache MPN for faster lookup
    description: text("description"),
    location: text("location"),
    quantity: integer("quantity").notNull().default(1),
    leadTime: integer("lead_time"), // Days to delivery
    cost: numeric("cost", { precision: 10, scale: 4 }), // Unit cost
    isAlternate: boolean("is_alternate").default(false), // Flag if this is an alternate component
    parentItemId: integer("parent_item_id").references(() => bomItemsTable.id, { onDelete: "cascade" }), // Link to primary component if alternate
  },
  (table) => ({
    bomIdIdx: index("bom_items_bom_id_idx").on(table.bomId),
    parentItemIdx: index("bom_items_parent_item_id_idx").on(table.parentItemId),
  })
);

export const insertBomSchema = createInsertSchema(bomsTable).omit({ id: true, createdAt: true });
export const insertBomItemSchema = createInsertSchema(bomItemsTable).omit({ id: true });

export type Bom = typeof bomsTable.$inferSelect;
export type InsertBom = z.infer<typeof insertBomSchema>;
export type BomItem = typeof bomItemsTable.$inferSelect;
export type InsertBomItem = z.infer<typeof insertBomItemSchema>;
