import type {
  Party, Opportunity, Policy, WorkflowTask, ComplianceObligation, Claim, Complaint,
  Insurer, InsurerRateVersion, StatutoryLevy, CommissionGuideEntry, PremiumConfirmation, FinancialTransaction, DocumentMeta,
  Risk, Submission, Quotation, Recommendation, Endorsement, Renewal, CommissionStatement, CommissionLine,
  Relationship, Interaction, ClientAccount, CorrespondenceTemplate, Notification,
  StaffProfile, StaffSession, AuditLogEntry, PolicyCheck, Discrepancy,
  ClaimChecklistItem, ClaimDiaryEntry, MarketStrategy, InsurerAppetite,
  ClaimReserveLine, ClaimPaymentLine, RiskClearance, Product,
  Payment, PettyCashFloat, PettyCashTransaction, OfficeExpense, PremiumAgeing,
  UnderwritingQuery, UnderwritingApproval, CoverageVerificationItem, ClaimsEscalation,
  KycChecklistItem,
  GlAccount, AccountingPeriod, JournalEntry, TrialBalance, IncomeStatement, BalanceSheet,
  Staff, Role, Employee, LeaveType, LeaveBalance, LeaveRequest, PerformanceReview,
  Producer, ProducerCommissionSplit,
} from "./types";

// Same-origin calls to this service's own Express server (Vite proxies
// /api in dev). The bearer token below identifies the signed-in staff member
// and is set after a real login (POST /api/auth/login). No shared API key is
// sent from here: that secret is for server-to-server callers only, and
// anything prefixed VITE_ would be readable by anyone who opens the bundle.

let authToken: string | null = null;
export function setAuthToken(token: string | null) {
  authToken = token;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(init?.headers || {}),
    },
  });
  const body = await res.json().catch(() => undefined);
  if (!res.ok) {
    throw new Error(body?.error || `Request failed (${res.status})`);
  }
  return body as T;
}

// Same as request(), but also returns the server's X-Total-Count so a paged
// list can show "26–50 of 493" without downloading all 493 rows.
interface PageParams { limit: number; offset: number; q?: string }

