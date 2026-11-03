import { vi } from "vitest";
import { render } from "@testing-library/react";
import { cleanup } from "@testing-library/react";
import type { ReactElement } from "react";
import { TenantProvider } from "../../src/ConfigContext";
import { setAuthToken } from "../../src/api";

// Helpers for the dashboard component tests. They run the real components in jsdom against a mocked
// fetch, so what is checked is what a person sees and what the screen sends to the API.

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });
export const problem = (status: number, slug: string, title: string, extra: Record<string, unknown> = {}) =>
  json({ type: `https://utmostbrokers.example/problems/${slug}`, title, status, ...extra }, status);

export const money = (minor: number, currency = "KES") => ({ amountMinor: minor, currency, display: `Ksh ${(minor / 100).toLocaleString("en-KE", { minimumFractionDigits: 2 })}` });

export const PUBLIC_CONFIG = {
  tenantId: "utmost", version: 1, hash: "a".repeat(64), effectiveFrom: "2026-01-01T00:00:00Z",
  regional: { countryCode: "KE", currency: "KES", timeZone: "Africa/Nairobi", fiscalYearStartMonth: 1, weekStartsOn: 1 },
  localization: { locale: "en-KE", dateFormat: "dd/MM/yyyy" },
  brand: { displayName: "Utmost Insurance Brokers", primaryColor: "#0b5c3b", onPrimaryColor: "#ffffff", accentColor: "#8a5a00", surfaceColor: "#ffffff", textColor: "#1a1a1a", fontFamily: "Inter, Arial, sans-serif" },
  tax: { pricing: "exclusive", taxes: [] }, modules: ["finance", "claims", "portal", "analytics", "commissions"],
};

export interface Call { key: string; body: any; headers: Record<string, string> }
type Handler = (call: Call) => Response | Promise<Response>;

/** Replace fetch. Routes are keyed "METHOD /path" (no /api prefix, no query). Unknown routes answer 404 so a stray call is visible. */
export function mockApi(routes: Record<string, Handler | unknown>) {
  const calls: Call[] = [];
  const all: Record<string, Handler | unknown> = { "GET /config/effective": PUBLIC_CONFIG, ...routes };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input).replace(/^.*\/api/, "");
    const key = `${init?.method ?? "GET"} ${url.split("?")[0]}`;
    const call: Call = { key, body: init?.body ? JSON.parse(String(init.body)) : undefined, headers: Object.fromEntries(Object.entries((init?.headers as Record<string, string>) ?? {}).map(([k, v]) => [k.toLowerCase(), v])) };
    (call as Call & { url: string }).url = url;
    calls.push(call);
    const route = all[key];
    if (route === undefined) return json({ error: `not mocked: ${key}` }, 404);
    return typeof route === "function" ? (route as Handler)(call) : json(route);
  }));
  return { calls, last: (key: string) => [...calls].reverse().find((c) => c.key === key), count: (key: string) => calls.filter((c) => c.key === key).length };
}

export function renderSignedIn(ui: ReactElement) {
  setAuthToken("test-token");
  return render(<TenantProvider signedIn>{ui}</TenantProvider>);
}

export const afterEachCleanup = () => { cleanup(); setAuthToken(null); document.documentElement.removeAttribute("style"); };
