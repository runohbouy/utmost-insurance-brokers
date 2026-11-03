// ---------------------------------------------------------------------------
// Tenant configuration, receipts, invoices, allocation, KPIs and portal access.
// The API in ../modules answers in these shapes; money is always integer minor units
// (cents) with its ISO 4217 currency, plus a ready-made `display` string in the
// tenant's locale. Never do arithmetic on `display`.
// ---------------------------------------------------------------------------
export interface MoneyDto { amountMinor: number; currency: string; display: string }

export type ReceiptStatus = "received" | "deposited" | "cleared" | "bounced" | "cancelled";
export type ReceiptMethod = "cash" | "mpesa" | "bank" | "card" | "cheque";

export interface ReceiptRow {
  id: string; receiptNo: string; clientId: string; clientName: string | null;
  amount: MoneyDto; allocated: MoneyDto; unallocated: MoneyDto;
  method: ReceiptMethod; reference: string | null; instrumentNo: string | null; drawerBank: string | null;
  status: ReceiptStatus; holdingKind: "suspense" | "client_credit" | null;
  approvalStatus: "not_required" | "pending" | "approved" | "rejected"; approvedBy: string | null; approvedAt: string | null; approvalNote: string | null;
  receivedAt: string | null; depositedAt: string | null; clearedAt: string | null; bouncedAt: string | null; cancelledAt: string | null;
  configVersionId: string; recordedBy: string | null; createdAt: string | null;
}
export interface ReceiptAllocationRow {
  id: string; invoiceId: string; invoiceNo: string; kind: "apply" | "reversal"; amount: MoneyDto;
  reversesAllocationId: string | null; reason: string | null; at: string | null;
}
export interface ReceiptDetail extends ReceiptRow {
  events: { from: string | null; to: string; at: string | null; actorId: string | null; note: string | null }[];
  allocations: ReceiptAllocationRow[];
  replayed?: boolean;
  bounce?: { reversed: { allocationId: string; invoiceId: string; amountMinor: number }[]; reversedMinor: number; policiesNeedingReview: string[]; feeInvoiceId: string | null };
}

export type InvoiceState = "open" | "part_paid" | "paid" | "overdue" | "void";
export interface InvoiceRow {
  id: string; invoiceNo: string; kind: "premium" | "fee"; policyId: string | null; clientId: string; clientName: string | null; productType: string | null;
  issueDate: string; dueDate: string; status: InvoiceState; total: MoneyDto; paid: MoneyDto; outstanding: MoneyDto; overdue: boolean; configVersionId: string;
}
export interface InvoiceDetail extends InvoiceRow {
  lines: { id: string; kind: "net" | "tax" | "fee"; code: string; description: string; amount: MoneyDto; paid: MoneyDto; outstanding: MoneyDto }[];
}

export type AllocationStrategy = "fifo" | "policy_priority" | "product_type_priority" | "pro_rata" | "manual" | "hybrid";
export interface AllocationOutcome {
  batchId: string | null; strategy: AllocationStrategy; replayed: boolean; preview: boolean;
  holdingKind: "suspense" | "client_credit" | null; policiesActivated: string[];
  allocations: { allocationId: string | null; invoiceId: string; invoiceNo: string | null; amount: MoneyDto; lines: { lineId: string; kind: string; amount: MoneyDto }[] }[];
  remainder: MoneyDto; stillOutstanding: MoneyDto; receipt: ReceiptDetail;
}

export interface ClientPosition {
  clientId: string; clientName: string; outstanding: MoneyDto; suspense: MoneyDto; clientCredit: MoneyDto;
  invoices: InvoiceRow[]; heldReceipts: ReceiptRow[]; pendingReceipts: ReceiptRow[];
}

export interface TaxRule { code: string; name: string; kind: "percent" | "flat"; rateBps?: number; flatMinor?: number }
export interface ConfigSlices {
  regional: { countryCode: string; currency: string; timeZone: string; fiscalYearStartMonth: number; weekStartsOn: 0 | 1 | 6 };
  tax: { pricing: "exclusive" | "inclusive"; rounding: "half_up" | "half_even" | "down"; taxes: TaxRule[] };
  localization: { locale: string; dateFormat: string };
  brand: { displayName: string; primaryColor: string; onPrimaryColor: string; accentColor: string; surfaceColor: string; textColor: string; fontFamily: string };
  entitlements: { modules: string[]; limits: { staffSeats: number; portalUsers: number } };
  finance: {
    allocationStrategy: string; feesFirst: boolean; overpaymentTreatment: "suspense" | "client_credit";
    returnedChequeFeeMinor: number; policyPriority: string[]; productTypePriority: string[]; receiptApproval: "none" | "required";
  };
  security: { mfa: "optional" | "required" };
}
export interface TenantConfig extends ConfigSlices { tenantId: string; versionId: string; version: number; regionPack: string; effectiveFrom: string; hash: string }
export interface PublicConfig {
  tenantId: string; version: number; hash: string; effectiveFrom: string;
  regional: ConfigSlices["regional"]; localization: ConfigSlices["localization"]; brand: ConfigSlices["brand"];
  tax: { pricing: string; taxes: TaxRule[] }; modules: string[]; receiptApproval?: "none" | "required";
}
export interface ConfigVersionSummary {
  id: string; tenantId: string; version: number; status: "draft" | "published" | "superseded"; regionPack: string; note: string | null;
  contentHash: string | null; effectiveFrom: string | null; createdBy: string | null; createdAt: string; publishedBy: string | null; publishedAt: string | null;
}
export interface ConfigDraft extends ConfigVersionSummary {
  overrides: Record<string, unknown>;
  validation: { valid: boolean; issues: { path: string; message: string }[]; preview?: ConfigSlices };
}
export interface RegionPackSummary { code: string; country: string; currency: string; timeZone: string; locale: string; taxPricing: string; taxes: TaxRule[] }

export interface KpiResult {
  key: string; name: string; description: string; category: string; unit: "money" | "count" | "percent" | "days"; pointInTime: boolean;
  value: number; currency?: string; display: string;
  period: { from: string; to: string; timeZone: string } | null; asOf?: { date: string; timeZone: string };
  series?: { bucket: string; value: number }[];
}
export interface KpiSummary { period: { from: string; to: string; granularity: string; timeZone: string }; kpis: KpiResult[] }

export interface PortalUser {
  id: string; partyId: string; partyName: string | null; email: string; active: boolean; mustChangePassword: boolean; mfaEnabled?: boolean;
  lastLoginAt: string | null; createdAt: string | null; temporaryPassword?: string;
}
