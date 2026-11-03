// Client portal API.
//
//   createPortalRouter       /api/portal/*  — for CLIENTS. Mounted BEFORE the staff
//                            authentication middleware (it brings its own), because a
//                            client token is not a staff token.
//   createPortalAdminRouter  /api/portal-users — for STAFF with portal.manage.
import express from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { getEffectiveConfig } from "../../lib/config/service";
import { Problem, problemRoute, sendProblem } from "../../lib/http/problem";
import { tenantOf } from "../../lib/tenant";
import { parseBody, queryString, readPage, sendPage, type RouterDeps } from "../http";
import * as portal from "./service";
import * as mfa from "../mfa/service";
import { getEffectiveConfig as tenantConfig } from "../../lib/config/service";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { portal?: portal.PortalPrincipal }
  }
}

const mfaCode = z.string().trim().regex(/^\d{3}\s?\d{3}$/, "the 6-digit code from your authenticator app");
const credentials = z.strictObject({ email: z.string().trim().email().max(200), password: z.string().min(1).max(200), code: mfaCode.optional() });
const passwordChange = z.strictObject({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(1).max(200) });
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export function createPortalRouter({ jwtSecret }: { jwtSecret: string }): express.Router {
  const router = express.Router();
  router.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); }); // a client's money data is never cached
  router.use(express.json({ limit: "20kb" }));

  // Only failed sign-ins count toward the cap, so a shared office address isn't locked out by successes.
  router.use("/auth/login", rateLimit({
    windowMs: 15 * 60 * 1000, limit: 20, skipSuccessfulRequests: true, standardHeaders: "draft-7", legacyHeaders: false,
    handler: (req, res) => sendProblem(req, res, new Problem(429, "too-many-attempts", "Too many sign-in attempts", "Try again in 15 minutes")),
  }));
  router.use(rateLimit({
    windowMs: 60 * 1000, limit: 120, standardHeaders: "draft-7", legacyHeaders: false,
    handler: (req, res) => sendProblem(req, res, new Problem(429, "rate-limited", "Too many requests", "Slow down and try again shortly")),
  }));

  // ----- public: what the sign-in page needs to look like the tenant
  router.get("/config", problemRoute(async (req, res) => {
    const c = await getEffectiveConfig(tenantOf(req));
    res.json({
      name: c.brand.displayName, brand: c.brand, locale: c.localization.locale, dateFormat: c.localization.dateFormat,
      timeZone: c.regional.timeZone, currency: c.regional.currency, portalEnabled: c.entitlements.modules.includes("portal"),
    });
  }));

  router.post("/auth/login", problemRoute(async (req, res) => {
    const { email, password, code } = parseBody(credentials, req.body);
    res.json(await portal.login(tenantOf(req), email, password, jwtSecret, code));
  }));

  // ----- everything below needs a valid client token
  router.use(async (req, res, next) => {
    try {
      const header = req.header("authorization");
      const principal = header?.startsWith("Bearer ") ? await portal.principalFromToken(header.slice(7), jwtSecret) : null;
      if (!principal) return sendProblem(req, res, new Problem(401, "session-required", "Sign in required"));
      req.portal = principal;
      next();
    } catch (err) {
      next(err);
    }
  });

  router.post("/auth/change-password", problemRoute(async (req, res) => {
    const { currentPassword, newPassword } = parseBody(passwordChange, req.body);
    await portal.changePassword(req.portal!, currentPassword, newPassword);
    res.status(204).end();
  }));

  router.get("/me", problemRoute(async (req, res) => res.json(await portal.me(req.portal!))));

  // ----- two-step verification (available straight after the first password change)
  const subject = (req: express.Request): mfa.MfaSubject => ({ table: "access.portal_users", id: req.portal!.userId, account: req.portal!.email });
  router.post("/auth/mfa/setup", problemRoute(async (req, res) => {
    if (req.portal!.mustChangePassword) throw new Problem(403, "password-change-required", "Change your password first");
    res.json(await mfa.beginEnrolment(subject(req), (await tenantConfig(req.portal!.tenantId)).brand.displayName, jwtSecret));
  }));
  router.post("/auth/mfa/enable", problemRoute(async (req, res) => {
    const body = parseBody(z.strictObject({ code: mfaCode }), req.body);
    await mfa.confirmEnrolment(subject(req), body.code, jwtSecret);
    res.json({ mfaEnabled: true });
  }));
  router.post("/auth/mfa/disable", problemRoute(async (req, res) => {
    const body = parseBody(z.strictObject({ password: z.string().min(1).max(200), code: mfaCode }), req.body);
    if (!(await portal.checkPassword(req.portal!, body.password))) throw new Problem(403, "wrong-password", "Password is incorrect");
    await mfa.disable(subject(req), body.code, jwtSecret);
    res.json({ mfaEnabled: false });
  }));

  // A temporary password must be replaced before anything else can be read.
  router.use((req, res, next) => {
    if (req.portal!.mustChangePassword) {
      return sendProblem(req, res, new Problem(403, "password-change-required", "Change your password first", "Use POST /api/portal/auth/change-password"));
    }
    next();
  });

  router.get("/position", problemRoute(async (req, res) => res.json(await portal.myPosition(req.portal!))));

  router.get("/policies", problemRoute(async (req, res) => {
    const { rows, total } = await portal.myPolicies(req.portal!, readPage(req));
    sendPage(res, rows, total);
  }));

  router.get("/invoices", problemRoute(async (req, res) => {
    const { rows, total } = await portal.myInvoices(req.portal!, readPage(req), queryString(req, "state"));
    sendPage(res, rows, total);
  }));
  router.get("/invoices/:id", problemRoute(async (req, res) => res.json(await portal.myInvoice(req.portal!, req.params.id))));

  router.get("/receipts", problemRoute(async (req, res) => {
    const { rows, total } = await portal.myReceipts(req.portal!, readPage(req));
    sendPage(res, rows, total);
  }));
  router.get("/receipts/:id", problemRoute(async (req, res) => res.json(await portal.myReceipt(req.portal!, req.params.id))));

  router.get("/statement", problemRoute(async (req, res) => {
    const q = parseBody(z.strictObject({ from: day.optional(), to: day.optional() }), { from: queryString(req, "from"), to: queryString(req, "to") });
    res.json(await portal.myStatement(req.portal!, q.from, q.to));
  }));

  // Anything else under /api/portal is simply not there.
  router.use((req, res) => sendProblem(req, res, new Problem(404, "not-found", "Not found")));
  return router;
}

