// What the backend's website API returns, in miniature. The site holds no insurer or
// settings data of its own, so every screen is tested against these responses.
import { vi } from "vitest";

export const ICEA = {
  id: "icea", name: "ICEA LION General Insurance Company Limited", tradingName: "ICEA LION", logoEmoji: "🦁",
  established: 1982, licenseYear: 2024, licenseStatus: "Active", iraLicenseMotor: "IRA/M/1", iraLicenseMedical: "IRA/H/1",
  odpcRegistered: true, memberOfAibk: true, rating: "A Rated (Excellent)", strengthReason: "Strong balance sheet",
  availableProducts: ["Motor", "Medical"], claimTurnaroundDays: 10, emergencyPhone: "0700",
  licensedGeneralClasses: ["07", "08", "12"], licensedLifeClasses: [], isCustom: false,
};
export const LIBERTY = { ...ICEA, id: "liberty", name: "Liberty Life", tradingName: "Liberty Life", licensedGeneralClasses: [], licensedLifeClasses: ["31"] };
export const AAR = { id: "aar", name: "AAR Insurance (Kenya) Limited", tradingName: "AAR Insurance (Kenya) Limited", profileComplete: false, licensedGeneralClasses: ["12"] };
export const CUSTOM = { ...ICEA, id: "test-carrier", name: "Test Carrier", tradingName: "Test Carrier", isCustom: true, licensedGeneralClasses: undefined };

export const CONFIG = {
  otherLineCategories: [
    { id: "fire", label: "Fire & Perils", code: "04", kind: "general" },
    { id: "marine", label: "Marine Cargo", code: "06", kind: "general" },
    { id: "investment", label: "Investment Plans", code: "37a", kind: "life" },
  ],
  otherLineLiveCategoryIds: ["fire", "marine", "investment"],
  medical: {
    memberAgeBands: [{ min: 18, max: 30 }, { min: 31, max: 40 }],
    outpatientAgeBands: [{ min: 0, max: 40 }],
  },
};

export const RATES = {
  levies: { pcfRate: 0.0025, itlRate: 0.002, stampDuty: 40 },
  versions: [{
    id: "rate-ver-icea-1", versionNumber: 1, insurerId: "icea", category: "all", status: "active",
    timestamp: "2026-07-14T00:00:00.000Z", updatedByStaffId: "staff-1",
    rates: { insurerName: ICEA.name, motorComprehensiveRate: 4.3, motorTpoRate: 8000, medicalMultiplier: 1.05, sumInsuredBands: [], vehicleTypes: [], riders: [] },
  }],
};

type Routes = Record<string, unknown>;

/** Replaces fetch with the backend's /api/site responses. Unknown paths answer 404 so a stray call is visible. */
export function mockBackend(overrides: Routes = {}, insurers: unknown[] = [ICEA, LIBERTY, AAR, CUSTOM]) {
  const routes: Routes = {
    "/insurers": insurers,
    "/config": CONFIG,
    "/insurer-logos": {},
    "/admin/rates": RATES,
    "/staff": [], "/claims": [], "/room-scans": [], "/compliance-logs": [],
    ...overrides,
  };
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const path = String(input).replace(/^.*\/api\/site/, "").split("?")[0];
    if (!(path in routes)) return new Response(JSON.stringify({ error: "not mocked: " + path }), { status: 404 });
    return new Response(JSON.stringify(routes[path]), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock };
}
