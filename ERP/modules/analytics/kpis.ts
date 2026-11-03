// ---------------------------------------------------------------------------
// KPI library. Each KPI is a named, documented definition with the permission
// needed to see it and a query that reads the ledger directly (never a cache of
// it, so a KPI can never disagree with the receipts it summarises).
//
// "Day" means a day in the TENANT's time zone: a cheque cleared at 23:30 UTC on
// the 30th is the 31st in Nairobi and lands in that day's bucket. Ranges are
// local dates, converted to half-open UTC instants with lib/time.
// ---------------------------------------------------------------------------
import { db } from "../../db/client";
import { Money } from "../../lib/money";
import { daysBetween, isCalendarDate, localDate, localDayRange } from "../../lib/time";
import type { EffectiveTenantConfig } from "../../lib/config/schema";
import { num, rows, sql, type Executor } from "../../lib/sql";
import { rebucket, type Granularity } from "./buckets";

export { rebucket };

export type KpiUnit = "money" | "count" | "percent" | "days";

export interface KpiRange { fromDate: string; toDate: string; from: Date; to: Date; granularity: Granularity }
interface Computed { value: number; series?: { date: string; value: number }[] }

export interface KpiDefinition {
  key: string;
  name: string;
  description: string;
  category: "collections" | "receivables" | "commission" | "operations";
  unit: KpiUnit;
  /** Needed to see this KPI. */
  permission: "analytics.view" | "analytics.finance";
  /** Point-in-time KPIs ignore the date range and report the position as of now. */
  pointInTime?: boolean;
  compute(zone: string, range: KpiRange, config: EffectiveTenantConfig, tenantId: string): Promise<Computed>;
}

const ex = db as unknown as Executor;

const daily = async (q: ReturnType<typeof sql>) =>
  (await rows<{ d: string; v: unknown }>(ex, q)).map((r) => ({ date: r.d, value: num(r.v) }));
const total = (series: { value: number }[]) => series.reduce((s, p) => s + p.value, 0);

/** Money position of invoices still open, optionally only those past due on `overdueBefore`. */
async function receivable(tenantId: string, overdueBefore?: string) {
  const r = await rows<{ v: unknown }>(ex, sql`
    SELECT COALESCE(SUM(i.total_minor - i.paid_minor), 0) AS v
    FROM finance.invoices i
    WHERE i.tenant_id = ${tenantId} AND i.status = 'open' ${overdueBefore ? sql`AND i.due_date < ${overdueBefore}::date` : sql``}`);
  return num(r[0]?.v);
}

async function held(tenantId: string, kind: "suspense" | "client_credit") {
  const r = await rows<{ v: unknown }>(ex, sql`
    SELECT COALESCE(SUM(r.amount_minor - r.allocated_minor), 0) AS v
    FROM finance.receipts r
    WHERE r.tenant_id = ${tenantId} AND r.status = 'cleared' AND r.holding_kind = ${kind}`);
  return num(r[0]?.v);
}

