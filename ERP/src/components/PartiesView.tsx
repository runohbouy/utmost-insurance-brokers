import { useState } from "react";
import { Plus } from "lucide-react";
import { api } from "../api";
import type { Party } from "../types";
import StatusPill from "./StatusPill";
import SearchInput from "./SearchInput";
import Pagination from "./Pagination";
import { usePagedList } from "../usePagedList";

const EMPTY_FORM = { fullName: "", partyType: "individual", phoneNumber: "", email: "", nationalId: "", kraPin: "", companyRegNo: "", county: "" };

export default function PartiesView({ onSelect }: { onSelect: (id: string) => void }) {
  const { rows: parties, total, loading, error, setError, query, setQuery, debouncedQuery, page, setPage, totalPages, reload: load } =
    usePagedList<Party>((request) => api.parties.page(request));
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.parties.create(form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Parties</h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus size={15} /> New party
        </button>
      </div>

      {error && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      <SearchInput value={query} onChange={setQuery} placeholder="Search by name, phone, email, county, ID…" />

      {showForm && (
        <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3">
          <input required placeholder="Full name" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          <select className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={form.partyType} onChange={(e) => setForm({ ...form, partyType: e.target.value })}>
            <option value="individual">Individual</option>
            <option value="corporate">Corporate</option>
          </select>
          <input placeholder="Phone number" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} />
          <input placeholder="Email" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input placeholder={form.partyType === "corporate" ? "Directors' National ID / Reg No." : "National ID / Passport No."} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={form.nationalId} onChange={(e) => setForm({ ...form, nationalId: e.target.value })} />
          <input placeholder="KRA PIN" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={form.kraPin} onChange={(e) => setForm({ ...form, kraPin: e.target.value })} />
          {form.partyType === "corporate" && (
            <input placeholder="Company registration no." className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={form.companyRegNo} onChange={(e) => setForm({ ...form, companyRegNo: e.target.value })} />
          )}
          <input placeholder="County" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={form.county} onChange={(e) => setForm({ ...form, county: e.target.value })} />
          <p className="col-span-2 text-xs text-slate-400 sm:col-span-3">The requisite KYC document checklist ({form.partyType === "corporate" ? "Certificate of Incorporation, KRA PIN, CR12, directors' IDs, tax compliance certificate" : "National ID/Passport, KRA PIN"}) is created automatically — upload and track it from the client's profile.</p>
          <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
            {saving ? "Saving…" : "Create party"}
          </button>
        </form>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th scope="col" className="px-4 py-2.5 font-medium">Name</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Type</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Contact</th>
              <th scope="col" className="px-4 py-2.5 font-medium">County</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Risk</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Loading…</td></tr>
            ) : parties.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">{debouncedQuery ? `No parties match "${debouncedQuery}".` : "No parties yet."}</td></tr>
            ) : (
              parties.map((p) => (
                <tr key={p.id} onClick={() => onSelect(p.id)} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-indigo-700">{p.fullName}</td>
                  <td className="px-4 py-2.5 capitalize text-slate-600">{p.partyType}</td>
                  <td className="px-4 py-2.5 text-slate-600">{p.phoneNumber || p.email || "—"}</td>
                  <td className="px-4 py-2.5 text-slate-600">{p.county || "—"}</td>
                  <td className="px-4 py-2.5 text-slate-600">{p.riskRating || "—"}</td>
                  <td className="px-4 py-2.5"><StatusPill status={p.status} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination page={page} totalPages={totalPages} totalItems={total} onChange={setPage} />
      </div>
    </div>
  );
}
