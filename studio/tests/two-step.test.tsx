import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import PortalDashboardView from "../src/components/PortalDashboardView";
import StaffLoginGate from "../src/components/StaffLoginGate";
import { portalToken, setPortalToken } from "../src/portalApi";

// Two-step verification on both sign-in screens of the public site: the client portal and the staff
// workspace. The server decides when a code is needed; these tests check what a person sees and sends.

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const problem = (status: number, slug: string, title: string, extra: Record<string, unknown> = {}) =>
  json({ type: `https://x.example/problems/${slug}`, title, status, ...extra }, status);

const CONFIG = { name: "Utmost Insurance Brokers", locale: "en-KE", dateFormat: "dd/MM/yyyy", timeZone: "Africa/Nairobi", currency: "KES", portalEnabled: true, brand: { displayName: "Utmost", primaryColor: "#0b5c3b" } };
const money = (n: number) => ({ amountMinor: n, currency: "KES", display: `Ksh ${n / 100}` });
const POSITION = { outstanding: money(0), unappliedPayments: money(0), openInvoices: [], chequesInClearing: [] };

type Handler = (init?: RequestInit) => Response | Promise<Response>;
function mock(routes: Record<string, Handler>, prefix = "/api/portal") {
  const calls: { key: string; body: any }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace(new RegExp(`^.*${prefix}`), "").split("?")[0];
    const key = `${init?.method ?? "GET"} ${path}`;
    calls.push({ key, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return key in routes ? routes[key](init) : json({ error: "not mocked: " + key }, 404);
  }));
  return calls;
}

beforeEach(() => { setPortalToken(null); });

describe("client portal sign-in with two-step verification", () => {
  const ME = { userId: "pu-1", partyId: "p-1", name: "Wanjiru Kamau", email: "wanjiru@example.com", phone: null, mustChangePassword: false, mfaEnabled: true };
  const base = {
    "GET /config": () => json(CONFIG), "GET /me": () => json(ME), "GET /position": () => json(POSITION), "GET /policies": () => json([], 200),
  };

  async function enterPassword(user: ReturnType<typeof userEvent.setup>) {
    await user.type(await screen.findByLabelText(/email/i), "wanjiru@example.com");
    await user.type(screen.getByLabelText(/password/i), "Correct-Horse-42");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));
  }

  it("asks for the code once the password is right — and that is not shown as an error", async () => {
    mock({ ...base, "POST /auth/login": () => problem(401, "mfa-required", "Enter your authenticator code", { mfaRequired: true }) });
    const user = userEvent.setup();
    render(<PortalDashboardView setActiveTab={vi.fn()} selectedQuote={null} savedAnalysis={null} />);
    await enterPassword(user);
    expect(await screen.findByLabelText(/6-digit code/i)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^password/i)).not.toBeInTheDocument();
  });

  it("sends the email, password and code together, and signs in", async () => {
    let attempts = 0;
    const calls = mock({
      ...base,
      "POST /auth/login": (init) => {
        const body = JSON.parse(String(init!.body));
        attempts++;
        return body.code ? json({ token: "tok-2", expiresAt: Date.now() + 7200_000, mustChangePassword: false }) : problem(401, "mfa-required", "Enter your authenticator code", { mfaRequired: true });
      },
    });
    const user = userEvent.setup();
    render(<PortalDashboardView setActiveTab={vi.fn()} selectedQuote={null} savedAnalysis={null} />);
    await enterPassword(user);
    await user.type(await screen.findByLabelText(/6-digit code/i), "123456");
    await user.click(screen.getByRole("button", { name: /verify and sign in/i }));
    expect(await screen.findByText("You owe")).toBeInTheDocument();
    expect(attempts).toBe(2);
    const last = calls.filter((c) => c.key === "POST /auth/login").pop()!;
    expect(last.body).toEqual({ email: "wanjiru@example.com", password: "Correct-Horse-42", code: "123456" });
    expect(portalToken()).toBe("tok-2");
  });

  it("says when the code was wrong and lets them try again", async () => {
    mock({ ...base, "POST /auth/login": (init) => (JSON.parse(String(init!.body)).code
      ? problem(401, "mfa-code-invalid", "That code is not right", { detail: "Check your authenticator app.", mfaRequired: true })
      : problem(401, "mfa-required", "Enter your authenticator code", { mfaRequired: true })) });
    const user = userEvent.setup();
    render(<PortalDashboardView setActiveTab={vi.fn()} selectedQuote={null} savedAnalysis={null} />);
    await enterPassword(user);
    await user.type(await screen.findByLabelText(/6-digit code/i), "000000");
    await user.click(screen.getByRole("button", { name: /verify and sign in/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/check your authenticator app/i);
    expect(screen.getByLabelText(/6-digit code/i)).toHaveValue(""); // cleared, ready for the next attempt
  });
});

