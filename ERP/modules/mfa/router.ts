// Two-step verification routes for STAFF (the dashboard). Clients have the same flow under
// /api/portal/auth/mfa/* (see modules/portal/router.ts); both use modules/mfa/service.
import bcrypt from "bcryptjs";
import express from "express";
import { z } from "zod";
import { getEffectiveConfig } from "../../lib/config/service";
import { conflict, Problem, problemRoute } from "../../lib/http/problem";
import { one, sql, type Executor } from "../../lib/sql";
import { db } from "../../db/client";
import { tenantOf } from "../../lib/tenant";
import { parseBody, type RouterDeps } from "../http";
import * as mfa from "./service";

const code = z.string().trim().regex(/^\d{3}\s?\d{3}$/, "the 6-digit code from your authenticator app");
const ex = db as unknown as Executor;

export function createStaffMfaRouter({ requirePermission, jwtSecret }: Pick<RouterDeps, "requirePermission"> & { jwtSecret: string }): express.Router {
  const router = express.Router();

  const subject = async (req: express.Request): Promise<mfa.MfaSubject> => {
    if (!req.staff) throw new Problem(401, "session-required", "Sign in required");
    const row = await one<{ email: string | null }>(ex, sql`SELECT email FROM access.staff WHERE id = ${req.staff.id}`);
    return { table: "access.staff", id: req.staff.id, account: row?.email ?? req.staff.id };
  };

  router.post("/auth/mfa/setup", problemRoute(async (req, res) => {
    const issuer = (await getEffectiveConfig(tenantOf(req))).brand.displayName;
    res.json(await mfa.beginEnrolment(await subject(req), issuer, jwtSecret));
  }));

  router.post("/auth/mfa/enable", problemRoute(async (req, res) => {
    const body = parseBody(z.strictObject({ code }), req.body);
    await mfa.confirmEnrolment(await subject(req), body.code, jwtSecret);
    res.json({ mfaEnabled: true });
  }));

  router.post("/auth/mfa/disable", problemRoute(async (req, res) => {
    const body = parseBody(z.strictObject({ password: z.string().min(1).max(200), code }), req.body);
    if ((await getEffectiveConfig(tenantOf(req))).security.mfa === "required") {
      throw conflict("mfa-required-by-policy", "Two-step verification is required", "Your organisation requires it for all staff, so it cannot be turned off");
    }
    const s = await subject(req);
    const hash = (await one<{ password_hash: string | null }>(ex, sql`SELECT password_hash FROM access.staff WHERE id = ${s.id}`))?.password_hash;
    if (!hash || !(await bcrypt.compare(body.password, hash))) throw new Problem(403, "wrong-password", "Password is incorrect");
    await mfa.disable(s, body.code, jwtSecret);
    res.json({ mfaEnabled: false });
  }));

  // A colleague lost their phone: forget their authenticator so they can enrol a new one.
  router.post("/staff/:id/mfa/reset", requirePermission("mfa.reset"), problemRoute(async (req, res) => {
    const exists = await one(ex, sql`SELECT 1 AS ok FROM access.staff WHERE id = ${req.params.id}`);
    if (!exists) throw new Problem(404, "not-found", "Not found", `Staff member ${req.params.id} was not found`);
    await mfa.clear({ table: "access.staff", id: req.params.id });
    await ex.execute(sql`INSERT INTO compliance.audit_log (actor_staff_id, action, entity_type, entity_id, after_state)
      VALUES (${req.staff?.id ?? null}, 'MFA_RESET', 'staff', ${req.params.id}, '{}'::jsonb)`);
    res.json({ mfaEnabled: false });
  }));

  return router;
}
