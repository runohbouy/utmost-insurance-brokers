// Thin helpers over Drizzle's raw `sql` so set-based and locking queries (the
// money ledger) can be written as SQL while still running on either driver
// (embedded PGlite or node-postgres) and inside the same transaction.
import { sql, type SQL } from "drizzle-orm";
import { db } from "../db/client";

export { sql };
export type { SQL };

/** Either the shared database or an open transaction. */
export interface Executor { execute(query: SQL): PromiseLike<unknown> }
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function rows<T = Record<string, unknown>>(ex: Executor, query: SQL): Promise<T[]> {
  return ((await ex.execute(query)) as { rows: T[] }).rows;
}

export async function one<T = Record<string, unknown>>(ex: Executor, query: SQL): Promise<T | undefined> {
  return (await rows<T>(ex, query))[0];
}

/** BIGINT / NUMERIC come back as number, string or bigint depending on the driver. */
export const num = (v: unknown): number => {
  const n = typeof v === "bigint" ? Number(v) : Number(v ?? 0);
  if (!Number.isSafeInteger(n) && !Number.isFinite(n)) throw new RangeError(`not a number: ${String(v)}`);
  return n;
};

/** Primary key generator in the style the rest of the schema uses (prefix + time + random). */
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const iso = (v: unknown): string | null => (v == null ? null : new Date(v as string | number | Date).toISOString());