describe("turning two-step verification on in the portal", () => {
  const base = (me: object) => ({ "GET /config": () => json(CONFIG), "GET /me": () => json(me), "GET /position": () => json(POSITION), "GET /policies": () => json([], 200) });
  const ME = { userId: "pu-1", partyId: "p-1", name: "Wanjiru Kamau", email: "wanjiru@example.com", phone: null, mustChangePassword: false };

  it("shows the QR code and setup key, then switches on once a code is confirmed", async () => {
    let enabled = false;
    const calls = mock({
      ...base(ME),
      "GET /me": () => json({ ...ME, mfaEnabled: enabled }),
      "POST /auth/mfa/setup": () => json({ secret: "JBSWY3DPEHPK3PXP", otpauthUrl: "otpauth://totp/x?secret=JBSWY3DPEHPK3PXP", qrSvg: "<svg xmlns='http://www.w3.org/2000/svg'></svg>" }),
      "POST /auth/mfa/enable": () => { enabled = true; return json({ mfaEnabled: true }); },
    });
    setPortalToken("tok-1");
    const user = userEvent.setup();
    render(<PortalDashboardView setActiveTab={vi.fn()} selectedQuote={null} savedAnalysis={null} />);
    await screen.findByText("You owe");
    await user.click(screen.getByRole("tab", { name: "Security" }));
    await user.click(screen.getByRole("button", { name: /set up two-step verification/i }));

    expect(await screen.findByRole("img", { name: /qr code/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Setup key")).toHaveTextContent("JBSW Y3DP EHPK 3PXP");

    await user.type(screen.getByLabelText(/6-digit code/i), "654321");
    await user.click(screen.getByRole("button", { name: /turn on/i }));
    expect(await screen.findByRole("status")).toHaveTextContent(/is on/i);
    expect(calls.find((c) => c.key === "POST /auth/mfa/enable")!.body).toEqual({ code: "654321" });
    expect(await screen.findByRole("form", { name: /turn off two-step verification/i })).toBeInTheDocument();
  });

  it("turning it off needs the password and a code", async () => {
    const calls = mock({ ...base({ ...ME, mfaEnabled: true }), "POST /auth/mfa/disable": () => json({ mfaEnabled: false }) });
    setPortalToken("tok-1");
    const user = userEvent.setup();
    render(<PortalDashboardView setActiveTab={vi.fn()} selectedQuote={null} savedAnalysis={null} />);
    await screen.findByText("You owe");
    await user.click(screen.getByRole("tab", { name: "Security" }));
    const form = await screen.findByRole("form", { name: /turn off two-step verification/i });
    await user.type(within(form).getByLabelText(/^password/i), "Correct-Horse-42");
    await user.type(within(form).getByLabelText(/current 6-digit code/i), "111222");
    await user.click(within(form).getByRole("button", { name: /turn off/i }));
    await screen.findByRole("status");
    expect(calls.find((c) => c.key === "POST /auth/mfa/disable")!.body).toEqual({ password: "Correct-Horse-42", code: "111222" });
  });

  it("shows a wrong confirmation code as an error and stays in setup", async () => {
    mock({
      ...base(ME),
      "POST /auth/mfa/setup": () => json({ secret: "JBSWY3DPEHPK3PXP", otpauthUrl: "otpauth://totp/x", qrSvg: "<svg xmlns='http://www.w3.org/2000/svg'></svg>" }),
      "POST /auth/mfa/enable": () => problem(422, "mfa-code-invalid", "That code is not right", { detail: "Check the 6-digit code in your authenticator app." }),
    });
    setPortalToken("tok-1");
    const user = userEvent.setup();
    render(<PortalDashboardView setActiveTab={vi.fn()} selectedQuote={null} savedAnalysis={null} />);
    await screen.findByText("You owe");
    await user.click(screen.getByRole("tab", { name: "Security" }));
    await user.click(screen.getByRole("button", { name: /set up two-step verification/i }));
    await user.type(await screen.findByLabelText(/6-digit code/i), "000000");
    await user.click(screen.getByRole("button", { name: /turn on/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/6-digit code/i);
    expect(screen.getByRole("form", { name: /confirm two-step verification/i })).toBeInTheDocument();
  });
});

describe("staff workspace sign-in", () => {
  const gate = () => render(<StaffLoginGate setActiveTab={vi.fn()}>{(staff) => <p>Welcome {staff.fullName}</p>}</StaffLoginGate>);

  it("asks for the authenticator code when the server says it is needed, and then signs in", async () => {
    const calls = mock({
      "POST /staff/login": (init) => {
        const body = JSON.parse(String(init!.body));
        return body.code
          ? json({ token: "t", staffId: "staff-1", fullName: "Amina Hassan", role: "Admin", expiresAt: Date.now() + 1000 })
          : json({ error: "Enter the 6-digit code from your authenticator app.", mfaRequired: true }, 401);
      },
    }, "/api/site");
    const user = userEvent.setup();
    gate();
    await user.type(screen.getByLabelText(/staff email/i), "amina@utmostbrokers.co.ke");
    await user.type(screen.getByLabelText(/^password/i), "ChangeMe123!");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));
    await user.type(await screen.findByLabelText(/6-digit code/i), "123456");
    await user.click(screen.getByRole("button", { name: /verify and sign in/i }));
    expect(await screen.findByText("Welcome Amina Hassan")).toBeInTheDocument();
    const last = calls.filter((c) => c.key === "POST /staff/login").pop()!;
    expect(last.body).toEqual({ username: "amina@utmostbrokers.co.ke", password: "ChangeMe123!", code: "123456" });
  });

  it("shows a refusal (for example enrolment still to do in the dashboard) as an error", async () => {
    mock({ "POST /staff/login": () => json({ error: "Two-step verification is required for staff. Sign in to the ERP dashboard once to set it up." }, 403) }, "/api/site");
    const user = userEvent.setup();
    gate();
    await user.type(screen.getByLabelText(/staff email/i), "amina@utmostbrokers.co.ke");
    await user.type(screen.getByLabelText(/^password/i), "ChangeMe123!");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(await screen.findByText(/set it up/i)).toBeInTheDocument();
  });
});
