import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "../api";
import type { ComplianceObligation } from "../types";
import StatusPill from "./StatusPill";
import SearchInput, { matchesQuery } from "./SearchInput";
import Pagination, { usePagedSlice } from "./Pagination";

const EMPTY_FORM = { requirement: "", obligationType: "licence", source: "", dueDate: "", recurrence: "annual" };

export default function ObligationsView() {
  const [obligations, setObligations] = useState<ComplianceObligation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  function load() {
    setLoading(true);
    api.obligations.list().then(setObligations).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.obligations.create(form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const now = Date.now();
  const filtered = obligations.filter((o) => matchesQuery(query, o.requirement, o.obligationType, o.source, o.status));
  const { pageItems, totalPages, clampedPage } = usePagedSlice(filtered, page);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Compliance obligations</h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus size={15} /> New obligation
        </button>
      </div>

      {error && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      <SearchInput value={query} onChange={setQuery} placeholder="Search by requirement, type, source, status…" />

      {showForm && (
        <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3">
          <input required placeholder="Requirement" className="col-span-2 rounded-md border border-slate-300 px-3 py-1.5 text-sm sm:col-span-1" value={form.requirement} onChange={(e) => setForm({ ...form, requirement: e.target.value })} />
          <select className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={form.obligationType} onChange={(e) => setForm({ ...form, obligationType: e.target.value })}>
            <option value="licence">Licence</option>
            <option value="filing">Filing</option>
            <option value="credential">Credential</option>
            <option value="returns">Returns</option>
          </select>
          <input placeholder="Source (e.g. IRA, Insurance Act)" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
          <input required type="date" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          <select className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value })}>
            <option value="annual">Annual</option>
            <option value="quarterly">Quarterly</option>
            <option value="one_off">One-off</option>
          </select>
          <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
            {saving ? "Saving…" : "Create obligation"}
          </button>
        </form>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th scope="col" className="px-4 py-2.5 font-medium">Requirement</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Type</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Source</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Due date</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">{obligations.length === 0 ? "No obligations registered yet." : `No obligations match "${query}".`}</td></tr>
            ) : (
              pageItems.map((o) => {
                const overdue = o.status === "open" && new Date(o.dueDate).getTime() < now;
                return (
                  <tr key={o.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-slate-900">{o.requirement}</td>
                    <td className="px-4 py-2.5 capitalize text-slate-600">{o.obligationType}</td>
                    <td className="px-4 py-2.5 text-slate-600">{o.source || "—"}</td>
                    <td className={`px-4 py-2.5 tabular-nums ${overdue ? "font-medium text-rose-600" : "text-slate-600"}`}>{o.dueDate}</td>
                    <td className="px-4 py-2.5"><StatusPill status={overdue ? "overdue" : o.status} /></td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        <Pagination page={clampedPage} totalPages={totalPages} totalItems={filtered.length} onChange={setPage} />
      </div>
    </div>
  );
}
