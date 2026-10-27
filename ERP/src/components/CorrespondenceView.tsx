import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "../api";
import type { CorrespondenceTemplate, Notification, Party } from "../types";
import { COMMS_CHANNELS } from "../types";
import StatusPill from "./StatusPill";
import SearchInput, { matchesQuery } from "./SearchInput";
import Pagination, { usePagedSlice } from "./Pagination";

const EMPTY_TEMPLATE_FORM = { code: "", area: "", channel: "email", subject: "", bodyTemplate: "" };

export default function CorrespondenceView() {
  const [templates, setTemplates] = useState<CorrespondenceTemplate[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [templateForm, setTemplateForm] = useState(EMPTY_TEMPLATE_FORM);
  const [templateQuery, setTemplateQuery] = useState("");
  const [notificationQuery, setNotificationQuery] = useState("");
  const [templatePage, setTemplatePage] = useState(0);
  const [notificationPage, setNotificationPage] = useState(0);

  function load() {
    setLoading(true);
    Promise.all([api.correspondenceTemplates.list(), api.notifications.list(), api.parties.list()])
      .then(([t, n, p]) => { setTemplates(t); setNotifications(n); setParties(p); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleCreateTemplate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.correspondenceTemplates.create({
        code: templateForm.code,
        area: templateForm.area || undefined,
        channel: templateForm.channel,
        subject: templateForm.subject || undefined,
        bodyTemplate: templateForm.bodyTemplate,
      });
      setTemplateForm(EMPTY_TEMPLATE_FORM);
      setShowTemplateForm(false);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(t: CorrespondenceTemplate) {
    try {
      await api.correspondenceTemplates.update(t.id, { active: !t.active });
      setTemplates((prev) => prev.map((x) => (x.id === t.id ? { ...x, active: !x.active } : x)));
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleMarkSent(notificationId: string) {
    setSaving(true);
    try {
      await api.notifications.update(notificationId, { status: "sent" });
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const partyName = (id: string | null) => (id ? parties.find((p) => p.id === id)?.fullName || id : "—");

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;

  const templatesFiltered = templates.filter((t) => matchesQuery(templateQuery, t.code, t.area, t.channel));
  const notificationsFiltered = notifications.filter((n) => matchesQuery(notificationQuery, partyName(n.partyId), n.channel, n.templateCode, n.status));
  const { pageItems: templatesPageItems, totalPages: templatesTotalPages, clampedPage: templatesClampedPage } = usePagedSlice(templatesFiltered, templatePage);
  const { pageItems: notificationsPageItems, totalPages: notificationsTotalPages, clampedPage: notificationsClampedPage } = usePagedSlice(notificationsFiltered, notificationPage);

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Correspondence templates</h2>
            <p className="mt-0.5 text-sm text-slate-500">The wording behind a system notification. Editing the body bumps the version — a past notification stays traceable to what it was actually sent with.</p>
          </div>
          <button onClick={() => setShowTemplateForm((v) => !v)} className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
            <Plus size={15} /> New template
          </button>
        </div>

        {error && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

        <SearchInput value={templateQuery} onChange={setTemplateQuery} placeholder="Search by code, area, channel…" />

        {showTemplateForm && (
          <form onSubmit={handleCreateTemplate} className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-4">
            <input required placeholder="Code (e.g. renewal_reminder_30d)" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={templateForm.code} onChange={(e) => setTemplateForm({ ...templateForm, code: e.target.value })} />
            <input placeholder="Area (e.g. placement, claims)" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={templateForm.area} onChange={(e) => setTemplateForm({ ...templateForm, area: e.target.value })} />
            <select className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={templateForm.channel} onChange={(e) => setTemplateForm({ ...templateForm, channel: e.target.value })}>
              {COMMS_CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input placeholder="Subject (email only)" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={templateForm.subject} onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })} />
            <textarea required placeholder="Body" className="col-span-2 rounded-md border border-slate-300 px-3 py-1.5 text-sm sm:col-span-4" value={templateForm.bodyTemplate} onChange={(e) => setTemplateForm({ ...templateForm, bodyTemplate: e.target.value })} />
            <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
              {saving ? "Saving…" : "Save template"}
            </button>
          </form>
        )}

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="px-4 py-2.5 font-medium">Code</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Area</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Channel</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Version</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Active</th>
              </tr>
            </thead>
            <tbody>
              {templatesFiltered.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">{templates.length === 0 ? "No correspondence templates yet." : `No templates match "${templateQuery}".`}</td></tr>
              ) : (
                templatesPageItems.map((t) => (
                  <tr key={t.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-900">{t.code}</td>
                    <td className="px-4 py-2.5 text-slate-600">{t.area || "—"}</td>
                    <td className="px-4 py-2.5 capitalize text-slate-600">{t.channel}</td>
                    <td className="px-4 py-2.5 tabular-nums text-slate-600">v{t.version}</td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => handleToggleActive(t)}>
                        <StatusPill status={t.active ? "active" : "inactive"} tone={t.active ? "good" : "neutral"} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <Pagination page={templatesClampedPage} totalPages={templatesTotalPages} totalItems={templatesFiltered.length} onChange={setTemplatePage} />
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Notifications sent</h2>
          <p className="mt-0.5 text-sm text-slate-500">No real email/SMS/WhatsApp gateway is wired up in this dev build — "sent" means a staff member marked it dispatched, not that a provider delivered it.</p>
        </div>
        <SearchInput value={notificationQuery} onChange={setNotificationQuery} placeholder="Search by client, channel, template, status…" />
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="px-4 py-2.5 font-medium">Client</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Channel</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Template</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Date</th>
                <th scope="col" className="px-4 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {notificationsFiltered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">{notifications.length === 0 ? "No notifications queued yet." : `No notifications match "${notificationQuery}".`}</td></tr>
              ) : (
                notificationsPageItems.map((n) => (
                  <tr key={n.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2.5 text-slate-900">{partyName(n.partyId)}</td>
                    <td className="px-4 py-2.5 capitalize text-slate-600">{n.channel}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{n.templateCode || "—"}</td>
                    <td className="px-4 py-2.5"><StatusPill status={n.status} tone={n.status === "sent" || n.status === "delivered" ? "good" : n.status === "failed" ? "critical" : "neutral"} /></td>
                    <td className="px-4 py-2.5 tabular-nums text-slate-600">{new Date(n.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-2.5 text-right">
                      {n.status === "queued" && (
                        <button onClick={() => handleMarkSent(n.id)} disabled={saving} className="text-xs font-medium text-indigo-600 hover:underline disabled:opacity-50">Mark as sent</button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <Pagination page={notificationsClampedPage} totalPages={notificationsTotalPages} totalItems={notificationsFiltered.length} onChange={setNotificationPage} />
        </div>
      </div>
    </div>
  );
}
