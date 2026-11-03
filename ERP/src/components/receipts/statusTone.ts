import type { InvoiceState, ReceiptStatus } from "../../financeTypes";

type Tone = "good" | "warning" | "critical" | "neutral";

export const RECEIPT_TONE: Record<ReceiptStatus, Tone> = {
  received: "warning", deposited: "warning", cleared: "good", bounced: "critical", cancelled: "neutral",
};
export const RECEIPT_LABEL: Record<ReceiptStatus, string> = {
  received: "Received", deposited: "Deposited", cleared: "Cleared", bounced: "Bounced", cancelled: "Cancelled",
};

export const INVOICE_TONE: Record<InvoiceState, Tone> = {
  open: "neutral", part_paid: "warning", paid: "good", overdue: "critical", void: "neutral",
};
export const INVOICE_LABEL: Record<InvoiceState, string> = {
  open: "Open", part_paid: "Part paid", paid: "Paid", overdue: "Overdue", void: "Void",
};

export const APPROVAL_LABEL = { pending: "Awaiting approval", approved: "Approved", rejected: "Rejected", not_required: "" } as const;
/** History entries that are decisions rather than status changes. */
export const EVENT_LABEL: Record<string, string> = { approved: "Approved", rejected: "Rejected" };

export const HOLDING_LABEL = { suspense: "Suspense", client_credit: "Client credit" } as const;
