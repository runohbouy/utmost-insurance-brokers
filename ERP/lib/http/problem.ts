// ---------------------------------------------------------------------------
// RFC 7807 "problem details" for the money and configuration APIs.
//
// Services throw `Problem`; `problemRoute` turns it (and database constraint
// failures) into an `application/problem+json` response whose `type` is a stable
// URI documented in docs/api/errors.md. Clients branch on `type`, never on the
// human-readable `title` / `detail`.
// ---------------------------------------------------------------------------
import type express from "express";
import type { ZodError } from "zod";

export const PROBLEM_BASE = "https://utmostbrokers.example/problems/";

export interface FieldError { field: string; message: string }

export class Problem extends Error {
  constructor(
    readonly status: number,
    /** Short stable slug, e.g. "receipt-invalid-transition". */
    readonly slug: string,
    readonly title: string,
    detail?: string,
    readonly errors?: FieldError[],
    readonly extra?: Record<string, unknown>,
  ) {
    super(detail ?? title);
    this.name = "Problem";
  }
}

export const badRequest = (slug: string, title: string, detail?: string, errors?: FieldError[]) => new Problem(400, slug, title, detail, errors);
export const notFound = (what: string) => new Problem(404, "not-found", "Not found", `${what} was not found`);
export const conflict = (slug: string, title: string, detail?: string, extra?: Record<string, unknown>) => new Problem(409, slug, title, detail, undefined, extra);
export const unprocessable = (slug: string, title: string, detail?: string, errors?: FieldError[]) => new Problem(422, slug, title, detail, errors);

export function fromZod(error: ZodError, title = "Request validation failed"): Problem {
  return new Problem(422, "validation-failed", title, "One or more fields are invalid", error.issues.map((i) => ({
    field: i.path.map(String).join(".") || "(body)",
    message: i.message,
  })));
}

export function sendProblem(req: express.Request, res: express.Response, p: Problem) {
  res.status(p.status).type("application/problem+json").json({
    type: PROBLEM_BASE + p.slug,
    title: p.title,
    status: p.status,
    detail: p.message === p.title ? undefined : p.message,
    instance: req.originalUrl.split("?")[0],
    ...(p.errors ? { errors: p.errors } : {}),
    ...(p.extra ?? {}),
  });
}

/** Database errors that are the caller's fault, as problems. Anything else is a 500. */
function fromDatabase(err: unknown): Problem | null {
  let e = err as { code?: string; cause?: unknown; message?: string } | undefined;
  for (let i = 0; i < 4 && e && !e.code && e.cause; i++) e = e.cause as typeof e;
  switch (e?.code) {
    case "23503": return new Problem(422, "reference-not-found", "A referenced record does not exist");
    case "23505": return new Problem(409, "duplicate", "That record already exists");
    case "23514": return new Problem(422, "constraint-violation", "A value is not allowed");
    case "22P02": case "22007": case "22003": return new Problem(400, "malformed-value", "A value has the wrong format");
    case "P0001": return new Problem(409, "rule-violation", "The change breaks a data-integrity rule");
    default: return null;
  }
}

export function problemRoute(handler: (req: express.Request, res: express.Response) => Promise<unknown>) {
  return (req: express.Request, res: express.Response) => {
    handler(req, res).catch((err) => {
      const problem = err instanceof Problem ? err : fromDatabase(err);
      if (problem) return sendProblem(req, res, problem);
      console.error(JSON.stringify({ level: "error", msg: "unhandled route error", method: req.method, path: req.path, error: String(err?.stack || err) }));
      sendProblem(req, res, new Problem(500, "internal", "Internal server error"));
    });
  };
}
