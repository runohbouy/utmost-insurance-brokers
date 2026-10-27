import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { api } from "../api";
import type { Policy, Party, Insurer, Renewal } from "../types";
import { className } from "../data/insuranceClasses";
import StatusPill from "./StatusPill";
import SearchInput, { matchesQuery } from "./SearchInput";
import Pagination, { usePagedSlice } from "./Pagination";

type Bucket = { label: string; tone: "good" | "warning" | "critical" | "neutral"; test: (days: number) => boolean };

const BUCKETS: Bucket[] = [
  { label: "Overdue", tone: "critical", test: (d) => d < 0 },
  { label: "Due in 0-30 days", tone: "critical", test: (d) => d >= 0 && d <= 30 },
  { label: "Due in 31-60 days", tone: "warning", test: (d) => d > 30 && d <= 60 },
  { label: "Due in 61-90 days", tone: "neutral", test: (d) => d > 60 && d <= 90 },
];

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export default function RenewalsView({ onSelectPolicy }: { onSelectPolicy: (id: string) => void }) {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [insurers, setInsurers] = useState<Insurer[]>([]);
  const [renewals, setRenewals] = useState<Renewal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [bucketPages, setBucketPages] = useState<Record<string, number>>({});

  function load() {
    setLoading(true);
    Promise.all([api.policies.list(), api.parties.list(), api.insurers.list(), api.renewals.list()])
      .then(([p, pa, ins, r]) => { setPolicies(p); setParties(pa); setInsurers(ins); setRenewals(r); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const partyName = (id: string | null) => parties.find((p) => p.id === id)?.fullName || "—";
  const insurerName = (id: string | null) => insurers.find((i) => i.id === id)?.name || id || "—";
  const renewalFor = (policyId: string) =>
    renewals.filter((r) => r.policyId === policyId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  const pipeline = policies
    .filter((p) => ["Active", "Delivered"].includes(p.status))
    .map((p) => ({ policy: p, daysToExpiry: daysUntil(p.endDate), renewal: renewalFor(p.id) }))
    .filter((row) => row.daysToExpiry <= 90)
    .filter((row) => matchesQuery(query, row.policy.id, partyName(row.policy.clientId), className(row.policy.category), insurerName(row.policy.insurerId), row.renewal?.renewalStatus));

  async function handleOpenCase(policyId: string, dueDate: string) {
    setSaving(policyId);
    try {
      await api.renewals.create({ policyId, dueDate });
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  }

  async function handleRemind(renewal: Renewal) {
    setSaving(renewal.policyId);
    try {
      await api.renewals.update(renewal.id, { reminderCount: renewal.reminderCount + 1, lastReminderAt: new Date().toISOString() });
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  }

  async function handleStatusChange(renewal: Renewal, renewalStatus: string) {
    setSaving(renewal.policyId);
    try {
      await api.renewals.update(renewal.id, { renewalStatus: renewalStatus as Renewal["renewalStatus"] });
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Renewals</h2>
        <p className="mt-1 text-sm text-slate-500">The 90-day renewal pipeline (SOP §12.2) — active policies approaching expiry, grouped by how urgent follow-up is.</p>
      </div>

      {error && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      <SearchInput value={query} onChange={setQuery} placeholder="Search by policy #, client, category, insurer, status…" />

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : pipeline.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">{query ? `No renewals match "${query}".` : "No active policies due for renewal in the next 90 days."}</p>
      ) : (
        BUCKETS.map((bucket) => {
          const rows = pipeline.filter((row) => bucket.test(row.daysToExpiry));
          if (rows.length === 0) return null;
          const page = bucketPages[bucket.label] || 0;
          const { pageItems, totalPages, clampedPage } = usePagedSlice(rows, page);
          return (
            <div key={bucket.label} className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-900">{bucket.label}</h3>
                <StatusPill status={String(rows.length)} tone={bucket.tone} />
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th scope="col" className="px-4 py-2.5 font-medium">Policy</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Client</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Category</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Insurer</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Premium</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Expiry</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Renewal status</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Reminders</th>
                      <th scope="col" className="px-4 py-2.5 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map(({ policy, daysToExpiry, renewal }) => (
                      <tr key={policy.id} className="border-b border-slate-100 last:border-0">
                        <td className="cursor-pointer px-4 py-2.5 font-mono text-xs text-indigo-700 hover:underline" onClick={() => onSelectPolicy(policy.id)}>{policy.id}</td>
                        <td className="px-4 py-2.5 text-slate-600">{partyName(policy.clientId)}</td>
                        <td className="px-4 py-2.5 text-slate-600">{className(policy.category)}</td>
                        <td className="px-4 py-2.5 text-slate-600">{insurerName(policy.insurerId)}</td>
                        <td className="px-4 py-2.5 tabular-nums text-slate-600">KES {Number(policy.premiumAmount).toLocaleString()}</td>
                        <td className="px-4 py-2.5 tabular-nums text-slate-600">{policy.endDate} ({daysToExpiry < 0 ? `${Math.abs(daysToExpiry)}d overdue` : `${daysToExpiry}d`})</td>
                        <td className="px-4 py-2.5">
                          {renewal ? (
                            <select
                              value={renewal.renewalStatus}
                              onChange={(e) => handleStatusChange(renewal, e.target.value)}
                              disabled={saving === policy.id}
                              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                            >
                              <option value="upcoming">Upcoming</option>
                              <option value="quoted">Quoted</option>
                              <option value="confirmed">Confirmed</option>
                              <option value="lapsed">Lapsed</option>
                            </select>
                          ) : (
                            <StatusPill status="Not started" tone="neutral" />
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">
                          {renewal ? `${renewal.reminderCount}${renewal.lastReminderAt ? ` · last ${new Date(renewal.lastReminderAt).toLocaleDateString()}` : ""}` : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {renewal ? (
                            <button onClick={() => handleRemind(renewal)} disabled={saving === policy.id} className="flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                              <Bell size={13} /> Send reminder
                            </button>
                          ) : (
                            <button onClick={() => handleOpenCase(policy.id, policy.endDate)} disabled={saving === policy.id} className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                              {saving === policy.id ? "Opening…" : "Open renewal case"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Pagination page={clampedPage} totalPages={totalPages} totalItems={rows.length} onChange={(p) => setBucketPages((prev) => ({ ...prev, [bucket.label]: p }))} />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
