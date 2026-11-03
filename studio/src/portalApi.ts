import { PORTAL_API } from "./api";

// ---------------------------------------------------------------------------
// Client for the backend's self-service portal (/api/portal/*). A client signs in with the
// email and password staff set up for them and then sees ONLY their own policies, invoices
// and payments — the server decides that from the token, nothing here can widen it.
//
// The session token is kept in sessionStorage (gone when the tab closes) rather than
// localStorage, so a shared computer does not stay signed in.
// ---------------------------------------------------------------------------

export interface Money { amountMinor: number; currency: string; display: string }

export interface PortalConfig {
  name: string; locale: string; dateFormat: string; timeZone: string; currency: string; portalEnabled: boolean;
  brand: { displayName: string; primaryColor: string };
}
export interface PortalMe { userId: string; partyId: string; name: string | null; email: string; phone: string | null; mustChangePassword: boolean; mfaEnabled?: boolean }
export interface PortalPosition {
  outstanding: Money; unappliedPayments: Money;
  openInvoices: { id: string; invoiceNo: string; dueDate: string; outstanding: Money; overdue: boolean }[];
  chequesInClearing: { id: string; receiptNo: string; amount: Money; status: string; instrumentNo: string | null }[];
}
export interface PortalInvoice {
  id: string; invoiceNo: string; kind: "premium" | "fee"; policyId: string | null; productType: string | null; issueDate: string; dueDate: string;
  status: "open" | "part_paid" | "paid" | "overdue" | "void"; total: Money; paid: Money; outstanding: Money;
  lines?: { id: string; kind: string; description: string; amount: Money; paid: Money; outstanding: Money }[];
}
export interface PortalReceipt {
  id: string; receiptNo: string; amount: Money; method: string; reference: string | null; instrumentNo: string | null;
  status: "received" | "deposited" | "cleared" | "bounced" | "cancelled"; receivedAt: string | null; clearedAt: string | null; bouncedAt: string | null;
  applied: Money; notYetApplied: Money;
}
export interface PortalPolicy { id: string; category: string; status: string; startDate: string; endDate: string; insurer: string | null; premium: Money }
export interface PortalStatement {
  currency: string; timeZone: string; openingBalance: Money; closingBalance: Money;
  entries: { date: string; type: "invoice" | "payment" | "reversal"; reference: string; description: string; amount: Money; balance: Money }[];
}

export class PortalError extends Error {
  constructor(message: string, readonly status: number, readonly problemType?: string, readonly mfaRequired = false) { super(message); this.name = "PortalError"; }
}

const TOKEN_KEY = "utmost_portal_token";
let memoryToken: string | null = null;
export function portalToken(): string | null {
  try { return sessionStorage.getItem(TOKEN_KEY) ?? memoryToken; } catch { return memoryToken; }
}
export function setPortalToken(token: string | null) {
  memoryToken = token;
  try { if (token) sessionStorage.setItem(TOKEN_KEY, token); else sessionStorage.removeItem(TOKEN_KEY); } catch { /* private mode: memory only */ }
}

async function call<T>(path: string, init: RequestInit = {}, withAuth = true): Promise<{ body: T; total: number | null }> {
  const token = portalToken();
  let res: Response;
  try {
    res = await fetch(`${PORTAL_API}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(withAuth && token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
    });
  } catch {
    throw new PortalError("We could not reach the server. Check your connection and try again.", 0);
  }
  if (res.status === 204) return { body: undefined as T, total: null };
  const body = await res.json().catch(() => undefined);
  if (!res.ok) {
    const fields = Array.isArray(body?.errors) ? ` ${body.errors.map((e: { message: string }) => e.message).join("; ")}` : "";
    throw new PortalError(`${body?.detail ?? body?.title ?? `Request failed (${res.status})`}${fields}`, res.status, typeof body?.type === "string" ? body.type.split("/").pop() : undefined, body?.mfaRequired === true);
  }
  const total = res.headers.get("X-Total-Count");
  return { body: body as T, total: total === null ? null : Number(total) };
}

const page = (limit: number, offset: number) => `limit=${limit}&offset=${offset}`;

export const portalApi = {
  config: () => call<PortalConfig>("/config", {}, false).then((r) => r.body),
  login: (email: string, password: string, code?: string) =>
    call<{ token: string; expiresAt: number; mustChangePassword: boolean }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password, ...(code ? { code } : {}) }) }, false).then((r) => r.body),
  mfaSetup: () => call<{ secret: string; otpauthUrl: string; qrSvg: string }>("/auth/mfa/setup", { method: "POST" }).then((r) => r.body),
  mfaEnable: (code: string) => call<{ mfaEnabled: boolean }>("/auth/mfa/enable", { method: "POST", body: JSON.stringify({ code }) }).then((r) => r.body),
  mfaDisable: (password: string, code: string) => call<{ mfaEnabled: boolean }>("/auth/mfa/disable", { method: "POST", body: JSON.stringify({ password, code }) }).then((r) => r.body),
  changePassword: (currentPassword: string, newPassword: string) =>
    call<void>("/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }).then(() => undefined),
  me: () => call<PortalMe>("/me").then((r) => r.body),
  position: () => call<PortalPosition>("/position").then((r) => r.body),
  invoices: (limit: number, offset: number) => call<PortalInvoice[]>(`/invoices?${page(limit, offset)}`).then((r) => ({ rows: r.body, total: r.total ?? r.body.length })),
  invoice: (id: string) => call<PortalInvoice>(`/invoices/${encodeURIComponent(id)}`).then((r) => r.body),
  receipts: (limit: number, offset: number) => call<PortalReceipt[]>(`/receipts?${page(limit, offset)}`).then((r) => ({ rows: r.body, total: r.total ?? r.body.length })),
  policies: (limit: number, offset: number) => call<PortalPolicy[]>(`/policies?${page(limit, offset)}`).then((r) => ({ rows: r.body, total: r.total ?? r.body.length })),
  statement: (from?: string, to?: string) => {
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    return call<PortalStatement>(`/statement${q.size ? `?${q}` : ""}`).then((r) => r.body);
  },
};
