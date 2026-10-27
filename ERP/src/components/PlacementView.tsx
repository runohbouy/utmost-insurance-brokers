import { useEffect, useState } from "react";
import { Plus, Award, Check, X, MessageCircleQuestion } from "lucide-react";
import { api } from "../api";
import { SUBMISSION_STAGES, MARKET_STRATEGY_TYPES, SANCTIONS_SCREENING_RESULTS, APPROVAL_STAGES, type Opportunity, type Party, type Insurer, type Risk, type Submission, type Quotation, type Recommendation, type MarketStrategy, type InsurerAppetite, type RiskClearance, type UnderwritingQuery, type UnderwritingApproval } from "../types";
import { GENERAL_CLASSES, className } from "../data/insuranceClasses";
import { RISK_CLASS_FIELDS } from "../data/riskClassFields";
import StatusPill from "./StatusPill";

const EMPTY_RISK_FORM = { class: "07", subjectMatter: "", valuationKes: "" };
const EMPTY_QUOTE_FORM = { insurerId: "", sumInsuredKes: "", basePremiumKes: "", exclusions: "", warranties: "", extensions: "", conditions: "", paymentTerms: "", specialTerms: "" };
const EMPTY_REC_FORM = { recommendedQuotationId: "", reasons: "", disclosures: "" };
const EMPTY_STRATEGY_FORM = { strategyType: "remarketing", rationale: "" };
const EMPTY_CLEARANCE_FORM = { sanctionsScreeningResult: "clear", pepStatus: false, conflictOfInterestChecked: true, conflictOfInterestNotes: "" };
const EMPTY_QUERY_FORM = { question: "", requiredResponseDate: "", clientInfoRequired: "" };
const EMPTY_APPROVAL_REASON = "";

