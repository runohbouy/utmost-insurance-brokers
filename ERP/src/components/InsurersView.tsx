import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "../api";
import type { Insurer, InsurerRateVersion, StatutoryLevy, CommissionGuideEntry, InsurerAppetite, Product } from "../types";
import { APPETITE_LEVELS } from "../types";
import { GENERAL_CLASSES, LIFE_CLASSES, className } from "../data/insuranceClasses";
import StatusPill from "./StatusPill";
import SearchInput, { matchesQuery } from "./SearchInput";
import Pagination, { usePagedSlice } from "./Pagination";

const EMPTY_INSURER_FORM = { name: "", insurerType: "general", licenseNumber: "", licenseExpiryDate: "", aibkMember: false, contactEmail: "", contactPhone: "", authorizedClasses: [] as string[] };
const EMPTY_RATE_FORM = { insurerId: "", category: "", commissionRatePct: "" };
const EMPTY_LEVY_FORM = { levyType: "pcf", category: "", calculationMethod: "percentage", ratePct: "", flatAmountKes: "", source: "" };
const EMPTY_APPETITE_FORM = { insurerId: "", classCode: "", appetiteLevel: "accepted", maxCapacityKes: "", notes: "" };
const EMPTY_PRODUCT_FORM = { insurerId: "", category: "", name: "", description: "" };

const LEVY_LABEL: Record<string, string> = { pcf: "PCF", itl: "Insurance Training Levy", stamp_duty: "Stamp duty" };

const TABS = [
  { id: "insurers", label: "Insurers" },
  { id: "rates", label: "Commission rates" },
  { id: "levies", label: "Statutory levies" },
  { id: "appetite", label: "Insurer appetite" },
  { id: "products", label: "Product catalog" },
  { id: "guide", label: "Commission guide" },
] as const;

