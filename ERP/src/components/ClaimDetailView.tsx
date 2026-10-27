import { useEffect, useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { api } from "../api";
import { CLAIM_STAGES, RESERVE_PAYMENT_CODES, type Claim, type Policy, type Party, type ClaimChecklistItem, type ClaimDiaryEntry, type ClaimReserveLine, type ClaimPaymentLine, type CoverageVerificationItem } from "../types";
import StatusPill from "./StatusPill";

const RESERVE_CODE_LABEL: Record<string, string> = {
  indemnity: "Indemnity",
  legal_fees: "Legal fees",
  loss_adjuster_fees: "Loss adjuster fees",
  medical_expenses: "Medical expenses",
  investigation_fees: "Investigation fees",
  salvage_recovery_cost: "Salvage recovery cost",
  other: "Other",
};

type Tab = "summary" | "coverage" | "checklist" | "diary" | "settlement" | "history";

const TABS: { id: Tab; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "coverage", label: "Coverage Check" },
  { id: "checklist", label: "Documents Checklist" },
  { id: "diary", label: "Diary" },
  { id: "settlement", label: "Settlement" },
  { id: "history", label: "History" },
];

const EMPTY_SETTLEMENT_FORM = { excessKes: "", salvageKes: "", priorPaymentsKes: "", settlementReason: "" };

