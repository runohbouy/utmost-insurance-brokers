import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "../api";
import { CLAIM_STAGES, type Claim, type Policy, type ClaimsEscalation } from "../types";
import StatusPill from "./StatusPill";
import SearchInput, { matchesQuery } from "./SearchInput";
import Pagination, { usePagedSlice } from "./Pagination";

const EMPTY_FORM = { policyId: "", claimType: "", phoneNumber: "", description: "", lossDate: "" };

export default function ClaimsView({ onSelect }: { onSelect: (id: string) => void }) {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [escalation, setEscalation] = useState<ClaimsEscalation | null>(null);
  const [view, setView] = useState<"list" | "escalation">("list");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [claimsPage, setClaimsPage] = useState(0);
  const [escalationPage, setEscalationPage] = useState(0);

  function load() {
    setLoading(true);
    Promise.all([api.claims.list(), api.policies.list(), api.claimsEscalation.get()])
      .then(([c, p, esc]) => { setClaims(c); setPolicies(p); setEscalation(esc); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.claims.create({
        policyId: form.policyId || undefined,
        policyNumber: form.policyId || undefined,
        claimType: form.claimType,
        phoneNumber: form.phoneNumber || undefined,
        description: form.description || undefined,
        lossDate: form.lossDate || undefined,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(id: string, status: string) {
    setClaims((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));
    try {
      await api.claims.update(id, { status });
    } catch (err: any) {
      setError(err.message);
      load();
    }
  }

  const claimsFiltered = claims.filter((c) => matchesQuery(query, c.id, c.policyNumber, c.claimType, c.status));
  const escalationFiltered = (escalation?.rows || []).filter((r) => matchesQuery(query, r.claimId, r.assignedOfficerId, r.escalationLevel));
  const { pageItems: claimsPageItems, totalPages: claimsTotalPages, clampedPage: claimsClampedPage } = usePagedSlice(claimsFiltered, claimsPage);
  const { pageItems: escalationPageItems, totalPages: escalationTotalPages, clampedPage: escalationClampedPage } = usePagedSlice(escalationFiltered, escalationPage);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Claims</h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-slate-300 bg-white p-0.5 text-xs">
            <button onClick={() => setView("list")} className={`rounded px-2.5 py-1 font-medium ${view === "list" ? "bg-slate-900 text-white" : "text-slate-600"}`}>List</button>
            <button onClick={() => setView("escalation")} className={`rounded px-2.5 py-1 font-medium ${view === "escalation" ? "bg-slate-900 text-white" : "text-slate-600"}`}>Escalation</button>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <Plus size={15} /> Register claim (FNOL)
          </button>
        </div>
      </div>

      {error && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      <SearchInput value={query} onChange={setQuery} placeholder={view === "list" ? "Search by claim #, policy #, type, status…" : "Search by claim #, owner…"} />

      {showForm && (
        <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3">
          <select required className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={form.policyId} onChange={(e) => setForm({ ...form, policyId: e.target.value })}>
            <option value="">-- Policy --</option>
            {policies.map((p) => <option key={p.id} value={p.id}>{p.id} ({p.category})</option>)}
          </select>
          <input required placeholder="Claim type (e.g. Motor Accident)" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={form.claimType} onChange={(e) => setForm({ ...form, claimType: e.target.value })} />
          <input placeholder="Claimant phone" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} />
          <input type="date" placeholder="Loss date" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={form.lossDate} onChange={(e) => setForm({ ...form, lossDate: e.target.value })} />
          <input placeholder="Description" className="col-span-2 rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
            {saving ? "Registering…" : "Register claim"}
          </button>
        </form>
      )}

      {view === "list" ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="px-4 py-2.5 font-medium"></th>
                <th scope="col" className="px-4 py-2.5 font-medium">Claim</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Policy</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Type</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Reserve</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Paid</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">Loading…</td></tr>
              ) : claimsFiltered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">{claims.length === 0 ? "No claims registered yet." : `No claims match "${query}".`}</td></tr>
              ) : (
                claimsPageItems.map((c) => (
                  <tr key={c.id} onClick={() => onSelect(c.id)} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <span className={`inline-block h-2.5 w-2.5 rounded-full ${c.priority === "red" ? "bg-rose-500" : c.priority === "amber" ? "bg-amber-500" : "bg-emerald-500"}`} title={`${c.priority} priority`} />
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-900">{c.id}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{c.policyNumber}</td>
                    <td className="px-4 py-2.5 text-slate-600">{c.claimType}</td>
                    <td className="px-4 py-2.5 tabular-nums text-slate-600">{c.reserveAmountKes ? `KES ${c.reserveAmountKes.toLocaleString()}` : "—"}</td>
                    <td className="px-4 py-2.5 tabular-nums text-slate-600">{c.paidAmountKes ? `KES ${c.paidAmountKes.toLocaleString()}` : "—"}</td>
                    <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={c.status}
                        onChange={(e) => handleStatusChange(c.id, e.target.value)}
                        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                      >
                        {CLAIM_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <Pagination page={claimsClampedPage} totalPages={claimsTotalPages} totalItems={claimsFiltered.length} onChange={setClaimsPage} />
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-slate-500">Open claims ranked by days outstanding — escalation level accounts for age plus fraud flags and red-priority claims, which escalate regardless of age.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {escalation && Object.entries(escalation.summary).map(([level, count]) => (
              <div key={level} className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                <p className="text-xl font-semibold tabular-nums text-slate-900">{count}</p>
                <p className="mt-0.5 text-xs capitalize text-slate-500">{level}</p>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th scope="col" className="px-4 py-2.5 font-medium">Claim</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Days outstanding</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Last action</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Next action</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Owner</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Escalation</th>
                </tr>
              </thead>
              <tbody>
                {!escalation || escalation.rows.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Nothing open.</td></tr>
                ) : escalationFiltered.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">{`No open claims match "${query}".`}</td></tr>
                ) : (
                  escalationPageItems.map((r) => (
                    <tr key={r.claimId} onClick={() => onSelect(r.claimId)} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-900">{r.claimId}</td>
                      <td className="px-4 py-2.5 tabular-nums text-slate-600">{r.daysOutstanding}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{r.lastActionDetail}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{r.nextActionHint}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{r.assignedOfficerId || "Unassigned"}</td>
                      <td className="px-4 py-2.5"><StatusPill status={r.escalationLevel} tone={r.escalationLevel === "critical" ? "critical" : r.escalationLevel === "escalate" ? "warning" : r.escalationLevel === "watch" ? "warning" : "good"} /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <Pagination page={escalationClampedPage} totalPages={escalationTotalPages} totalItems={escalationFiltered.length} onChange={setEscalationPage} />
          </div>
        </div>
      )}
    </div>
  );
}