export default function InsurersView() {
  const [insurers, setInsurers] = useState<Insurer[]>([]);
  const [rates, setRates] = useState<InsurerRateVersion[]>([]);
  const [levies, setLevies] = useState<StatutoryLevy[]>([]);
  const [commissionGuide, setCommissionGuide] = useState<CommissionGuideEntry[]>([]);
  const [appetite, setAppetite] = useState<InsurerAppetite[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInsurerForm, setShowInsurerForm] = useState(false);
  const [showRateForm, setShowRateForm] = useState(false);
  const [showLevyForm, setShowLevyForm] = useState(false);
  const [showAppetiteForm, setShowAppetiteForm] = useState(false);
  const [insurerForm, setInsurerForm] = useState(EMPTY_INSURER_FORM);
  const [rateForm, setRateForm] = useState(EMPTY_RATE_FORM);
  const [levyForm, setLevyForm] = useState(EMPTY_LEVY_FORM);
  const [appetiteForm, setAppetiteForm] = useState(EMPTY_APPETITE_FORM);
  const [showProductForm, setShowProductForm] = useState(false);
  const [productForm, setProductForm] = useState(EMPTY_PRODUCT_FORM);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [tab, setTab] = useState<typeof TABS[number]["id"]>("insurers");
  const [rateQuery, setRateQuery] = useState("");
  const [levyQuery, setLevyQuery] = useState("");
  const [appetiteQuery, setAppetiteQuery] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [guideQuery, setGuideQuery] = useState("");
  const [ratePage, setRatePage] = useState(0);
  const [levyPage, setLevyPage] = useState(0);
  const [appetitePage, setAppetitePage] = useState(0);
  const [productPage, setProductPage] = useState(0);
  const [guidePage, setGuidePage] = useState(0);

  function load() {
    setLoading(true);
    Promise.all([api.insurers.list(), api.insurerRates.list(), api.statutoryLevies.list(), api.commissionGuide.list(), api.insurerAppetite.list(), api.products.list()])
      .then(([i, r, l, cg, a, p]) => { setInsurers(i); setRates(r); setLevies(l); setCommissionGuide(cg); setAppetite(a); setProducts(p); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleCreateInsurer(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.insurers.create({
        name: insurerForm.name,
        insurerType: insurerForm.insurerType,
        authorizedClasses: insurerForm.authorizedClasses,
        licenseNumber: insurerForm.licenseNumber || undefined,
        licenseExpiryDate: insurerForm.licenseExpiryDate || undefined,
        aibkMember: insurerForm.aibkMember,
        contactEmail: insurerForm.contactEmail || undefined,
        contactPhone: insurerForm.contactPhone || undefined,
      });
      setInsurerForm(EMPTY_INSURER_FORM);
      setShowInsurerForm(false);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleKycStatusChange(id: string, kycStatus: string) {
    setInsurers((prev) => prev.map((i) => (i.id === id ? { ...i, kycStatus } : i)));
    try {
      await api.insurers.update(id, { kycStatus });
    } catch (err: any) {
      setError(err.message);
      load();
    }
  }

  async function handleCreateRate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.insurerRates.create({
        insurerId: rateForm.insurerId,
        category: rateForm.category,
        commissionRatePct: rateForm.commissionRatePct ? Number(rateForm.commissionRatePct) : undefined,
      });
      setRateForm(EMPTY_RATE_FORM);
      setShowRateForm(false);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateLevy(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.statutoryLevies.create({
        levyType: levyForm.levyType as StatutoryLevy["levyType"],
        category: levyForm.category || null,
        calculationMethod: levyForm.calculationMethod as StatutoryLevy["calculationMethod"],
        ratePct: levyForm.calculationMethod === "percentage" && levyForm.ratePct ? Number(levyForm.ratePct) : null,
        flatAmountKes: levyForm.calculationMethod === "flat" && levyForm.flatAmountKes ? Number(levyForm.flatAmountKes) : null,
        source: levyForm.source || undefined,
      });
      setLevyForm(EMPTY_LEVY_FORM);
      setShowLevyForm(false);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateAppetite(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.insurerAppetite.create({
        insurerId: appetiteForm.insurerId,
        classCode: appetiteForm.classCode,
        appetiteLevel: appetiteForm.appetiteLevel as InsurerAppetite["appetiteLevel"],
        maxCapacityKes: appetiteForm.maxCapacityKes ? Number(appetiteForm.maxCapacityKes) : undefined,
        notes: appetiteForm.notes || undefined,
      });
      setAppetiteForm(EMPTY_APPETITE_FORM);
      setShowAppetiteForm(false);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateProduct(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.products.create({
        insurerId: productForm.insurerId,
        category: productForm.category,
        name: productForm.name,
        description: productForm.description || undefined,
      });
      setProductForm(EMPTY_PRODUCT_FORM);
      setShowProductForm(false);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleProductActive(id: string, active: boolean) {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, active } : p)));
    try {
      await api.products.update(id, { active });
    } catch (err: any) {
      setError(err.message);
      load();
    }
  }

  const insurerName = (id: string) => insurers.find((i) => i.id === id)?.name || id;
  const classOptionsForForm = insurerForm.insurerType === "life" ? LIFE_CLASSES : GENERAL_CLASSES;
  const rateFormInsurer = insurers.find((i) => i.id === rateForm.insurerId);
  const classOptionsForRate = rateFormInsurer?.authorizedClasses?.length
    ? [...GENERAL_CLASSES, ...LIFE_CLASSES].filter((c) => rateFormInsurer.authorizedClasses.includes(c.code))
    : [];
  const rateFormCap = rateForm.category
    ? commissionGuide.filter((cg) => cg.classCode === rateForm.category).reduce((max, cg) => Math.max(max, cg.maxPermittedCommissionPct), 0) || null
    : null;
  const productFormInsurer = insurers.find((i) => i.id === productForm.insurerId);
  const classOptionsForProduct = productFormInsurer?.authorizedClasses?.length
    ? [...GENERAL_CLASSES, ...LIFE_CLASSES].filter((c) => productFormInsurer.authorizedClasses.includes(c.code))
    : [];
  const capForClass = (code: string) =>
    commissionGuide.filter((cg) => cg.classCode === code).reduce((max, cg) => Math.max(max, cg.maxPermittedCommissionPct), 0) || null;

  const filteredInsurers = useMemo(() => {
    return insurers.filter((i) => {
      if (typeFilter !== "all" && i.insurerType !== typeFilter) return false;
      if (search && !i.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [insurers, search, typeFilter]);

  const ratesFiltered = rates.filter((r) => matchesQuery(rateQuery, insurerName(r.insurerId), className(r.category)));
  const leviesFiltered = levies.filter((l) => matchesQuery(levyQuery, LEVY_LABEL[l.levyType] || l.levyType, l.category ? className(l.category) : "all classes", l.source));
  const appetiteFiltered = appetite.filter((a) => matchesQuery(appetiteQuery, insurerName(a.insurerId), className(a.classCode), a.appetiteLevel, a.notes));
  const productsFiltered = products.filter((p) => matchesQuery(productQuery, p.name, insurerName(p.insurerId), className(p.category), p.description));
  const guideFiltered = commissionGuide.filter((cg) => matchesQuery(guideQuery, cg.category, cg.policyName, cg.classCode ? className(cg.classCode) : ""));

  const { pageItems: ratesPageItems, totalPages: ratesTotalPages, clampedPage: ratesClampedPage } = usePagedSlice(ratesFiltered, ratePage);
  const { pageItems: leviesPageItems, totalPages: leviesTotalPages, clampedPage: leviesClampedPage } = usePagedSlice(leviesFiltered, levyPage);
  const { pageItems: appetitePageItems, totalPages: appetiteTotalPages, clampedPage: appetiteClampedPage } = usePagedSlice(appetiteFiltered, appetitePage);
  const { pageItems: productsPageItems, totalPages: productsTotalPages, clampedPage: productsClampedPage } = usePagedSlice(productsFiltered, productPage);
  const { pageItems: guidePageItems, totalPages: guideTotalPages, clampedPage: guideClampedPage } = usePagedSlice(guideFiltered, guidePage);

  function toggleFormClass(code: string) {
    setInsurerForm((f) => ({
      ...f,
      authorizedClasses: f.authorizedClasses.includes(code) ? f.authorizedClasses.filter((c) => c !== code) : [...f.authorizedClasses, code],
    }));
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">Insurer panel</h2>

      {error && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.id ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "insurers" && (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">62 IRA-licensed insurers on the panel.</p>
          <button
            onClick={() => setShowInsurerForm((v) => !v)}
            className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <Plus size={15} /> Add insurer
          </button>
        </div>

        {showInsurerForm && (
          <form onSubmit={handleCreateInsurer} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <input required placeholder="Insurer name" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={insurerForm.name} onChange={(e) => setInsurerForm({ ...insurerForm, name: e.target.value })} />
              <select className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={insurerForm.insurerType} onChange={(e) => setInsurerForm({ ...insurerForm, insurerType: e.target.value, authorizedClasses: [] })}>
                <option value="general">General</option>
                <option value="life">Life</option>
                <option value="micro">Micro</option>
              </select>
              <input placeholder="IRA licence number" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={insurerForm.licenseNumber} onChange={(e) => setInsurerForm({ ...insurerForm, licenseNumber: e.target.value })} />
              <input type="date" placeholder="Licence expiry" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={insurerForm.licenseExpiryDate} onChange={(e) => setInsurerForm({ ...insurerForm, licenseExpiryDate: e.target.value })} />
              <input placeholder="Contact email" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={insurerForm.contactEmail} onChange={(e) => setInsurerForm({ ...insurerForm, contactEmail: e.target.value })} />
              <input placeholder="Contact phone" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={insurerForm.contactPhone} onChange={(e) => setInsurerForm({ ...insurerForm, contactPhone: e.target.value })} />
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">Authorized classes (IRA licence)</p>
              <div className="flex flex-wrap gap-1.5">
                {classOptionsForForm.map((c) => (
                  <label key={c.code} className="flex items-center gap-1.5 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700">
                    <input type="checkbox" checked={insurerForm.authorizedClasses.includes(c.code)} onChange={() => toggleFormClass(c.code)} />
                    {c.name}
                  </label>
                ))}
              </div>
            </div>
            <label className="flex w-fit items-center gap-2 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600">
              <input type="checkbox" checked={insurerForm.aibkMember} onChange={(e) => setInsurerForm({ ...insurerForm, aibkMember: e.target.checked })} />
              AIBK member
            </label>
            <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
              {saving ? "Saving…" : "Add insurer"}
            </button>
          </form>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={search} onChange={setSearch} placeholder="Search insurers…" />
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="all">All types</option>
            <option value="general">General</option>
            <option value="life">Life</option>
            <option value="micro">Micro</option>
          </select>
          <span className="self-center text-xs text-slate-400">{filteredInsurers.length} of {insurers.length} insurers</span>
        </div>

        <div className="max-h-[520px] overflow-y-auto overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="px-4 py-2.5 font-medium">Insurer</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Type</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Authorized classes</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Panel status</th>
                <th scope="col" className="px-4 py-2.5 font-medium">KYC status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Loading…</td></tr>
              ) : filteredInsurers.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">No insurers match.</td></tr>
              ) : (
                filteredInsurers.map((i) => (
                  <tr key={i.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-slate-900">
                      {i.name}
                      {i.licenseNumber && <div className="text-xs font-normal text-slate-400">{i.licenseNumber}{i.licenseExpiryDate ? ` · exp. ${i.licenseExpiryDate}` : ""}</div>}
                    </td>
                    <td className="px-4 py-2.5 capitalize text-slate-600">{i.insurerType}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-600">
                      <div className="flex max-w-xs flex-wrap gap-1">
                        {i.authorizedClasses.length === 0 ? "—" : i.authorizedClasses.map((code) => (
                          <span key={code} className="rounded bg-slate-100 px-1.5 py-0.5">{className(code)}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2.5"><StatusPill status={i.panelStatus} tone={i.panelStatus === "approved" ? "good" : i.panelStatus === "suspended" ? "critical" : "warning"} /></td>
                    <td className="px-4 py-2.5">
                      <select
                        value={i.kycStatus}
                        onChange={(e) => handleKycStatusChange(i.id, e.target.value)}
                        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                      >
                        <option value="pending">Pending</option>
                        <option value="verified">Verified</option>
                        <option value="expired">Expired</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {tab === "rates" && (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Commission rates</h2>
          <button
            onClick={() => setShowRateForm((v) => !v)}
            className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <Plus size={15} /> New rate
          </button>
        </div>
        <p className="text-xs text-slate-500">Negotiated with each insurer, per class — this is the only thing that varies by insurer. Statutory taxes and levies are set once, market-wide, below.</p>

        {showRateForm && (
          <form onSubmit={handleCreateRate} className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3">
            <select required className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={rateForm.insurerId} onChange={(e) => setRateForm({ ...rateForm, insurerId: e.target.value, category: "" })}>
              <option value="">-- Insurer --</option>
              {insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
            <select required disabled={!rateFormInsurer} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-50" value={rateForm.category} onChange={(e) => setRateForm({ ...rateForm, category: e.target.value })}>
              <option value="">{rateFormInsurer ? "-- Class --" : "Pick an insurer first"}</option>
              {classOptionsForRate.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
            <input placeholder="Commission rate %" type="number" step="0.01" max={rateFormCap ?? undefined} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={rateForm.commissionRatePct} onChange={(e) => setRateForm({ ...rateForm, commissionRatePct: e.target.value })} />
            <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
              {saving ? "Saving…" : "Save rate"}
            </button>
            {rateFormInsurer && classOptionsForRate.length === 0 && (
              <p className="col-span-2 text-xs text-amber-600 sm:col-span-3">This insurer has no authorized classes recorded yet — add them under Insurer panel above first.</p>
            )}
            {rateFormCap != null && (
              <p className="col-span-2 text-xs text-slate-500 sm:col-span-3">Commission Guide caps this class at {rateFormCap}%.</p>
            )}
          </form>
        )}

        <SearchInput value={rateQuery} onChange={setRateQuery} placeholder="Search by insurer, class…" />

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="px-4 py-2.5 font-medium">Insurer</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Class</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Commission</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Guide max</th>
              </tr>
            </thead>
            <tbody>
              {ratesFiltered.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">{rates.length === 0 ? "No commission rates configured yet." : `No rates match "${rateQuery}".`}</td></tr>
              ) : (
                ratesPageItems.map((r) => {
                  const cap = capForClass(r.category);
                  const overCap = cap != null && r.commissionRatePct != null && r.commissionRatePct > cap;
                  return (
                    <tr key={r.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-2.5 font-medium text-slate-900">{insurerName(r.insurerId)}</td>
                      <td className="px-4 py-2.5 text-slate-600">{className(r.category)}</td>
                      <td className={`px-4 py-2.5 tabular-nums ${overCap ? "font-medium text-rose-600" : "text-slate-600"}`}>{r.commissionRatePct != null ? `${r.commissionRatePct}%` : "—"}</td>
                      <td className="px-4 py-2.5 tabular-nums text-slate-400">{cap != null ? `${cap}%` : "—"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          <Pagination page={ratesClampedPage} totalPages={ratesTotalPages} totalItems={ratesFiltered.length} onChange={setRatePage} />
        </div>
      </div>
      )}

      {tab === "levies" && (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Statutory levies &amp; taxes</h2>
          <button
            onClick={() => setShowLevyForm((v) => !v)}
            className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <Plus size={15} /> New levy
          </button>
        </div>
        <p className="text-xs text-slate-500">Government-mandated charges (PCF, Insurance Training Levy, stamp duty) — set once for the whole market, not per insurer. Leave class blank to apply to every class.</p>

        {showLevyForm && (
          <form onSubmit={handleCreateLevy} className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3">
            <select required className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={levyForm.levyType} onChange={(e) => setLevyForm({ ...levyForm, levyType: e.target.value })}>
              <option value="pcf">PCF</option>
              <option value="itl">Insurance Training Levy</option>
              <option value="stamp_duty">Stamp duty</option>
            </select>
            <select className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={levyForm.category} onChange={(e) => setLevyForm({ ...levyForm, category: e.target.value })}>
              <option value="">All classes</option>
              {[...GENERAL_CLASSES, ...LIFE_CLASSES].map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
            <select className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={levyForm.calculationMethod} onChange={(e) => setLevyForm({ ...levyForm, calculationMethod: e.target.value })}>
              <option value="percentage">Percentage of premium</option>
              <option value="flat">Flat amount</option>
            </select>
            {levyForm.calculationMethod === "percentage" ? (
              <input placeholder="Rate %" type="number" step="0.0001" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={levyForm.ratePct} onChange={(e) => setLevyForm({ ...levyForm, ratePct: e.target.value })} />
            ) : (
              <input placeholder="Flat amount (KES)" type="number" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={levyForm.flatAmountKes} onChange={(e) => setLevyForm({ ...levyForm, flatAmountKes: e.target.value })} />
            )}
            <input placeholder="Source (e.g. IRA Circular, Insurance Act Cap 487)" className="col-span-2 rounded-md border border-slate-300 px-3 py-1.5 text-sm sm:col-span-2" value={levyForm.source} onChange={(e) => setLevyForm({ ...levyForm, source: e.target.value })} />
            <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
              {saving ? "Saving…" : "Save levy"}
            </button>
          </form>
        )}

        <SearchInput value={levyQuery} onChange={setLevyQuery} placeholder="Search by levy, class, source…" />

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="px-4 py-2.5 font-medium">Levy</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Class</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Value</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Effective from</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {leviesFiltered.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">{levies.length === 0 ? "No statutory levies configured yet." : `No levies match "${levyQuery}".`}</td></tr>
              ) : (
                leviesPageItems.map((l) => (
                  <tr key={l.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-slate-900">{LEVY_LABEL[l.levyType] || l.levyType}</td>
                    <td className="px-4 py-2.5 text-slate-600">{l.category ? className(l.category) : "All classes"}</td>
                    <td className="px-4 py-2.5 tabular-nums text-slate-600">{l.calculationMethod === "flat" ? `KES ${Number(l.flatAmountKes).toLocaleString()}` : `${l.ratePct}%`}</td>
                    <td className="px-4 py-2.5 text-slate-600">{l.effectiveFrom}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">{l.source || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <Pagination page={leviesClampedPage} totalPages={leviesTotalPages} totalItems={leviesFiltered.length} onChange={setLevyPage} />
        </div>
      </div>
      )}

      {tab === "appetite" && (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Insurer appetite</h2>
          <button
            onClick={() => setShowAppetiteForm((v) => !v)}
            className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <Plus size={15} /> New appetite setting
          </button>
        </div>
        <p className="text-xs text-slate-500">Business risk appetite per insurer+class (SOP-07) — separate from IRA licensing. An insurer can be licensed for a class and still be off-panel for it: "excluded" blocks it from the placement flow's market picker entirely; "restricted" allows it with a warning.</p>

        {showAppetiteForm && (
          <form onSubmit={handleCreateAppetite} className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-4">
            <select required className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={appetiteForm.insurerId} onChange={(e) => setAppetiteForm({ ...appetiteForm, insurerId: e.target.value })}>
              <option value="">-- Insurer --</option>
              {insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
            <select required className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={appetiteForm.classCode} onChange={(e) => setAppetiteForm({ ...appetiteForm, classCode: e.target.value })}>
              <option value="">-- Class --</option>
              {[...GENERAL_CLASSES, ...LIFE_CLASSES].map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
            <select className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={appetiteForm.appetiteLevel} onChange={(e) => setAppetiteForm({ ...appetiteForm, appetiteLevel: e.target.value })}>
              {APPETITE_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <input placeholder="Max capacity (KES)" type="number" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={appetiteForm.maxCapacityKes} onChange={(e) => setAppetiteForm({ ...appetiteForm, maxCapacityKes: e.target.value })} />
            <input placeholder="Notes" className="col-span-2 rounded-md border border-slate-300 px-3 py-1.5 text-sm sm:col-span-3" value={appetiteForm.notes} onChange={(e) => setAppetiteForm({ ...appetiteForm, notes: e.target.value })} />
            <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
              {saving ? "Saving…" : "Save setting"}
            </button>
          </form>
        )}

        <SearchInput value={appetiteQuery} onChange={setAppetiteQuery} placeholder="Search by insurer, class, appetite…" />

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="px-4 py-2.5 font-medium">Insurer</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Class</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Appetite</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Max capacity</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {appetiteFiltered.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">{appetite.length === 0 ? "No appetite settings configured yet — every licensed insurer is treated as \"accepted\" by default." : `No appetite settings match "${appetiteQuery}".`}</td></tr>
              ) : (
                appetitePageItems.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-slate-900">{insurerName(a.insurerId)}</td>
                    <td className="px-4 py-2.5 text-slate-600">{className(a.classCode)}</td>
                    <td className="px-4 py-2.5"><StatusPill status={a.appetiteLevel} tone={a.appetiteLevel === "preferred" ? "good" : a.appetiteLevel === "excluded" ? "critical" : a.appetiteLevel === "restricted" ? "warning" : "neutral"} /></td>
                    <td className="px-4 py-2.5 tabular-nums text-slate-600">{a.maxCapacityKes != null ? `KES ${Number(a.maxCapacityKes).toLocaleString()}` : "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">{a.notes || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <Pagination page={appetiteClampedPage} totalPages={appetiteTotalPages} totalItems={appetiteFiltered.length} onChange={setAppetitePage} />
        </div>
      </div>
      )}

      {tab === "products" && (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Product catalog</h2>
          <button
            onClick={() => setShowProductForm((v) => !v)}
            className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <Plus size={15} /> New product
          </button>
        </div>
        <p className="text-xs text-slate-500">Named products an insurer actually sells (e.g. "AAR Motor Comprehensive Plus"), separate from the raw class used for pricing — publish or retire one without a code change.</p>

        {showProductForm && (
          <form onSubmit={handleCreateProduct} className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3">
            <select required className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={productForm.insurerId} onChange={(e) => setProductForm({ ...productForm, insurerId: e.target.value, category: "" })}>
              <option value="">-- Insurer --</option>
              {insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
            <select required disabled={!productFormInsurer} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-50" value={productForm.category} onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}>
              <option value="">{productFormInsurer ? "-- Class --" : "Pick an insurer first"}</option>
              {classOptionsForProduct.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
            <input required placeholder="Product name" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} />
            <input placeholder="Description (optional)" className="col-span-2 rounded-md border border-slate-300 px-3 py-1.5 text-sm sm:col-span-3" value={productForm.description} onChange={(e) => setProductForm({ ...productForm, description: e.target.value })} />
            <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
              {saving ? "Saving…" : "Add product"}
            </button>
            {productFormInsurer && classOptionsForProduct.length === 0 && (
              <p className="col-span-2 text-xs text-amber-600 sm:col-span-3">This insurer has no authorized classes recorded yet — add them under Insurer panel above first.</p>
            )}
          </form>
        )}

        <SearchInput value={productQuery} onChange={setProductQuery} placeholder="Search by product, insurer, class…" />

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="px-4 py-2.5 font-medium">Product</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Insurer</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Class</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Active</th>
              </tr>
            </thead>
            <tbody>
              {productsFiltered.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">{products.length === 0 ? "No products in the catalog yet." : `No products match "${productQuery}".`}</td></tr>
              ) : (
                productsPageItems.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-slate-900">
                      {p.name}
                      {p.description && <div className="text-xs font-normal text-slate-400">{p.description}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{insurerName(p.insurerId)}</td>
                    <td className="px-4 py-2.5 text-slate-600">{className(p.category)}</td>
                    <td className="px-4 py-2.5">
                      <label className="flex w-fit items-center gap-1.5 text-xs text-slate-600">
                        <input type="checkbox" checked={p.active} onChange={(e) => handleToggleProductActive(p.id, e.target.checked)} />
                        {p.active ? "Active" : "Inactive"}
                      </label>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <Pagination page={productsClampedPage} totalPages={productsTotalPages} totalItems={productsFiltered.length} onChange={setProductPage} />
        </div>
      </div>
      )}

      {tab === "guide" && (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Commission guide</h2>
        <p className="text-xs text-slate-500">Maximum permitted commission rate per line of business — the ceiling commission rates above are checked against, not a broker-editable setting.</p>
        <SearchInput value={guideQuery} onChange={setGuideQuery} placeholder="Search by category, policy line, class…" />
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="px-4 py-2.5 font-medium">Category</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Policy line</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Class</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Max commission</th>
              </tr>
            </thead>
            <tbody>
              {guideFiltered.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">{commissionGuide.length === 0 ? "Commission guide not loaded." : `No guide entries match "${guideQuery}".`}</td></tr>
              ) : (
                guidePageItems.map((cg) => (
                  <tr key={cg.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2.5 text-xs uppercase tracking-wide text-slate-400">{cg.category}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-900">{cg.policyName}</td>
                    <td className="px-4 py-2.5 text-slate-600">{cg.classCode ? className(cg.classCode) : "—"}</td>
                    <td className="px-4 py-2.5 tabular-nums text-slate-600">{cg.maxPermittedCommissionPct}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <Pagination page={guideClampedPage} totalPages={guideTotalPages} totalItems={guideFiltered.length} onChange={setGuidePage} />
        </div>
      </div>
      )}
    </div>
  );
}
