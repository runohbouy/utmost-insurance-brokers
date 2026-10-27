import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "../api";
import { COMPLAINT_STAGES, type Complaint, type Party } from "../types";
import SearchInput, { matchesQuery } from "./SearchInput";
import Pagination, { usePagedSlice } from "./Pagination";

const EMPTY_FORM = { partyId: "", category: "", severity: "medium", subject: "", description: "", channel: "phone" };

export default function ComplaintsView() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  function load() {
    setLoading(true);
    Promise.all([api.complaints.list(), api.parties.list()])
      .then(([c, p]) => { setComplaints(c); setParties(p); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.complaints.create({
        partyId: form.partyId || undefined,
        category: form.category || undefined,
        severity: form.severity,
        subject: form.subject,
        description: form.description || undefined,
        channel: form.channel,
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
    setComplaints((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));
    try {
      await api.complaints.update(id, { status });
    } catch (err: any) {
      setError(err.message);
      load();
    }
  }

  const partyName = (id: string | null) => parties.find((p) => p.id === id)?.fullName || "—";
  const filtered = complaints.filter((c) => matchesQuery(query, c.subject, partyName(c.partyId), c.severity, c.channel, c.status, c.category));
  const { pageItems, totalPages, clampedPage } = usePagedSlice(filtered, page);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Complaints</h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus size={15} /> Register complaint
        </button>
      </div>

      {error && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      <SearchInput value={query} onChange={setQuery} placeholder="Search by subject, party, severity, channel, status…" />

      {showForm && (
        <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3">
          <select className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={form.partyId} onChange={(e) => setForm({ ...form, partyId: e.target.value })}>
            <option value="">-- Party --</option>
            {parties.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
          </select>
          <input required placeholder="Subject" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          <input placeholder="Category" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <select className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
          <select className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
            <option value="phone">Phone</option>
            <option value="email">Email</option>
            <option value="portal">Portal</option>
            <option value="walk_in">Walk-in</option>
          </select>
          <input placeholder="Description" className="col-span-2 rounded-md border border-slate-300 px-3 py-1.5 text-sm sm:col-span-1" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
            {saving ? "Registering…" : "Register complaint"}
          </button>
        </form>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th scope="col" className="px-4 py-2.5 font-medium">Subject</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Party</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Severity</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Channel</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">{complaints.length === 0 ? "No complaints registered yet." : `No complaints match "${query}".`}</td></tr>
            ) : (
              pageItems.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-slate-900">{c.subject}</td>
                  <td className="px-4 py-2.5 text-slate-600">{partyName(c.partyId)}</td>
                  <td className="px-4 py-2.5 capitalize text-slate-600">{c.severity || "—"}</td>
                  <td className="px-4 py-2.5 capitalize text-slate-600">{c.channel || "—"}</td>
                  <td className="px-4 py-2.5">
                    <select
                      value={c.status}
                      onChange={(e) => handleStatusChange(c.id, e.target.value)}
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                    >
                      {COMPLAINT_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination page={clampedPage} totalPages={totalPages} totalItems={filtered.length} onChange={setPage} />
      </div>
    </div>
  );
}
