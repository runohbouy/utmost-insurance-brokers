// KPI API. A user sees only the KPIs their role's permissions allow, and only if
// the tenant's plan includes the analytics module.
import express from "express";
import { requireModule } from "../../lib/config/service";
import { Problem, notFound, problemRoute, unprocessable } from "../../lib/http/problem";
import { tenantOf } from "../../lib/tenant";
import type { RouterDeps } from "../http";
import { KPIS, buildRange, describe, evaluate, kpiByKey, type KpiDefinition } from "./kpis";

export function createAnalyticsRouter({ hasPermission }: RouterDeps): express.Router {
  const router = express.Router();

  const visibleTo = async (req: express.Request): Promise<KpiDefinition[]> => {
    const allowed = new Map<string, boolean>();
    for (const p of new Set(KPIS.map((k) => k.permission))) allowed.set(p, await hasPermission(req, p));
    return KPIS.filter((k) => allowed.get(k.permission));
  };

  const rangeOf = (req: express.Request, config: Awaited<ReturnType<typeof requireModule>>) => {
    try {
      return buildRange(config, { from: asString(req.query.from), to: asString(req.query.to), granularity: asString(req.query.granularity) });
    } catch (err) {
      throw unprocessable("validation-failed", "Request validation failed", (err as Error).message);
    }
  };

  router.get("/kpis", problemRoute(async (req, res) => {
    await requireModule(tenantOf(req), "analytics");
    res.json((await visibleTo(req)).map(describe));
  }));

  router.get("/kpis/summary", problemRoute(async (req, res) => {
    const config = await requireModule(tenantOf(req), "analytics");
    const range = rangeOf(req, config);
    const withSeries = req.query.series === "true";
    const defs = await visibleTo(req);
    res.json({
      period: { from: range.fromDate, to: range.toDate, granularity: range.granularity, timeZone: config.regional.timeZone },
      kpis: await Promise.all(defs.map((d) => evaluate(d, config, range, withSeries))),
    });
  }));

  router.get("/kpis/:key", problemRoute(async (req, res) => {
    const config = await requireModule(tenantOf(req), "analytics");
    const def = kpiByKey.get(req.params.key);
    if (!def) throw notFound(`KPI ${req.params.key}`);
    if (!(await hasPermission(req, def.permission))) throw new Problem(403, "kpi-forbidden", "You may not view this KPI", `Requires ${def.permission}`);
    res.json(await evaluate(def, config, rangeOf(req, config), true));
  }));

  return router;
}

const asString = (v: unknown) => (typeof v === "string" && v ? v : undefined);
