import { useEffect, useState } from "react";
import { ArrowLeft, FileEdit, RefreshCw, Ban, ClipboardCheck } from "lucide-react";
import { api } from "../api";
import type { Policy, Party, Insurer, Quotation, Endorsement, Renewal, PremiumConfirmation, FinancialTransaction, DocumentMeta, PolicyCheck, Discrepancy } from "../types";
import { ENDORSEMENT_STAGES } from "../types";
import { className } from "../data/insuranceClasses";
import { ENDORSEMENT_CATEGORIES, ENDORSEMENT_TYPES_BY_CATEGORY, ENDORSEMENT_TYPE_LABEL, ENDORSEMENT_TYPE_EFFECT, ENDORSEMENT_TYPE_FIELDS } from "../data/endorsementFields";
import StatusPill from "./StatusPill";

type Tab = "summary" | "cover" | "endorsements" | "issuance" | "documents" | "transactions" | "history";

const TABS: { id: Tab; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "cover", label: "Cover Details" },
  { id: "endorsements", label: "Endorsements" },
  { id: "issuance", label: "Issuance Check" },
  { id: "documents", label: "Documents" },
  { id: "transactions", label: "Transactions" },
  { id: "history", label: "History" },
];

const EMPTY_ENDORSEMENT_FORM = { endorsementCategory: "financial_valuation", endorsementType: "adjust_sum_insured", description: "", premiumAdjustmentKes: "", effectiveDate: "" };

