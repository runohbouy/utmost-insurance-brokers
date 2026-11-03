// Small request helpers shared by the module routers.
import type express from "express";
import type { ZodType } from "zod";
import { fromZod, unprocessable } from "../lib/http/problem";

export interface RouterDeps {
  requirePermission: (permissionId: string) => express.RequestHandler;
  /** Does the signed-in staff member hold this permission? (For per-item checks inside a handler.) */
  hasPermission: (req: express.Request, permissionId: string) => Promise<boolean>;
  /** Signed-in staff id, or the system actor when the caller has no session. */
  actorId: (req: express.Request) => string;
}

export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body ?? {});
  if (!r.success) throw fromZod(r.error);
  return r.data;
}

/** Every collection endpoint is paged: ?limit (1–200, default 25) &offset &q. Total goes in X-Total-Count. */
export function readPage(req: express.Request) {
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? ""), 10) || 25, 1), 200);
  const offset = Math.max(parseInt(String(req.query.offset ?? ""), 10) || 0, 0);
  return { limit, offset, q: String(req.query.q ?? "").trim().slice(0, 100) };
}

export function sendPage(res: express.Response, rows: unknown[], total: number) {
  res.setHeader("X-Total-Count", String(total));
  res.setHeader("Access-Control-Expose-Headers", "X-Total-Count");
  res.json(rows);
}

/** Idempotency-Key request header: opaque, 8–128 visible characters. */
export function idempotencyKey(req: express.Request): string | undefined {
  const key = req.header("idempotency-key");
  if (key === undefined) return undefined;
  if (!/^[\x21-\x7e]{8,128}$/.test(key)) {
    throw unprocessable("validation-failed", "Request validation failed", undefined, [{ field: "Idempotency-Key", message: "must be 8–128 printable characters" }]);
  }
  return key;
}

export const queryString = (req: express.Request, name: string): string | undefined => {
  const v = req.query[name];
  return typeof v === "string" && v.trim() ? v.trim().slice(0, 100) : undefined;
};
