import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import HomeView from "../src/components/HomeView";
import InsurersView from "../src/components/InsurersView";
import OtherLinesQuoteView from "../src/components/OtherLinesQuoteView";
import AdminPortalView from "../src/components/AdminPortalView";
import { CONFIG, mockBackend } from "./fixtures";

// The website bundles no insurer list and no quote-engine settings: it fetches them from the
// backend. These screens used to read bundled constants synchronously, so each now has to cope
// with "not loaded yet" without crashing, and then render what the backend sent.

const staff = { token: "t", staffId: "staff-underwriter", fullName: "Peter Otieno", role: "Underwriter" };

describe("Home page insurer directory", () => {
  it("renders before the insurers arrive, then lists the ones the backend sent", async () => {
    mockBackend();
    render(<HomeView setActiveTab={vi.fn()} />);
    expect(screen.getByText("Carriers Directory")).toBeInTheDocument(); // no crash on the empty first render
    await waitFor(() => expect(screen.getAllByText(/ICEA LION/).length).toBeGreaterThan(0));
  });

  it("keeps carriers that have no marketing profile off the public page", async () => {
    mockBackend();
    render(<HomeView setActiveTab={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByText(/ICEA LION/).length).toBeGreaterThan(0));
    expect(screen.queryByText(/AAR Insurance/)).not.toBeInTheDocument();
  });

  it("copes with the backend being unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    render(<HomeView setActiveTab={vi.fn()} />);
    expect(await screen.findByText("Carriers Directory")).toBeInTheDocument();
  });
});

describe("Insurers page", () => {
  it("shows the backend's insurers, including ones staff added, and hides profile-less carriers", async () => {
    mockBackend();
    render(<InsurersView setActiveTab={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByText(/Test Carrier/).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/ICEA LION/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/AAR Insurance/)).not.toBeInTheDocument();
  });
});

describe("Other lines quote form", () => {
  it("waits for the product-line settings, then offers exactly the live categories the backend lists", async () => {
    mockBackend({ "/config": { ...CONFIG, otherLineLiveCategoryIds: ["fire", "marine"] } });
    render(<OtherLinesQuoteView setActiveTab={vi.fn()} />);
    expect(screen.getByText(/Loading product lines/)).toBeInTheDocument();
    expect((await screen.findAllByText("Fire & Perils")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Marine Cargo").length).toBeGreaterThan(0);
    expect(screen.queryByText("Investment Plans")).not.toBeInTheDocument(); // not live
  });
});

describe("Staff workspace: rates desk", () => {
  it("renders from backend data without crashing on the empty first render", async () => {
    mockBackend();
    render(<AdminPortalView setActiveTab={vi.fn()} authenticatedStaff={staff} onLogout={vi.fn()} />);
    expect(await screen.findByText("Database Rates Desk")).toBeInTheDocument();
  });

  it("offers every register insurer, except that life-only carriers are kept off the rates desk", async () => {
    mockBackend();
    render(<AdminPortalView setActiveTab={vi.fn()} authenticatedStaff={staff} onLogout={vi.fn()} />);
    await screen.findByText("Database Rates Desk");

    await waitFor(() => {
      const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
      const labels = (s: HTMLSelectElement) => Array.from(s.options).map((o) => o.textContent ?? "");
      // the rates-desk picker: ICEA, a staff-added carrier and a profile-less one are in; Liberty (life only) is out
      const desk = selects.find((s) => labels(s).some((l) => /ICEA/.test(l)) && labels(s).some((l) => /Test Carrier/.test(l)) && !labels(s).some((l) => /Liberty/.test(l)));
      expect(desk, "rates desk carrier picker").toBeTruthy();
      expect(labels(desk!).some((l) => /AAR/.test(l))).toBe(true);
      // the logo manager lists everyone, life-only included
      expect(selects.find((s) => labels(s).some((l) => /Liberty/.test(l))), "logo manager picker").toBeTruthy();
    });
  });

  it("reads staff-only data with the signed-in staff member's token", async () => {
    const { fetchMock } = mockBackend();
    render(<AdminPortalView setActiveTab={vi.fn()} authenticatedStaff={staff} onLogout={vi.fn()} />);
    await screen.findByText("Database Rates Desk");
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith("/claims"))).toBe(true));
    for (const path of ["/admin/rates", "/staff", "/claims", "/room-scans", "/compliance-logs"]) {
      const call = fetchMock.mock.calls.find(([u]) => String(u).endsWith(path));
      expect(call, path).toBeTruthy();
      expect((call![1]?.headers as Record<string, string>)?.Authorization, path).toBe("Bearer t");
    }
  });
});

void React;
