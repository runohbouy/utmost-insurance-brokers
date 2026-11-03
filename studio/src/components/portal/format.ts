// Display helpers for the portal. Money arrives from the server already formatted in the
// tenant's currency and locale; dates are shown in the tenant's time zone, never the browser's.

export function formatDay(day: string | null | undefined, locale: string): string {
  if (!day) return "—";
  // a calendar day has no zone: format it as UTC noon so it can never slip to the neighbouring day
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
}

export function formatInstant(iso: string | null | undefined, locale: string, timeZone: string): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(iso));
}

export const INVOICE_STATUS: Record<string, { label: string; tone: "ok" | "warn" | "bad" | "idle" }> = {
  open: { label: "Due", tone: "idle" }, part_paid: { label: "Part paid", tone: "warn" }, paid: { label: "Paid", tone: "ok" },
  overdue: { label: "Overdue", tone: "bad" }, void: { label: "Cancelled", tone: "idle" },
};

export const PAYMENT_STATUS: Record<string, { label: string; tone: "ok" | "warn" | "bad" | "idle" }> = {
  received: { label: "Received — awaiting deposit", tone: "warn" }, deposited: { label: "Deposited — clearing", tone: "warn" },
  cleared: { label: "Cleared", tone: "ok" }, bounced: { label: "Returned unpaid", tone: "bad" }, cancelled: { label: "Cancelled", tone: "idle" },
};

export const TONE_CLASS = {
  ok: "border-emerald-300 bg-emerald-50 text-emerald-800",
  warn: "border-amber-300 bg-amber-50 text-amber-800",
  bad: "border-red-300 bg-red-50 text-red-800",
  idle: "border-[#D8E2F0] bg-[#FAF9F6] text-[#5E5A51]",
} as const;
