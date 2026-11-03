// Tenant configuration API. Reading the effective configuration is open to any
// signed-in staff member (the dashboard needs currency, locale and brand);
// everything that changes it needs tenant_config.manage.
import express from "express";
import { z } from "zod";
import { REGION_PACKS } from "../../lib/config/packs";
import { brandCss, startDraftFromCurrent, discardDraft, getConfigVersion, getDraft, getEffectiveConfig, listVersions, publicView, publishDraft, saveDraft } from "../../lib/config/service";
import { notFound, Problem, problemRoute } from "../../lib/http/problem";
import { tenantOf } from "../../lib/tenant";
import { parseBody, type RouterDeps } from "../http";

const draftBody = z.strictObject({
  regionPack: z.string().min(2).max(10),
  overrides: z.record(z.string(), z.unknown()).default({}),
  note: z.string().trim().max(500).optional(),
});

export function createConfigRouter({ requirePermission, actorId }: RouterDeps): express.Router {
  const router = express.Router();

  router.get("/config/effective", problemRoute(async (req, res) => {
    if (!req.staff) throw new Problem(401, "session-required", "Sign in required");
    res.json(publicView(await getEffectiveConfig(tenantOf(req))));
  }));

  router.get("/config/brand.css", problemRoute(async (req, res) => {
    if (!req.staff) throw new Problem(401, "session-required", "Sign in required");
    res.type("text/css").send(brandCss(await getEffectiveConfig(tenantOf(req))));
  }));

  router.get("/config/region-packs", requirePermission("tenant_config.manage"), (_req, res) => {
    res.json(Object.entries(REGION_PACKS).map(([code, p]) => ({
      code, country: p.regional.countryCode, currency: p.regional.currency, timeZone: p.regional.timeZone,
      locale: p.localization.locale, taxPricing: p.tax.pricing, taxes: p.tax.taxes,
    })));
  });

  // The full resolved configuration in force (every slice), for the settings screen.
  router.get("/config/current", requirePermission("tenant_config.manage"), problemRoute(async (req, res) => {
    res.json(await getEffectiveConfig(tenantOf(req)));
  }));

  // One region pack in full, so an editor can show exactly which values a tenant has overridden.
  router.get("/config/region-packs/:code", requirePermission("tenant_config.manage"), problemRoute(async (req, res) => {
    const pack = REGION_PACKS[req.params.code];
    if (!pack) throw notFound(`Region pack ${req.params.code}`);
    res.json(pack);
  }));

  router.get("/config/versions", requirePermission("tenant_config.manage"), problemRoute(async (req, res) => {
    res.json(await listVersions(tenantOf(req)));
  }));

  router.get("/config/versions/:id", requirePermission("tenant_config.manage"), problemRoute(async (req, res) => {
    const version = await getConfigVersion(req.params.id);
    if (version.tenantId !== tenantOf(req)) throw notFound(`Configuration version ${req.params.id}`);
    res.json(version);
  }));

  router.get("/config/draft", requirePermission("tenant_config.manage"), problemRoute(async (req, res) => {
    const draft = await getDraft(tenantOf(req));
    if (!draft) throw notFound("A draft configuration");
    res.json(draft);
  }));

  router.post("/config/draft/from-current", requirePermission("tenant_config.manage"), problemRoute(async (req, res) => {
    res.json(await startDraftFromCurrent(tenantOf(req), actorId(req)));
  }));

  router.put("/config/draft", requirePermission("tenant_config.manage"), problemRoute(async (req, res) => {
    const body = parseBody(draftBody, req.body);
    res.json(await saveDraft(tenantOf(req), body, actorId(req)));
  }));

  router.delete("/config/draft", requirePermission("tenant_config.manage"), problemRoute(async (req, res) => {
    await discardDraft(tenantOf(req));
    res.status(204).end();
  }));

  router.post("/config/draft/publish", requirePermission("tenant_config.manage"), problemRoute(async (req, res) => {
    res.status(201).json(await publishDraft(tenantOf(req), actorId(req)));
  }));

  return router;
}
