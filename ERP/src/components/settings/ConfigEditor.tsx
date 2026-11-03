import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../../api";
import { useTenant } from "../../ConfigContext";
import { Money } from "../../../lib/money";
import { contrastRatio } from "../../../lib/config/contrast";
import { describeChanges, diffOverrides, mergeOverrides } from "../../configForm";
import type { ConfigDraft, ConfigSlices, RegionPackSummary, TaxRule } from "../../financeTypes";
import { DecimalInput, Dialog, ErrorNotice, Field, SuccessNotice, inputClass, primaryButton, secondaryButton } from "../ui";

const MODULES = [
  { id: "finance", label: "Finance (receipts, invoices, allocation)" }, { id: "claims", label: "Claims" }, { id: "portal", label: "Client portal" },
  { id: "analytics", label: "Analytics (KPIs)" }, { id: "commissions", label: "Commissions" }, { id: "strategy", label: "Strategy" },
];
const STRATEGIES = [
  { id: "fifo", label: "Oldest first (FIFO)" }, { id: "policy_priority", label: "Policy priority" },
  { id: "product_type_priority", label: "Product-type priority" }, { id: "pro_rata", label: "Pro-rata" },
];
const DATE_FORMATS = ["dd/MM/yyyy", "MM/dd/yyyy", "yyyy-MM-dd", "dd.MM.yyyy"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const clone = <T,>(v: T): T => structuredClone(v);
/** Just the six editable slices — never the server's bookkeeping (tenantId, versionId, hash, …). */
const sliceOf = (c: ConfigSlices): ConfigSlices => ({ regional: c.regional, tax: c.tax, localization: c.localization, brand: c.brand, entitlements: c.entitlements, finance: c.finance, security: c.security });
const moneyParse = (currency: string) => (text: string): number | null => { try { return Money.fromMajor(text.replace(/[,\s]/g, "") || "0", currency).minor; } catch { return null; } };
const moneyFormat = (currency: string) => (minor: number) => { try { return Money.of(minor, currency).toMajorString(); } catch { return String(minor); } };
const percentParse = (text: string): number | null => {
  if (!/^\d{0,3}(\.\d{0,2})?$/.test(text.trim()) || text.trim() === "" || text.trim() === ".") return null;
  const v = parseFloat(text);
  return v >= 0 && v <= 100 ? Math.round(v * 100) : null;
};
const percentFormat = (bps: number) => String(bps / 100);
const timeZones = (): string[] => { try { return (Intl as any).supportedValuesOf("timeZone"); } catch { return ["UTC", "Africa/Nairobi", "Europe/Berlin", "America/New_York"]; } };

function Contrast({ fg, bg, label }: { fg: string; bg: string; label: string }) {
  if (!/^#[0-9a-fA-F]{6}$/.test(fg) || !/^#[0-9a-fA-F]{6}$/.test(bg)) return null;
  const ratio = contrastRatio(fg, bg);
  const ok = ratio >= 4.5;
  return <span className={`text-xs ${ok ? "text-emerald-700" : "text-rose-700"}`}>{label}: {ratio.toFixed(1)}:1 {ok ? "passes WCAG AA" : "fails WCAG AA (needs 4.5:1)"}</span>;
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input type="color" aria-label={`${label} picker`} className="h-8 w-10 cursor-pointer rounded border border-slate-300" value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"} onChange={(e) => onChange(e.target.value)} />
        <input className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} />
      </div>
    </Field>
  );
}

