import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import PortalDashboardView from "../src/components/PortalDashboardView";
import { portalToken, setPortalToken } from "../src/portalApi";

// The customer portal shows a client's own account from the backend's portal API. These tests drive the
// real component against mocked responses: signing in, being made to choose a password, reading real
// balances, and what happens when the server says no.

const money = (minor: number) => ({ amountMinor: minor, currency: "KES", display: `Ksh ${(minor / 100).toLocaleString("en-KE", { minimumFractionDigits: 2 })}` });
const CONFIG = { name: "Utmost Insurance Brokers", locale: "en-KE", dateFormat: "dd/MM/yyyy", timeZone: "Africa/Nairobi", currency: "KES", portalEnabled: true, brand: { displayName: "Utmost Insurance Brokers", primaryColor: "#0b5c3b" } };
const ME = { userId: "pu-1", partyId: "party-1", name: "Wanjiru Kamau", email: "wanjiru@example.com", phone: "0712 345 678", mustChangePassword: false };
const POSITION = {
  outstanding: money(5_000_000), unappliedPayments: money(0),
  openInvoices: [{ id: "inv-1", invoiceNo: "INV-2026-000001", dueDate: "2026-11-01", outstanding: money(5_000_000), overdue: false }, { id: "inv-2", invoiceNo: "INV-2026-000002", dueDate: "2026-08-01", outstanding: money(0), overdue: true }],
  chequesInClearing: [{ id: "rct-9", receiptNo: "RCT-2026-000009", amount: money(2_500_000), status: "deposited", instrumentNo: "004513" }],
};
const INVOICE = { id: "inv-1", invoiceNo: "INV-2026-000001", kind: "premium", policyId: "pol-1", productType: "07", issueDate: "2026-10-01", dueDate: "2026-11-01", status: "part_paid", total: money(10_000_000), paid: money(5_000_000), outstanding: money(5_000_000) };
const RECEIPT = { id: "rct-1", receiptNo: "RCT-2026-000001", amount: money(5_000_000), method: "mpesa", reference: "QWE1", instrumentNo: null, status: "cleared", receivedAt: "2026-10-05T07:00:00Z", clearedAt: "2026-10-05T07:00:00Z", bouncedAt: null, applied: money(5_000_000), notYetApplied: money(0) };
const POLICY = { id: "pol-1", category: "Motor private", status: "Active", startDate: "2026-01-01", endDate: "2026-12-31", insurer: "Jubilee", premium: money(10_000_000) };
const STATEMENT = {
  currency: "KES", timeZone: "Africa/Nairobi", openingBalance: money(0), closingBalance: money(5_000_000),
  entries: [
    { date: "2026-10-01", type: "invoice", reference: "INV-2026-000001", description: "Invoice", amount: money(10_000_000), balance: money(10_000_000) },
    { date: "2026-10-05", type: "payment", reference: "RCT-2026-000001", description: "Payment applied to INV-2026-000001", amount: money(-5_000_000), balance: money(5_000_000) },
  ],
};

type Handler = (init?: RequestInit) => Response | Promise<Response>;
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });
const problem = (status: number, slug: string, title: string, detail?: string) => json({ type: `https://x.example/problems/${slug}`, title, status, detail }, status);

/** Replaces fetch with the portal API. Unknown paths answer 404 so a stray call is visible. */
function mockPortal(overrides: Record<string, Handler> = {}) {
  const routes: Record<string, Handler> = {
    "GET /config": () => json(CONFIG),
    "POST /auth/login": () => json({ token: "tok-1", expiresAt: Date.now() + 7200_000, mustChangePassword: false }),
    "GET /me": () => json(ME),
    "GET /position": () => json(POSITION),
    "GET /policies": () => json([POLICY], 200, { "X-Total-Count": "1" }),
    "GET /invoices": () => json([INVOICE], 200, { "X-Total-Count": "1" }),
    "GET /invoices/inv-1": () => json({ ...INVOICE, lines: [{ id: "l1", kind: "net", description: "Premium pol-1", amount: money(10_000_000), paid: money(5_000_000), outstanding: money(5_000_000) }] }),
    "GET /receipts": () => json([RECEIPT], 200, { "X-Total-Count": "1" }),
    "GET /statement": () => json(STATEMENT),
    ...overrides,
  };
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace(/^.*\/api\/portal/, "").split("?")[0];
    const key = `${init?.method ?? "GET"} ${path}`;
    return key in routes ? routes[key](init) : json({ error: "not mocked: " + key }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const view = () => render(<PortalDashboardView setActiveTab={vi.fn()} selectedQuote={null} savedAnalysis={null} />);

async function signIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText(/email/i), "wanjiru@example.com");
  await user.type(screen.getByLabelText(/password/i), "Correct-Horse-42");
  await user.click(screen.getByRole("button", { name: /^sign in$/i }));
}

beforeEach(() => { setPortalToken(null); });

