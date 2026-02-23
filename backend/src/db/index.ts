import pg from "pg";
import type { Pool } from "pg";
import { schemaSql } from "./schema";

let pool: Pool | null = null;
const { Pool } = pg;

export function getDb(): Pool {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for SQL storage");
  }
  if (!pool) {
    pool = new Pool({ connectionString: databaseUrl });
  }
  return pool;
}

export async function initDb(): Promise<void> {
  const db = getDb();
  await db.query(schemaSql);
}
