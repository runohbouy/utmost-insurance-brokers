import { Fragment, useEffect, useState } from "react";
import { Plus, RefreshCw, Lock, Undo2 } from "lucide-react";
import { api } from "../api";
import type { FinancialTransaction, Insurer, Policy, Party, CommissionStatement, CommissionLine, Payment, PremiumAgeing, PettyCashFloat, PettyCashTransaction, OfficeExpense, GlAccount, AccountingPeriod, JournalEntry, TrialBalance, IncomeStatement, BalanceSheet } from "../types";
import { OFFICE_EXPENSE_CATEGORIES } from "../types";
import StatusPill from "./StatusPill";
import SearchInput, { matchesQuery } from "./SearchInput";
import Pagination, { usePagedSlice } from "./Pagination";

const EMPTY_STATEMENT_FORM = { insurerId: "", periodStart: "", periodEnd: "", totalCommissionKes: "" };
const EMPTY_LINE_FORM = { policyId: "", commissionRatePct: "", commissionAmountKes: "" };
const EMPTY_PAYMENT_FORM = { partyId: "", totalAmountKes: "", method: "mpesa", paymentReference: "" };
const EMPTY_ALLOCATION_FORM = { policyId: "", confirmedAmountKes: "" };
const EMPTY_CLAWBACK_FORM = { policyId: "", amountKes: "", reason: "" };
const EMPTY_FLOAT_FORM = { custodianStaffId: "", openingBalanceKes: "" };
const EMPTY_PETTY_TXN_FORM = { transactionType: "disbursement", amountKes: "", purpose: "" };
const EMPTY_EXPENSE_FORM = { category: "rent", description: "", amountKes: "", vendor: "", paymentMethod: "bank", incurredAt: new Date().toISOString().slice(0, 10) };
const EMPTY_ACCOUNT_FORM = { code: "", name: "", accountType: "expense", normalBalance: "debit", parentAccountCode: "" };
const EMPTY_PERIOD_FORM = { id: new Date().toISOString().slice(0, 7), startDate: "", endDate: "" };
const EMPTY_JOURNAL_FORM = { entryDate: new Date().toISOString().slice(0, 10), description: "", reference: "" };
const EMPTY_JOURNAL_LINE = { accountCode: "", side: "debit" as "debit" | "credit", amountKes: "" };

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "commission", label: "Commission" },
  { id: "payments", label: "Payments" },
  { id: "ageing", label: "Premium ageing" },
  { id: "internal", label: "Internal finance" },
  { id: "gl", label: "General ledger" },
] as const;

