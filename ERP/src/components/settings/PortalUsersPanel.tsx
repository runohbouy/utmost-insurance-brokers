import { useState } from "react";
import { Plus } from "lucide-react";
import { api } from "../../api";
import { useTenant } from "../../ConfigContext";
import type { PortalUser } from "../../financeTypes";
import { usePagedList } from "../../usePagedList";
import { ClientPicker, type PickedClient } from "../Picker";
import Pagination from "../Pagination";
import SearchInput from "../SearchInput";
import StatusPill from "../StatusPill";
import { Dialog, ErrorNotice, Field, SuccessNotice, inputClass, primaryButton, secondaryButton } from "../ui";

/** Client self-service accounts. Staff create them and hand over a one-time password that must be changed at first sign-in. */
export default function PortalUsersPanel() {
  const tenant = useTenant();
  const list = usePagedList<PortalUser>((request) => api.portalUsers.page(request));
  const [showForm, setShowForm] = useState(false);
  const [client, setClient] = useState<PickedClient | null>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [secret, setSecret] = useState<{ email: string; password: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!client) return setError("Choose the client this login is for.");
    setBusy(true); setError(null);
    try {
      const u = await api.portalUsers.create({ partyId: client.id, email });
      setSecret({ email: u.email, password: u.temporaryPassword! });
      setShowForm(false); setClient(null); setEmail("");
      list.reload();
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  }

  async function toggle(u: PortalUser) {
    try { await api.portalUsers.setActive(u.id, !u.active); setNotice(`${u.email} ${u.active ? "disabled" : "enabled"}.`); list.reload(); } catch (err: any) { setError(err.message); }
  }
  async function reset(u: PortalUser) {
    try { const r = await api.portalUsers.resetPassword(u.id); setSecret({ email: r.email, password: r.temporaryPassword! }); list.reload(); } catch (err: any) { setError(err.message); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput value={list.query} onChange={list.setQuery} placeholder="Search by email or client…" />
        <button onClick={() => setShowForm((v) => !v)} className={`${primaryButton} flex items-center gap-1.5`}><Plus size={15} /> New portal login</button>
      </div>
      <ErrorNotice message={error ?? list.error} onDismiss={() => { setError(null); list.setError(null); }} />
      <SuccessNotice message={notice} />

      {showForm && (
        <form onSubmit={create} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2" aria-label="Create a portal login">
          <ClientPicker value={client} onChange={setClient} required />
          <Field label="Email (their sign-in)"><input required type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <p className="text-xs text-slate-500 sm:col-span-2">A one-time password is shown once. The client must change it the first time they sign in, and sees only their own policies, invoices and payments.</p>
          <div className="flex gap-2 sm:col-span-2"><button type="submit" disabled={busy} className={primaryButton}>{busy ? "Creating…" : "Create login"}</button><button type="button" onClick={() => setShowForm(false)} className={secondaryButton}>Cancel</button></div>
        </form>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <th scope="col" className="px-4 py-2.5 font-medium">Client</th><th scope="col" className="px-4 py-2.5 font-medium">Email</th><th scope="col" className="px-4 py-2.5 font-medium">Status</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Last sign-in</th><th scope="col" className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
          </tr></thead>
          <tbody>
            {list.loading ? <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Loading…</td></tr>
              : list.rows.length === 0 ? <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">{list.debouncedQuery ? "No logins match." : "No client has a portal login yet."}</td></tr>
              : list.rows.map((u) => (
                <tr key={u.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{u.partyName ?? u.partyId}</td>
                  <td className="px-4 py-2.5 text-slate-600">{u.email}</td>
                  <td className="px-4 py-2.5"><StatusPill status={!u.active ? "Disabled" : u.mustChangePassword ? "Awaiting first sign-in" : "Active"} tone={!u.active ? "critical" : u.mustChangePassword ? "warning" : "good"} /></td>
                  <td className="px-4 py-2.5 text-slate-600">{u.lastLoginAt ? tenant.dateTime(u.lastLoginAt) : "Never"}</td>
                  <td className="space-x-3 px-4 py-2.5 text-right">
                    <button type="button" onClick={() => reset(u)} className="text-xs font-medium text-indigo-700 hover:underline">Reset password</button>
                    <button type="button" onClick={() => toggle(u)} className="text-xs font-medium text-rose-700 hover:underline">{u.active ? "Disable" : "Enable"}</button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        <Pagination page={list.page} totalPages={list.totalPages} totalItems={list.total} onChange={list.setPage} />
      </div>

      {secret && (
        <Dialog title="One-time password" onClose={() => setSecret(null)} footer={<>
          <button type="button" className={secondaryButton} onClick={() => navigator.clipboard?.writeText(secret.password)}>Copy</button>
          <button type="button" className={primaryButton} onClick={() => setSecret(null)}>Done</button>
        </>}>
          <p>Give this to <span className="font-medium">{secret.email}</span> through a channel you trust. It is shown only once and must be changed at first sign-in.</p>
          <p className="rounded-md bg-slate-50 p-3 text-center font-mono text-base tracking-wider text-slate-900" aria-label="Temporary password">{secret.password}</p>
        </Dialog>
      )}
    </div>
  );
}