const newUser = z.strictObject({ partyId: z.string().min(1), email: z.string().trim().email().max(200) });
const activeBody = z.strictObject({ active: z.boolean() });

export function createPortalAdminRouter({ requirePermission, actorId }: RouterDeps): express.Router {
  const router = express.Router();
  const ctx = (req: express.Request) => ({ tenantId: tenantOf(req), staffId: actorId(req) });

  router.get("/portal-users", requirePermission("portal.manage"), problemRoute(async (req, res) => {
    const { rows, total } = await portal.listPortalUsers(ctx(req), readPage(req));
    sendPage(res, rows, total);
  }));

  router.post("/portal-users", requirePermission("portal.manage"), problemRoute(async (req, res) => {
    res.status(201).json(await portal.createPortalUser(ctx(req), parseBody(newUser, req.body)));
  }));

  router.patch("/portal-users/:id", requirePermission("portal.manage"), problemRoute(async (req, res) => {
    res.json(await portal.setPortalUserActive(ctx(req), req.params.id, parseBody(activeBody, req.body).active));
  }));

  router.post("/portal-users/:id/reset-password", requirePermission("portal.manage"), problemRoute(async (req, res) => {
    res.json(await portal.resetPortalPassword(ctx(req), req.params.id));
  }));

  router.post("/portal-users/:id/mfa/reset", requirePermission("mfa.reset"), problemRoute(async (req, res) => {
    res.json(await portal.resetPortalMfa(ctx(req), req.params.id));
  }));

  return router;
}