export default function FinanceView() {
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [insurers, setInsurers] = useState<Insurer[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [statements, setStatements] = useState<CommissionStatement[]>([]);
  const [linesByStatement, setLinesByStatement] = useState<Record<string, CommissionLine[]>>({});
  const [payments, setPayments] = useState<Payment[]>([]);
  const [ageing, setAgeing] = useState<PremiumAgeing | null>(null);
  const [floats, setFloats] = useState<PettyCashFloat[]>([]);
  const [pettyTxns, setPettyTxns] = useState<PettyCashTransaction[]>([]);
  const [expenses, setExpenses] = useState<OfficeExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showStatementForm, setShowStatementForm] = useState(false);
  const [statementForm, setStatementForm] = useState(EMPTY_STATEMENT_FORM);
  const [expandedStatementId, setExpandedStatementId] = useState<string | null>(null);
  const [lineForm, setLineForm] = useState(EMPTY_LINE_FORM);
  const [reconcileResult, setReconcileResult] = useState<Record<string, { matchedCount: number; discrepancyCount: number; unresolvedCount: number }>>({});

  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentForm, setPaymentForm] = useState(EMPTY_PAYMENT_FORM);
  const [expandedPaymentId, setExpandedPaymentId] = useState<string | null>(null);
  const [allocationForm, setAllocationForm] = useState(EMPTY_ALLOCATION_FORM);
  const [showClawbackForm, setShowClawbackForm] = useState(false);
  const [clawbackForm, setClawbackForm] = useState(EMPTY_CLAWBACK_FORM);
  const [showFloatForm, setShowFloatForm] = useState(false);
  const [floatForm, setFloatForm] = useState(EMPTY_FLOAT_FORM);
  const [expandedFloatId, setExpandedFloatId] = useState<string | null>(null);
  const [pettyTxnForm, setPettyTxnForm] = useState(EMPTY_PETTY_TXN_FORM);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseForm, setExpenseForm] = useState(EMPTY_EXPENSE_FORM);
  const [tab, setTab] = useState<typeof TABS[number]["id"]>("overview");
  const [txnQuery, setTxnQuery] = useState("");
  const [statementQuery, setStatementQuery] = useState("");
  const [paymentQuery, setPaymentQuery] = useState("");
  const [expenseQuery, setExpenseQuery] = useState("");
  const [journalQuery, setJournalQuery] = useState("");
  const [ageingQuery, setAgeingQuery] = useState("");
  const [floatQuery, setFloatQuery] = useState("");
  const [trialBalanceQuery, setTrialBalanceQuery] = useState("");
  const [accountQuery, setAccountQuery] = useState("");

  const [txnPage, setTxnPage] = useState(0);
  const [statementPage, setStatementPage] = useState(0);
  const [paymentPage, setPaymentPage] = useState(0);
  const [expensePage, setExpensePage] = useState(0);
  const [journalPage, setJournalPage] = useState(0);
  const [ageingPage, setAgeingPage] = useState(0);
  const [floatPage, setFloatPage] = useState(0);
  const [trialBalancePage, setTrialBalancePage] = useState(0);
  const [accountPage, setAccountPage] = useState(0);

  const [glAccountsList, setGlAccountsList] = useState<GlAccount[]>([]);
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState(new Date().toISOString().slice(0, 7));
  const [journalEntriesList, setJournalEntriesList] = useState<JournalEntry[]>([]);
  const [trialBalance, setTrialBalance] = useState<TrialBalance | null>(null);
  const [incomeStatement, setIncomeStatement] = useState<IncomeStatement | null>(null);
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheet | null>(null);
  const [glReport, setGlReport] = useState<"trial_balance" | "income_statement" | "balance_sheet">("trial_balance");
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [accountForm, setAccountForm] = useState(EMPTY_ACCOUNT_FORM);
  const [showPeriodForm, setShowPeriodForm] = useState(false);
  const [periodForm, setPeriodForm] = useState(EMPTY_PERIOD_FORM);
  const [showJournalForm, setShowJournalForm] = useState(false);
  const [journalForm, setJournalForm] = useState(EMPTY_JOURNAL_FORM);
  const [journalLinesForm, setJournalLinesForm] = useState([{ ...EMPTY_JOURNAL_LINE, side: "debit" as const }, { ...EMPTY_JOURNAL_LINE, side: "credit" as const }]);
  const [initialLoadFailed, setInitialLoadFailed] = useState(false);

  function load() {
    setLoading(true);
    setInitialLoadFailed(false);
    Promise.all([
      api.financialTransactions.list(), api.insurers.list(), api.policies.list(), api.parties.list(), api.commissionStatements.list(),
      api.payments.list(), api.premiumAgeing.get(), api.pettyCashFloats.list(), api.pettyCashTransactions.list(), api.officeExpenses.list(),
      api.glAccounts.list(), api.accountingPeriods.list(),
    ])
      .then(([t, ins, pol, par, stmts, pay, age, flts, ptxns, exp, accts, prds]) => {
        setTransactions(t); setInsurers(ins); setPolicies(pol); setParties(par); setStatements(stmts);
        setPayments(pay); setAgeing(age); setFloats(flts); setPettyTxns(ptxns); setExpenses(exp);
        setGlAccountsList(accts); setPeriods(prds);
      })
      .catch((err) => { setError(err.message); setInitialLoadFailed(true); })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function loadGlReports(periodId: string) {
    Promise.all([api.journalEntries.list(periodId), api.gl.trialBalance(periodId), api.gl.incomeStatement(periodId)])
      .then(([entries, tb, is]) => { setJournalEntriesList(entries); setTrialBalance(tb); setIncomeStatement(is); })
      .catch((err) => setError(err.message));
    const period = periods.find((p) => p.id === periodId);
    api.gl.balanceSheet(period?.endDate).then(setBalanceSheet).catch((err) => setError(err.message));
  }

  useEffect(() => {
    if (tab === "gl") loadGlReports(selectedPeriodId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selectedPeriodId, periods]);

  async function loadLines(statementId: string) {
    const lines = await api.commissionLines.list(statementId);
    setLinesByStatement((prev) => ({ ...prev, [statementId]: lines }));
  }

  function toggleExpand(statementId: string) {
    if (expandedStatementId === statementId) {
      setExpandedStatementId(null);
      return;
    }
    setExpandedStatementId(statementId);
    if (!linesByStatement[statementId]) loadLines(statementId);
  }

  async function handleCreateStatement(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.commissionStatements.create({
        insurerId: statementForm.insurerId,
        periodStart: statementForm.periodStart,
        periodEnd: statementForm.periodEnd,
        totalCommissionKes: statementForm.totalCommissionKes ? Number(statementForm.totalCommissionKes) : undefined,
      });
      setStatementForm(EMPTY_STATEMENT_FORM);
      setShowStatementForm(false);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddLine(e: React.FormEvent, statementId: string) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.commissionLines.create({
        statementId,
        policyId: lineForm.policyId || undefined,
        commissionRatePct: lineForm.commissionRatePct ? Number(lineForm.commissionRatePct) : undefined,
        commissionAmountKes: lineForm.commissionAmountKes ? Number(lineForm.commissionAmountKes) : undefined,
      });
      setLineForm(EMPTY_LINE_FORM);
      await loadLines(statementId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleReconcile(statementId: string) {
    setSaving(true);
    try {
      const result = await api.commissionStatements.reconcile(statementId);
      setReconcileResult((prev) => ({ ...prev, [statementId]: result }));
      setStatements((prev) => prev.map((s) => (s.id === statementId ? result.statement : s)));
      await loadLines(statementId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreatePayment(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await api.payments.create({
        partyId: paymentForm.partyId,
        totalAmountKes: Number(paymentForm.totalAmountKes),
        method: paymentForm.method,
        paymentReference: paymentForm.paymentReference || undefined,
      });
      setPaymentForm(EMPTY_PAYMENT_FORM);
      setShowPaymentForm(false);
      setPayments((prev) => [{ ...created, allocatedKes: 0, unallocatedKes: created.totalAmountKes }, ...prev]);
      setExpandedPaymentId(created.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleExpandPayment(paymentId: string) {
    if (expandedPaymentId === paymentId) {
      setExpandedPaymentId(null);
      return;
    }
    setExpandedPaymentId(paymentId);
    try {
      const detail = await api.payments.get(paymentId);
      setPayments((prev) => prev.map((p) => (p.id === paymentId ? detail : p)));
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleAllocate(e: React.FormEvent, paymentId: string) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.payments.allocate(paymentId, {
        policyId: allocationForm.policyId,
        confirmedAmountKes: Number(allocationForm.confirmedAmountKes),
      });
      setAllocationForm(EMPTY_ALLOCATION_FORM);
      const [detail, pols, age, txns] = await Promise.all([api.payments.get(paymentId), api.policies.list(), api.premiumAgeing.get(), api.financialTransactions.list()]);
      setPayments((prev) => prev.map((p) => (p.id === paymentId ? detail : p)));
      setPolicies(pols);
      setAgeing(age);
      setTransactions(txns);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleClawback(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.commissionClawbacks.create({
        policyId: clawbackForm.policyId,
        amountKes: Number(clawbackForm.amountKes),
        reason: clawbackForm.reason,
      });
      setClawbackForm(EMPTY_CLAWBACK_FORM);
      setShowClawbackForm(false);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateFloat(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await api.pettyCashFloats.create({
        custodianStaffId: floatForm.custodianStaffId || undefined,
        openingBalanceKes: Number(floatForm.openingBalanceKes) || 0,
      });
      setFloats((prev) => [created, ...prev]);
      setFloatForm(EMPTY_FLOAT_FORM);
      setShowFloatForm(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handlePettyTxn(e: React.FormEvent, floatId: string) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.pettyCashTransactions.create({
        floatId,
        transactionType: pettyTxnForm.transactionType as "replenishment" | "disbursement",
        amountKes: Number(pettyTxnForm.amountKes),
        purpose: pettyTxnForm.purpose,
      });
      setPettyTxnForm(EMPTY_PETTY_TXN_FORM);
      const [flts, ptxns] = await Promise.all([api.pettyCashFloats.list(), api.pettyCashTransactions.list()]);
      setFloats(flts);
      setPettyTxns(ptxns);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateExpense(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await api.officeExpenses.create({
        category: expenseForm.category,
        description: expenseForm.description,
        amountKes: Number(expenseForm.amountKes),
        vendor: expenseForm.vendor || undefined,
        paymentMethod: expenseForm.paymentMethod || undefined,
        incurredAt: expenseForm.incurredAt,
      });
      setExpenses((prev) => [created, ...prev]);
      setExpenseForm(EMPTY_EXPENSE_FORM);
      setShowExpenseForm(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleExpenseStatus(id: string, status: OfficeExpense["status"]) {
    try {
      const updated = await api.officeExpenses.update(id, { status });
      setExpenses((prev) => prev.map((e) => (e.id === id ? updated : e)));
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await api.glAccounts.create({
        code: accountForm.code,
        name: accountForm.name,
        accountType: accountForm.accountType as GlAccount["accountType"],
        normalBalance: accountForm.normalBalance as GlAccount["normalBalance"],
        parentAccountCode: accountForm.parentAccountCode || undefined,
      });
      setGlAccountsList((prev) => [...prev, created].sort((a, b) => a.code.localeCompare(b.code)));
      setAccountForm(EMPTY_ACCOUNT_FORM);
      setShowAccountForm(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreatePeriod(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await api.accountingPeriods.create(periodForm);
      setPeriods((prev) => [created, ...prev]);
      setSelectedPeriodId(created.id);
      setPeriodForm(EMPTY_PERIOD_FORM);
      setShowPeriodForm(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleClosePeriod(id: string) {
    if (!confirm(`Close accounting period ${id}? No further entries can be posted into it.`)) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.accountingPeriods.close(id);
      setPeriods((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const journalLinesTotal = (side: "debit" | "credit") =>
    journalLinesForm.filter((l) => l.side === side).reduce((sum, l) => sum + (Number(l.amountKes) || 0), 0);

  async function handleCreateJournalEntry(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const lines = journalLinesForm
        .filter((l) => l.accountCode && Number(l.amountKes) > 0)
        .map((l) => ({
          accountCode: l.accountCode,
          debitKes: l.side === "debit" ? Number(l.amountKes) : undefined,
          creditKes: l.side === "credit" ? Number(l.amountKes) : undefined,
        }));
      const created = await api.journalEntries.create({
        periodId: selectedPeriodId,
        entryDate: journalForm.entryDate,
        description: journalForm.description || undefined,
        reference: journalForm.reference || undefined,
        lines,
      });
      setJournalEntriesList((prev) => [created, ...prev]);
      setJournalForm(EMPTY_JOURNAL_FORM);
      setJournalLinesForm([{ ...EMPTY_JOURNAL_LINE, side: "debit" }, { ...EMPTY_JOURNAL_LINE, side: "credit" }]);
      setShowJournalForm(false);
      loadGlReports(selectedPeriodId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleReverseEntry(id: string) {
    if (!confirm("Reverse this journal entry? A compensating entry will be posted; the original stays on record.")) return;
    setSaving(true);
    setError(null);
    try {
      await api.journalEntries.reverse(id);
      loadGlReports(selectedPeriodId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const insurerName = (id: string) => insurers.find((i) => i.id === id)?.name || id;
  const policyLabel = (id: string | null) => {
    if (!id) return "—";
    const p = policies.find((x) => x.id === id);
    return p ? `${p.id} (${p.category})` : id;
  };
  const partyName = (id: string | null) => (id ? parties.find((p) => p.id === id)?.fullName || id : "—");
  const AGEING_BUCKET_TONE: Record<string, "neutral" | "warning" | "critical" | "good"> = {
    current: "good", early: "neutral", follow_up: "warning", escalation: "warning", critical: "critical",
  };

  const transactionsFiltered = transactions.filter((t) => matchesQuery(txnQuery, policyLabel(t.policyId), t.transactionType, t.method, t.status, t.providerReference));
  const statementsFiltered = statements.filter((s) => matchesQuery(statementQuery, insurerName(s.insurerId), s.status));
  const paymentsFiltered = payments.filter((p) => matchesQuery(paymentQuery, partyName(p.partyId), p.method, p.paymentReference));
  const expensesFiltered = expenses.filter((e) => matchesQuery(expenseQuery, e.category, e.description, e.vendor, e.status));
  const journalEntriesFiltered = journalEntriesList.filter((je) => matchesQuery(journalQuery, je.description, je.sourceType, je.status, ...je.lines.map((l) => l.accountCode)));
  const ageingRowsFiltered = (ageing?.rows || []).filter((r) => matchesQuery(ageingQuery, r.policyId, partyName(r.clientId), r.bucketLabel));
  const floatsFiltered = floats.filter((f) => matchesQuery(floatQuery, f.custodianStaffId, f.status));
  const trialBalanceRowsFiltered = (trialBalance?.rows || []).filter((r) => matchesQuery(trialBalanceQuery, r.accountCode, r.name, r.accountType));
  const glAccountsFiltered = glAccountsList.filter((a) => matchesQuery(accountQuery, a.code, a.name, a.accountType, a.normalBalance));

  const { pageItems: transactionsPage, totalPages: transactionsTotalPages, clampedPage: transactionsClampedPage } = usePagedSlice(transactionsFiltered, txnPage);
  const { pageItems: statementsPage, totalPages: statementsTotalPages, clampedPage: statementsClampedPage } = usePagedSlice(statementsFiltered, statementPage);
  const { pageItems: paymentsPage, totalPages: paymentsTotalPages, clampedPage: paymentsClampedPage } = usePagedSlice(paymentsFiltered, paymentPage);
  const { pageItems: expensesPage, totalPages: expensesTotalPages, clampedPage: expensesClampedPage } = usePagedSlice(expensesFiltered, expensePage);
  const { pageItems: journalEntriesPage, totalPages: journalTotalPages, clampedPage: journalClampedPage } = usePagedSlice(journalEntriesFiltered, journalPage);
  const { pageItems: ageingRowsPage, totalPages: ageingTotalPages, clampedPage: ageingClampedPage } = usePagedSlice(ageingRowsFiltered, ageingPage);
  const { pageItems: floatsPage, totalPages: floatsTotalPages, clampedPage: floatsClampedPage } = usePagedSlice(floatsFiltered, floatPage);
  const { pageItems: trialBalanceRowsPage, totalPages: trialBalanceTotalPages, clampedPage: trialBalanceClampedPage } = usePagedSlice(trialBalanceRowsFiltered, trialBalancePage);
  const { pageItems: glAccountsPage, totalPages: accountsTotalPages, clampedPage: accountsClampedPage } = usePagedSlice(glAccountsFiltered, accountPage);

  const totalPremiumCollected = transactions
    .filter((t) => t.transactionType === "premium")
    .reduce((sum, t) => sum + t.amountKes, 0);

  const projectedCommission = transactions
    .filter((t) => t.transactionType === "commission" && t.status === "pending")
    .reduce((sum, t) => sum + t.amountKes, 0);

  const confirmedCommission = transactions
    .filter((t) => t.transactionType === "commission" && t.status !== "pending")
    .reduce((sum, t) => sum + t.amountKes, 0);

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (initialLoadFailed) return <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">Finance</h2>
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

      {tab === "overview" && (
      <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Premium collected</p>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums text-emerald-600">KES {totalPremiumCollected.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Projected commission</p>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums text-amber-600">KES {projectedCommission.toLocaleString()}</p>
          <p className="mt-1 text-xs text-slate-400">Not yet insurer-confirmed</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Confirmed commission</p>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums text-slate-900">KES {confirmedCommission.toLocaleString()}</p>
        </div>
      </div>

      <SearchInput value={txnQuery} onChange={setTxnQuery} placeholder="Search by policy, type, method, status, reference…" />

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th scope="col" className="px-4 py-2.5 font-medium">Policy</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Type</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Amount</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Method</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Date</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {transactionsFiltered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">{transactions.length === 0 ? "No transactions yet." : `No transactions match "${txnQuery}".`}</td></tr>
            ) : (
              transactionsPage.map((t) => (
                <tr key={t.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{t.policyId || "—"}</td>
                  <td className="px-4 py-2.5 capitalize text-slate-900">{t.transactionType}</td>
                  <td className="px-4 py-2.5 tabular-nums text-slate-600">KES {t.amountKes.toLocaleString()}</td>
                  <td className="px-4 py-2.5 capitalize text-slate-600">{t.method || "—"}</td>
                  <td className="px-4 py-2.5 tabular-nums text-slate-600">{new Date(t.occurredAt).toLocaleDateString()}</td>
                  <td className="px-4 py-2.5"><StatusPill status={t.status} tone={t.status === "pending" ? "warning" : t.status === "matched" ? "good" : undefined} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination page={transactionsClampedPage} totalPages={transactionsTotalPages} totalItems={transactionsFiltered.length} onChange={setTxnPage} />
      </div>
      </div>
      )}

      {tab === "commission" && (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Commission statement reconciliation</h3>
            <p className="mt-0.5 text-xs text-slate-500">Check an insurer's own commission statement against our projected commission per policy — a line only counts as reconciled once the amounts agree.</p>
          </div>
          <button onClick={() => setShowStatementForm((v) => !v)} className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
            <Plus size={15} /> New statement
          </button>
        </div>

        {showStatementForm && (
          <form onSubmit={handleCreateStatement} className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-4">
            <select required className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={statementForm.insurerId} onChange={(e) => setStatementForm({ ...statementForm, insurerId: e.target.value })}>
              <option value="">-- Insurer --</option>
              {insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
            <input required placeholder="Period start" type="date" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={statementForm.periodStart} onChange={(e) => setStatementForm({ ...statementForm, periodStart: e.target.value })} />
            <input required placeholder="Period end" type="date" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={statementForm.periodEnd} onChange={(e) => setStatementForm({ ...statementForm, periodEnd: e.target.value })} />
            <input placeholder="Total commission (KES)" type="number" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={statementForm.totalCommissionKes} onChange={(e) => setStatementForm({ ...statementForm, totalCommissionKes: e.target.value })} />
            <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
              {saving ? "Saving…" : "Import statement"}
            </button>
          </form>
        )}

        <SearchInput value={statementQuery} onChange={setStatementQuery} placeholder="Search by insurer, status…" />

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="px-4 py-2.5 font-medium">Insurer</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Period</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Total commission</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                <th scope="col" className="px-4 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {statementsFiltered.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">{statements.length === 0 ? "No commission statements imported yet." : `No statements match "${statementQuery}".`}</td></tr>
              ) : (
                statementsPage.map((s) => {
                  const expanded = expandedStatementId === s.id;
                  const lines = linesByStatement[s.id] || [];
                  const result = reconcileResult[s.id];
                  return (
                    <Fragment key={s.id}>
                      <tr onClick={() => toggleExpand(s.id)} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-medium text-slate-900">{insurerName(s.insurerId)}</td>
                        <td className="px-4 py-2.5 tabular-nums text-slate-600">{s.periodStart} → {s.periodEnd}</td>
                        <td className="px-4 py-2.5 tabular-nums text-slate-600">{s.totalCommissionKes != null ? `KES ${Number(s.totalCommissionKes).toLocaleString()}` : "—"}</td>
                        <td className="px-4 py-2.5"><StatusPill status={s.status} tone={s.status === "Discrepancy" ? "critical" : s.status === "Manual Review" ? "warning" : ["Auto-Matched", "Resolved", "Approved", "Posted", "Closed"].includes(s.status) ? "good" : "neutral"} /></td>
                        <td className="px-4 py-2.5 text-right text-xs text-indigo-600">{expanded ? "Hide lines" : "View lines"}</td>
                      </tr>
                      {expanded && (
                        <tr className="border-b border-slate-100 bg-slate-50">
                          <td colSpan={5} className="px-4 py-4">
                            <div className="space-y-3">
                              <form onSubmit={(e) => handleAddLine(e, s.id)} className="flex flex-wrap items-end gap-2">
                                <select required className="rounded-md border border-slate-300 px-2 py-1 text-xs" value={lineForm.policyId} onChange={(e) => setLineForm({ ...lineForm, policyId: e.target.value })}>
                                  <option value="">-- Policy --</option>
                                  {policies.filter((p) => p.insurerId === s.insurerId).map((p) => <option key={p.id} value={p.id}>{p.id} ({p.category})</option>)}
                                </select>
                                <input placeholder="Rate %" type="number" step="0.01" className="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs" value={lineForm.commissionRatePct} onChange={(e) => setLineForm({ ...lineForm, commissionRatePct: e.target.value })} />
                                <input required placeholder="Commission (KES)" type="number" className="w-36 rounded-md border border-slate-300 px-2 py-1 text-xs" value={lineForm.commissionAmountKes} onChange={(e) => setLineForm({ ...lineForm, commissionAmountKes: e.target.value })} />
                                <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50">Add line</button>
                                <button type="button" onClick={() => handleReconcile(s.id)} disabled={saving || lines.length === 0} className="ml-auto flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                                  <RefreshCw size={12} /> Reconcile
                                </button>
                              </form>

                              {result && (
                                <p className="text-xs text-slate-500">
                                  {result.matchedCount} matched, {result.discrepancyCount} discrepanc{result.discrepancyCount === 1 ? "y" : "ies"}, {result.unresolvedCount} unresolved.
                                </p>
                              )}

                              <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b border-slate-200 text-left uppercase tracking-wide text-slate-500">
                                      <th scope="col" className="px-3 py-1.5 font-medium">Policy</th>
                                      <th scope="col" className="px-3 py-1.5 font-medium">Rate</th>
                                      <th scope="col" className="px-3 py-1.5 font-medium">Commission</th>
                                      <th scope="col" className="px-3 py-1.5 font-medium">Match</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {lines.length === 0 ? (
                                      <tr><td colSpan={4} className="px-3 py-3 text-center text-slate-400">No lines yet — add one above.</td></tr>
                                    ) : (
                                      lines.map((l) => (
                                        <tr key={l.id} className="border-b border-slate-100 last:border-0">
                                          <td className="px-3 py-1.5 text-slate-700">{policyLabel(l.policyId)}</td>
                                          <td className="px-3 py-1.5 tabular-nums text-slate-600">{l.commissionRatePct != null ? `${l.commissionRatePct}%` : "—"}</td>
                                          <td className="px-3 py-1.5 tabular-nums text-slate-600">{l.commissionAmountKes != null ? `KES ${Number(l.commissionAmountKes).toLocaleString()}` : "—"}</td>
                                          <td className="px-3 py-1.5">{lineMatchPill(l, transactions)}</td>
                                        </tr>
                                      ))
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
          <Pagination page={statementsClampedPage} totalPages={statementsTotalPages} totalItems={statementsFiltered.length} onChange={setStatementPage} />
        </div>
      </div>
      )}

      {tab === "payments" && (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Payments &amp; allocation</h3>
            <p className="mt-0.5 text-xs text-slate-500">One cheque, transfer or M-Pesa payment can fund more than one policy at once — record the payment, then allocate it across policies. Unallocated balance stays visible until fully applied.</p>
          </div>
          <button onClick={() => setShowPaymentForm((v) => !v)} className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
            <Plus size={15} /> Record payment
          </button>
        </div>

        {showPaymentForm && (
          <form onSubmit={handleCreatePayment} className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-4">
            <select required className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={paymentForm.partyId} onChange={(e) => setPaymentForm({ ...paymentForm, partyId: e.target.value })}>
              <option value="">-- Client --</option>
              {parties.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
            </select>
            <input required placeholder="Total amount (KES)" type="number" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={paymentForm.totalAmountKes} onChange={(e) => setPaymentForm({ ...paymentForm, totalAmountKes: e.target.value })} />
            <select className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={paymentForm.method} onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}>
              <option value="mpesa">M-Pesa</option>
              <option value="bank">Bank</option>
              <option value="card">Card</option>
              <option value="cheque">Cheque</option>
              <option value="journal">Journal</option>
            </select>
            <input placeholder="Reference (e.g. cheque no.)" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={paymentForm.paymentReference} onChange={(e) => setPaymentForm({ ...paymentForm, paymentReference: e.target.value })} />
            <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
              {saving ? "Saving…" : "Record payment"}
            </button>
          </form>
        )}

        <SearchInput value={paymentQuery} onChange={setPaymentQuery} placeholder="Search by client, method, reference…" />

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="px-4 py-2.5 font-medium">Client</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Total</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Allocated</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Unallocated</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Method / ref</th>
                <th scope="col" className="px-4 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {paymentsFiltered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">{payments.length === 0 ? "No payments recorded yet." : `No payments match "${paymentQuery}".`}</td></tr>
              ) : (
                paymentsPage.map((p) => {
                  const expanded = expandedPaymentId === p.id;
                  return (
                    <Fragment key={p.id}>
                      <tr onClick={() => toggleExpandPayment(p.id)} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-medium text-slate-900">{partyName(p.partyId)}</td>
                        <td className="px-4 py-2.5 tabular-nums text-slate-600">KES {Number(p.totalAmountKes).toLocaleString()}</td>
                        <td className="px-4 py-2.5 tabular-nums text-slate-600">KES {(p.allocatedKes ?? 0).toLocaleString()}</td>
                        <td className={`px-4 py-2.5 tabular-nums ${(p.unallocatedKes ?? 0) > 0 ? "font-medium text-amber-600" : "text-slate-400"}`}>KES {(p.unallocatedKes ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-xs capitalize text-slate-500">{p.method || "—"} {p.paymentReference ? `· ${p.paymentReference}` : ""}</td>
                        <td className="px-4 py-2.5 text-right text-xs text-indigo-600">{expanded ? "Hide" : "Allocate"}</td>
                      </tr>
                      {expanded && (
                        <tr className="border-b border-slate-100 bg-slate-50">
                          <td colSpan={6} className="px-4 py-4">
                            <div className="space-y-3">
                              {(p.unallocatedKes ?? 0) > 0 ? (
                                <form onSubmit={(e) => handleAllocate(e, p.id)} className="flex flex-wrap items-end gap-2">
                                  <select required className="rounded-md border border-slate-300 px-2 py-1 text-xs" value={allocationForm.policyId} onChange={(e) => setAllocationForm({ ...allocationForm, policyId: e.target.value })}>
                                    <option value="">-- Policy --</option>
                                    {policies.filter((pol) => pol.clientId === p.partyId).map((pol) => <option key={pol.id} value={pol.id}>{pol.id} ({pol.category}) — KES {Number(pol.premiumAmount).toLocaleString()}</option>)}
                                  </select>
                                  <input required placeholder="Amount (KES)" type="number" max={p.unallocatedKes} className="w-36 rounded-md border border-slate-300 px-2 py-1 text-xs" value={allocationForm.confirmedAmountKes} onChange={(e) => setAllocationForm({ ...allocationForm, confirmedAmountKes: e.target.value })} />
                                  <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50">Allocate</button>
                                  <span className="text-xs text-slate-400">Unallocated: KES {(p.unallocatedKes ?? 0).toLocaleString()}</span>
                                </form>
                              ) : (
                                <p className="text-xs text-emerald-600">Fully allocated.</p>
                              )}
                              <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b border-slate-200 text-left uppercase tracking-wide text-slate-500">
                                      <th scope="col" className="px-3 py-1.5 font-medium">Policy</th>
                                      <th scope="col" className="px-3 py-1.5 font-medium">Amount applied</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(p.allocations || []).length === 0 ? (
                                      <tr><td colSpan={2} className="px-3 py-3 text-center text-slate-400">No allocations yet.</td></tr>
                                    ) : (
                                      (p.allocations || []).map((a) => (
                                        <tr key={a.id} className="border-b border-slate-100 last:border-0">
                                          <td className="px-3 py-1.5 text-slate-700">{policyLabel(a.policyId)}</td>
                                          <td className="px-3 py-1.5 tabular-nums text-slate-600">KES {Number(a.confirmedAmountKes).toLocaleString()}</td>
                                        </tr>
                                      ))
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
          <Pagination page={paymentsClampedPage} totalPages={paymentsTotalPages} totalItems={paymentsFiltered.length} onChange={setPaymentPage} />
        </div>
      </div>
      )}

      {tab === "ageing" && (
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Premium ageing</h3>
          <p className="mt-0.5 text-xs text-slate-500">Outstanding premium bucketed by days past its due date. Policies in the two most overdue buckets automatically get a collection task in Tasks → finance queue.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {ageing && Object.entries(ageing.summary).map(([bucket, count]) => (
            <div key={bucket} className="rounded-lg border border-slate-200 bg-white p-3 text-center">
              <p className="text-xl font-semibold tabular-nums text-slate-900">{count}</p>
              <p className="mt-0.5 text-xs capitalize text-slate-500">{bucket.replace(/_/g, " ")}</p>
            </div>
          ))}
        </div>
        <SearchInput value={ageingQuery} onChange={setAgeingQuery} placeholder="Search by policy, client, bucket…" />
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="px-4 py-2.5 font-medium">Policy</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Client</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Outstanding</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Due date</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Days past due</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Bucket</th>
              </tr>
            </thead>
            <tbody>
              {!ageing || ageing.rows.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Nothing outstanding.</td></tr>
              ) : ageingRowsFiltered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">{`No outstanding items match "${ageingQuery}".`}</td></tr>
              ) : (
                ageingRowsPage.map((r) => (
                  <tr key={r.policyId} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-slate-900">{r.policyId}</td>
                    <td className="px-4 py-2.5 text-slate-600">{partyName(r.clientId)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-slate-600">KES {r.outstandingKes.toLocaleString()}</td>
                    <td className="px-4 py-2.5 tabular-nums text-slate-600">{r.dueDate}</td>
                    <td className="px-4 py-2.5 tabular-nums text-slate-600">{r.daysPastDue}</td>
                    <td className="px-4 py-2.5"><StatusPill status={r.bucketLabel} tone={AGEING_BUCKET_TONE[r.bucket]} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <Pagination page={ageingClampedPage} totalPages={ageingTotalPages} totalItems={ageingRowsFiltered.length} onChange={setAgeingPage} />
        </div>
      </div>
      )}

      {tab === "commission" && (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Commission clawback</h3>
            <p className="mt-0.5 text-xs text-slate-500">Insurer reversal of previously-paid commission (e.g. a policy was cancelled or short-rated) — recorded as its own debit entry, never by editing the original credit.</p>
          </div>
          <button onClick={() => setShowClawbackForm((v) => !v)} className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Plus size={15} /> Record clawback
          </button>
        </div>
        {showClawbackForm && (
          <form onSubmit={handleClawback} className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3">
            <select required className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={clawbackForm.policyId} onChange={(e) => setClawbackForm({ ...clawbackForm, policyId: e.target.value })}>
              <option value="">-- Policy --</option>
              {policies.map((p) => <option key={p.id} value={p.id}>{p.id} ({p.category})</option>)}
            </select>
            <input required placeholder="Amount clawed back (KES)" type="number" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={clawbackForm.amountKes} onChange={(e) => setClawbackForm({ ...clawbackForm, amountKes: e.target.value })} />
            <input required placeholder="Reason" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={clawbackForm.reason} onChange={(e) => setClawbackForm({ ...clawbackForm, reason: e.target.value })} />
            <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 sm:col-span-3 sm:w-fit">
              {saving ? "Saving…" : "Record clawback"}
            </button>
          </form>
        )}
      </div>
      )}

      {tab === "internal" && (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Internal operating finance</h2>
          <p className="mt-0.5 text-xs text-slate-500">The brokerage's own running costs — petty cash and office expenses — kept separate from client premium and insurer commission money above, which the firm never treats as its own.</p>
        </div>

        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Petty cash</h3>
          <button onClick={() => setShowFloatForm((v) => !v)} className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Plus size={15} /> New float
          </button>
        </div>
        {showFloatForm && (
          <form onSubmit={handleCreateFloat} className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3">
            <input placeholder="Custodian staff id (optional)" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={floatForm.custodianStaffId} onChange={(e) => setFloatForm({ ...floatForm, custodianStaffId: e.target.value })} />
            <input required placeholder="Opening balance (KES)" type="number" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={floatForm.openingBalanceKes} onChange={(e) => setFloatForm({ ...floatForm, openingBalanceKes: e.target.value })} />
            <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
              {saving ? "Saving…" : "Open float"}
            </button>
          </form>
        )}
        <SearchInput value={floatQuery} onChange={setFloatQuery} placeholder="Search by custodian, status…" />
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="px-4 py-2.5 font-medium">Custodian</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Opening</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Current balance</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                <th scope="col" className="px-4 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {floats.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">No petty cash floats yet.</td></tr>
              ) : floatsFiltered.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">{`No floats match "${floatQuery}".`}</td></tr>
              ) : (
                floatsPage.map((f) => {
                  const expanded = expandedFloatId === f.id;
                  const txnsForFloat = pettyTxns.filter((t) => t.floatId === f.id);
                  return (
                    <Fragment key={f.id}>
                      <tr onClick={() => setExpandedFloatId(expanded ? null : f.id)} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-medium text-slate-900">{f.custodianStaffId || "—"}</td>
                        <td className="px-4 py-2.5 tabular-nums text-slate-600">KES {Number(f.openingBalanceKes).toLocaleString()}</td>
                        <td className="px-4 py-2.5 tabular-nums text-slate-600">KES {Number(f.currentBalanceKes).toLocaleString()}</td>
                        <td className="px-4 py-2.5"><StatusPill status={f.status} tone={f.status === "active" ? "good" : "neutral"} /></td>
                        <td className="px-4 py-2.5 text-right text-xs text-indigo-600">{expanded ? "Hide" : "View"}</td>
                      </tr>
                      {expanded && (
                        <tr className="border-b border-slate-100 bg-slate-50">
                          <td colSpan={5} className="px-4 py-4">
                            <div className="space-y-3">
                              {f.status === "active" && (
                                <form onSubmit={(e) => handlePettyTxn(e, f.id)} className="flex flex-wrap items-end gap-2">
                                  <select className="rounded-md border border-slate-300 px-2 py-1 text-xs" value={pettyTxnForm.transactionType} onChange={(e) => setPettyTxnForm({ ...pettyTxnForm, transactionType: e.target.value })}>
                                    <option value="disbursement">Disbursement</option>
                                    <option value="replenishment">Replenishment</option>
                                  </select>
                                  <input required placeholder="Amount (KES)" type="number" className="w-32 rounded-md border border-slate-300 px-2 py-1 text-xs" value={pettyTxnForm.amountKes} onChange={(e) => setPettyTxnForm({ ...pettyTxnForm, amountKes: e.target.value })} />
                                  <input required placeholder="Purpose" className="rounded-md border border-slate-300 px-2 py-1 text-xs" value={pettyTxnForm.purpose} onChange={(e) => setPettyTxnForm({ ...pettyTxnForm, purpose: e.target.value })} />
                                  <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50">Record</button>
                                </form>
                              )}
                              <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b border-slate-200 text-left uppercase tracking-wide text-slate-500">
                                      <th scope="col" className="px-3 py-1.5 font-medium">Type</th>
                                      <th scope="col" className="px-3 py-1.5 font-medium">Amount</th>
                                      <th scope="col" className="px-3 py-1.5 font-medium">Purpose</th>
                                      <th scope="col" className="px-3 py-1.5 font-medium">Date</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {txnsForFloat.length === 0 ? (
                                      <tr><td colSpan={4} className="px-3 py-3 text-center text-slate-400">No transactions yet.</td></tr>
                                    ) : (
                                      txnsForFloat.map((t) => (
                                        <tr key={t.id} className="border-b border-slate-100 last:border-0">
                                          <td className={`px-3 py-1.5 capitalize ${t.transactionType === "disbursement" ? "text-rose-600" : "text-emerald-600"}`}>{t.transactionType}</td>
                                          <td className="px-3 py-1.5 tabular-nums text-slate-600">KES {Number(t.amountKes).toLocaleString()}</td>
                                          <td className="px-3 py-1.5 text-slate-600">{t.purpose}</td>
                                          <td className="px-3 py-1.5 tabular-nums text-slate-400">{new Date(t.occurredAt).toLocaleDateString()}</td>
                                        </tr>
                                      ))
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
          <Pagination page={floatsClampedPage} totalPages={floatsTotalPages} totalItems={floatsFiltered.length} onChange={setFloatPage} />
        </div>

        <div className="flex items-center justify-between pt-2">
          <h3 className="text-base font-semibold text-slate-900">Office expenses</h3>
          <button onClick={() => setShowExpenseForm((v) => !v)} className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Plus size={15} /> New expense
          </button>
        </div>
        {showExpenseForm && (
          <form onSubmit={handleCreateExpense} className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3">
            <select className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}>
              {OFFICE_EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
            </select>
            <input required placeholder="Description" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} />
            <input required placeholder="Amount (KES)" type="number" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={expenseForm.amountKes} onChange={(e) => setExpenseForm({ ...expenseForm, amountKes: e.target.value })} />
            <input placeholder="Vendor" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={expenseForm.vendor} onChange={(e) => setExpenseForm({ ...expenseForm, vendor: e.target.value })} />
            <input type="date" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={expenseForm.incurredAt} onChange={(e) => setExpenseForm({ ...expenseForm, incurredAt: e.target.value })} />
            <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
              {saving ? "Saving…" : "Record expense"}
            </button>
          </form>
        )}
        <SearchInput value={expenseQuery} onChange={setExpenseQuery} placeholder="Search by category, description, vendor, status…" />
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="px-4 py-2.5 font-medium">Category</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Description</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Amount</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Vendor</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Date</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {expensesFiltered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">{expenses.length === 0 ? "No office expenses recorded yet." : `No expenses match "${expenseQuery}".`}</td></tr>
              ) : (
                expensesPage.map((e) => (
                  <tr key={e.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2.5 capitalize text-slate-900">{e.category.replace(/_/g, " ")}</td>
                    <td className="px-4 py-2.5 text-slate-600">{e.description}</td>
                    <td className="px-4 py-2.5 tabular-nums text-slate-600">KES {Number(e.amountKes).toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-slate-500">{e.vendor || "—"}</td>
                    <td className="px-4 py-2.5 tabular-nums text-slate-500">{e.incurredAt}</td>
                    <td className="px-4 py-2.5">
                      <select value={e.status} onChange={(ev) => handleExpenseStatus(e.id, ev.target.value as OfficeExpense["status"])} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs">
                        <option value="recorded">Recorded</option>
                        <option value="approved">Approved</option>
                        <option value="paid">Paid</option>
                      </select>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <Pagination page={expensesClampedPage} totalPages={expensesTotalPages} totalItems={expensesFiltered.length} onChange={setExpensePage} />
        </div>
      </div>
      )}

      {tab === "gl" && (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">General ledger</h2>
          <p className="mt-0.5 text-xs text-slate-500">Chart of accounts, accounting periods and double-entry journal entries. Premium confirmations, paid office expenses and petty cash transactions post here automatically; a posted entry is corrected by reversal, never edited.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Period</label>
          <select value={selectedPeriodId} onChange={(e) => setSelectedPeriodId(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            {!periods.some((p) => p.id === selectedPeriodId) && <option value={selectedPeriodId}>{selectedPeriodId} (not yet created)</option>}
            {periods.map((p) => <option key={p.id} value={p.id}>{p.id} ({p.status})</option>)}
          </select>
          {periods.find((p) => p.id === selectedPeriodId)?.status === "open" && (
            <button onClick={() => handleClosePeriod(selectedPeriodId)} className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Lock size={13} /> Close period
            </button>
          )}
          <button onClick={() => setShowPeriodForm((v) => !v)} className="ml-auto flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Plus size={15} /> New period
          </button>
        </div>
        {showPeriodForm && (
          <form onSubmit={handleCreatePeriod} className="grid grid-cols-3 gap-3 rounded-lg border border-slate-200 bg-white p-4">
            <input required placeholder="Period id, e.g. 2026-07" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={periodForm.id} onChange={(e) => setPeriodForm({ ...periodForm, id: e.target.value })} />
            <input required type="date" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={periodForm.startDate} onChange={(e) => setPeriodForm({ ...periodForm, startDate: e.target.value })} />
            <input required type="date" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={periodForm.endDate} onChange={(e) => setPeriodForm({ ...periodForm, endDate: e.target.value })} />
            <button disabled={saving} type="submit" className="col-span-3 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
              {saving ? "Saving…" : "Create period"}
            </button>
          </form>
        )}

        <div className="flex gap-1 border-b border-slate-100">
          {([
            { id: "trial_balance", label: "Trial balance" },
            { id: "income_statement", label: "Income statement" },
            { id: "balance_sheet", label: "Balance sheet" },
          ] as const).map((r) => (
            <button key={r.id} onClick={() => setGlReport(r.id)}
              className={`px-3 py-1.5 text-xs font-medium ${glReport === r.id ? "border-b-2 border-indigo-600 text-indigo-700" : "text-slate-500 hover:text-slate-800"}`}>
              {r.label}
            </button>
          ))}
        </div>

        {glReport === "trial_balance" && trialBalance && (
          <div className="space-y-2">
            <SearchInput value={trialBalanceQuery} onChange={setTrialBalanceQuery} placeholder="Search by account code, name, type…" />
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th scope="col" className="px-4 py-2.5 font-medium">Account</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Type</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Debit</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Credit</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {trialBalance.rows.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">No activity posted in this period yet.</td></tr>
                  ) : trialBalanceRowsFiltered.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">{`No accounts match "${trialBalanceQuery}".`}</td></tr>
                  ) : (
                    trialBalanceRowsPage.map((r) => (
                      <tr key={r.accountCode} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-2.5 font-medium text-slate-900">{r.accountCode} · {r.name}</td>
                        <td className="px-4 py-2.5 capitalize text-slate-500">{r.accountType}</td>
                        <td className="px-4 py-2.5 tabular-nums text-slate-600">{r.totalDebitKes ? `KES ${r.totalDebitKes.toLocaleString()}` : "—"}</td>
                        <td className="px-4 py-2.5 tabular-nums text-slate-600">{r.totalCreditKes ? `KES ${r.totalCreditKes.toLocaleString()}` : "—"}</td>
                        <td className="px-4 py-2.5 tabular-nums font-medium text-slate-900">KES {r.balanceKes.toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {trialBalance.rows.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 font-medium">
                      <td className="px-4 py-2.5" colSpan={2}>Total</td>
                      <td className="px-4 py-2.5 tabular-nums">KES {trialBalance.totalDebitKes.toLocaleString()}</td>
                      <td className="px-4 py-2.5 tabular-nums">KES {trialBalance.totalCreditKes.toLocaleString()}</td>
                      <td className="px-4 py-2.5"><StatusPill status={trialBalance.balanced ? "balanced" : "out of balance"} tone={trialBalance.balanced ? "good" : "critical"} /></td>
                    </tr>
                  </tfoot>
                )}
              </table>
              <Pagination page={trialBalanceClampedPage} totalPages={trialBalanceTotalPages} totalItems={trialBalanceRowsFiltered.length} onChange={setTrialBalancePage} />
            </div>
          </div>
        )}

        {glReport === "income_statement" && incomeStatement && (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="space-y-1">
              {incomeStatement.rows.filter((r) => r.accountType === "income").map((r) => (
                <div key={r.accountCode} className="flex justify-between text-sm"><span className="text-slate-600">{r.name}</span><span className="tabular-nums text-emerald-600">KES {r.amountKes.toLocaleString()}</span></div>
              ))}
              <div className="flex justify-between border-t border-slate-200 pt-1 text-sm font-medium"><span>Total income</span><span className="tabular-nums">KES {incomeStatement.totalIncomeKes.toLocaleString()}</span></div>
            </div>
            <div className="mt-4 space-y-1">
              {incomeStatement.rows.filter((r) => r.accountType === "expense").map((r) => (
                <div key={r.accountCode} className="flex justify-between text-sm"><span className="text-slate-600">{r.name}</span><span className="tabular-nums text-rose-600">KES {r.amountKes.toLocaleString()}</span></div>
              ))}
              <div className="flex justify-between border-t border-slate-200 pt-1 text-sm font-medium"><span>Total expenses</span><span className="tabular-nums">KES {incomeStatement.totalExpenseKes.toLocaleString()}</span></div>
            </div>
            <div className="mt-4 flex justify-between border-t-2 border-slate-300 pt-2 text-base font-semibold">
              <span>Net income</span>
              <span className={`tabular-nums ${incomeStatement.netIncomeKes >= 0 ? "text-emerald-600" : "text-rose-600"}`}>KES {incomeStatement.netIncomeKes.toLocaleString()}</span>
            </div>
          </div>
        )}

        {glReport === "balance_sheet" && balanceSheet && (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="mb-2 text-xs text-slate-400">As of {balanceSheet.asOfDate}</p>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assets</h4>
                <div className="mt-1 space-y-1">
                  {balanceSheet.rows.filter((r) => r.accountType === "asset").map((r) => (
                    <div key={r.accountCode} className="flex justify-between text-sm"><span className="text-slate-600">{r.name}</span><span className="tabular-nums">KES {r.balanceKes.toLocaleString()}</span></div>
                  ))}
                </div>
                <div className="mt-2 flex justify-between border-t border-slate-200 pt-1 text-sm font-medium"><span>Total assets</span><span className="tabular-nums">KES {balanceSheet.totalAssetsKes.toLocaleString()}</span></div>
              </div>
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Liabilities &amp; equity</h4>
                <div className="mt-1 space-y-1">
                  {balanceSheet.rows.filter((r) => r.accountType === "liability" || r.accountType === "equity").map((r) => (
                    <div key={r.accountCode} className="flex justify-between text-sm"><span className="text-slate-600">{r.name}</span><span className="tabular-nums">KES {r.balanceKes.toLocaleString()}</span></div>
                  ))}
                  <div className="flex justify-between text-sm"><span className="text-slate-600">Current earnings (unclosed)</span><span className="tabular-nums">KES {balanceSheet.currentEarningsKes.toLocaleString()}</span></div>
                </div>
                <div className="mt-2 flex justify-between border-t border-slate-200 pt-1 text-sm font-medium"><span>Total liabilities &amp; equity</span><span className="tabular-nums">KES {balanceSheet.totalLiabilitiesAndEquityKes.toLocaleString()}</span></div>
              </div>
            </div>
            <div className="mt-4 border-t border-slate-200 pt-2 text-right">
              <StatusPill status={balanceSheet.balanced ? "balanced" : "out of balance"} tone={balanceSheet.balanced ? "good" : "critical"} />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <h3 className="text-base font-semibold text-slate-900">Journal entries</h3>
          <button onClick={() => setShowJournalForm((v) => !v)} className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Plus size={15} /> New entry
          </button>
        </div>
        {showJournalForm && (
          <form onSubmit={handleCreateJournalEntry} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
            <div className="grid grid-cols-3 gap-3">
              <input required type="date" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={journalForm.entryDate} onChange={(e) => setJournalForm({ ...journalForm, entryDate: e.target.value })} />
              <input placeholder="Reference (optional)" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={journalForm.reference} onChange={(e) => setJournalForm({ ...journalForm, reference: e.target.value })} />
              <input placeholder="Description" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={journalForm.description} onChange={(e) => setJournalForm({ ...journalForm, description: e.target.value })} />
            </div>
            <div className="space-y-2">
              {journalLinesForm.map((line, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select className="w-56 rounded-md border border-slate-300 px-2 py-1 text-xs" value={line.accountCode} onChange={(e) => setJournalLinesForm((prev) => prev.map((l, idx) => (idx === i ? { ...l, accountCode: e.target.value } : l)))}>
                    <option value="">Select account…</option>
                    {glAccountsList.filter((a) => a.active).map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
                  </select>
                  <select className="rounded-md border border-slate-300 px-2 py-1 text-xs" value={line.side} onChange={(e) => setJournalLinesForm((prev) => prev.map((l, idx) => (idx === i ? { ...l, side: e.target.value as "debit" | "credit" } : l)))}>
                    <option value="debit">Debit</option>
                    <option value="credit">Credit</option>
                  </select>
                  <input placeholder="Amount (KES)" type="number" className="w-32 rounded-md border border-slate-300 px-2 py-1 text-xs" value={line.amountKes} onChange={(e) => setJournalLinesForm((prev) => prev.map((l, idx) => (idx === i ? { ...l, amountKes: e.target.value } : l)))} />
                  {journalLinesForm.length > 2 && (
                    <button type="button" onClick={() => setJournalLinesForm((prev) => prev.filter((_, idx) => idx !== i))} className="text-xs text-rose-500 hover:underline">Remove</button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => setJournalLinesForm((prev) => [...prev, { ...EMPTY_JOURNAL_LINE }])} className="text-xs font-medium text-indigo-600 hover:underline">+ Add line</button>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-500">
              <span>Debit total: KES {journalLinesTotal("debit").toLocaleString()} · Credit total: KES {journalLinesTotal("credit").toLocaleString()}</span>
              {journalLinesTotal("debit") !== journalLinesTotal("credit") && <span className="font-medium text-rose-600">Does not balance yet</span>}
            </div>
            <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
              {saving ? "Posting…" : "Post entry"}
            </button>
          </form>
        )}
        <SearchInput value={journalQuery} onChange={setJournalQuery} placeholder="Search by description, source, account, status…" />
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="px-4 py-2.5 font-medium">Date</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Description</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Source</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Lines</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                <th scope="col" className="px-4 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {journalEntriesFiltered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">{journalEntriesList.length === 0 ? "No journal entries in this period yet." : `No entries match "${journalQuery}".`}</td></tr>
              ) : (
                journalEntriesPage.map((je) => (
                  <tr key={je.id} className="border-b border-slate-100 last:border-0 align-top">
                    <td className="px-4 py-2.5 tabular-nums text-slate-500">{je.entryDate}</td>
                    <td className="px-4 py-2.5 text-slate-700">{je.description || "—"}</td>
                    <td className="px-4 py-2.5 text-xs capitalize text-slate-400">{je.sourceType.replace(/_/g, " ")}</td>
                    <td className="px-4 py-2.5">
                      <div className="space-y-0.5 text-xs">
                        {je.lines.map((l) => (
                          <div key={l.id} className="flex justify-between gap-4">
                            <span className="text-slate-500">{l.accountCode}</span>
                            <span className="tabular-nums text-slate-700">{Number(l.debitKes) > 0 ? `Dr ${Number(l.debitKes).toLocaleString()}` : `Cr ${Number(l.creditKes).toLocaleString()}`}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2.5"><StatusPill status={je.status} tone={je.status === "posted" ? "good" : "neutral"} /></td>
                    <td className="px-4 py-2.5 text-right">
                      {je.status === "posted" && (
                        <button onClick={() => handleReverseEntry(je.id)} className="flex items-center gap-1 text-xs text-rose-600 hover:underline">
                          <Undo2 size={12} /> Reverse
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <Pagination page={journalClampedPage} totalPages={journalTotalPages} totalItems={journalEntriesFiltered.length} onChange={setJournalPage} />
        </div>

        <div className="flex items-center justify-between pt-2">
          <h3 className="text-base font-semibold text-slate-900">Chart of accounts</h3>
          <button onClick={() => setShowAccountForm((v) => !v)} className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Plus size={15} /> New account
          </button>
        </div>
        {showAccountForm && (
          <form onSubmit={handleCreateAccount} className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3">
            <input required placeholder="Code, e.g. 5010" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={accountForm.code} onChange={(e) => setAccountForm({ ...accountForm, code: e.target.value })} />
            <input required placeholder="Name" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={accountForm.name} onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })} />
            <select className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={accountForm.accountType} onChange={(e) => setAccountForm({ ...accountForm, accountType: e.target.value })}>
              <option value="asset">Asset</option>
              <option value="liability">Liability</option>
              <option value="equity">Equity</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
            <select className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={accountForm.normalBalance} onChange={(e) => setAccountForm({ ...accountForm, normalBalance: e.target.value })}>
              <option value="debit">Normal debit</option>
              <option value="credit">Normal credit</option>
            </select>
            <select className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" value={accountForm.parentAccountCode} onChange={(e) => setAccountForm({ ...accountForm, parentAccountCode: e.target.value })}>
              <option value="">No parent</option>
              {glAccountsList.map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
            </select>
            <button disabled={saving} type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
              {saving ? "Saving…" : "Create account"}
            </button>
          </form>
        )}
        <SearchInput value={accountQuery} onChange={setAccountQuery} placeholder="Search by code, name, type, normal balance…" />
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="px-4 py-2.5 font-medium">Code</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Name</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Type</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Normal balance</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Active</th>
              </tr>
            </thead>
            <tbody>
              {glAccountsList.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">No accounts yet.</td></tr>
              ) : glAccountsFiltered.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">{`No accounts match "${accountQuery}".`}</td></tr>
              ) : (
                glAccountsPage.map((a) => (
                <tr key={a.code} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2.5 tabular-nums text-slate-900">{a.code}</td>
                  <td className="px-4 py-2.5 text-slate-700">{a.parentAccountCode ? <span className="text-slate-400">↳ </span> : null}{a.name}</td>
                  <td className="px-4 py-2.5 capitalize text-slate-500">{a.accountType}</td>
                  <td className="px-4 py-2.5 capitalize text-slate-500">{a.normalBalance}</td>
                  <td className="px-4 py-2.5">
                    <select value={a.active ? "true" : "false"} onChange={async (e) => {
                      try {
                        const updated = await api.glAccounts.update(a.code, { active: e.target.value === "true" });
                        setGlAccountsList((prev) => prev.map((x) => (x.code === a.code ? updated : x)));
                      } catch (err: any) { setError(err.message); }
                    }} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs">
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
                  </td>
                </tr>
                ))
              )}
            </tbody>
          </table>
          <Pagination page={accountsClampedPage} totalPages={accountsTotalPages} totalItems={glAccountsFiltered.length} onChange={setAccountPage} />
        </div>
      </div>
      )}
    </div>
  );
}

function lineMatchPill(line: CommissionLine, transactions: FinancialTransaction[]) {
  if (!line.matchedTransactionId) return <StatusPill status="unmatched" tone="neutral" />;
  const txn = transactions.find((t) => t.id === line.matchedTransactionId);
  if (txn?.status === "disputed") return <StatusPill status="disputed" tone="critical" />;
  return <StatusPill status="matched" tone="good" />;
}