export const KPIS: KpiDefinition[] = [
  {
    key: "cash_cleared", name: "Cleared receipts", category: "collections", unit: "money", permission: "analytics.finance",
    description: "Money that cleared in the period, net of cheques that cleared and later bounced.",
    async compute(zone, range, _c, tenantId) {
      const series = await daily(sql`
        SELECT (e.occurred_at AT TIME ZONE ${zone})::date::text AS d,
               SUM(CASE WHEN e.to_status = 'cleared' THEN r.amount_minor ELSE -r.amount_minor END) AS v
        FROM finance.receipt_events e JOIN finance.receipts r ON r.id = e.receipt_id
        WHERE r.tenant_id = ${tenantId}
          AND e.occurred_at >= ${range.from.toISOString()}::timestamptz AND e.occurred_at < ${range.to.toISOString()}::timestamptz
          AND (e.to_status = 'cleared' OR (e.to_status = 'bounced' AND e.from_status = 'cleared'))
        GROUP BY 1 ORDER BY 1`);
      return { value: total(series), series };
    },
  },
  {
    key: "invoices_billed", name: "Premium billed", category: "collections", unit: "money", permission: "analytics.finance",
    description: "Total of invoices issued in the period (premium, levies and fees).",
    async compute(_z, range, _c, tenantId) {
      const series = await daily(sql`
        SELECT issue_date::text AS d, SUM(total_minor) AS v FROM finance.invoices
        WHERE tenant_id = ${tenantId} AND status = 'open' AND issue_date BETWEEN ${range.fromDate}::date AND ${range.toDate}::date
        GROUP BY 1 ORDER BY 1`);
      return { value: total(series), series };
    },
  },
  {
    key: "collection_rate", name: "Collection rate", category: "collections", unit: "percent", permission: "analytics.finance",
    description: "Share of premium invoices issued in the period that has been paid so far.",
    async compute(_z, range, _c, tenantId) {
      const [r] = await rows<{ billed: unknown; collected: unknown }>(ex, sql`
        SELECT COALESCE(SUM(i.total_minor), 0) AS billed,
               COALESCE(SUM(i.paid_minor), 0) AS collected
        FROM finance.invoices i
        WHERE i.tenant_id = ${tenantId} AND i.status = 'open' AND i.kind = 'premium'
          AND i.issue_date BETWEEN ${range.fromDate}::date AND ${range.toDate}::date`);
      const billed = num(r.billed);
      const bps = billed === 0 ? 0 : Math.round((num(r.collected) * 10_000) / billed);
      return { value: bps }; // basis points: 10000 = 100%
    },
  },
  {
    key: "outstanding_premium", name: "Outstanding premium", category: "receivables", unit: "money", permission: "analytics.finance", pointInTime: true,
    description: "Everything clients currently owe on open invoices.",
    async compute(_z, _r, _c, tenantId) { return { value: await receivable(tenantId) }; },
  },
  {
    key: "overdue_premium", name: "Overdue premium", category: "receivables", unit: "money", permission: "analytics.finance", pointInTime: true,
    description: "Outstanding premium on invoices past their due date, measured in the tenant's local day.",
    async compute(zone, _r, _c, tenantId) { return { value: await receivable(tenantId, localDate(new Date(), zone)) }; },
  },
  {
    key: "suspense_balance", name: "Suspense balance", category: "receivables", unit: "money", permission: "analytics.finance", pointInTime: true,
    description: "Cleared money not applied to any invoice that staff still need to resolve.",
    async compute(_z, _r, _c, tenantId) { return { value: await held(tenantId, "suspense") }; },
  },
  {
    key: "client_credit_balance", name: "Client credit", category: "receivables", unit: "money", permission: "analytics.finance", pointInTime: true,
    description: "Overpayments held for clients and applied automatically to their next invoice.",
    async compute(_z, _r, _c, tenantId) { return { value: await held(tenantId, "client_credit") }; },
  },
  {
    key: "commission_earned", name: "Commission earned", category: "commission", unit: "money", permission: "analytics.finance",
    description: "Commission accrued on cleared premium in the period, net of reversals for returned cheques.",
    async compute(zone, range, _c, tenantId) {
      const series = await daily(sql`
        SELECT (created_at AT TIME ZONE ${zone})::date::text AS d, SUM(amount_minor) AS v FROM finance.commission_accruals
        WHERE tenant_id = ${tenantId} AND created_at >= ${range.from.toISOString()}::timestamptz AND created_at < ${range.to.toISOString()}::timestamptz
        GROUP BY 1 ORDER BY 1`);
      return { value: total(series), series };
    },
  },
  {
    key: "receipts_recorded", name: "Receipts recorded", category: "operations", unit: "count", permission: "analytics.view",
    description: "Number of receipts recorded in the period.",
    async compute(zone, range, _c, tenantId) {
      const series = await daily(sql`
        SELECT (received_at AT TIME ZONE ${zone})::date::text AS d, COUNT(*) AS v FROM finance.receipts
        WHERE tenant_id = ${tenantId} AND received_at >= ${range.from.toISOString()}::timestamptz AND received_at < ${range.to.toISOString()}::timestamptz
        GROUP BY 1 ORDER BY 1`);
      return { value: total(series), series };
    },
  },
  {
    key: "cheques_bounced", name: "Cheques returned", category: "operations", unit: "count", permission: "analytics.view",
    description: "Number of cheques returned unpaid in the period.",
    async compute(zone, range, _c, tenantId) {
      const series = await daily(sql`
        SELECT (e.occurred_at AT TIME ZONE ${zone})::date::text AS d, COUNT(*) AS v
        FROM finance.receipt_events e JOIN finance.receipts r ON r.id = e.receipt_id
        WHERE r.tenant_id = ${tenantId} AND e.to_status = 'bounced'
          AND e.occurred_at >= ${range.from.toISOString()}::timestamptz AND e.occurred_at < ${range.to.toISOString()}::timestamptz
        GROUP BY 1 ORDER BY 1`);
      return { value: total(series), series };
    },
  },
  {
    key: "avg_days_to_clear", name: "Days to clear a cheque", category: "operations", unit: "days", permission: "analytics.view",
    description: "Average days from receiving a cheque to it clearing, for cheques that cleared in the period.",
    async compute(_z, range, _c, tenantId) {
      const [r] = await rows<{ v: unknown }>(ex, sql`
        SELECT AVG(EXTRACT(EPOCH FROM (e.occurred_at - r.received_at)) / 86400.0) AS v
        FROM finance.receipt_events e JOIN finance.receipts r ON r.id = e.receipt_id
        WHERE r.tenant_id = ${tenantId} AND r.method = 'cheque' AND e.to_status = 'cleared'
          AND e.occurred_at >= ${range.from.toISOString()}::timestamptz AND e.occurred_at < ${range.to.toISOString()}::timestamptz`);
      return { value: r?.v == null ? 0 : Math.round(Number(r.v) * 10) / 10 };
    },
  },
];

