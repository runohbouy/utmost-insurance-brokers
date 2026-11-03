import { useEffect, useState } from "react";
import { api } from "../../api";
import { useTenant } from "../../ConfigContext";
import type { ConfigVersionSummary, TenantConfig } from "../../financeTypes";
import StatusPill from "../StatusPill";
import { Dialog, ErrorNotice, secondaryButton } from "../ui";

/** Every configuration version the tenant has ever had, newest first. Published versions are immutable evidence. */
export default function VersionsPanel() {
  const tenant = useTenant();
  const [versions, setVersions] = useState<ConfigVersionSummary[] | null>(null);
  const [viewing, setViewing] = useState<TenantConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { api.tenantConfig.versions().then(setVersions).catch((e) => setError(e.message)); }, []);

  async function view(v: ConfigVersionSummary) {
    try { setViewing(await api.tenantConfig.version(v.id)); } catch (err: any) { setError(err.message); }
  }

  return (
    <div className="space-y-3">
      <ErrorNotice message={error} onDismiss={() => setError(null)} />
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <th scope="col" className="px-4 py-2.5 font-medium">Version</th><th scope="col" className="px-4 py-2.5 font-medium">Status</th><th scope="col" className="px-4 py-2.5 font-medium">Region pack</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Published</th><th scope="col" className="px-4 py-2.5 font-medium">By</th><th scope="col" className="px-4 py-2.5 font-medium">Note</th><th scope="col" className="px-4 py-2.5 font-medium">Fingerprint</th>
          </tr></thead>
          <tbody>
            {!versions ? <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">Loading…</td></tr> : versions.map((v) => (
              <tr key={v.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2.5 font-medium">{v.status === "draft" ? <span>{v.version}</span> : <button type="button" onClick={() => view(v)} className="text-indigo-700 hover:underline">v{v.version}</button>}</td>
                <td className="px-4 py-2.5"><StatusPill status={v.status === "published" ? "In force" : v.status === "draft" ? "Draft" : "Superseded"} tone={v.status === "published" ? "good" : v.status === "draft" ? "warning" : "neutral"} /></td>
                <td className="px-4 py-2.5 text-slate-600">{v.regionPack}</td>
                <td className="px-4 py-2.5 text-slate-600">{v.publishedAt ? tenant.dateTime(v.publishedAt) : "—"}</td>
                <td className="px-4 py-2.5 text-slate-600">{v.publishedBy ?? "system"}</td>
                <td className="px-4 py-2.5 text-slate-600">{v.note ?? "—"}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{v.contentHash?.slice(0, 10) ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {viewing && (
        <Dialog title={`Configuration version ${viewing.version}`} onClose={() => setViewing(null)} footer={<button type="button" className={secondaryButton} onClick={() => setViewing(null)}>Close</button>}>
          <pre className="max-h-96 overflow-auto rounded-md bg-slate-50 p-3 text-xs">{JSON.stringify({ regional: viewing.regional, tax: viewing.tax, localization: viewing.localization, brand: viewing.brand, entitlements: viewing.entitlements, finance: viewing.finance }, null, 2)}</pre>
        </Dialog>
      )}
    </div>
  );
}