export default function PolicyDetailView({ policyId, onBack, backLabel = "Back to Policies" }: { policyId: string; onBack: () => void; backLabel?: string }) {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [parties, setParties] = useState<Party[]>([]);
  const [insurers, setInsurers] = useState<Insurer[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [endorsements, setEndorsements] = useState<Endorsement[]>([]);
  const [renewals, setRenewals] = useState<Renewal[]>([]);
  const [premiumConfirmations, setPremiumConfirmations] = useState<PremiumConfirmation[]>([]);
  const [financialTransactions, setFinancialTransactions] = useState<FinancialTransaction[]>([]);
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [policyChecks, setPolicyChecks] = useState<PolicyCheck[]>([]);
  const [discrepancies, setDiscrepancies] = useState<Discrepancy[]>([]);
  const [tab, setTab] = useState<Tab>("summary");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showEndorseForm, setShowEndorseForm] = useState(false);
  const [showRenewForm, setShowRenewForm] = useState(false);
  const [endorseForm, setEndorseForm] = useState(EMPTY_ENDORSEMENT_FORM);
  const [endorseFields, setEndorseFields] = useState<Record<string, string>>({});
  const [renewDueDate, setRenewDueDate] = useState("");
  const [showDiscrepancyForm, setShowDiscrepancyForm] = useState(false);
  const [discrepancyDescription, setDiscrepancyDescription] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState("email");

  function load() {
    setLoading(true);
    Promise.all([
      api.policies.list(),
      api.parties.list(),
      api.insurers.list(),
      api.quotations.list(),
      api.endorsements.list(policyId),
      api.renewals.list(policyId),
      api.premiumConfirmations.list(policyId),
      api.financialTransactions.list(),
      api.documents.list("policy", policyId),
      api.policyChecks.list(policyId),
      api.discrepancies.list(policyId),
    ])
      .then(([pols, parties, ins, quotes, ends, rens, pcs, fts, docs, checks, discs]) => {
        const p = pols.find((x) => x.id === policyId) || null;
        setPolicy(p);
        setParties(parties);
        setInsurers(ins);
        setQuotations(quotes);
        setEndorsements(ends);
        setRenewals(rens);
        setPremiumConfirmations(pcs);
        setFinancialTransactions(fts.filter((f) => f.policyId === policyId));
        setDocuments(docs);
        setPolicyChecks(checks);
        setDiscrepancies(discs);
        setRenewDueDate(p?.endDate || "");
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [policyId]);

  async function handleEndorse(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const fieldSpecs = ENDORSEMENT_TYPE_FIELDS[endorseForm.endorsementType] || [];
      const afterValue: Record<string, unknown> = {};
      for (const f of fieldSpecs) {
        const raw = endorseFields[f.key];
        if (raw === "" || raw === undefined) continue;
        afterValue[f.key] = f.type === "number" ? Number(raw) : raw;
      }
      await api.endorsements.create({
        policyId,
        endorsementCategory: endorseForm.endorsementCategory,
        endorsementType: endorseForm.endorsementType,
        description: endorseForm.description || undefined,
        afterValue: Object.keys(afterValue).length > 0 ? afterValue : undefined,
        premiumAdjustmentKes: endorseForm.premiumAdjustmentKes ? Number(endorseForm.premiumAdjustmentKes) : 0,
        effectiveDate: endorseForm.effectiveDate || undefined,
      });
      setEndorseForm(EMPTY_ENDORSEMENT_FORM);
      setEndorseFields({});
      setShowEndorseForm(false);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleEndorsementStatus(endorsementId: string, status: string) {
    setSaving(true);
    setError(null);
    try {
      await api.endorsements.update(endorsementId, { status });
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRenew(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.renewals.create({ policyId, dueDate: renewDueDate });
      setShowRenewForm(false);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    if (!confirm("Cancel this policy? This cannot be undone from here.")) return;
    setSaving(true);
    setError(null);
    try {
      await api.policies.update(policyId, { status: "Cancelled" });
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Reinstatement goes through a real, audited endorsement (contractual
  // & legal category) rather than a direct status write, so there's a
  // record of when and why a lapsed/cancelled policy came back.
  async function handleReinstate() {
    const reason = prompt("Reason for reinstating this policy (e.g. payment issue resolved):");
    if (!reason) return;
    setSaving(true);
    setError(null);
    try {
      const created = await api.endorsements.create({
        policyId,
        endorsementCategory: "contractual_legal",
        endorsementType: "reinstate_lapsed_coverage",
        description: reason,
      });
      await api.endorsements.update(created.id, { status: "Completed" });
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleStartCheck() {
    setSaving(true);
    try {
      await api.policies.startCheck(policyId);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCheckStatus(checkId: string, status: "pass" | "fail") {
    setSaving(true);
    try {
      await api.policyChecks.update(checkId, { status });
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRaiseDiscrepancy(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.discrepancies.create({ policyId, description: discrepancyDescription });
      setDiscrepancyDescription("");
      setShowDiscrepancyForm(false);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleResolveDiscrepancy(id: string, status: "corrected" | "waived") {
    setSaving(true);
    try {
      await api.discrepancies.update(id, { status });
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkDelivered() {
    setSaving(true);
    setError(null);
    try {
      await api.policies.update(policyId, { status: "Delivered", deliveryMethod });
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAcknowledge() {
    setSaving(true);
    try {
      await api.policies.update(policyId, { clientAcknowledgedAt: new Date().toISOString() });
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading policy…</p>;
  if (error && !policy) return <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>;
  if (!policy) return <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">Policy not found.</div>;

  const partyName = (id: string | null) => parties.find((p) => p.id === id)?.fullName || "—";
  const insurerName = (id: string | null) => insurers.find((i) => i.id === id)?.name || id || "—";
  const linkedQuotation = quotations.find((q) => q.id === policy.quotationId);
  const canModify = !["Cancelled", "Expired", "Lapsed"].includes(policy.status);

  const historyEvents = [
    ...endorsements.map((e) => ({ date: e.requestedDate, label: `Endorsement: ${ENDORSEMENT_TYPE_LABEL[e.endorsementType] || e.endorsementType}`, status: e.status })),
    ...renewals.map((r) => ({ date: r.createdAt, label: `Renewal due ${r.dueDate}`, status: r.renewalStatus })),
    ...premiumConfirmations.map((pc) => ({ date: pc.confirmedAt, label: `Premium confirmed — KES ${Number(pc.confirmedAmountKes).toLocaleString()}`, status: "confirmed" })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ArrowLeft size={15} /> {backLabel}
      </button>

      {error && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-mono text-xl font-semibold text-slate-900">{policy.id}</h2>
            <p className="mt-0.5 text-sm capitalize text-slate-500">{className(policy.category)} · {partyName(policy.clientId)}</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill status={policy.status} />
            {canModify && (
              <>
                <button onClick={() => setShowEndorseForm((v) => !v)} className="flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                  <FileEdit size={13} /> Endorse
                </button>
                <button onClick={() => setShowRenewForm((v) => !v)} className="flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                  <RefreshCw size={13} /> Renew
                </button>
                <button onClick={handleCancel} disabled={saving} className="flex items-center gap-1.5 rounded-md border border-rose-200 px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50">
                  <Ban size={13} /> Cancel
                </button>
              </>
            )}
            {["Cancelled", "Lapsed", "Expired"].includes(policy.status) && (
              <button onClick={handleReinstate} disabled={saving} className="flex items-center gap-1.5 rounded-md border border-emerald-200 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
                <RefreshCw size={13} /> Reinstate
              </button>
            )}
          </div>
        </div>

        {showEndorseForm && (
          <form onSubmit={handleEndorse} className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-4">
            <select
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              value={endorseForm.endorsementCategory}
              onChange={(e) => {
                const category = e.target.value;
                const firstType = ENDORSEMENT_TYPES_BY_CATEGORY[category][0];
                setEndorseForm({ ...endorseForm, endorsementCategory: category, endorsementType: firstType });
                setEndorseFields({});
              }}
            >
              {ENDORSEMENT_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <select
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              value={endorseForm.endorsementType}
              onChange={(e) => { setEndorseForm({ ...endorseForm, endorsementType: e.target.value }); setEndorseFields({}); }}
            >
              {ENDORSEMENT_TYPES_BY_CATEGORY[endorseForm.endorsementCategory].map((t) => <option key={t} value={t}>{ENDORSEMENT_TYPE_LABEL[t]}</option>)}
            </select>
            <input placeholder="Effective date" type="date" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={endorseForm.effectiveDate} onChange={(e) => setEndorseForm({ ...endorseForm, effectiveDate: e.target.value })} />
            <input placeholder="Premium adjustment (KES, +/-)" type="number" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={endorseForm.premiumAdjustmentKes} onChange={(e) => setEndorseForm({ ...endorseForm, premiumAdjustmentKes: e.target.value })} />

            {ENDORSEMENT_TYPE_EFFECT[endorseForm.endorsementType] && (
              <p className="col-span-2 text-xs text-slate-400 sm:col-span-4">Once Completed: {ENDORSEMENT_TYPE_EFFECT[endorseForm.endorsementType]}</p>
            )}

            {(ENDORSEMENT_TYPE_FIELDS[endorseForm.endorsementType] || []).map((f) => (
              <label key={f.key} className="col-span-2 text-xs text-slate-600 sm:col-span-2">
                {f.label}
                {f.type === "textarea" ? (
                  <textarea rows={2} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={endorseFields[f.key] || ""} onChange={(e) => setEndorseFields({ ...endorseFields, [f.key]: e.target.value })} />
                ) : f.type === "select" ? (
                  <select className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={endorseFields[f.key] || ""} onChange={(e) => setEndorseFields({ ...endorseFields, [f.key]: e.target.value })}>
                    <option value="">-- Select --</option>
                    {f.options?.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
                  </select>
                ) : (
                  <input type={f.type} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={endorseFields[f.key] || ""} onChange={(e) => setEndorseFields({ ...endorseFields, [f.key]: e.target.value })} />
                )}
              </label>
            ))}

            <input placeholder="Description / reason" className="col-span-2 rounded-md border border-slate-300 px-3 py-1.5 text-sm sm:col-span-4" value={endorseForm.description} onChange={(e) => setEndorseForm({ ...endorseForm, description: e.target.value })} />
            <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
              {saving ? "Requesting…" : "Request endorsement"}
            </button>
          </form>
        )}

        {showRenewForm && (
          <form onSubmit={handleRenew} className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
            <label className="text-sm text-slate-600">Renewal due date</label>
            <input required type="date" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={renewDueDate} onChange={(e) => setRenewDueDate(e.target.value)} />
            <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
              {saving ? "Opening…" : "Open renewal case"}
            </button>
          </form>
        )}

        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 text-sm sm:grid-cols-4">
          <div><p className="text-xs uppercase tracking-wide text-slate-400">Insurer</p><p className="text-slate-700">{insurerName(policy.insurerId)}</p></div>
          <div><p className="text-xs uppercase tracking-wide text-slate-400">Premium</p><p className="text-slate-700">KES {Number(policy.premiumAmount).toLocaleString()}</p></div>
          <div><p className="text-xs uppercase tracking-wide text-slate-400">Cover period</p><p className="text-slate-700">{policy.startDate} → {policy.endDate}</p></div>
          <div><p className="text-xs uppercase tracking-wide text-slate-400">Quotation ref</p><p className="font-mono text-xs text-slate-700">{policy.quotationId || "—"}</p></div>
        </div>
      </div>

      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`border-b-2 px-1 py-2 text-sm font-medium ${tab === t.id ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === "summary" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="mb-3 text-sm font-semibold text-slate-900">Policy</p>
            <dl className="space-y-2 text-sm">
              <Row label="Category" value={className(policy.category)} />
              <Row label="Client" value={partyName(policy.clientId)} />
              <Row label="Insurer" value={insurerName(policy.insurerId)} />
              <Row label="Status" value={<StatusPill status={policy.status} />} />
              <Row label="Created" value={new Date(policy.createdAt).toLocaleDateString()} />
              <Row label="Last updated" value={new Date(policy.updatedAt).toLocaleDateString()} />
            </dl>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="mb-3 text-sm font-semibold text-slate-900">Open items</p>
            {endorsements.filter((e) => !["Completed", "Declined"].includes(e.status)).length === 0 && renewals.filter((r) => r.renewalStatus === "upcoming").length === 0 ? (
              <p className="text-sm text-slate-400">No open endorsements or renewals.</p>
            ) : (
              <ul className="space-y-2">
                {endorsements.filter((e) => !["Completed", "Declined"].includes(e.status)).map((e) => (
                  <li key={e.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">{ENDORSEMENT_TYPE_LABEL[e.endorsementType] || e.endorsementType}</span>
                    <StatusPill status={e.status} />
                  </li>
                ))}
                {renewals.filter((r) => r.renewalStatus === "upcoming").map((r) => (
                  <li key={r.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">Renewal due {r.dueDate}</span>
                    <StatusPill status={r.renewalStatus} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === "cover" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="mb-3 text-sm font-semibold text-slate-900">Current cover terms</p>
            <p className="mb-3 text-xs text-slate-500">Changes over the policy's life via endorsement — distinct from the quotation snapshot below, which is fixed at the point of bind.</p>
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <Row label="Sum insured" value={policy.sumInsuredKes != null ? `KES ${Number(policy.sumInsuredKes).toLocaleString()}` : "—"} />
              <Row label="Deductible" value={policy.deductibleKes != null ? `KES ${Number(policy.deductibleKes).toLocaleString()}` : "—"} />
              <Row label="Valuation method" value={policy.valuationMethod ? policy.valuationMethod.replace(/_/g, " ") : "—"} />
              <Row label="Agreed value" value={policy.agreedValueKes != null ? `KES ${Number(policy.agreedValueKes).toLocaleString()}` : "—"} />
            </dl>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="mb-3 text-sm font-semibold text-slate-900">Quotation snapshot (as bound)</p>
            {linkedQuotation ? (
              <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                <Row label="Sum insured" value={linkedQuotation.sumInsuredKes != null ? `KES ${Number(linkedQuotation.sumInsuredKes).toLocaleString()}` : "—"} />
                <Row label="Base premium" value={linkedQuotation.basePremiumKes != null ? `KES ${Number(linkedQuotation.basePremiumKes).toLocaleString()}` : "—"} />
                <Row label="Commission rate" value={linkedQuotation.commissionRatePct != null ? `${linkedQuotation.commissionRatePct}%` : "—"} />
                <Row label="PCF levy" value={linkedQuotation.pcfLevyKes != null ? `KES ${Number(linkedQuotation.pcfLevyKes).toLocaleString()}` : "—"} />
                <Row label="Insurance Training Levy" value={linkedQuotation.itlLevyKes != null ? `KES ${Number(linkedQuotation.itlLevyKes).toLocaleString()}` : "—"} />
                <Row label="Stamp duty" value={linkedQuotation.stampDutyKes != null ? `KES ${Number(linkedQuotation.stampDutyKes).toLocaleString()}` : "—"} />
                <Row label="Total premium" value={linkedQuotation.totalPremiumKes != null ? `KES ${Number(linkedQuotation.totalPremiumKes).toLocaleString()}` : "—"} />
              </dl>
            ) : (
              <p className="text-sm text-slate-400">No linked quotation on file — this policy wasn't issued through the Placement flow, so its cover breakdown (sum insured, levies, commission) isn't recorded here.</p>
            )}
          </div>
        </div>
      )}

      {tab === "endorsements" && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="px-4 py-2.5 font-medium">Type</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Description</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Premium adj.</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Effective</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                <th scope="col" className="px-4 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {endorsements.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">No endorsements requested yet.</td></tr>
              ) : (
                endorsements.map((e) => (
                  <tr key={e.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2.5 text-slate-700">
                      {ENDORSEMENT_TYPE_LABEL[e.endorsementType] || e.endorsementType}
                      {e.appliedAt && <div className="text-xs text-emerald-600">Applied {new Date(e.appliedAt).toLocaleDateString()}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">{e.description || "—"}</td>
                    <td className="px-4 py-2.5 tabular-nums text-slate-600">{e.premiumAdjustmentKes ? `KES ${Number(e.premiumAdjustmentKes).toLocaleString()}` : "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">{e.effectiveDate || "—"}</td>
                    <td className="px-4 py-2.5"><StatusPill status={e.status} tone={e.status === "Completed" ? "good" : e.status === "Declined" ? "critical" : "neutral"} /></td>
                    <td className="px-4 py-2.5 text-right">
                      {!["Completed", "Declined"].includes(e.status) && (
                        <select
                          value={e.status}
                          onChange={(ev) => handleEndorsementStatus(e.id, ev.target.value)}
                          disabled={saving}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs disabled:opacity-50"
                        >
                          {ENDORSEMENT_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "issuance" && (
        <div className="space-y-4">
          {policyChecks.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-600">No issuance check started yet — compares the issued policy against the placement instruction (SOP-11) before it can be marked Delivered.</p>
              <button onClick={handleStartCheck} disabled={saving} className="mt-3 flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                <ClipboardCheck size={15} /> {saving ? "Starting…" : "Start check"}
              </button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th scope="col" className="px-4 py-2.5 font-medium">Check item</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Checked by</th>
                      <th scope="col" className="px-4 py-2.5 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {policyChecks.map((c) => (
                      <tr key={c.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-2.5 text-slate-700">{c.checkItem}</td>
                        <td className="px-4 py-2.5"><StatusPill status={c.status} tone={c.status === "pass" ? "good" : c.status === "fail" ? "critical" : "neutral"} /></td>
                        <td className="px-4 py-2.5 text-xs text-slate-500">{c.checkedBy || "—"}</td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button onClick={() => handleCheckStatus(c.id, "pass")} disabled={saving} className="rounded-md border border-emerald-200 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">Pass</button>
                            <button onClick={() => handleCheckStatus(c.id, "fail")} disabled={saving} className="rounded-md border border-rose-200 px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50">Fail</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">Discrepancies</p>
                  <button onClick={() => setShowDiscrepancyForm((v) => !v)} className="text-xs font-medium text-indigo-600 hover:underline">Raise discrepancy</button>
                </div>
                {showDiscrepancyForm && (
                  <form onSubmit={handleRaiseDiscrepancy} className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-4">
                    <input required placeholder="Describe the discrepancy" className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={discrepancyDescription} onChange={(e) => setDiscrepancyDescription(e.target.value)} />
                    <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">Raise</button>
                  </form>
                )}
                <SimpleTable
                  headers={["Description", "Status", ""]}
                  rows={discrepancies.map((d) => [
                    d.description,
                    <StatusPill status={d.status} tone={d.status === "open" ? "critical" : d.status === "waived" ? "warning" : "good"} />,
                    d.status === "open" ? (
                      <div className="flex gap-1.5">
                        <button onClick={() => handleResolveDiscrepancy(d.id, "corrected")} disabled={saving} className="text-xs font-medium text-indigo-600 hover:underline disabled:opacity-50">Mark corrected</button>
                        <button onClick={() => handleResolveDiscrepancy(d.id, "waived")} disabled={saving} className="text-xs font-medium text-slate-500 hover:underline disabled:opacity-50">Waive</button>
                      </div>
                    ) : "",
                  ])}
                  empty="No discrepancies raised."
                />
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="mb-3 text-sm font-semibold text-slate-900">Delivery</p>
                {policy.deliveredAt ? (
                  <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                    <Row label="Delivered" value={new Date(policy.deliveredAt).toLocaleString()} />
                    <Row label="Method" value={policy.deliveryMethod || "—"} />
                    <Row label="Client acknowledged" value={policy.clientAcknowledgedAt ? new Date(policy.clientAcknowledgedAt).toLocaleString() : (
                      <button onClick={handleAcknowledge} disabled={saving} className="text-xs font-medium text-indigo-600 hover:underline disabled:opacity-50">Record acknowledgement</button>
                    )} />
                  </dl>
                ) : (
                  <div className="flex flex-wrap items-end gap-2">
                    <div>
                      <label className="text-xs text-slate-500">Delivery method</label>
                      <select className="block rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={deliveryMethod} onChange={(e) => setDeliveryMethod(e.target.value)}>
                        <option value="email">Email</option>
                        <option value="portal">Portal</option>
                        <option value="courier">Courier</option>
                        <option value="hand">Hand delivery</option>
                      </select>
                    </div>
                    <button onClick={handleMarkDelivered} disabled={saving} className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                      {saving ? "Saving…" : "Mark Delivered"}
                    </button>
                    <p className="w-full text-xs text-slate-400">Blocked until every checklist item passes and every discrepancy is resolved.</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {tab === "documents" && (
        <SimpleTable
          headers={["File", "Type", "Sensitivity", "Uploaded"]}
          rows={documents.map((d) => [
            d.fileName,
            d.documentType || "—",
            d.sensitivity,
            new Date(d.createdAt).toLocaleDateString(),
          ])}
          empty="No documents on file for this policy — upload one under Documents, linked to this policy's ID."
        />
      )}

      {tab === "transactions" && (
        <SimpleTable
          headers={["Type", "Amount", "Method/Reference", "Date"]}
          rows={[
            ...premiumConfirmations.map((pc) => [
              "Premium confirmation",
              `KES ${Number(pc.confirmedAmountKes).toLocaleString()}`,
              pc.paymentReference || pc.insurerChannel || "—",
              new Date(pc.confirmedAt).toLocaleDateString(),
            ]),
            ...financialTransactions.map((ft) => [
              ft.transactionType,
              `${ft.direction === "credit" ? "+" : "-"} KES ${Number(ft.amountKes).toLocaleString()}`,
              ft.providerReference || ft.method || "—",
              new Date(ft.occurredAt).toLocaleDateString(),
            ]),
          ]}
          empty="No premium confirmations or transactions recorded yet."
        />
      )}

      {tab === "history" && (
        <SimpleTable
          headers={["Event", "Status", "Date"]}
          rows={historyEvents.map((h) => [h.label, <StatusPill status={h.status} />, new Date(h.date).toLocaleDateString()])}
          empty="No endorsements, renewals or premium confirmations recorded yet."
        />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-slate-700">{value}</dd>
    </div>
  );
}

function SimpleTable({ headers, rows, empty }: { headers: string[]; rows: React.ReactNode[][]; empty: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            {headers.map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={headers.length} className="px-4 py-6 text-center text-slate-400">{empty}</td></tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i} className="border-b border-slate-100 last:border-0">
                {row.map((cell, j) => <td key={j} className="px-4 py-2.5 text-slate-700">{cell}</td>)}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