export default function ClaimDetailView({ claimId, onBack }: { claimId: string; onBack: () => void }) {
  const [claim, setClaim] = useState<Claim | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [checklist, setChecklist] = useState<ClaimChecklistItem[]>([]);
  const [coverageItems, setCoverageItems] = useState<CoverageVerificationItem[]>([]);
  const [diary, setDiary] = useState<ClaimDiaryEntry[]>([]);
  const [reserveLines, setReserveLines] = useState<ClaimReserveLine[]>([]);
  const [paymentLines, setPaymentLines] = useState<ClaimPaymentLine[]>([]);
  const [tab, setTab] = useState<Tab>("summary");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showChecklistForm, setShowChecklistForm] = useState(false);
  const [documentType, setDocumentType] = useState("");
  const [showDiaryForm, setShowDiaryForm] = useState(false);
  const [diaryNote, setDiaryNote] = useState("");
  const [diaryCommitment, setDiaryCommitment] = useState("");
  const [settlementForm, setSettlementForm] = useState(EMPTY_SETTLEMENT_FORM);
  const [showReopenForm, setShowReopenForm] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [reserveLineForm, setReserveLineForm] = useState({ reserveCode: "indemnity", amountKes: "", notes: "" });
  const [paymentLineForm, setPaymentLineForm] = useState({ paymentCode: "indemnity", amountKes: "", paymentReference: "", notes: "" });

  function load() {
    setLoading(true);
    Promise.all([
      api.claims.get(claimId),
      api.policies.list(),
      api.parties.list(),
      api.claimChecklistItems.list(claimId),
      api.claimDiary.list(claimId),
      api.claimReserveLines.list(claimId),
      api.claimPaymentLines.list(claimId),
      api.coverageVerification.list(claimId),
    ])
      .then(([c, pols, parties, items, entries, reserves, payments, coverage]) => {
        setClaim(c);
        setPolicies(pols);
        setParties(parties);
        setChecklist(items);
        setDiary(entries);
        setReserveLines(reserves);
        setPaymentLines(payments);
        setCoverageItems(coverage);
        setSettlementForm({
          excessKes: c.excessKes != null ? String(c.excessKes) : "",
          salvageKes: c.salvageKes != null ? String(c.salvageKes) : "",
          priorPaymentsKes: c.priorPaymentsKes != null ? String(c.priorPaymentsKes) : "",
          settlementReason: c.settlementReason || "",
        });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [claimId]);

  async function handleAddChecklistItem(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.claimChecklistItems.create({ claimId, documentType });
      setDocumentType("");
      setShowChecklistForm(false);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleChecklistStatus(id: string, status: ClaimChecklistItem["status"]) {
    setSaving(true);
    try {
      await api.claimChecklistItems.update(id, { status });
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleStartCoverageCheck() {
    setSaving(true);
    try {
      const items = await api.coverageVerification.start(claimId);
      setCoverageItems(items);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCoverageStatus(id: string, status: CoverageVerificationItem["status"], notes?: string) {
    setSaving(true);
    try {
      const updated = await api.coverageVerification.update(id, { status, notes });
      setCoverageItems((prev) => prev.map((c) => (c.id === id ? updated : c)));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddDiaryEntry(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.claimDiary.create({ claimId, note: diaryNote, commitmentDueAt: diaryCommitment || undefined });
      setDiaryNote("");
      setDiaryCommitment("");
      setShowDiaryForm(false);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveSettlement(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.claims.update(claimId, {
        excessKes: settlementForm.excessKes ? Number(settlementForm.excessKes) : undefined,
        salvageKes: settlementForm.salvageKes ? Number(settlementForm.salvageKes) : undefined,
        priorPaymentsKes: settlementForm.priorPaymentsKes ? Number(settlementForm.priorPaymentsKes) : undefined,
        settlementReason: settlementForm.settlementReason || undefined,
      });
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handlePriorityChange(priority: Claim["priority"]) {
    setSaving(true);
    try {
      await api.claims.update(claimId, { priority });
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddReserveLine(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.claimReserveLines.create({ claimId, reserveCode: reserveLineForm.reserveCode, amountKes: Number(reserveLineForm.amountKes), notes: reserveLineForm.notes || undefined });
      setReserveLineForm({ reserveCode: "indemnity", amountKes: "", notes: "" });
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddPaymentLine(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.claimPaymentLines.create({
        claimId,
        paymentCode: paymentLineForm.paymentCode,
        amountKes: Number(paymentLineForm.amountKes),
        paymentReference: paymentLineForm.paymentReference || undefined,
        notes: paymentLineForm.notes || undefined,
      });
      setPaymentLineForm({ paymentCode: "indemnity", amountKes: "", paymentReference: "", notes: "" });
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleManagerReview() {
    setSaving(true);
    setError(null);
    try {
      await api.claims.managerReview(claimId);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleClose() {
    setSaving(true);
    setError(null);
    try {
      await api.claims.update(claimId, { status: "Closed" });
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleReopen(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.claims.reopen(claimId, reopenReason);
      setReopenReason("");
      setShowReopenForm(false);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading claim…</p>;
  if (!claim) return <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error || "Claim not found."}</div>;

  const policy = policies.find((p) => p.id === claim.policyId);
  const clientName = policy ? parties.find((p) => p.id === policy.clientId)?.fullName : null;

  const now = Date.now();
  const latestDiaryEntry = diary[0];
  const isStale = latestDiaryEntry?.commitmentDueAt ? new Date(latestDiaryEntry.commitmentDueAt).getTime() < now : false;

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ArrowLeft size={15} /> Back to Claims
      </button>

      {error && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-mono text-xl font-semibold text-slate-900">{claim.id}</h2>
            <p className="mt-0.5 text-sm text-slate-500">{claim.claimType} {clientName ? `· ${clientName}` : ""}</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={claim.priority}
              onChange={(e) => handlePriorityChange(e.target.value as Claim["priority"])}
              disabled={saving}
              className={`rounded-full border-0 px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                claim.priority === "red" ? "bg-rose-50 text-rose-700 ring-rose-600/20" : claim.priority === "amber" ? "bg-amber-50 text-amber-700 ring-amber-600/20" : "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
              }`}
              title="Priority"
            >
              <option value="green">Green</option>
              <option value="amber">Amber</option>
              <option value="red">Red</option>
            </select>
            <StatusPill status={claim.status} />
            {claim.requiresManagerReview && (
              <StatusPill status={claim.managerReviewedAt ? "Reviewed" : "Needs manager review"} tone={claim.managerReviewedAt ? "good" : "critical"} />
            )}
            {isStale && <StatusPill status="Overdue update" tone="critical" />}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 text-sm sm:grid-cols-4">
          <div><p className="text-xs uppercase tracking-wide text-slate-400">Policy</p><p className="font-mono text-xs text-slate-700">{claim.policyNumber}</p></div>
          <div><p className="text-xs uppercase tracking-wide text-slate-400">Reserve</p><p className="text-slate-700">{claim.reserveAmountKes ? `KES ${Number(claim.reserveAmountKes).toLocaleString()}` : "—"}</p></div>
          <div><p className="text-xs uppercase tracking-wide text-slate-400">Paid</p><p className="text-slate-700">{claim.paidAmountKes ? `KES ${Number(claim.paidAmountKes).toLocaleString()}` : "—"}</p></div>
          <div><p className="text-xs uppercase tracking-wide text-slate-400">Loss date</p><p className="text-slate-700">{claim.lossDate || "—"}</p></div>
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
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <Row label="Status" value={<StatusPill status={claim.status} />} />
            <Row label="Assigned officer" value={claim.assignedOfficerId || "—"} />
            <Row label="Reported" value={new Date(claim.reportedDate).toLocaleString()} />
            <Row label="Closed" value={claim.closedDate ? new Date(claim.closedDate).toLocaleString() : "—"} />
            <Row label="Fraud flag" value={claim.fraudFlag ? <StatusPill status="Flagged" tone="critical" /> : "No"} />
            <Row label="Description" value={claim.description || "—"} />
          </dl>
        </div>
      )}

      {tab === "coverage" && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">The policy itself, checked before the claim ever goes to the insurer — distinct from the documents checklist, which is the paperwork supporting it.</p>
          {coverageItems.length === 0 ? (
            <button onClick={handleStartCoverageCheck} disabled={saving} className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
              <Plus size={15} /> Start coverage check
            </button>
          ) : (
            <>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                {(() => {
                  const failCount = coverageItems.filter((c) => c.status === "fail").length;
                  const pendingCount = coverageItems.filter((c) => c.status === "pending").length;
                  const ready = failCount === 0 && pendingCount === 0;
                  return <StatusPill status={ready ? "Ready for submission" : failCount > 0 ? "Information required" : `${pendingCount} item(s) pending`} tone={ready ? "good" : failCount > 0 ? "critical" : "warning"} />;
                })()}
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th scope="col" className="px-4 py-2.5 font-medium">Check</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Notes</th>
                      <th scope="col" className="px-4 py-2.5 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {coverageItems.map((c) => (
                      <tr key={c.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-2.5 text-slate-700">{c.checkItem}</td>
                        <td className="px-4 py-2.5"><StatusPill status={c.status === "pass" ? "Yes" : c.status === "fail" ? "No" : "Pending"} tone={c.status === "pass" ? "good" : c.status === "fail" ? "critical" : "neutral"} /></td>
                        <td className="px-4 py-2.5 text-xs text-slate-500">{c.notes || "—"}</td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button onClick={() => handleCoverageStatus(c.id, "pass")} disabled={saving} className="text-xs font-medium text-emerald-600 hover:underline disabled:opacity-50">Yes</button>
                            <button onClick={() => handleCoverageStatus(c.id, "fail", c.notes || undefined)} disabled={saving} className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-50">No</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "checklist" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={() => setShowChecklistForm((v) => !v)} className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
              <Plus size={15} /> Request document
            </button>
          </div>
          {showChecklistForm && (
            <form onSubmit={handleAddChecklistItem} className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-4">
              <input required placeholder="Document type (e.g. Police abstract, repair quote)" className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={documentType} onChange={(e) => setDocumentType(e.target.value)} />
              <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">Request</button>
            </form>
          )}
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th scope="col" className="px-4 py-2.5 font-medium">Document</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Requested</th>
                  <th scope="col" className="px-4 py-2.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {checklist.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">No documents requested yet.</td></tr>
                ) : (
                  checklist.map((c) => (
                    <tr key={c.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-2.5 text-slate-700">{c.documentType}</td>
                      <td className="px-4 py-2.5"><StatusPill status={c.status} tone={c.status === "reviewed" ? "good" : c.status === "waived" ? "neutral" : c.status === "received" ? "warning" : "critical"} /></td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{new Date(c.requestedAt).toLocaleDateString()}</td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex justify-end gap-1.5">
                          {c.status === "requested" && <button onClick={() => handleChecklistStatus(c.id, "received")} disabled={saving} className="text-xs font-medium text-indigo-600 hover:underline disabled:opacity-50">Mark received</button>}
                          {c.status === "received" && <button onClick={() => handleChecklistStatus(c.id, "reviewed")} disabled={saving} className="text-xs font-medium text-indigo-600 hover:underline disabled:opacity-50">Mark reviewed</button>}
                          {c.status !== "waived" && c.status !== "reviewed" && <button onClick={() => handleChecklistStatus(c.id, "waived")} disabled={saving} className="text-xs font-medium text-slate-500 hover:underline disabled:opacity-50">Waive</button>}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "diary" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={() => setShowDiaryForm((v) => !v)} className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
              <Plus size={15} /> Add diary entry
            </button>
          </div>
          {showDiaryForm && (
            <form onSubmit={handleAddDiaryEntry} className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
              <textarea required placeholder="Update, commitment or follow-up note" className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={diaryNote} onChange={(e) => setDiaryNote(e.target.value)} />
              <div className="flex items-end gap-2">
                <div>
                  <label className="text-xs text-slate-500">Next update due (optional)</label>
                  <input type="date" className="block rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={diaryCommitment} onChange={(e) => setDiaryCommitment(e.target.value)} />
                </div>
                <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">Save entry</button>
              </div>
            </form>
          )}
          {diary.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-400">No diary entries yet — every update, even "no movement," belongs here (SOP-15).</p>
          ) : (
            <ul className="space-y-2">
              {diary.map((d) => {
                const overdue = d.commitmentDueAt ? new Date(d.commitmentDueAt).getTime() < now : false;
                return (
                  <li key={d.id} className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-slate-500">{new Date(d.createdAt).toLocaleString()} · {d.staffId || "—"}</p>
                      {d.commitmentDueAt && <StatusPill status={overdue ? `Update overdue (was due ${new Date(d.commitmentDueAt).toLocaleDateString()})` : `Next update ${new Date(d.commitmentDueAt).toLocaleDateString()}`} tone={overdue ? "critical" : "neutral"} />}
                    </div>
                    <p className="mt-1.5 text-sm text-slate-700">{d.note}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {tab === "settlement" && (
        <div className="space-y-4">
          <form onSubmit={handleSaveSettlement} className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-4">
            <p className="col-span-2 text-sm font-semibold text-slate-900 sm:col-span-4">Settlement breakdown</p>
            <input placeholder="Excess (KES)" type="number" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={settlementForm.excessKes} onChange={(e) => setSettlementForm({ ...settlementForm, excessKes: e.target.value })} />
            <input placeholder="Salvage (KES)" type="number" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={settlementForm.salvageKes} onChange={(e) => setSettlementForm({ ...settlementForm, salvageKes: e.target.value })} />
            <input placeholder="Prior payments (KES)" type="number" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={settlementForm.priorPaymentsKes} onChange={(e) => setSettlementForm({ ...settlementForm, priorPaymentsKes: e.target.value })} />
            <input placeholder="Settlement/repudiation reason" className="col-span-2 rounded-md border border-slate-300 px-3 py-1.5 text-sm sm:col-span-4" value={settlementForm.settlementReason} onChange={(e) => setSettlementForm({ ...settlementForm, settlementReason: e.target.value })} />
            <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
              {saving ? "Saving…" : "Save settlement details"}
            </button>
          </form>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="mb-1 text-sm font-semibold text-slate-900">Reserve breakdown</p>
              <p className="mb-3 text-xs text-slate-400">What the reserve total is for — should reconcile with the reserve amount above, not enforced automatically.</p>
              <form onSubmit={handleAddReserveLine} className="mb-3 flex flex-wrap items-end gap-2">
                <select className="rounded-md border border-slate-300 px-2 py-1.5 text-xs" value={reserveLineForm.reserveCode} onChange={(e) => setReserveLineForm({ ...reserveLineForm, reserveCode: e.target.value })}>
                  {RESERVE_PAYMENT_CODES.map((c) => <option key={c} value={c}>{RESERVE_CODE_LABEL[c]}</option>)}
                </select>
                <input required placeholder="Amount (KES)" type="number" className="w-32 rounded-md border border-slate-300 px-2 py-1.5 text-xs" value={reserveLineForm.amountKes} onChange={(e) => setReserveLineForm({ ...reserveLineForm, amountKes: e.target.value })} />
                <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50">Add</button>
              </form>
              <ul className="space-y-1.5 text-sm">
                {reserveLines.length === 0 ? (
                  <p className="text-sm text-slate-400">No reserve lines recorded yet.</p>
                ) : (
                  reserveLines.map((r) => (
                    <li key={r.id} className="flex justify-between border-b border-slate-100 pb-1.5 last:border-0">
                      <span className="text-slate-600">{RESERVE_CODE_LABEL[r.reserveCode] || r.reserveCode}</span>
                      <span className="tabular-nums text-slate-900">KES {Number(r.amountKes).toLocaleString()}</span>
                    </li>
                  ))
                )}
                {reserveLines.length > 0 && (
                  <li className="flex justify-between border-t border-slate-200 pt-1.5 font-medium">
                    <span>Total</span>
                    <span className="tabular-nums">KES {reserveLines.reduce((sum, r) => sum + Number(r.amountKes), 0).toLocaleString()}</span>
                  </li>
                )}
              </ul>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="mb-1 text-sm font-semibold text-slate-900">Payment breakdown</p>
              <p className="mb-3 text-xs text-slate-400">What the paid total is for — should reconcile with the paid amount above, not enforced automatically.</p>
              <form onSubmit={handleAddPaymentLine} className="mb-3 flex flex-wrap items-end gap-2">
                <select className="rounded-md border border-slate-300 px-2 py-1.5 text-xs" value={paymentLineForm.paymentCode} onChange={(e) => setPaymentLineForm({ ...paymentLineForm, paymentCode: e.target.value })}>
                  {RESERVE_PAYMENT_CODES.map((c) => <option key={c} value={c}>{RESERVE_CODE_LABEL[c]}</option>)}
                </select>
                <input required placeholder="Amount (KES)" type="number" className="w-28 rounded-md border border-slate-300 px-2 py-1.5 text-xs" value={paymentLineForm.amountKes} onChange={(e) => setPaymentLineForm({ ...paymentLineForm, amountKes: e.target.value })} />
                <input placeholder="Reference" className="w-28 rounded-md border border-slate-300 px-2 py-1.5 text-xs" value={paymentLineForm.paymentReference} onChange={(e) => setPaymentLineForm({ ...paymentLineForm, paymentReference: e.target.value })} />
                <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50">Add</button>
              </form>
              <ul className="space-y-1.5 text-sm">
                {paymentLines.length === 0 ? (
                  <p className="text-sm text-slate-400">No payment lines recorded yet.</p>
                ) : (
                  paymentLines.map((p) => (
                    <li key={p.id} className="flex justify-between border-b border-slate-100 pb-1.5 last:border-0">
                      <span className="text-slate-600">{RESERVE_CODE_LABEL[p.paymentCode] || p.paymentCode}{p.paymentReference ? ` · ${p.paymentReference}` : ""}</span>
                      <span className="tabular-nums text-slate-900">KES {Number(p.amountKes).toLocaleString()}</span>
                    </li>
                  ))
                )}
                {paymentLines.length > 0 && (
                  <li className="flex justify-between border-t border-slate-200 pt-1.5 font-medium">
                    <span>Total</span>
                    <span className="tabular-nums">KES {paymentLines.reduce((sum, p) => sum + Number(p.amountKes), 0).toLocaleString()}</span>
                  </li>
                )}
              </ul>
            </div>
          </div>

          {claim.requiresManagerReview && (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="mb-2 text-sm font-semibold text-slate-900">Manager review</p>
              <p className="mb-3 text-xs text-slate-500">This claim was repudiated or the payment is a material partial of the reserve — SOP-16 requires manager sign-off before it can be closed.</p>
              {claim.managerReviewedAt ? (
                <StatusPill status={`Reviewed by ${claim.managerReviewedBy} on ${new Date(claim.managerReviewedAt).toLocaleDateString()}`} tone="good" />
              ) : (
                <button onClick={handleManagerReview} disabled={saving} className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                  {saving ? "Recording…" : "Record manager review"}
                </button>
              )}
            </div>
          )}

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="mb-2 text-sm font-semibold text-slate-900">Closure</p>
            {claim.status === "Closed" ? (
              <div className="space-y-2">
                <p className="text-sm text-slate-600">Closed {claim.closedDate ? new Date(claim.closedDate).toLocaleString() : ""}. {claim.reopenedCount > 0 && `Reopened ${claim.reopenedCount} time${claim.reopenedCount === 1 ? "" : "s"} previously.`}</p>
                {!showReopenForm ? (
                  <button onClick={() => setShowReopenForm(true)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Reopen claim</button>
                ) : (
                  <form onSubmit={handleReopen} className="flex flex-wrap items-end gap-2">
                    <input required placeholder="Reason for reopening" className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} />
                    <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">Reopen</button>
                  </form>
                )}
              </div>
            ) : (
              <div>
                <button onClick={handleClose} disabled={saving} className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                  {saving ? "Closing…" : "Close claim"}
                </button>
                <p className="mt-2 text-xs text-slate-400">Blocked without a settlement reason, and without manager review if this claim required it.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "history" && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Detail</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {!claim.timeline || claim.timeline.length === 0 ? (
                <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-400">No status changes recorded yet.</td></tr>
              ) : (
                [...claim.timeline].sort((a, b) => b.sortOrder - a.sortOrder).map((step) => (
                  <tr key={step.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2.5"><StatusPill status={step.status} /></td>
                    <td className="px-4 py-2.5 text-slate-700">{step.detail || "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">{step.eventDate ? new Date(step.eventDate).toLocaleString() : "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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