function pageUrl(path: string, { limit, offset, q }: PageParams): string {
  return `${path}?limit=${limit}&offset=${offset}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
}

async function requestPage<T>(path: string): Promise<{ rows: T[]; total: number }> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json", ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
  });
  const body = await res.json().catch(() => undefined);
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return { rows: body as T[], total: Number(res.headers.get("X-Total-Count") ?? (body as T[]).length) };
}

async function requestBlob(path: string): Promise<Blob> {
  const res = await fetch(`/api${path}`, {
    headers: {
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.blob();
}

export const api = {
  parties: {
    list: () => request<Party[]>("/parties"),
    page: (params: PageParams) => requestPage<Party>(pageUrl("/parties", params)),
    create: (data: Partial<Party>) => request<Party>("/parties", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Party>) => request<Party>(`/parties/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  clientAccounts: {
    list: (partyId?: string) => request<ClientAccount[]>(`/client-accounts${partyId ? `?partyId=${partyId}` : ""}`),
    create: (data: Partial<ClientAccount>) => request<ClientAccount>("/client-accounts", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<ClientAccount>) => request<ClientAccount>(`/client-accounts/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  kycChecklistItems: {
    list: (partyId: string) => request<KycChecklistItem[]>(`/kyc-checklist-items?partyId=${partyId}`),
    create: (data: Partial<KycChecklistItem>) => request<KycChecklistItem>("/kyc-checklist-items", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<KycChecklistItem>) => request<KycChecklistItem>(`/kyc-checklist-items/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  relationships: {
    list: (partyId?: string) => request<Relationship[]>(`/relationships${partyId ? `?partyId=${partyId}` : ""}`),
    create: (data: Partial<Relationship>) => request<Relationship>("/relationships", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Relationship>) => request<Relationship>(`/relationships/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  interactions: {
    list: (partyId?: string) => request<Interaction[]>(`/interactions${partyId ? `?partyId=${partyId}` : ""}`),
    create: (data: Partial<Interaction>) => request<Interaction>("/interactions", { method: "POST", body: JSON.stringify(data) }),
  },
  correspondenceTemplates: {
    list: () => request<CorrespondenceTemplate[]>("/correspondence-templates"),
    create: (data: Partial<CorrespondenceTemplate>) => request<CorrespondenceTemplate>("/correspondence-templates", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<CorrespondenceTemplate>) => request<CorrespondenceTemplate>(`/correspondence-templates/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  notifications: {
    list: (partyId?: string) => request<Notification[]>(`/notifications${partyId ? `?partyId=${partyId}` : ""}`),
    create: (data: Partial<Notification> & { templateCode: string }) => request<Notification>("/notifications", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Notification>) => request<Notification>(`/notifications/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  opportunities: {
    list: () => request<Opportunity[]>("/opportunities"),
    page: (params: PageParams) => requestPage<Opportunity>(pageUrl("/opportunities", params)),
    create: (data: Partial<Opportunity>) => request<Opportunity>("/opportunities", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Opportunity>) => request<Opportunity>(`/opportunities/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  policies: {
    list: () => request<Policy[]>("/policies"),
    page: (params: PageParams) => requestPage<Policy>(pageUrl("/policies", params)),
    create: (data: Partial<Policy>) => request<Policy>("/policies", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Policy>) => request<Policy>(`/policies/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    startCheck: (id: string) => request<PolicyCheck[]>(`/policies/${id}/start-check`, { method: "POST" }),
  },
  policyChecks: {
    list: (policyId: string) => request<PolicyCheck[]>(`/policy-checks?policyId=${policyId}`),
    update: (id: string, data: Partial<PolicyCheck>) => request<PolicyCheck>(`/policy-checks/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  discrepancies: {
    list: (policyId: string) => request<Discrepancy[]>(`/discrepancies?policyId=${policyId}`),
    create: (data: Partial<Discrepancy>) => request<Discrepancy>("/discrepancies", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Discrepancy>) => request<Discrepancy>(`/discrepancies/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  endorsements: {
    list: (policyId?: string) => request<Endorsement[]>(`/endorsements${policyId ? `?policyId=${policyId}` : ""}`),
    create: (data: Partial<Endorsement>) => request<Endorsement>("/endorsements", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Endorsement>) => request<Endorsement>(`/endorsements/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  renewals: {
    list: (policyId?: string) => request<Renewal[]>(`/renewals${policyId ? `?policyId=${policyId}` : ""}`),
    create: (data: Partial<Renewal>) => request<Renewal>("/renewals", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Renewal>) => request<Renewal>(`/renewals/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  tasks: {
    list: () => request<WorkflowTask[]>("/tasks"),
    update: (id: string, data: Partial<WorkflowTask>) => request<WorkflowTask>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  obligations: {
    list: () => request<ComplianceObligation[]>("/obligations"),
    create: (data: Partial<ComplianceObligation>) => request<ComplianceObligation>("/obligations", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<ComplianceObligation>) => request<ComplianceObligation>(`/obligations/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  claims: {
    list: () => request<Claim[]>("/claims"),
    get: (id: string) => request<Claim>(`/claims/${id}`),
    create: (data: Partial<Claim>) => request<Claim>("/claims", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Claim> & { timelineDetail?: string }) => request<Claim>(`/claims/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    managerReview: (id: string) => request<Claim>(`/claims/${id}/manager-review`, { method: "POST" }),
    reopen: (id: string, reason: string) => request<Claim>(`/claims/${id}/reopen`, { method: "POST", body: JSON.stringify({ reason }) }),
  },
  claimReserveLines: {
    list: (claimId: string) => request<ClaimReserveLine[]>(`/claim-reserve-lines?claimId=${claimId}`),
    create: (data: Partial<ClaimReserveLine>) => request<ClaimReserveLine>("/claim-reserve-lines", { method: "POST", body: JSON.stringify(data) }),
  },
  claimPaymentLines: {
    list: (claimId: string) => request<ClaimPaymentLine[]>(`/claim-payment-lines?claimId=${claimId}`),
    create: (data: Partial<ClaimPaymentLine>) => request<ClaimPaymentLine>("/claim-payment-lines", { method: "POST", body: JSON.stringify(data) }),
  },
  claimChecklistItems: {
    list: (claimId: string) => request<ClaimChecklistItem[]>(`/claim-checklist-items?claimId=${claimId}`),
    create: (data: Partial<ClaimChecklistItem>) => request<ClaimChecklistItem>("/claim-checklist-items", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<ClaimChecklistItem>) => request<ClaimChecklistItem>(`/claim-checklist-items/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  claimDiary: {
    list: (claimId: string) => request<ClaimDiaryEntry[]>(`/claim-diary?claimId=${claimId}`),
    create: (data: Partial<ClaimDiaryEntry>) => request<ClaimDiaryEntry>("/claim-diary", { method: "POST", body: JSON.stringify(data) }),
  },
  coverageVerification: {
    list: (claimId: string) => request<CoverageVerificationItem[]>(`/coverage-verification-items?claimId=${claimId}`),
    start: (claimId: string) => request<CoverageVerificationItem[]>(`/claims/${claimId}/start-coverage-check`, { method: "POST" }),
    update: (id: string, data: Partial<CoverageVerificationItem>) => request<CoverageVerificationItem>(`/coverage-verification-items/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  claimsEscalation: {
    get: () => request<ClaimsEscalation>("/claims-escalation"),
  },
  complaints: {
    list: () => request<Complaint[]>("/complaints"),
    create: (data: Partial<Complaint>) => request<Complaint>("/complaints", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Complaint>) => request<Complaint>(`/complaints/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  insurers: {
    list: () => request<Insurer[]>("/insurers"),
    create: (data: Partial<Insurer>) => request<Insurer>("/insurers", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Insurer>) => request<Insurer>(`/insurers/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  insurerRates: {
    list: (insurerId?: string) => request<InsurerRateVersion[]>(`/insurer-rates${insurerId ? `?insurerId=${insurerId}` : ""}`),
    create: (data: Partial<InsurerRateVersion>) => request<InsurerRateVersion>("/insurer-rates", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<InsurerRateVersion>) => request<InsurerRateVersion>(`/insurer-rates/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  insurerAppetite: {
    list: (insurerId?: string) => request<InsurerAppetite[]>(`/insurer-appetite${insurerId ? `?insurerId=${insurerId}` : ""}`),
    create: (data: Partial<InsurerAppetite>) => request<InsurerAppetite>("/insurer-appetite", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<InsurerAppetite>) => request<InsurerAppetite>(`/insurer-appetite/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  products: {
    list: (insurerId?: string) => request<Product[]>(`/products${insurerId ? `?insurerId=${insurerId}` : ""}`),
    create: (data: Partial<Product>) => request<Product>("/products", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Product>) => request<Product>(`/products/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  statutoryLevies: {
    list: () => request<StatutoryLevy[]>("/statutory-levies"),
    create: (data: Partial<StatutoryLevy>) => request<StatutoryLevy>("/statutory-levies", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<StatutoryLevy>) => request<StatutoryLevy>(`/statutory-levies/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  commissionGuide: {
    list: () => request<CommissionGuideEntry[]>("/commission-guide"),
  },
  premiumConfirmations: {
    list: (policyId?: string) => request<PremiumConfirmation[]>(`/premium-confirmations${policyId ? `?policyId=${policyId}` : ""}`),
    create: (data: Partial<PremiumConfirmation> & { method?: string }) => request<PremiumConfirmation>("/premium-confirmations", { method: "POST", body: JSON.stringify(data) }),
  },
  financialTransactions: {
    list: () => request<FinancialTransaction[]>("/financial-transactions"),
  },
  commissionClawbacks: {
    create: (data: { policyId: string; amountKes: number; reason: string }) => request<FinancialTransaction>("/commission-clawbacks", { method: "POST", body: JSON.stringify(data) }),
  },
  payments: {
    list: (partyId?: string) => request<Payment[]>(`/payments${partyId ? `?partyId=${partyId}` : ""}`),
    get: (id: string) => request<Payment>(`/payments/${id}`),
    create: (data: Partial<Payment>) => request<Payment>("/payments", { method: "POST", body: JSON.stringify(data) }),
    allocate: (id: string, data: { policyId: string; confirmedAmountKes: number }) => request<PremiumConfirmation>(`/payments/${id}/allocations`, { method: "POST", body: JSON.stringify(data) }),
  },
  premiumAgeing: {
    get: () => request<PremiumAgeing>("/premium-ageing"),
  },
  pettyCashFloats: {
    list: () => request<PettyCashFloat[]>("/petty-cash-floats"),
    create: (data: Partial<PettyCashFloat>) => request<PettyCashFloat>("/petty-cash-floats", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<PettyCashFloat>) => request<PettyCashFloat>(`/petty-cash-floats/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  pettyCashTransactions: {
    list: (floatId?: string) => request<PettyCashTransaction[]>(`/petty-cash-transactions${floatId ? `?floatId=${floatId}` : ""}`),
    create: (data: Partial<PettyCashTransaction>) => request<PettyCashTransaction>("/petty-cash-transactions", { method: "POST", body: JSON.stringify(data) }),
  },
  officeExpenses: {
    list: () => request<OfficeExpense[]>("/office-expenses"),
    create: (data: Partial<OfficeExpense>) => request<OfficeExpense>("/office-expenses", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<OfficeExpense>) => request<OfficeExpense>(`/office-expenses/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  glAccounts: {
    list: () => request<GlAccount[]>("/gl-accounts"),
    create: (data: Partial<GlAccount>) => request<GlAccount>("/gl-accounts", { method: "POST", body: JSON.stringify(data) }),
    update: (code: string, data: Partial<GlAccount>) => request<GlAccount>(`/gl-accounts/${code}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  accountingPeriods: {
    list: () => request<AccountingPeriod[]>("/accounting-periods"),
    create: (data: Partial<AccountingPeriod>) => request<AccountingPeriod>("/accounting-periods", { method: "POST", body: JSON.stringify(data) }),
    close: (id: string) => request<AccountingPeriod>(`/accounting-periods/${id}`, { method: "PATCH", body: JSON.stringify({ status: "closed" }) }),
  },
  journalEntries: {
    list: (periodId?: string) => request<JournalEntry[]>(`/journal-entries${periodId ? `?periodId=${periodId}` : ""}`),
    create: (data: { periodId: string; entryDate: string; description?: string; reference?: string; lines: { accountCode: string; debitKes?: number; creditKes?: number; description?: string }[] }) =>
      request<JournalEntry>("/journal-entries", { method: "POST", body: JSON.stringify(data) }),
    reverse: (id: string, periodId?: string) => request<JournalEntry>(`/journal-entries/${id}/reverse`, { method: "POST", body: JSON.stringify({ periodId }) }),
  },
  gl: {
    trialBalance: (periodId: string) => request<TrialBalance>(`/gl/trial-balance?periodId=${periodId}`),
    incomeStatement: (periodId: string) => request<IncomeStatement>(`/gl/income-statement?periodId=${periodId}`),
    balanceSheet: (asOfDate?: string) => request<BalanceSheet>(`/gl/balance-sheet${asOfDate ? `?asOfDate=${asOfDate}` : ""}`),
  },
  commissionStatements: {
    list: (insurerId?: string) => request<CommissionStatement[]>(`/commission-statements${insurerId ? `?insurerId=${insurerId}` : ""}`),
    create: (data: Partial<CommissionStatement>) => request<CommissionStatement>("/commission-statements", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<CommissionStatement>) => request<CommissionStatement>(`/commission-statements/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    reconcile: (id: string) => request<{ statement: CommissionStatement; matchedCount: number; discrepancyCount: number; unresolvedCount: number }>(`/commission-statements/${id}/reconcile`, { method: "POST" }),
  },
  commissionLines: {
    list: (statementId: string) => request<CommissionLine[]>(`/commission-lines?statementId=${statementId}`),
    create: (data: Partial<CommissionLine>) => request<CommissionLine>("/commission-lines", { method: "POST", body: JSON.stringify(data) }),
  },
  documents: {
    list: (ownerEntityType?: string, ownerEntityId?: string) => {
      const params = new URLSearchParams();
      if (ownerEntityType) params.set("ownerEntityType", ownerEntityType);
      if (ownerEntityId) params.set("ownerEntityId", ownerEntityId);
      const qs = params.toString();
      return request<DocumentMeta[]>(`/documents${qs ? `?${qs}` : ""}`);
    },
    upload: (data: { fileName: string; mimeType: string; fileBase64: string; ownerEntityType: string; ownerEntityId: string; documentType?: string; sensitivity?: string }) =>
      request<DocumentMeta>("/documents", { method: "POST", body: JSON.stringify(data) }),
    download: (id: string) => requestBlob(`/documents/${id}/download`),
  },
  risks: {
    list: (opportunityId?: string) => request<Risk[]>(`/risks${opportunityId ? `?opportunityId=${opportunityId}` : ""}`),
    create: (data: Partial<Risk>) => request<Risk>("/risks", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Risk>) => request<Risk>(`/risks/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  marketStrategies: {
    list: (riskId?: string) => request<MarketStrategy[]>(`/market-strategies${riskId ? `?riskId=${riskId}` : ""}`),
    create: (data: Partial<MarketStrategy>) => request<MarketStrategy>("/market-strategies", { method: "POST", body: JSON.stringify(data) }),
  },
  underwritingApprovals: {
    list: (riskId?: string) => request<UnderwritingApproval[]>(`/underwriting-approvals${riskId ? `?riskId=${riskId}` : ""}`),
    request: (data: { riskId: string; reason: string }) => request<UnderwritingApproval[]>("/underwriting-approvals", { method: "POST", body: JSON.stringify(data) }),
    decide: (id: string, data: { decision: "approved" | "rejected"; comments?: string; conditions?: string }) => request<UnderwritingApproval>(`/underwriting-approvals/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  underwritingQueries: {
    list: (submissionId?: string) => request<UnderwritingQuery[]>(`/underwriting-queries${submissionId ? `?submissionId=${submissionId}` : ""}`),
    create: (data: Partial<UnderwritingQuery>) => request<UnderwritingQuery>("/underwriting-queries", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<UnderwritingQuery>) => request<UnderwritingQuery>(`/underwriting-queries/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  riskClearances: {
    list: (riskId?: string) => request<RiskClearance[]>(`/risk-clearances${riskId ? `?riskId=${riskId}` : ""}`),
    create: (data: Partial<RiskClearance>) => request<RiskClearance>("/risk-clearances", { method: "POST", body: JSON.stringify(data) }),
  },
  submissions: {
    list: (riskId?: string) => request<Submission[]>(`/submissions${riskId ? `?riskId=${riskId}` : ""}`),
    create: (data: Partial<Submission> & { singleSourceJustification?: string }) => request<Submission>("/submissions", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Submission>) => request<Submission>(`/submissions/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  quotations: {
    list: (submissionId?: string) => request<Quotation[]>(`/quotations${submissionId ? `?submissionId=${submissionId}` : ""}`),
    create: (data: Partial<Quotation>) => request<Quotation>("/quotations", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Quotation>) => request<Quotation>(`/quotations/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  recommendations: {
    list: (submissionId?: string) => request<Recommendation[]>(`/recommendations${submissionId ? `?submissionId=${submissionId}` : ""}`),
    create: (data: Partial<Recommendation>) => request<Recommendation>("/recommendations", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Recommendation> & { actorStaffId?: string }) => request<Recommendation>(`/recommendations/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  auditLog: {
    list: () => request<AuditLogEntry[]>("/audit-log"),
  },
  auth: {
    login: (email: string, password: string) => request<{ token: string; staff: StaffProfile }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
    me: () => request<StaffSession>("/auth/me"),
  },
  roles: {
    list: () => request<Role[]>("/roles"),
  },
  staff: {
    list: () => request<Staff[]>("/staff"),
    create: (data: Partial<Staff> & { password?: string; jobTitle?: string; department?: string; branch?: string; employmentType?: string; hireDate?: string; nationalId?: string; kraPin?: string; emergencyContactName?: string; emergencyContactPhone?: string; baseSalaryKes?: number }) =>
      request<Staff & Employee>("/staff", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Staff>) => request<Staff>(`/staff/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  employees: {
    list: () => request<Employee[]>("/employees"),
    update: (staffId: string, data: Partial<Employee>) => request<Employee>(`/employees/${staffId}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  leaveTypes: {
    list: () => request<LeaveType[]>("/leave-types"),
  },
  leaveBalances: {
    list: (staffId?: string) => request<LeaveBalance[]>(`/leave-balances${staffId ? `?staffId=${staffId}` : ""}`),
  },
  leaveRequests: {
    list: (staffId?: string) => request<LeaveRequest[]>(`/leave-requests${staffId ? `?staffId=${staffId}` : ""}`),
    create: (data: { staffId: string; leaveTypeId: string; startDate: string; endDate: string; reason?: string }) =>
      request<LeaveRequest>("/leave-requests", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: { status: LeaveRequest["status"]; decisionNotes?: string }) =>
      request<LeaveRequest>(`/leave-requests/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  performanceReviews: {
    list: (staffId?: string) => request<PerformanceReview[]>(`/performance-reviews${staffId ? `?staffId=${staffId}` : ""}`),
    create: (data: Partial<PerformanceReview>) => request<PerformanceReview>("/performance-reviews", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<PerformanceReview>) => request<PerformanceReview>(`/performance-reviews/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  producers: {
    list: () => request<Producer[]>("/producers"),
    create: (data: Partial<Producer>) => request<Producer>("/producers", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Producer>) => request<Producer>(`/producers/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
  producerCommissionSplits: {
    list: (producerId?: string) => request<ProducerCommissionSplit[]>(`/producer-commission-splits${producerId ? `?producerId=${producerId}` : ""}`),
    pay: (id: string, paymentReference?: string) => request<ProducerCommissionSplit>(`/producer-commission-splits/${id}/pay`, { method: "POST", body: JSON.stringify({ paymentReference }) }),
  },
};
