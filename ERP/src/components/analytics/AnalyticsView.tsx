import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import { useTenant } from "../../ConfigContext";
import type { KpiResult, KpiSummary } from "../../financeTypes";
import { ErrorNotice, Field, inputClass, primaryButton } from "../ui";

const CATEGORIES: { id: string; label: string }[] = [
  { id: "collections", label: "Collections" }, { id: "receivables", label: "Receivables" },
  { id: "commission", label: "Commission" }, { id: "operations", label: "Operations" },
];

/** A tiny trend line. The same numbers are available as a table for screen-reader and keyboard users. */
function Sparkline({ series, label, format }: { series: { bucket: string; value: number }[]; label: string; format: (n: number) => string }) {
  if (series.length < 2) return <p className="mt-3 text-xs text-slate-400">{series.length === 0 ? "No activity in this period." : `Single period: ${series[0].bucket}`}</p>;
  const W = 220, H = 44, P = 3;
  const values = series.map((s) => s.value);
  const lo = Math.min(0, ...values), hi = Math.max(0, ...values), span = hi - lo || 1;
  const x = (i: number) => P + (i * (W - 2 * P)) / (series.length - 1);
  const y = (v: number) => H - P - ((v - lo) * (H - 2 * P)) / span;
  const points = series.map((s, i) => `${x(i).toFixed(1)},${y(s.value).toFixed(1)}`).join(" ");
  const summary = `${label}: from ${format(series[0].value)} on ${series[0].bucket} to ${format(series[series.length - 1].value)} on ${series[series.length - 1].bucket}`;
  return (
    <div className="mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} className="h-11 w-full text-indigo-600">
        {lo < 0 && <line x1={P} x2={W - P} y1={y(0)} y2={y(0)} stroke="currentColor" strokeOpacity="0.25" strokeDasharray="2 2" />}
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <details className="mt-1 text-xs text-slate-500">
        <summary className="cursor-pointer">View the numbers</summary>
        <table className="mt-1 w-full"><tbody>{series.map((s) => <tr key={s.bucket}><th scope="row" className="py-0.5 pr-2 text-left font-normal">{s.bucket}</th><td className="py-0.5 text-right tabular-nums">{format(s.value)}</td></tr>)}</tbody></table>
      </details>
    </div>
  );
}

function KpiCard({ kpi, money }: { kpi: KpiResult; money: (n: number) => string }) {
  const format = (n: number) => kpi.unit === "money" ? money(n) : kpi.unit === "percent" ? `${(n / 100).toFixed(1)}%` : kpi.unit === "days" ? `${n.toFixed(1)} days` : String(n);
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4" aria-label={kpi.name}>
      <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">{kpi.name}</h3>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{kpi.display}</p>
      <p className="mt-1 text-xs text-slate-500">{kpi.description}</p>
      <p className="mt-1 text-xs text-slate-400">{kpi.pointInTime ? `As of ${kpi.asOf?.date}` : kpi.period ? `${kpi.period.from} to ${kpi.period.to}` : ""}</p>
      {kpi.series && <Sparkline series={kpi.series} label={kpi.name} format={format} />}
    </article>
  );
}

export default function AnalyticsView() {
  const tenant = useTenant();
  const today = tenant.today();
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [granularity, setGranularity] = useState("day");
  const [data, setData] = useState<KpiSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await api.kpis.summary({ from, to, granularity, series: true })); } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }, [from, to, granularity]);
  useEffect(() => { load(); /* load once on open; later changes go through the Update button */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Analytics</h2>
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); load(); }} aria-label="Reporting period">
          <Field label="From"><input type="date" className={inputClass} value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><input type="date" className={inputClass} value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
          <Field label="Group by"><select className={inputClass} value={granularity} onChange={(e) => setGranularity(e.target.value)}><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option></select></Field>
          <button type="submit" disabled={loading} className={primaryButton}>{loading ? "Updating…" : "Update"}</button>
        </form>
      </div>
      <p className="text-xs text-slate-500">Days are {data ? data.period.timeZone : "the tenant's"} days, not the server's or your browser's, so a figure never moves with where you are sitting.</p>
      <ErrorNotice message={error} onDismiss={() => setError(null)} />
      {data && data.kpis.length === 0 && <p className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-500">Your role does not include any KPIs.</p>}
      {data && CATEGORIES.map((c) => {
        const items = data.kpis.filter((k) => k.category === c.id);
        if (items.length === 0) return null;
        return (
          <section key={c.id} aria-label={c.label} className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-700">{c.label}</h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{items.map((k) => <KpiCard key={k.key} kpi={k} money={tenant.money} />)}</div>
          </section>
        );
      })}
    </div>
  );
}