export default function ConfigEditor() {
  const tenant = useTenant();
  const [current, setCurrent] = useState<(ConfigSlices & { version: number; regionPack: string }) | null>(null);
  const [packs, setPacks] = useState<RegionPackSummary[]>([]);
  const [draft, setDraft] = useState<ConfigDraft | null>(null);
  const [regionPack, setRegionPack] = useState("KE");
  const [packSlices, setPackSlices] = useState<ConfigSlices | null>(null);
  const [form, setForm] = useState<ConfigSlices | null>(null);
  const [saved, setSaved] = useState<ConfigSlices | null>(null);
  const [issues, setIssues] = useState<{ path: string; message: string }[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const zones = useMemo(timeZones, []);

  const load = useCallback(async () => {
    try {
      const [cur, list] = await Promise.all([api.tenantConfig.current(), api.tenantConfig.regionPacks()]);
      setCurrent(cur); setPacks(list);
      let d: ConfigDraft | null = null;
      try { d = await api.tenantConfig.draft(); } catch (e) { if (!(e instanceof ApiError && e.status === 404)) throw e; }
      setDraft(d);
      const code = d ? d.regionPack : cur.regionPack;
      const pack = await api.tenantConfig.regionPack(code);
      setRegionPack(code); setPackSlices(pack);
      const slices: ConfigSlices = d ? mergeOverrides(pack, d.overrides) : clone(sliceOf(cur));
      setForm(clone(slices)); setSaved(clone(slices)); setIssues(d && !d.validation.valid ? d.validation.issues : []);
      setNote(d?.note ?? "");
    } catch (err: any) { setError(err.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const change = (fn: (f: ConfigSlices) => void) => setForm((f) => { const n = clone(f!); fn(n); return n; });
  const dirty = form && saved && JSON.stringify(form) !== JSON.stringify(saved);
  const liveSlices = useMemo(() => (current ? sliceOf(current) : null), [current]);
  const changes = useMemo(() => (form && liveSlices ? describeChanges(liveSlices, form) : []), [form, liveSlices]);

  async function choosePack(code: string) {
    setBusy(true);
    try {
      const pack = await api.tenantConfig.regionPack(code);
      setRegionPack(code); setPackSlices(pack);
      // switching jurisdiction replaces the jurisdiction-driven slices; the tenant's own brand, plan and finance rules stay
      change((f) => { f.regional = pack.regional; f.tax = pack.tax; f.localization = pack.localization; });
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  }

  async function saveDraft() {
    if (!form || !packSlices) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const d = await api.tenantConfig.saveDraft({ regionPack, overrides: diffOverrides(packSlices, form), note: note || undefined });
      setDraft(d); setSaved(clone(form)); setIssues(d.validation.issues);
      setMessage(d.validation.valid ? "Draft saved and valid. Review the changes, then publish." : "Draft saved, but it cannot be published until the problems listed below are fixed.");
    } catch (err: any) {
      setError(err.message);
      if (err instanceof ApiError && err.fieldErrors) setIssues(err.fieldErrors.map((f) => ({ path: f.field, message: f.message })));
    } finally { setBusy(false); }
  }

  async function discard() {
    setBusy(true);
    try { await api.tenantConfig.discardDraft(); setMessage("Draft discarded."); await load(); } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  }

  async function publish() {
    setBusy(true); setError(null);
    try {
      const v = await api.tenantConfig.publish();
      setConfirmPublish(false);
      setMessage(`Version ${v.version} is now in force. Documents created from here on use it; earlier ones keep the version they were created under.`);
      tenant.reload();
      await load();
    } catch (err: any) {
      setConfirmPublish(false);
      setError(err.message);
      if (err instanceof ApiError && err.fieldErrors) setIssues(err.fieldErrors.map((f) => ({ path: f.field, message: f.message })));
    } finally { setBusy(false); }
  }

  if (!form || !current) return error ? <ErrorNotice message={error} /> : <p className="text-slate-400">Loading configuration…</p>;
  const currency = form.regional.currency;
  // amounts are stored as minor units; show them the way a person reads them
  const shown = (path: string, value: string) => (/Minor$/.test(path) && /^\d+$/.test(value) ? moneyFormat(currency)(Number(value)) + ` ${currency}` : value);
  const canPublish = draft && !dirty && draft.validation.valid && issues.length === 0;
  const issueFor = (prefix: string) => issues.filter((i) => i.path === prefix || i.path.startsWith(`${prefix}.`));

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <p><span className="font-medium text-slate-900">Version {current.version}</span> is in force ({packs.find((p) => p.code === current.regionPack)?.country ?? current.regionPack} region pack). Changes are saved as a draft, checked in full, and only take effect when you publish. Published versions are never edited: each receipt and invoice keeps the version it was created under.</p>
        {draft && <p className="mt-1 font-medium text-amber-700">You are editing draft version {draft.version}{dirty ? " — unsaved changes" : ""}.</p>}
      </div>

      <ErrorNotice message={error} onDismiss={() => setError(null)} />
      <SuccessNotice message={message} />
      {issues.length > 0 && (
        <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <p className="font-medium">These must be fixed before the draft can be published:</p>
          <ul className="mt-1 list-disc pl-5">{issues.map((i, n) => <li key={n}><code className="text-xs">{i.path}</code> — {i.message}</li>)}</ul>
        </div>
      )}

      <fieldset className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold text-slate-900">Region &amp; time</legend>
        <Field label="Region pack" hint="Statutory defaults for a jurisdiction. Changing it replaces region, tax and localization below.">
          <select className={inputClass} value={regionPack} disabled={busy} onChange={(e) => choosePack(e.target.value)}>
            {packs.map((p) => <option key={p.code} value={p.code}>{p.code} — {p.country}, {p.currency}, {p.timeZone}</option>)}
          </select>
        </Field>
        <Field label="Currency (ISO 4217)" hint="Cannot change once the tenant has receipts or invoices."><input className={inputClass} value={form.regional.currency} maxLength={3} onChange={(e) => change((f) => { f.regional.currency = e.target.value.toUpperCase(); })} /></Field>
        <Field label="Country (ISO 3166)"><input className={inputClass} value={form.regional.countryCode} maxLength={2} onChange={(e) => change((f) => { f.regional.countryCode = e.target.value.toUpperCase(); })} /></Field>
        <Field label="Time zone" hint="Business days, KPIs and statements follow this zone, not the server's.">
          <input list="zones" className={inputClass} value={form.regional.timeZone} onChange={(e) => change((f) => { f.regional.timeZone = e.target.value; })} />
          <datalist id="zones">{zones.map((z) => <option key={z} value={z} />)}</datalist>
        </Field>
        <Field label="Financial year starts"><select className={inputClass} value={form.regional.fiscalYearStartMonth} onChange={(e) => change((f) => { f.regional.fiscalYearStartMonth = Number(e.target.value); })}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></Field>
        <Field label="Week starts on"><select className={inputClass} value={form.regional.weekStartsOn} onChange={(e) => change((f) => { f.regional.weekStartsOn = Number(e.target.value) as 0 | 1 | 6; })}><option value={1}>Monday</option><option value={0}>Sunday</option><option value={6}>Saturday</option></select></Field>
        <Field label="Locale (BCP 47)" hint="Number and date formatting, e.g. en-KE, de-DE"><input className={inputClass} value={form.localization.locale} onChange={(e) => change((f) => { f.localization.locale = e.target.value; })} /></Field>
        <Field label="Date format"><select className={inputClass} value={form.localization.dateFormat} onChange={(e) => change((f) => { f.localization.dateFormat = e.target.value; })}>{DATE_FORMATS.map((d) => <option key={d}>{d}</option>)}</select></Field>
        {issueFor("regional").concat(issueFor("localization")).map((i, n) => <p key={n} className="text-xs text-rose-700 sm:col-span-2">{i.path}: {i.message}</p>)}
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <legend className="px-1 text-sm font-semibold text-slate-900">Tax &amp; levies</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Premium pricing" hint={form.tax.pricing === "exclusive" ? "Net premium is quoted; taxes are added on top." : "Gross price is quoted; taxes are carved out of it."}>
            <select className={inputClass} value={form.tax.pricing} onChange={(e) => change((f) => { f.tax.pricing = e.target.value as "exclusive" | "inclusive"; })}><option value="exclusive">Tax-exclusive</option><option value="inclusive">Tax-inclusive</option></select>
          </Field>
          <Field label="Rounding"><select className={inputClass} value={form.tax.rounding} onChange={(e) => change((f) => { f.tax.rounding = e.target.value as "half_up" | "half_even" | "down"; })}><option value="half_up">Half up</option><option value="half_even">Half to even (banker's)</option><option value="down">Round down</option></select></Field>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500"><th scope="col" className="py-1 font-medium">Code</th><th scope="col" className="py-1 font-medium">Name</th><th scope="col" className="py-1 font-medium">Kind</th><th scope="col" className="py-1 font-medium">Rate / amount</th><th scope="col" className="py-1"><span className="sr-only">Remove</span></th></tr></thead>
          <tbody>
            {form.tax.taxes.length === 0 && <tr><td colSpan={5} className="py-2 text-slate-400">No taxes are itemised.</td></tr>}
            {form.tax.taxes.map((t, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="py-1.5 pr-2"><input aria-label={`Tax ${i + 1} code`} className={inputClass} value={t.code} onChange={(e) => change((f) => { f.tax.taxes[i].code = e.target.value; })} /></td>
                <td className="py-1.5 pr-2"><input aria-label={`Tax ${i + 1} name`} className={inputClass} value={t.name} onChange={(e) => change((f) => { f.tax.taxes[i].name = e.target.value; })} /></td>
                <td className="py-1.5 pr-2"><select aria-label={`Tax ${i + 1} kind`} className={inputClass} value={t.kind} onChange={(e) => change((f) => { f.tax.taxes[i] = e.target.value === "percent" ? { code: t.code, name: t.name, kind: "percent", rateBps: 0 } : { code: t.code, name: t.name, kind: "flat", flatMinor: 0 }; })}><option value="percent">Percent</option><option value="flat">Flat amount</option></select></td>
                <td className="py-1.5 pr-2">
                  {t.kind === "percent"
                    ? <div className="flex items-center gap-1"><DecimalInput aria-label={`Tax ${i + 1} rate percent`} className={`${inputClass} max-w-24`} value={t.rateBps ?? 0} parse={percentParse} format={percentFormat} onValue={(bps) => change((f) => { f.tax.taxes[i].rateBps = bps; })} /><span>%</span></div>
                    : <DecimalInput aria-label={`Tax ${i + 1} amount`} className={`${inputClass} max-w-28`} value={t.flatMinor ?? 0} parse={moneyParse(currency)} format={moneyFormat(currency)} onValue={(minor) => change((f) => { f.tax.taxes[i].flatMinor = minor; })} />}
                </td>
                <td className="py-1.5 text-right"><button type="button" onClick={() => change((f) => { f.tax.taxes.splice(i, 1); })} className="text-xs font-medium text-rose-700 hover:underline">Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className={secondaryButton} onClick={() => change((f) => { f.tax.taxes.push({ code: `tax_${f.tax.taxes.length + 1}`, name: "New tax", kind: "percent", rateBps: 0 } as TaxRule); })}>Add a tax</button>
        {issueFor("tax").map((i, n) => <p key={n} className="text-xs text-rose-700">{i.path}: {i.message}</p>)}
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <legend className="px-1 text-sm font-semibold text-slate-900">Money rules</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Default allocation strategy" hint="Used when a cheque clears or money is received."><select className={inputClass} value={form.finance.allocationStrategy} onChange={(e) => change((f) => { f.finance.allocationStrategy = e.target.value; })}>{STRATEGIES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></Field>
          <Field label="Money beyond everything owed" hint={form.finance.overpaymentTreatment === "suspense" ? "Held in suspense until staff decide." : "Kept as client credit and applied to the next invoice automatically."}>
            <select className={inputClass} value={form.finance.overpaymentTreatment} onChange={(e) => change((f) => { f.finance.overpaymentTreatment = e.target.value as "suspense" | "client_credit"; })}><option value="suspense">Hold in suspense</option><option value="client_credit">Keep as client credit</option></select>
          </Field>
          <Field label={`Returned-cheque fee (${currency})`} hint="Invoiced to the client when a cheque bounces. 0 means no fee.">
            <DecimalInput className={inputClass} value={form.finance.returnedChequeFeeMinor} parse={moneyParse(currency)} format={moneyFormat(currency)} onValue={(minor) => change((f) => { f.finance.returnedChequeFeeMinor = minor; })} />
          </Field>
          <Field label="Receipt approval" hint={form.finance.receiptApproval === "required" ? "A receipt is not treated as money until a different person approves it." : "A receipt counts as soon as it is recorded."}>
            <select className={inputClass} value={form.finance.receiptApproval} onChange={(e) => change((f) => { f.finance.receiptApproval = e.target.value as "none" | "required"; })}><option value="none">Not required</option><option value="required">Required (maker-checker)</option></select>
          </Field>
          <label className="flex items-center gap-2 pt-5 text-sm"><input type="checkbox" checked={form.finance.feesFirst} onChange={(e) => change((f) => { f.finance.feesFirst = e.target.checked; })} /> Settle fees before premium</label>
          <Field label="Priority policies" hint="Policy numbers, comma-separated (policy-priority strategy)"><input className={inputClass} value={form.finance.policyPriority.join(", ")} onChange={(e) => change((f) => { f.finance.policyPriority = e.target.value.split(",").map((s) => s.trim()).filter(Boolean); })} /></Field>
          <Field label="Priority product types" hint="Comma-separated (product-type-priority strategy)"><input className={inputClass} value={form.finance.productTypePriority.join(", ")} onChange={(e) => change((f) => { f.finance.productTypePriority = e.target.value.split(",").map((s) => s.trim()).filter(Boolean); })} /></Field>
        </div>
        {issueFor("finance").map((i, n) => <p key={n} className="text-xs text-rose-700">{i.path}: {i.message}</p>)}
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <legend className="px-1 text-sm font-semibold text-slate-900">Brand</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Display name"><input className={inputClass} value={form.brand.displayName} onChange={(e) => change((f) => { f.brand.displayName = e.target.value; })} /></Field>
          <Field label="Font family"><input className={inputClass} value={form.brand.fontFamily} onChange={(e) => change((f) => { f.brand.fontFamily = e.target.value; })} /></Field>
          <ColorField label="Primary colour" value={form.brand.primaryColor} onChange={(v) => change((f) => { f.brand.primaryColor = v; })} />
          <ColorField label="Text on primary" value={form.brand.onPrimaryColor} onChange={(v) => change((f) => { f.brand.onPrimaryColor = v; })} />
          <ColorField label="Accent colour" value={form.brand.accentColor} onChange={(v) => change((f) => { f.brand.accentColor = v; })} />
          <ColorField label="Surface colour" value={form.brand.surfaceColor} onChange={(v) => change((f) => { f.brand.surfaceColor = v; })} />
          <ColorField label="Text colour" value={form.brand.textColor} onChange={(v) => change((f) => { f.brand.textColor = v; })} />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <Contrast fg={form.brand.onPrimaryColor} bg={form.brand.primaryColor} label="Text on primary" />
          <Contrast fg={form.brand.textColor} bg={form.brand.surfaceColor} label="Text on surface" />
          <Contrast fg={form.brand.primaryColor} bg={form.brand.surfaceColor} label="Primary on surface" />
        </div>
        <div className="rounded-md border border-slate-200 p-3" style={{ background: form.brand.surfaceColor, color: form.brand.textColor, fontFamily: form.brand.fontFamily }} aria-label="Brand preview">
          <p className="text-sm font-semibold">{form.brand.displayName}</p>
          <span className="mt-2 inline-block rounded px-3 py-1 text-sm" style={{ background: form.brand.primaryColor, color: form.brand.onPrimaryColor }}>Primary button</span>
          <span className="ml-3 text-sm font-medium" style={{ color: form.brand.accentColor }}>Accent link</span>
        </div>
        {issueFor("brand").map((i, n) => <p key={n} className="text-xs text-rose-700">{i.path}: {i.message}</p>)}
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <legend className="px-1 text-sm font-semibold text-slate-900">Plan</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {MODULES.map((m) => (
            <label key={m.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.entitlements.modules.includes(m.id)} onChange={(e) => change((f) => { f.entitlements.modules = e.target.checked ? [...new Set([...f.entitlements.modules, m.id])] : f.entitlements.modules.filter((x) => x !== m.id); })} /> {m.label}</label>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Staff seats"><input type="number" min={1} className={inputClass} value={form.entitlements.limits.staffSeats} onChange={(e) => change((f) => { f.entitlements.limits.staffSeats = Number(e.target.value); })} /></Field>
          <Field label="Client portal users"><input type="number" min={0} className={inputClass} value={form.entitlements.limits.portalUsers} onChange={(e) => change((f) => { f.entitlements.limits.portalUsers = Number(e.target.value); })} /></Field>
        </div>
        {issueFor("entitlements").map((i, n) => <p key={n} className="text-xs text-rose-700">{i.path}: {i.message}</p>)}
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <legend className="px-1 text-sm font-semibold text-slate-900">Security</legend>
        <Field label="Two-step verification" hint={form.security.mfa === "required" ? "Staff are asked to set it up the next time they sign in and cannot use the system until they have." : "Anyone can turn it on from their account; it is not forced."}>
          <select className={inputClass} value={form.security.mfa} onChange={(e) => change((f) => { f.security.mfa = e.target.value as "optional" | "required"; })}><option value="optional">Optional</option><option value="required">Required for all staff</option></select>
        </Field>
        {issueFor("security").map((i, n) => <p key={n} className="text-xs text-rose-700">{i.path}: {i.message}</p>)}
      </fieldset>

      <section aria-label="Changes from the version in force" className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">Changes from version {current.version}</h3>
        {changes.length === 0 ? <p className="mt-1 text-sm text-slate-400">No differences from what is in force.</p> : (
          <ul className="mt-2 space-y-1 text-sm">
            {changes.map((c) => <li key={c.path}><code className="text-xs text-slate-500">{c.path}</code> <span className="text-slate-400 line-through">{shown(c.path, c.before)}</span> → <span className="font-medium text-slate-900">{shown(c.path, c.after)}</span></li>)}
          </ul>
        )}
        <div className="mt-3"><Field label="Note for the history (optional)"><input className={inputClass} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="What changed and why" /></Field></div>
      </section>

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || (!dirty && !!draft)} onClick={saveDraft} className={secondaryButton}>{draft ? "Save draft" : "Save as draft"}</button>
        <button type="button" disabled={busy || !canPublish || changes.length === 0} onClick={() => setConfirmPublish(true)} className={primaryButton}>Publish…</button>
        {draft && <button type="button" disabled={busy} onClick={discard} className={secondaryButton}>Discard draft</button>}
        {!draft && <p className="self-center text-xs text-slate-400">Make a change and save it as a draft to publish it.</p>}
        {draft && dirty && <p className="self-center text-xs text-amber-700">Save the draft to check it before publishing.</p>}
      </div>

      {confirmPublish && (
        <Dialog title={`Publish version ${draft?.version}`} onClose={() => setConfirmPublish(false)} footer={<>
          <button type="button" className={secondaryButton} onClick={() => setConfirmPublish(false)}>Not yet</button>
          <button type="button" disabled={busy} className={primaryButton} onClick={publish}>{busy ? "Publishing…" : "Publish now"}</button>
        </>}>
          <p>This makes the draft the configuration for everyone in {current.regionPack === regionPack ? "this tenant" : "this tenant (and changes its region pack)"} from now on. It cannot be edited afterwards; to change anything you publish a new version.</p>
          <ul className="list-disc pl-5 text-slate-600">{changes.slice(0, 12).map((c) => <li key={c.path}><code className="text-xs">{c.path}</code>: {shown(c.path, c.before)} → {shown(c.path, c.after)}</li>)}{changes.length > 12 && <li>…and {changes.length - 12} more</li>}</ul>
        </Dialog>
      )}
    </div>
  );
}