describe("signing in", () => {
  it("asks for an email and password and keeps no demo data on the page", async () => {
    mockPortal();
    view();
    expect(await screen.findByRole("form", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByText(/Utmost Insurance Brokers customer account/)).toBeInTheDocument();
    expect(screen.queryByText(/David Kiprop/)).not.toBeInTheDocument();
    expect(screen.queryByText(/bypass/i)).not.toBeInTheDocument();
  });

  it("says plainly when the email and password do not match", async () => {
    mockPortal({ "POST /auth/login": () => problem(401, "invalid-credentials", "Invalid email or password") });
    const user = userEvent.setup();
    view();
    await signIn(user);
    expect(await screen.findByRole("alert")).toHaveTextContent(/do not match/i);
    expect(portalToken()).toBeNull();
  });

  it("tells the client to slow down when they are rate limited", async () => {
    mockPortal({ "POST /auth/login": () => problem(429, "too-many-attempts", "Too many sign-in attempts") });
    const user = userEvent.setup();
    view();
    await signIn(user);
    expect(await screen.findByRole("alert")).toHaveTextContent(/too many attempts/i);
  });

  it("copes with the server being unreachable", async () => {
    mockPortal({ "POST /auth/login": () => { throw new Error("network down"); } });
    const user = userEvent.setup();
    view();
    await signIn(user);
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not reach the server/i);
  });

  it("explains when the brokerage has not switched online accounts on", async () => {
    mockPortal({ "GET /config": () => json({ ...CONFIG, portalEnabled: false }) });
    view();
    expect(await screen.findByText(/not available yet/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
  });

  it("makes a first-time client replace the one-time password before showing anything", async () => {
    let changed = false;
    mockPortal({
      "POST /auth/login": () => json({ token: "tok-1", expiresAt: Date.now() + 7200_000, mustChangePassword: true }),
      "GET /me": () => json({ ...ME, mustChangePassword: !changed }),
      "POST /auth/change-password": () => { changed = true; return new Response(null, { status: 204 }); },
    });
    const user = userEvent.setup();
    view();
    await signIn(user);
    expect(await screen.findByRole("form", { name: /change password/i })).toBeInTheDocument();
    expect(screen.queryByText("You owe")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/one-time password/i), "tempTEMP12345678");
    await user.type(screen.getByLabelText(/^new password/i), "Correct-Horse-42");
    await user.type(screen.getByLabelText(/repeat new password/i), "Different-Horse-42");
    await user.click(screen.getByRole("button", { name: /save password/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/do not match/i);

    await user.clear(screen.getByLabelText(/repeat new password/i));
    await user.type(screen.getByLabelText(/repeat new password/i), "Correct-Horse-42");
    await user.click(screen.getByRole("button", { name: /save password/i }));
    expect(await screen.findByText("You owe")).toBeInTheDocument();
  });
});

describe("the signed-in account", () => {
  async function openAccount() {
    mockPortal();
    setPortalToken("tok-1");
    view();
    await screen.findByText("You owe");
  }

  it("resumes an existing session without asking to sign in again", async () => {
    await openAccount();
    expect(screen.getByText("Wanjiru Kamau")).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: /sign in/i })).not.toBeInTheDocument();
  });

  it("shows what is owed and what is still clearing, straight from the server", async () => {
    await openAccount();
    const balances = screen.getByRole("group", { name: /your balances/i });
    expect(within(balances).getByText("Ksh 50,000.00")).toBeInTheDocument();
    expect(screen.getByText("INV-2026-000001")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cheques being processed" })).toBeInTheDocument();
    expect(screen.getByText(/cheque 004513/)).toBeInTheDocument();
    expect(screen.getByText(/Deposited — clearing/)).toBeInTheDocument();
  });

  it("lists invoices and opens one to show its lines", async () => {
    await openAccount();
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Invoices" }));
    await user.click(await screen.findByRole("button", { name: "INV-2026-000001" }));
    expect(await screen.findByText("Premium pol-1")).toBeInTheDocument();
    expect(screen.getByText("Part paid")).toBeInTheDocument();
  });

  it("lists payments with their status", async () => {
    await openAccount();
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Payments" }));
    expect(await screen.findByText("RCT-2026-000001")).toBeInTheDocument();
    expect(screen.getByText("Cleared")).toBeInTheDocument();
  });

  it("lists policies", async () => {
    await openAccount();
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Policies" }));
    expect(await screen.findByText(/Motor private · Jubilee/)).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("shows a statement whose last line is what is owed", async () => {
    await openAccount();
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Statement" }));
    expect(await screen.findByText("Balance owing")).toBeInTheDocument();
    const rows = screen.getAllByRole("row");
    expect(rows[rows.length - 1]).toHaveTextContent("Ksh 50,000.00");
    expect(screen.getByText(/Payment applied to INV-2026-000001/)).toBeInTheDocument();
  });

  it("reports a failed load instead of showing a blank page", async () => {
    mockPortal({ "GET /invoices": () => problem(500, "internal", "Internal server error") });
    setPortalToken("tok-1");
    const user = userEvent.setup();
    view();
    await screen.findByText("You owe");
    await user.click(screen.getByRole("tab", { name: "Invoices" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("signs out: the token is discarded and the sign-in form returns", async () => {
    await openAccount();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /sign out/i }));
    expect(await screen.findByRole("form", { name: /sign in/i })).toBeInTheDocument();
    expect(portalToken()).toBeNull();
  });

  it("sends a revoked or expired session back to sign in", async () => {
    mockPortal({ "GET /me": () => problem(401, "session-required", "Sign in required") });
    setPortalToken("stale");
    view();
    expect(await screen.findByRole("form", { name: /sign in/i })).toBeInTheDocument();
    await waitFor(() => expect(portalToken()).toBeNull());
  });

  it("sends the session token only to the portal API, never in a URL", async () => {
    const fetchMock = mockPortal();
    setPortalToken("tok-secret");
    view();
    await screen.findByText("You owe");
    for (const [url, init] of fetchMock.mock.calls) {
      expect(String(url)).not.toContain("tok-secret");
      expect(String(url)).toMatch(/\/api\/portal\//);
      if (!String(url).endsWith("/config")) expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok-secret");
    }
  });
});