export default function PlacementView() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [insurers, setInsurers] = useState<Insurer[]>([]);
  const [appetite, setAppetite] = useState<InsurerAppetite[]>([]);
  const [opportunityId, setOpportunityId] = useState("");
  const [risk, setRisk] = useState<Risk | null>(null);
  const [marketStrategy, setMarketStrategy] = useState<MarketStrategy | null>(null);
  const [riskClearance, setRiskClearance] = useState<RiskClearance | null>(null);
  const [submissionsList, setSubmissionsList] = useState<Submission[]>([]);
  const [submissionId, setSubmissionId] = useState("");
  const [quotationsList, setQuotationsList] = useState<Quotation[]>([]);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [riskForm, setRiskForm] = useState(EMPTY_RISK_FORM);
  const [strategyForm, setStrategyForm] = useState(EMPTY_STRATEGY_FORM);
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [quoteForm, setQuoteForm] = useState(EMPTY_QUOTE_FORM);
  const [showRecForm, setShowRecForm] = useState(false);
  const [recForm, setRecForm] = useState(EMPTY_REC_FORM);
  const [showClearanceForm, setShowClearanceForm] = useState(false);
  const [clearanceForm, setClearanceForm] = useState(EMPTY_CLEARANCE_FORM);
  const [approvals, setApprovals] = useState<UnderwritingApproval[]>([]);
  const [showApprovalForm, setShowApprovalForm] = useState(false);
  const [approvalReason, setApprovalReason] = useState(EMPTY_APPROVAL_REASON);
  const [decisionForm, setDecisionForm] = useState<Record<string, { comments: string; conditions: string }>>({});
  const [queries, setQueries] = useState<UnderwritingQuery[]>([]);
  const [showQueryForm, setShowQueryForm] = useState(false);
  const [queryForm, setQueryForm] = useState(EMPTY_QUERY_FORM);
  const [responseDraft, setResponseDraft] = useState<Record<string, string>>({});
  const [riskFieldsForm, setRiskFieldsForm] = useState<Record<string, string>>({});
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [submissionWarnings, setSubmissionWarnings] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([api.opportunities.list(), api.parties.list(), api.insurers.list(), api.insurerAppetite.list()])
      .then(([o, p, i, a]) => { setOpportunities(o); setParties(p); setInsurers(i); setAppetite(a); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const opportunity = opportunities.find((o) => o.id === opportunityId) || null;

  async function loadRisk(oppId: string) {
    const found = await api.risks.list(oppId);
    const r = found[0] || null;
    setRisk(r);
    if (r) {
      const strategies = await api.marketStrategies.list(r.id);
      setMarketStrategy(strategies[0] || null);
      const clearances = await api.riskClearances.list(r.id);
      setRiskClearance(clearances[0] || null);
      const approvalRows = await api.underwritingApprovals.list(r.id);
      setApprovals(approvalRows);
      const fields = RISK_CLASS_FIELDS[r.class] || [];
      const initialForm: Record<string, string> = {};
      for (const f of fields) initialForm[f.key] = r.exposureAttributes?.[f.key] != null ? String(r.exposureAttributes[f.key]) : "";
      setRiskFieldsForm(initialForm);
      await loadSubmissions(r.id);
    } else {
      setMarketStrategy(null);
      setRiskClearance(null);
      setApprovals([]);
      setRiskFieldsForm({});
      setSubmissionsList([]); setSubmissionId(""); setQuotationsList([]); setRecommendation(null); setQueries([]);
    }
  }

  async function loadSubmissions(riskId: string) {
    const found = await api.submissions.list(riskId);
    setSubmissionsList(found);
    const latest = found[0];
    if (latest) {
      setSubmissionId(latest.id);
      await loadSubmissionDetail(latest.id);
    } else {
      setSubmissionId("");
      setQuotationsList([]);
      setRecommendation(null);
    }
  }

  async function loadSubmissionDetail(subId: string) {
    const [quotes, recs, q] = await Promise.all([api.quotations.list(subId), api.recommendations.list(subId), api.underwritingQueries.list(subId)]);
    setQuotationsList(quotes);
    setRecommendation(recs[0] || null);
    setQueries(q);
  }

  useEffect(() => {
    if (opportunityId) loadRisk(opportunityId).catch((err) => setError(err.message));
    else { setRisk(null); setSubmissionsList([]); setSubmissionId(""); setQuotationsList([]); setRecommendation(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunityId]);

  async function handleCreateRisk(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.risks.create({
        opportunityId,
        partyId: opportunity?.partyId || undefined,
        class: riskForm.class,
        subjectMatter: riskForm.subjectMatter || undefined,
        valuationKes: riskForm.valuationKes ? Number(riskForm.valuationKes) : undefined,
      });
      await loadRisk(opportunityId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveRiskFields(e: React.FormEvent) {
    e.preventDefault();
    if (!risk) return;
    setSaving(true);
    setError(null);
    try {
      const fields = RISK_CLASS_FIELDS[risk.class] || [];
      const exposureAttributes: Record<string, unknown> = { ...(risk.exposureAttributes || {}) };
      for (const f of fields) {
        const raw = riskFieldsForm[f.key];
        if (raw === "" || raw === undefined) { delete exposureAttributes[f.key]; continue; }
        exposureAttributes[f.key] = f.type === "number" ? Number(raw) : raw;
      }
      const updated = await api.risks.update(risk.id, { exposureAttributes });
      setRisk(updated);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateStrategy(e: React.FormEvent) {
    e.preventDefault();
    if (!risk) return;
    setSaving(true);
    setError(null);
    try {
      const created = await api.marketStrategies.create({ riskId: risk.id, strategyType: strategyForm.strategyType, rationale: strategyForm.rationale });
      setMarketStrategy(created);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRequestApproval(e: React.FormEvent) {
    e.preventDefault();
    if (!risk) return;
    setSaving(true);
    setError(null);
    try {
      const created = await api.underwritingApprovals.request({ riskId: risk.id, reason: approvalReason });
      setApprovals((prev) => [...prev, ...created]);
      setApprovalReason(EMPTY_APPROVAL_REASON);
      setShowApprovalForm(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDecideApproval(id: string, decision: "approved" | "rejected") {
    setSaving(true);
    setError(null);
    try {
      const draft = decisionForm[id] || { comments: "", conditions: "" };
      const updated = await api.underwritingApprovals.decide(id, { decision, comments: draft.comments || undefined, conditions: draft.conditions || undefined });
      setApprovals((prev) => prev.map((a) => (a.id === id ? updated : a)));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateQuery(e: React.FormEvent) {
    e.preventDefault();
    if (!submissionId) return;
    setSaving(true);
    setError(null);
    try {
      const created = await api.underwritingQueries.create({
        submissionId,
        question: queryForm.question,
        requiredResponseDate: queryForm.requiredResponseDate || undefined,
        clientInfoRequired: queryForm.clientInfoRequired || undefined,
      });
      setQueries((prev) => [created, ...prev]);
      setQueryForm(EMPTY_QUERY_FORM);
      setShowQueryForm(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRespondQuery(id: string) {
    setSaving(true);
    setError(null);
    try {
      const response = responseDraft[id];
      const updated = await api.underwritingQueries.update(id, { response });
      setQueries((prev) => prev.map((q) => (q.id === id ? updated : q)));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateSubmission(markets: string[], singleSourceJustification?: string) {
    if (!risk) return;
    setSaving(true);
    setError(null);
    try {
      const created = await api.submissions.create({ riskId: risk.id, markets, singleSourceJustification });
      setSubmissionWarnings(created.restrictedInsurerWarnings || []);
      await loadSubmissions(risk.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmissionStatusChange(status: string) {
    if (!submissionId) return;
    setError(null);
    try {
      await api.submissions.update(submissionId, { status });
      setSubmissionsList((prev) => prev.map((s) => (s.id === submissionId ? { ...s, status } : s)));
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleCreateQuotation(e: React.FormEvent) {
    e.preventDefault();
    if (!risk || !submissionId) return;
    setSaving(true);
    setError(null);
    try {
      const toLines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
      await api.quotations.create({
        submissionId,
        clientId: opportunity?.partyId || undefined,
        category: risk.class,
        insurerId: quoteForm.insurerId,
        sumInsuredKes: Number(quoteForm.sumInsuredKes),
        basePremiumKes: Number(quoteForm.basePremiumKes),
        exclusions: toLines(quoteForm.exclusions),
        warranties: toLines(quoteForm.warranties),
        extensions: toLines(quoteForm.extensions),
        conditions: quoteForm.conditions || undefined,
        paymentTerms: quoteForm.paymentTerms || undefined,
        specialTerms: quoteForm.specialTerms || undefined,
      });
      setQuoteForm(EMPTY_QUOTE_FORM);
      setShowQuoteForm(false);
      await loadSubmissionDetail(submissionId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleSelectQuotation(quotationId: string) {
    setCompareIds(quotationsList.filter((q) => q.status !== "declined").map((q) => q.id));
    setRecForm({ ...EMPTY_REC_FORM, recommendedQuotationId: quotationId });
    setShowRecForm(true);
  }

  async function handleRejectQuotation(quotationId: string) {
    setSaving(true);
    setError(null);
    try {
      await api.quotations.update(quotationId, { status: "declined" });
      await loadSubmissionDetail(submissionId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRequestClarification() {
    if (!submissionId) return;
    setSaving(true);
    setError(null);
    try {
      await api.submissions.update(submissionId, { status: "Clarification" });
      setSubmissionsList((prev) => prev.map((s) => (s.id === submissionId ? { ...s, status: "Clarification" } : s)));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateRecommendation(e: React.FormEvent) {
    e.preventDefault();
    if (!submissionId || compareIds.length < 1) return;
    setSaving(true);
    setError(null);
    try {
      await api.recommendations.create({
        submissionId,
        comparedQuotationIds: compareIds,
        recommendedQuotationId: recForm.recommendedQuotationId,
        reasons: recForm.reasons || undefined,
        disclosures: recForm.disclosures || undefined,
      });
      setRecForm(EMPTY_REC_FORM);
      setCompareIds([]);
      setShowRecForm(false);
      await loadSubmissionDetail(submissionId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRecordClearance(e: React.FormEvent) {
    e.preventDefault();
    if (!risk) return;
    setSaving(true);
    setError(null);
    try {
      const created = await api.riskClearances.create({
        riskId: risk.id,
        sanctionsScreeningResult: clearanceForm.sanctionsScreeningResult as RiskClearance["sanctionsScreeningResult"],
        pepStatus: clearanceForm.pepStatus,
        conflictOfInterestChecked: clearanceForm.conflictOfInterestChecked,
        conflictOfInterestNotes: clearanceForm.conflictOfInterestNotes || undefined,
      });
      setRiskClearance(created);
      setClearanceForm(EMPTY_CLEARANCE_FORM);
      setShowClearanceForm(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleClientDecision(decision: string) {
    if (!recommendation) return;
    setSaving(true);
    setError(null);
    try {
      await api.recommendations.update(recommendation.id, { clientDecision: decision });
      await loadSubmissionDetail(submissionId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleBindPolicy() {
    if (!recommendation?.recommendedQuotationId) return;
    const quote = quotationsList.find((q) => q.id === recommendation.recommendedQuotationId);
    if (!quote) return;
    setSaving(true);
    setError(null);
    try {
      const oneYearOut = new Date();
      oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);
      await api.policies.create({
        quotationId: quote.id,
        clientId: quote.clientId || opportunity?.partyId || undefined,
        insurerId: quote.insurerId || undefined,
        category: quote.category,
        premiumAmount: quote.totalPremiumKes || quote.basePremiumKes || 0,
        endDate: oneYearOut.toISOString().slice(0, 10),
      });
      if (opportunity) await api.opportunities.update(opportunity.id, { stage: "Won" });
      setOpportunities((prev) => prev.map((o) => (o.id === opportunityId ? { ...o, stage: "Won" } : o)));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const insurerName = (id: string | null) => insurers.find((i) => i.id === id)?.name || id || "—";
  const partyName = (id: string | null) => parties.find((p) => p.id === id)?.fullName || "—";
  const openOpportunities = opportunities.filter((o) => !["Won", "Lost", "Deferred"].includes(o.stage));

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">Placement</h2>
      <p className="max-w-2xl text-sm text-slate-500">Risk → market submission → quotation comparison → client recommendation, closing with a bound policy. Follows SOP §8's Risk/Submission/Quotation/Recommendation chain.</p>

      {error && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      <select className="w-full max-w-md rounded-md border border-slate-300 px-3 py-2 text-sm" value={opportunityId} onChange={(e) => setOpportunityId(e.target.value)}>
        <option value="">-- Select an opportunity to place --</option>
        {openOpportunities.map((o) => (
          <option key={o.id} value={o.id}>{partyName(o.partyId)} · {o.class || "no class"} · {o.stage}</option>
        ))}
      </select>

      {opportunityId && !risk && (
        <form onSubmit={handleCreateRisk} className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3">
          <p className="col-span-2 text-sm font-medium text-slate-700 sm:col-span-3">No risk profile yet for this opportunity — capture what's actually being insured.</p>
          <select required className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={riskForm.class} onChange={(e) => setRiskForm({ ...riskForm, class: e.target.value })}>
            {GENERAL_CLASSES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
          <input placeholder="Subject matter (e.g. KDA 123B Toyota Axio)" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={riskForm.subjectMatter} onChange={(e) => setRiskForm({ ...riskForm, subjectMatter: e.target.value })} />
          <input placeholder="Valuation (KES)" type="number" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={riskForm.valuationKes} onChange={(e) => setRiskForm({ ...riskForm, valuationKes: e.target.value })} />
          <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
            {saving ? "Saving…" : "Create risk profile"}
          </button>
        </form>
      )}

      {risk && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Risk</p>
          <p className="mt-1 text-sm text-slate-900">{className(risk.class)} {risk.subjectMatter ? `· ${risk.subjectMatter}` : ""} {risk.valuationKes ? `· valued KES ${risk.valuationKes.toLocaleString()}` : ""}</p>
        </div>
      )}

      {risk && RISK_CLASS_FIELDS[risk.class] && (() => {
        const fields = RISK_CLASS_FIELDS[risk.class];
        const missing = fields.filter((f) => f.required && !(risk.exposureAttributes?.[f.key] != null && risk.exposureAttributes[f.key] !== ""));
        return (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">Risk data ({className(risk.class)})</p>
              {missing.length > 0 ? (
                <StatusPill status={`${missing.length} required field(s) missing`} tone="warning" />
              ) : (
                <StatusPill status="Complete" tone="good" />
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">Class-specific underwriting information — required fields must be completed before this risk can be submitted to market.</p>
            <form onSubmit={handleSaveRiskFields} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {fields.map((f) => (
                <label key={f.key} className="text-xs text-slate-600">
                  {f.label}{f.required && <span className="text-rose-500"> *</span>}
                  {f.type === "textarea" ? (
                    <textarea rows={2} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={riskFieldsForm[f.key] || ""} onChange={(e) => setRiskFieldsForm({ ...riskFieldsForm, [f.key]: e.target.value })} />
                  ) : f.type === "select" ? (
                    <select className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={riskFieldsForm[f.key] || ""} onChange={(e) => setRiskFieldsForm({ ...riskFieldsForm, [f.key]: e.target.value })}>
                      <option value="">-- Select --</option>
                      {f.options?.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
                    </select>
                  ) : (
                    <input type={f.type} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={riskFieldsForm[f.key] || ""} onChange={(e) => setRiskFieldsForm({ ...riskFieldsForm, [f.key]: e.target.value })} />
                  )}
                </label>
              ))}
              <button disabled={saving} type="submit" className="col-span-1 w-fit rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 sm:col-span-2">
                {saving ? "Saving…" : "Save risk data"}
              </button>
            </form>
          </div>
        );
      })()}

      {risk && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900">Underwriting approval</p>
            {approvals.length === 0 && (
              <button onClick={() => setShowApprovalForm((v) => !v)} className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">
                Request approval
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">For risks outside normal appetite (high value, high-risk industry, large discount, unusual terms). Advisory — it doesn't itself block presenting or accepting a recommendation.</p>

          {showApprovalForm && approvals.length === 0 && (
            <form onSubmit={handleRequestApproval} className="mt-3 flex flex-wrap items-end gap-2">
              <input required placeholder="Reason approval is needed" className="min-w-[240px] flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={approvalReason} onChange={(e) => setApprovalReason(e.target.value)} />
              <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                {saving ? "Saving…" : "Open approval chain"}
              </button>
            </form>
          )}

          {approvals.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-slate-500">{approvals[0].reason}</p>
              {APPROVAL_STAGES.map((stage) => {
                const row = approvals.find((a) => a.stage === stage);
                if (!row) return null;
                const draft = decisionForm[row.id] || { comments: "", conditions: "" };
                return (
                  <div key={row.id} className="rounded-md border border-slate-200 p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium capitalize text-slate-700">{stage.replace(/_/g, " ")}</span>
                      <StatusPill status={row.decision} tone={row.decision === "approved" ? "good" : row.decision === "rejected" ? "critical" : "neutral"} />
                    </div>
                    {row.decision === "pending" ? (
                      <div className="mt-2 flex flex-wrap items-end gap-1.5">
                        <input placeholder="Comments" className="min-w-[140px] flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs" value={draft.comments} onChange={(e) => setDecisionForm({ ...decisionForm, [row.id]: { ...draft, comments: e.target.value } })} />
                        <input placeholder="Conditions" className="min-w-[140px] flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs" value={draft.conditions} onChange={(e) => setDecisionForm({ ...decisionForm, [row.id]: { ...draft, conditions: e.target.value } })} />
                        <button disabled={saving} onClick={() => handleDecideApproval(row.id, "approved")} className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">Approve</button>
                        <button disabled={saving} onClick={() => handleDecideApproval(row.id, "rejected")} className="rounded-md border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50">Reject</button>
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-slate-500">{row.comments}{row.conditions ? ` — conditions: ${row.conditions}` : ""}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {risk && !marketStrategy && (
        <form onSubmit={handleCreateStrategy} className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
          <p className="col-span-1 text-sm font-medium text-slate-700 sm:col-span-2">Market strategy (SOP-07) — agree the placement approach before submitting to market.</p>
          <select required className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={strategyForm.strategyType} onChange={(e) => setStrategyForm({ ...strategyForm, strategyType: e.target.value })}>
            {MARKET_STRATEGY_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
          </select>
          <input required placeholder="Rationale" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={strategyForm.rationale} onChange={(e) => setStrategyForm({ ...strategyForm, rationale: e.target.value })} />
          <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
            {saving ? "Saving…" : "Approve strategy"}
          </button>
        </form>
      )}

      {risk && marketStrategy && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Market strategy</p>
          <p className="mt-1 text-sm capitalize text-slate-900">{marketStrategy.strategyType.replace(/_/g, " ")}</p>
          <p className="mt-0.5 text-sm text-slate-600">{marketStrategy.rationale}</p>
        </div>
      )}

      {risk && marketStrategy && submissionsList.length === 0 && (
        <InsurerPicker insurers={insurers} appetite={appetite} riskClass={risk.class} disabled={saving} onSubmit={handleCreateSubmission} />
      )}

      {submissionWarnings.length > 0 && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-700">Restricted-appetite insurer(s) included in this submission: {submissionWarnings.join(", ")} — allowed, but flagged for awareness.</p>
      )}

      {risk && submissionsList.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900">Market submission</p>
            <select
              value={submissionsList.find((s) => s.id === submissionId)?.status || "Draft"}
              onChange={(e) => handleSubmissionStatusChange(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
            >
              {SUBMISSION_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <p className="mt-1 text-sm text-slate-600">Markets: {(submissionsList.find((s) => s.id === submissionId)?.markets || []).map((id) => insurerName(id)).join(", ") || "none"}</p>
        </div>
      )}

      {submissionId && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900">Underwriter queries</p>
            <button onClick={() => setShowQueryForm((v) => !v)} className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">
              Log query
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">An insurer's mid-submission information request, tracked here instead of only in email — question, client info required, response.</p>

          {showQueryForm && (
            <form onSubmit={handleCreateQuery} className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input required placeholder="Underwriter's question" className="col-span-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm sm:col-span-3" value={queryForm.question} onChange={(e) => setQueryForm({ ...queryForm, question: e.target.value })} />
              <input placeholder="Client info required" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={queryForm.clientInfoRequired} onChange={(e) => setQueryForm({ ...queryForm, clientInfoRequired: e.target.value })} />
              <input type="date" placeholder="Required response date" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={queryForm.requiredResponseDate} onChange={(e) => setQueryForm({ ...queryForm, requiredResponseDate: e.target.value })} />
              <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                {saving ? "Saving…" : "Log query"}
              </button>
            </form>
          )}

          {queries.length > 0 && (
            <div className="mt-3 space-y-2">
              {queries.map((q) => (
                <div key={q.id} className="rounded-md border border-slate-200 p-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-800">{q.question}</p>
                    <StatusPill status={q.status} tone={q.status === "closed" || q.status === "responded" ? "good" : q.status === "awaiting_client" ? "warning" : "neutral"} />
                  </div>
                  {q.clientInfoRequired && <p className="mt-1 text-xs text-slate-500">Client info required: {q.clientInfoRequired}</p>}
                  {q.requiredResponseDate && <p className="mt-0.5 text-xs text-slate-400">Response due {q.requiredResponseDate}</p>}
                  {q.response ? (
                    <p className="mt-1.5 rounded-md bg-slate-50 p-2 text-xs text-slate-600">{q.response}</p>
                  ) : (
                    <div className="mt-1.5 flex gap-1.5">
                      <input placeholder="Response to underwriter" className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs" value={responseDraft[q.id] || ""} onChange={(e) => setResponseDraft({ ...responseDraft, [q.id]: e.target.value })} />
                      <button disabled={saving || !responseDraft[q.id]} onClick={() => handleRespondQuery(q.id)} className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50">Send</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {submissionId && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900">Quotations</p>
            <button onClick={() => setShowQuoteForm((v) => !v)} className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
              <Plus size={15} /> Add quotation
            </button>
          </div>

          {showQuoteForm && (
            <form onSubmit={handleCreateQuotation} className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3">
              <select required className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={quoteForm.insurerId} onChange={(e) => setQuoteForm({ ...quoteForm, insurerId: e.target.value })}>
                <option value="">-- Insurer --</option>
                {(submissionsList.find((s) => s.id === submissionId)?.markets || []).map((id) => (
                  <option key={id} value={id}>{insurerName(id)}</option>
                ))}
              </select>
              <input required placeholder="Sum insured (KES)" type="number" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={quoteForm.sumInsuredKes} onChange={(e) => setQuoteForm({ ...quoteForm, sumInsuredKes: e.target.value })} />
              <input required placeholder="Base premium (KES)" type="number" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={quoteForm.basePremiumKes} onChange={(e) => setQuoteForm({ ...quoteForm, basePremiumKes: e.target.value })} />
              <details className="col-span-2 sm:col-span-3">
                <summary className="cursor-pointer text-xs font-medium text-slate-500">Terms (exclusions, warranties, extensions, conditions) — optional</summary>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <textarea placeholder="Exclusions (one per line)" rows={2} className="rounded-md border border-slate-300 px-2 py-1.5 text-xs" value={quoteForm.exclusions} onChange={(e) => setQuoteForm({ ...quoteForm, exclusions: e.target.value })} />
                  <textarea placeholder="Warranties (one per line)" rows={2} className="rounded-md border border-slate-300 px-2 py-1.5 text-xs" value={quoteForm.warranties} onChange={(e) => setQuoteForm({ ...quoteForm, warranties: e.target.value })} />
                  <textarea placeholder="Extensions (one per line)" rows={2} className="rounded-md border border-slate-300 px-2 py-1.5 text-xs" value={quoteForm.extensions} onChange={(e) => setQuoteForm({ ...quoteForm, extensions: e.target.value })} />
                  <input placeholder="Payment terms" className="rounded-md border border-slate-300 px-2 py-1.5 text-xs" value={quoteForm.paymentTerms} onChange={(e) => setQuoteForm({ ...quoteForm, paymentTerms: e.target.value })} />
                  <input placeholder="Conditions" className="rounded-md border border-slate-300 px-2 py-1.5 text-xs" value={quoteForm.conditions} onChange={(e) => setQuoteForm({ ...quoteForm, conditions: e.target.value })} />
                  <input placeholder="Special terms" className="rounded-md border border-slate-300 px-2 py-1.5 text-xs" value={quoteForm.specialTerms} onChange={(e) => setQuoteForm({ ...quoteForm, specialTerms: e.target.value })} />
                </div>
              </details>
              <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                {saving ? "Pricing…" : "Add quotation"}
              </button>
              <p className="col-span-2 text-xs text-slate-400 sm:col-span-3">PCF, training levy and stamp duty are computed automatically from the insurer's rate settings (Underwriting → Insurer panel).</p>
            </form>
          )}

          {quotationsList.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">No quotations yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {quotationsList.map((q) => (
                <QuotationCard
                  key={q.id}
                  quotation={q}
                  isRecommended={recommendation?.recommendedQuotationId === q.id}
                  canAct={!recommendation && q.status !== "declined"}
                  saving={saving}
                  onSelect={() => handleSelectQuotation(q.id)}
                  onReject={() => handleRejectQuotation(q.id)}
                  onRequestClarification={handleRequestClarification}
                />
              ))}
            </div>
          )}

          {!recommendation && showRecForm && (
            <form onSubmit={handleCreateRecommendation} className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
              <p className="col-span-1 text-sm font-medium text-slate-700 sm:col-span-2">Present this recommendation to the client</p>
              <select required className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={recForm.recommendedQuotationId} onChange={(e) => setRecForm({ ...recForm, recommendedQuotationId: e.target.value })}>
                <option value="">-- Recommend which quotation? --</option>
                {compareIds.map((id) => {
                  const q = quotationsList.find((x) => x.id === id);
                  return <option key={id} value={id}>{q?.insurerName} — KES {(q?.totalPremiumKes || 0).toLocaleString()}</option>;
                })}
              </select>
              <input placeholder="Reasons for the recommendation" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={recForm.reasons} onChange={(e) => setRecForm({ ...recForm, reasons: e.target.value })} />
              <input placeholder="Disclosures / limitations" className="col-span-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm sm:col-span-2" value={recForm.disclosures} onChange={(e) => setRecForm({ ...recForm, disclosures: e.target.value })} />
              <div className="flex gap-2">
                <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                  {saving ? "Saving…" : "Present recommendation"}
                </button>
                <button type="button" onClick={() => { setShowRecForm(false); setCompareIds([]); }} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
                  Cancel
                </button>
              </div>
            </form>
          )}

          {recommendation && recommendation.clientDecision === "pending" && (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">Clearance (SOP-23)</p>
                <StatusPill
                  status={!riskClearance ? "not screened" : riskClearance.sanctionsScreeningResult === "hit" ? "hit — blocked" : riskClearance.conflictOfInterestChecked ? "cleared" : "conflict check pending"}
                  tone={!riskClearance || riskClearance.sanctionsScreeningResult === "hit" || !riskClearance.conflictOfInterestChecked ? "warning" : "good"}
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">Sanctions/PEP screening and a conflict-of-interest check must clear before the client's decision can be accepted.</p>
              {riskClearance && (
                <p className="mt-2 text-sm text-slate-600">
                  Screening: <span className="font-medium capitalize">{riskClearance.sanctionsScreeningResult}</span>
                  {riskClearance.pepStatus ? " · PEP" : ""} · Conflict of interest {riskClearance.conflictOfInterestChecked ? "checked" : "not checked"}
                  {riskClearance.conflictOfInterestNotes ? ` — ${riskClearance.conflictOfInterestNotes}` : ""}
                </p>
              )}
              {!showClearanceForm ? (
                <button onClick={() => setShowClearanceForm(true)} className="mt-3 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                  {riskClearance ? "Record new clearance" : "Record clearance"}
                </button>
              ) : (
                <form onSubmit={handleRecordClearance} className="mt-3 grid grid-cols-1 gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
                  <select className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={clearanceForm.sanctionsScreeningResult} onChange={(e) => setClearanceForm({ ...clearanceForm, sanctionsScreeningResult: e.target.value })}>
                    {SANCTIONS_SCREENING_RESULTS.filter((r) => r !== "pending").map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={clearanceForm.pepStatus} onChange={(e) => setClearanceForm({ ...clearanceForm, pepStatus: e.target.checked })} />
                    Politically exposed person
                  </label>
                  <label className="col-span-1 flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
                    <input type="checkbox" checked={clearanceForm.conflictOfInterestChecked} onChange={(e) => setClearanceForm({ ...clearanceForm, conflictOfInterestChecked: e.target.checked })} />
                    Conflict-of-interest check completed
                  </label>
                  <input placeholder="Conflict-of-interest notes (optional)" className="col-span-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm sm:col-span-2" value={clearanceForm.conflictOfInterestNotes} onChange={(e) => setClearanceForm({ ...clearanceForm, conflictOfInterestNotes: e.target.value })} />
                  <div className="flex gap-2">
                    <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                      {saving ? "Saving…" : "Save clearance"}
                    </button>
                    <button type="button" onClick={() => setShowClearanceForm(false)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {recommendation && (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-slate-900">Recommendation</p>
              {recommendation.reasons && <p className="mt-1 text-sm text-slate-600">{recommendation.reasons}</p>}
              {recommendation.disclosures && <p className="mt-1 text-xs text-slate-400">{recommendation.disclosures}</p>}
              <div className="mt-3 flex items-center gap-3">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Client decision</span>
                <StatusPill status={recommendation.clientDecision} tone={recommendation.clientDecision === "accepted" ? "good" : recommendation.clientDecision === "declined" ? "critical" : recommendation.clientDecision === "pending" ? "neutral" : "warning"} />
                {recommendation.clientDecision === "pending" && (
                  <div className="flex gap-2">
                    <button onClick={() => handleClientDecision("accepted")} disabled={saving} className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700">Accept</button>
                    <button onClick={() => handleClientDecision("declined")} disabled={saving} className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50">Decline</button>
                  </div>
                )}
              </div>
              {recommendation.clientDecision === "accepted" && (
                <button onClick={handleBindPolicy} disabled={saving} className="mt-3 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                  {saving ? "Binding…" : "Bind to policy"}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function QuotationCard({
  quotation, isRecommended, canAct, saving, onSelect, onReject, onRequestClarification,
}: {
  quotation: Quotation;
  isRecommended: boolean;
  canAct: boolean;
  saving: boolean;
  onSelect: () => void;
  onReject: () => void;
  onRequestClarification: () => void;
}) {
  const q = quotation;
  const declined = q.status === "declined";
  return (
    <div className={`flex flex-col rounded-lg border bg-white p-4 ${isRecommended ? "border-emerald-300 ring-1 ring-emerald-200" : declined ? "border-slate-200 opacity-60" : "border-slate-200"}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-slate-900">{q.insurerName}</p>
        {isRecommended ? (
          <span className="flex items-center gap-1 text-xs font-medium text-emerald-600"><Award size={13} /> Recommended</span>
        ) : (
          <StatusPill status={q.status} tone={declined ? "critical" : q.status === "accepted" ? "good" : "neutral"} />
        )}
      </div>

      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex justify-between"><dt className="text-slate-500">Sum insured</dt><dd className="tabular-nums text-slate-700">KES {(q.sumInsuredKes || 0).toLocaleString()}</dd></div>
        <div className="flex justify-between"><dt className="text-slate-500">Base premium</dt><dd className="tabular-nums text-slate-700">KES {(q.basePremiumKes || 0).toLocaleString()}</dd></div>
        <div className="flex justify-between"><dt className="text-slate-500">Levies (PCF+ITL+duty)</dt><dd className="tabular-nums text-slate-500">KES {((q.pcfLevyKes || 0) + (q.itlLevyKes || 0) + (q.stampDutyKes || 0)).toLocaleString()}</dd></div>
        <div className="flex justify-between border-t border-slate-100 pt-1.5 font-medium"><dt className="text-slate-700">Total premium</dt><dd className="tabular-nums text-slate-900">KES {(q.totalPremiumKes || 0).toLocaleString()}</dd></div>
        <div className="flex justify-between"><dt className="text-slate-500">Commission</dt><dd className="tabular-nums text-slate-700">{q.commissionRatePct != null ? `${q.commissionRatePct}%` : "—"}</dd></div>
      </dl>

      {(q.exclusions?.length || q.warranties?.length || q.extensions?.length || q.conditions || q.paymentTerms || q.specialTerms) ? (
        <div className="mt-3 space-y-1 border-t border-slate-100 pt-2 text-xs text-slate-500">
          {!!q.warranties?.length && <p><span className="font-medium text-slate-600">Warranties:</span> {q.warranties.join("; ")}</p>}
          {!!q.exclusions?.length && <p><span className="font-medium text-slate-600">Exclusions:</span> {q.exclusions.join("; ")}</p>}
          {!!q.extensions?.length && <p><span className="font-medium text-slate-600">Extensions:</span> {q.extensions.join("; ")}</p>}
          {q.paymentTerms && <p><span className="font-medium text-slate-600">Payment terms:</span> {q.paymentTerms}</p>}
          {q.conditions && <p><span className="font-medium text-slate-600">Conditions:</span> {q.conditions}</p>}
          {q.specialTerms && <p><span className="font-medium text-slate-600">Special terms:</span> {q.specialTerms}</p>}
        </div>
      ) : null}

      {canAct && (
        <div className="mt-4 flex gap-1.5 border-t border-slate-100 pt-3">
          <button onClick={onSelect} disabled={saving} className="flex flex-1 items-center justify-center gap-1 rounded-md bg-emerald-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            <Check size={13} /> Select
          </button>
          <button onClick={onReject} disabled={saving} className="flex items-center justify-center gap-1 rounded-md border border-rose-200 px-2 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50" title="Reject">
            <X size={13} />
          </button>
          <button onClick={onRequestClarification} disabled={saving} className="flex items-center justify-center gap-1 rounded-md border border-slate-300 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50" title="Request clarification">
            <MessageCircleQuestion size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

function InsurerPicker({ insurers, appetite, riskClass, disabled, onSubmit }: { insurers: Insurer[]; appetite: InsurerAppetite[]; riskClass: string; disabled: boolean; onSubmit: (markets: string[], singleSourceJustification?: string) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [justification, setJustification] = useState("");
  // Only insurers actually IRA-licensed for this risk's class can be a
  // market — a broker can't lawfully submit a Motor risk to a
  // life-only insurer, so this isn't just a UX nicety. Business risk
  // appetite (SOP-07) is a second, separate filter on top of that
  // licence check: 'excluded' insurers never appear as an option at
  // all, even if licensed.
  const appetiteFor = (insurerId: string) => appetite.find((a) => a.insurerId === insurerId && a.classCode === riskClass);
  const eligible = insurers.filter((i) => i.authorizedClasses?.includes(riskClass) && appetiteFor(i.id)?.appetiteLevel !== "excluded");
  const ineligibleCount = insurers.length - eligible.length;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm font-medium text-slate-700">No market submission yet — pick which insurers to submit this risk to.</p>
      <p className="mt-1 text-xs text-slate-400">Showing insurers licensed for {className(riskClass)}{ineligibleCount > 0 ? ` — ${ineligibleCount} not shown, not authorized or excluded from this class's appetite` : ""}.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {eligible.map((i) => {
          const level = appetiteFor(i.id)?.appetiteLevel;
          return (
            <label key={i.id} className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs ${level === "restricted" ? "border-amber-300 bg-amber-50 text-amber-800" : level === "preferred" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-300 text-slate-700"}`}>
              <input type="checkbox" checked={selected.includes(i.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, i.id] : selected.filter((id) => id !== i.id))} />
              {i.name}
              {level === "restricted" && " (restricted)"}
              {level === "preferred" && " (preferred)"}
            </label>
          );
        })}
        {eligible.length === 0 && <p className="text-sm text-slate-400">No insurers on the panel are licensed (or not excluded by appetite) for {className(riskClass)} yet — add one under Underwriting → Insurer panel.</p>}
      </div>
      {selected.length === 1 && (
        <input required placeholder="Justification for single-market placement (SOP-07)" className="mt-3 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={justification} onChange={(e) => setJustification(e.target.value)} />
      )}
      <button
        onClick={() => onSubmit(selected, selected.length === 1 ? justification : undefined)}
        disabled={disabled || selected.length === 0 || (selected.length === 1 && !justification)}
        className="mt-3 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
      >
        Create submission
      </button>
    </div>
  );
}