export const kpiByKey = new Map(KPIS.map((k) => [k.key, k]));

// ---------- ranges and buckets ----------

export function buildRange(config: EffectiveTenantConfig, input: { from?: string; to?: string; granularity?: string }): KpiRange {
  const zone = config.regional.timeZone;
  const todayLocal = localDate(new Date(), zone);
  const toDate = input.to ?? todayLocal;
  const fromDate = input.from ?? `${toDate.slice(0, 7)}-01`;
  const granularity = (input.granularity ?? "day") as Granularity;
  for (const [name, v] of [["from", fromDate], ["to", toDate]] as const) {
    if (!isCalendarDate(v)) throw new RangeError(`${name} must be a YYYY-MM-DD date`);
  }
  if (!["day", "week", "month"].includes(granularity)) throw new RangeError("granularity must be day, week or month");
  if (fromDate > toDate) throw new RangeError("from must not be after to");
  if (daysBetween(fromDate, toDate) > 366) throw new RangeError("the range cannot exceed 366 days");
  const { from, to } = localDayRange(fromDate, toDate, zone);
  return { fromDate, toDate, from, to, granularity };
}

// ---------- presentation ----------

export function describe(def: KpiDefinition) {
  return { key: def.key, name: def.name, description: def.description, category: def.category, unit: def.unit, pointInTime: Boolean(def.pointInTime), permission: def.permission };
}

function displayValue(def: KpiDefinition, value: number, config: EffectiveTenantConfig): string {
  switch (def.unit) {
    case "money": return Money.of(value, config.regional.currency).format(config.localization.locale);
    case "percent": return `${(value / 100).toFixed(1)}%`;
    case "days": return `${value.toFixed(1)} days`;
    default: return new Intl.NumberFormat(config.localization.locale).format(value);
  }
}

export async function evaluate(def: KpiDefinition, config: EffectiveTenantConfig, range: KpiRange, withSeries: boolean) {
  const zone = config.regional.timeZone;
  const computed = await def.compute(zone, range, config, config.tenantId);
  return {
    ...describe(def),
    value: computed.value,
    currency: def.unit === "money" ? config.regional.currency : undefined,
    display: displayValue(def, computed.value, config),
    period: def.pointInTime ? null : { from: range.fromDate, to: range.toDate, timeZone: zone },
    asOf: def.pointInTime ? { date: localDate(new Date(), zone), timeZone: zone } : undefined,
    series: withSeries && computed.series ? rebucket(computed.series, range.granularity, config.regional.weekStartsOn) : undefined,
  };
}
