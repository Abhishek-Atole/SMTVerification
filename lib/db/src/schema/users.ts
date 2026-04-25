import { pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    username: text("username").notNull().default(""),
    password: text("password").notNull().default(""),
    displayName: text("display_name").notNull().default(""),
    name: text("name").notNull().default(""),
    role: text("role").notNull().default("operator"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    usernameIdx: index("users_username_idx").on(table.username),
    roleIdx: index("users_role_idx").on(table.role),
  })
);

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
});

export type User = typeof usersTable.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
