import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

function shouldUseSsl(): false | { rejectUnauthorized: boolean } {
  const explicitSsl = process.env.DB_SSL?.toLowerCase();
  if (explicitSsl === "true") {
    return { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false" };
  }

  if (explicitSsl === "false") {
    return false;
  }

  const sslMode = (() => {
    try {
      const parsed = new URL(process.env.DATABASE_URL ?? "");
      return parsed.searchParams.get("sslmode")?.toLowerCase();
    } catch {
      return undefined;
    }
  })();

  if (sslMode === "require" || sslMode === "verify-full" || sslMode === "verify-ca") {
    return { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false" };
  }

  return false;
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: shouldUseSsl(),
});
export const db = drizzle(pool, { schema });

export * from "./schema";
