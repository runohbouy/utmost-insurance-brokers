import { useEffect, useState } from "react";
import {
  Users, TrendingUp, FileCheck2, Banknote, Wallet, LifeBuoy,
  MessageSquareWarning, ListChecks, ShieldCheck, ArrowUpRight, ArrowDownRight,
  RotateCcw, UserPlus,
} from "lucide-react";
import { api } from "../api";
import type { Party, Opportunity, Policy, WorkflowTask, ComplianceObligation, Claim, Complaint, FinancialTransaction } from "../types";
import StatusPill from "./StatusPill";

// Solid Tailwind class names, one per icon-badge color — kept as a
// static lookup rather than building the class with string
// interpolation (e.g. `bg-${color}-500`), since Tailwind's JIT scanner
// only picks up class names it can see literally in the source.
const BADGE_COLOR: Record<string, string> = {
  indigo: "bg-indigo-500",
  purple: "bg-purple-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  blue: "bg-blue-500",
  orange: "bg-orange-500",
};

interface StatCardProps {
  icon: typeof Users;
  color: keyof typeof BADGE_COLOR;
  label: string;
  value: string;
  trendPct?: number | null;
}

function StatCard({ icon: Icon, color, label, value, trendPct }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className={`inline-flex size-9 items-center justify-center rounded-full text-white shadow-[inset_0_1px_2px_1px_rgba(255,255,255,0.25),inset_0_-1px_2px_1px_rgba(0,0,0,0.1)] ${BADGE_COLOR[color]}`}>
          <Icon size={16} />
        </span>
        {trendPct != null && (
          <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${trendPct >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
            {trendPct >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
            {Math.abs(trendPct).toFixed(1)}%
          </span>
        )}
      </div>
      <p className="mt-3 text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

// Compact horizontal pill stat, styled after the capsule pattern at
// https://ui.watermelon.sh/blocks/Stats (Stats 3) — icon square, bold
// value, small label, all inline in a rounded-full shell.
function QuickFactPill({ icon: Icon, color, value, label }: { icon: typeof Users; color: keyof typeof BADGE_COLOR; value: string; label: string }) {
  return (
    <div className="inline-flex items-center gap-2.5 rounded-full border border-slate-200 bg-white py-1.5 pr-4 pl-1.5 shadow-sm">
      <span className={`flex size-7 items-center justify-center rounded-full text-white ${BADGE_COLOR[color]}`}>
        <Icon size={13} />
      </span>
      <span className="flex items-baseline gap-1.5">
        <span className="text-sm font-semibold tabular-nums text-slate-900">{value}</span>
        <span className="text-xs text-slate-500">{label}</span>
      </span>
    </div>
  );
}

// Plain inline SVG — deliberately no charting library dependency for
// a single trend line. values.length must be >= 2.
function buildAreaPath(values: number[], width: number, height: number, padding = 6) {
  const max = Math.max(...values, 1);
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = padding + (height - padding * 2) * (1 - v / max);
    return [x, y] as const;
  });
  const linePath = points.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1][0]} ${height} L ${points[0][0]} ${height} Z`;
  return { linePath, areaPath };
}

function PremiumTrendCard({ labels, values }: { labels: string[]; values: number[] }) {
  const width = 600;
  const height = 140;
  const { linePath, areaPath } = buildAreaPath(values, width, height);
  const current = values[values.length - 1];
  const previous = values[values.length - 2];
  const trendPct = previous > 0 ? ((current - previous) / previous) * 100 : current > 0 ? 100 : 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Premium collected — last 6 months</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="text-2xl font-semibold tabular-nums text-slate-900">KES {current.toLocaleString()}</p>
        <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium ${trendPct >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
          {trendPct >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
          {Math.abs(trendPct).toFixed(1)}% vs prior month
        </span>
      </div>
      <div className="mt-4">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-32 w-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id="premiumTrendGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#premiumTrendGradient)" />
          <path d={linePath} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        <div className="mt-1 flex justify-between text-[10px] text-slate-400">
          {labels.map((l, i) => <span key={`${l}-${i}`}>{l}</span>)}
        </div>
      </div>
    </div>
  );
}

export default function DashboardView() {
  const [parties, setParties] = useState<Party[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [tasks, setTasks] = useState<WorkflowTask[]>([]);
  const [obligations, setObligations] = useState<ComplianceObligation[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.parties.list(),
      api.opportunities.list(),
      api.policies.list(),
      api.tasks.list(),
      api.obligations.list(),
      api.claims.list(),
      api.complaints.list(),
      api.financialTransactions.list(),
    ])
      .then(([p, o, pol, t, ob, cl, co, txn]) => {
        setParties(p);
        setOpportunities(o);
        setPolicies(pol);
        setTasks(t);
        setObligations(ob);
        setClaims(cl);
        setComplaints(co);
        setTransactions(txn);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-slate-500">Loading workspace…</p>;
  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        Couldn't reach the API: {error}. Is the server (and Postgres) running?
      </div>
    );
  }

  const activePolicies = policies.filter((p) => p.status === "Active").length;
  const openOpportunities = opportunities.filter((o) => !["Won", "Lost", "Deferred"].includes(o.stage));
  const now = Date.now();
  const overdueTasks = tasks.filter((t) => t.status !== "done" && t.status !== "cancelled" && t.dueAt && new Date(t.dueAt).getTime() < now);
  const openTasks = tasks.filter((t) => t.status !== "done" && t.status !== "cancelled");
  const dueSoonObligations = obligations
    .filter((o) => o.status === "open" || o.status === "overdue")
    .filter((o) => new Date(o.dueDate).getTime() < now + 30 * 24 * 60 * 60 * 1000)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  const stageCounts = opportunities.reduce<Record<string, number>>((acc, o) => {
    acc[o.stage] = (acc[o.stage] || 0) + 1;
    return acc;
  }, {});

  const openClaims = claims.filter((c) => c.status !== "Closed");
  const openComplaints = complaints
    .filter((c) => !["Closed", "Escalated"].includes(c.status))
    .sort((a, b) => new Date(a.receivedDate).getTime() - new Date(b.receivedDate).getTime());

  const premiumCollected = transactions.filter((t) => t.transactionType === "premium").reduce((sum, t) => sum + t.amountKes, 0);
  const projectedCommission = transactions.filter((t) => t.transactionType === "commission" && t.status === "pending").reduce((sum, t) => sum + t.amountKes, 0);

  // Last 6 calendar months of premium collected, computed from
  // financialTransactions already fetched above — no extra endpoint.
  const monthLabels: string[] = [];
  const monthTotals: number[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const key = d.toISOString().slice(0, 7);
    monthLabels.push(d.toLocaleDateString(undefined, { month: "short" }));
    const total = transactions
      .filter((t) => t.transactionType === "premium" && t.occurredAt.slice(0, 7) === key)
      .reduce((sum, t) => sum + t.amountKes, 0);
    monthTotals.push(total);
  }

  // "Today at a glance" — a few time-boxed operational facts distinct
  // from the point-in-time totals above (renewals/premium/new business
  // in motion right now, not a running count).
  const weekFromNow = now + 7 * 24 * 60 * 60 * 1000;
  const todayKey = new Date().toISOString().slice(0, 10);
  const renewalsDueThisWeek = policies.filter((p) => p.status === "Active" && new Date(p.endDate).getTime() < weekFromNow && new Date(p.endDate).getTime() >= now).length;
  const premiumConfirmedToday = transactions.filter((t) => t.transactionType === "premium" && t.occurredAt.slice(0, 10) === todayKey).reduce((sum, t) => sum + t.amountKes, 0);
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const newPartiesThisWeek = parties.filter((p) => new Date(p.createdAt).getTime() > weekAgo).length;
  const newOpportunitiesThisWeek = opportunities.filter((o) => new Date(o.createdAt).getTime() > weekAgo).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2.5">
        <QuickFactPill icon={RotateCcw} color="blue" value={String(renewalsDueThisWeek)} label="renewals due this week" />
        <QuickFactPill icon={Banknote} color="emerald" value={`KES ${premiumConfirmedToday.toLocaleString()}`} label="premium confirmed today" />
        <QuickFactPill icon={UserPlus} color="purple" value={String(newPartiesThisWeek)} label="new parties this week" />
        <QuickFactPill icon={TrendingUp} color="indigo" value={String(newOpportunitiesThisWeek)} label="new opportunities this week" />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard icon={Users} color="indigo" label="Parties" value={String(parties.length)} />
        <StatCard icon={TrendingUp} color="purple" label="Open opportunities" value={String(openOpportunities.length)} />
        <StatCard icon={FileCheck2} color="emerald" label="Active policies" value={String(activePolicies)} />
        <StatCard icon={Banknote} color="emerald" label="Premium collected" value={`KES ${premiumCollected.toLocaleString()}`} />
        <StatCard icon={Wallet} color="amber" label="Projected commission" value={`KES ${projectedCommission.toLocaleString()}`} />
        <StatCard icon={LifeBuoy} color={openClaims.length > 0 ? "rose" : "emerald"} label="Open claims" value={String(openClaims.length)} />
        <StatCard icon={MessageSquareWarning} color={openComplaints.length > 0 ? "orange" : "emerald"} label="Open complaints" value={String(openComplaints.length)} />
        <StatCard icon={ListChecks} color={overdueTasks.length > 0 ? "rose" : "blue"} label="Open tasks" value={String(openTasks.length)} />
        <StatCard icon={ShieldCheck} color={dueSoonObligations.length > 0 ? "amber" : "emerald"} label="Obligations due (30d)" value={String(dueSoonObligations.length)} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <PremiumTrendCard labels={monthLabels} values={monthTotals} />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">Opportunity pipeline</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stageCounts).length === 0 && <p className="text-sm text-slate-400">No opportunities yet.</p>}
            {Object.entries(stageCounts).map(([stage, count]) => (
              <span key={stage} className="rounded-md bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
                {stage} <span className="tabular-nums text-slate-900">{count}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-slate-900">
            Open claims {openClaims.length > 0 && <span className="text-amber-600">({openClaims.length})</span>}
          </p>
          {openClaims.length === 0 ? (
            <p className="text-sm text-slate-400">Nothing open.</p>
          ) : (
            <ul className="space-y-2">
              {openClaims.slice(0, 8).map((c) => (
                <li key={c.id} className="flex items-center justify-between text-sm">
                  <span className="truncate pr-2 text-slate-700">{c.claimType} · {c.policyNumber}</span>
                  <StatusPill status={c.status} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-slate-900">
            Open complaints {openComplaints.length > 0 && <span className="text-amber-600">({openComplaints.length})</span>}
          </p>
          {openComplaints.length === 0 ? (
            <p className="text-sm text-slate-400">Nothing open.</p>
          ) : (
            <ul className="space-y-2">
              {openComplaints.slice(0, 8).map((c) => (
                <li key={c.id} className="flex items-center justify-between text-sm">
                  <span className="truncate pr-2 text-slate-700">{c.subject}</span>
                  <StatusPill status={c.status} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-slate-900">
            Overdue tasks {overdueTasks.length > 0 && <span className="text-rose-600">({overdueTasks.length})</span>}
          </p>
          {overdueTasks.length === 0 ? (
            <p className="text-sm text-slate-400">Nothing overdue.</p>
          ) : (
            <ul className="space-y-2">
              {overdueTasks.slice(0, 8).map((t) => (
                <li key={t.id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700">{t.taskType}{t.queue ? ` · ${t.queue}` : ""}</span>
                  <span className="tabular-nums text-rose-600">{t.dueAt && new Date(t.dueAt).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-slate-900">Compliance obligations due soon</p>
          {dueSoonObligations.length === 0 ? (
            <p className="text-sm text-slate-400">Nothing due in the next 30 days.</p>
          ) : (
            <ul className="space-y-2">
              {dueSoonObligations.slice(0, 8).map((o) => (
                <li key={o.id} className="flex items-center justify-between text-sm">
                  <span className="truncate pr-2 text-slate-700">{o.requirement}</span>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="tabular-nums text-slate-500">{new Date(o.dueDate).toLocaleDateString()}</span>
                    <StatusPill status={o.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
