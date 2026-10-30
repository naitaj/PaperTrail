/**
 * Database client for PaperTrail Web Application (TRD §3, §8).
 * Provides pooled PostgreSQL connections for Next.js Route Handlers and Server Components.
 */

import { Pool, PoolConfig } from "pg";

let pool: Pool | null = null;

export function getDbPool(): Pool {
  if (pool) {
    return pool;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not defined");
  }

  const config: PoolConfig = {
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: {
      rejectUnauthorized: false,
    },
  };

  pool = new Pool(config);

  pool.on("error", (err) => {
    console.error("Unexpected error on idle database client", err);
  });

  return pool;
}

export async function query<T = unknown>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const p = getDbPool();
  const res = await p.query(text, params);
  return res.rows as T[];
}
