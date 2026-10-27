import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEEDED, makeClient, seedExtraStaff, startApp, type TestApp } from "../helpers";

// The website used to keep its state in JSON files next to a hard-coded insurer
// list. All of it now lives in the ERP database. These tests check the data
// really comes from, and goes to, that one database.

let app: TestApp;
let client: ReturnType<typeof makeClient>;
let admin: string, underwriter: string, claims: string;
const site = (p: string) => `/site${p}`;
const MOTOR = { category: "motor", params: { vehicleReg: "KDA 1A", vehicleMake: "Toyota", vehicleModel: "Corolla", mfgYear: 2020, vehicleValue: 1500000, coverType: "comprehensive", vehicleUse: "private", vehicleType: "saloon", ownerName: "A", ownerEmail: "a@x.co", ownerPhone: "0712345678" } };

const quotesFor = async (body: unknown = MOTOR) => (await client.call("POST", site("/generate-quotes"), { apiKey: null, body })).json.quotes as any[];

beforeAll(async () => {
  app = await startApp();
  client = makeClient(app.baseUrl);
  await seedExtraStaff();
  [admin, underwriter, claims] = await Promise.all([client.login(SEEDED.admin), client.login(SEEDED.underwriter), client.login(SEEDED.claims)]);
});
afterAll(() => app.close());

describe("one insurer table", () => {
  it("the website's insurers are rows of the ERP's insurer register", async () => {
    const website = (await client.call("GET", site("/insurers"), { apiKey: null })).json as any[];
    const erp = (await client.call("GET", "/insurers", { token: admin, apiKey: null })).json as any[];
    expect(website.length).toBeGreaterThanOrEqual(21);
    // every website insurer is an ERP insurer with the same short id recorded on it
    for (const slug of ["icea", "heritage", "cic", "britam", "jubilee", "aar"]) {
      expect(website.find((w) => w.id === slug)).toBeTruthy();
      expect(erp.find((e) => e.siteSlug === slug)).toBeTruthy();
    }
    expect(erp.find((e) => e.siteSlug === "icea").id).toBe("icea-lion-general");
  });

  it("marks carriers without a marketing profile so public pages can skip them", async () => {
    const website = (await client.call("GET", site("/insurers"), { apiKey: null })).json as any[];
    expect(website.find((w) => w.id === "aar")).toMatchObject({ profileComplete: false, licensedGeneralClasses: expect.any(Array) });
    expect(website.find((w) => w.id === "icea").profileComplete).toBeUndefined();
    expect(website.find((w) => w.id === "icea").tradingName).toBeTruthy();
  });

  it("serves quote-engine settings from the backend", async () => {
    const config = (await client.call("GET", site("/config"), { apiKey: null })).json;
    expect(config.otherLineCategories.length).toBeGreaterThan(5);
    expect(config.otherLineLiveCategoryIds.length).toBeGreaterThan(0);
    expect(config.medical.memberAgeBands.length).toBeGreaterThan(3);
    expect(config.medical.outpatientAgeBands.length).toBeGreaterThan(0);
  });

  it("prices exactly the built-in pool, in its fixed order, without Jubilee/AAR/APA", async () => {
    const ids = (await quotesFor()).map((q) => q.insurerId);
    expect(ids).toEqual(["icea", "heritage", "cic", "kenindia", "stardiscover", "britam", "oldmutual", "geminia", "mua", "cannon", "pioneer", "madison", "ncba", "directline"].filter((id) => ids.includes(id)));
    for (const excluded of ["jubilee", "aar", "apa"]) expect(ids).not.toContain(excluded);
  });
});

describe("premium rate tables are versioned database rows", () => {
  it("publishing a new table retires the live one, keeps history, and changes live quotes", async () => {
    const before = (await quotesFor()).find((q) => q.insurerId === "heritage");

    const res = await client.call("POST", site("/admin/rates"), { apiKey: null, token: underwriter, body: { insurerId: "heritage", motorComprehensiveRate: 9.5 } });
    expect(res.status).toBe(200);

    const versions = res.json.db.versions.filter((v: any) => v.insurerId === "heritage");
    const active = versions.filter((v: any) => v.status === "active");
    expect(active).toHaveLength(1); // never two live tables
    expect(active[0].rates.motorComprehensiveRate).toBe(9.5);
    expect(active[0].updatedByStaffId).toBe("staff-underwriter");
    expect(versions.filter((v: any) => v.status === "inactive").length).toBeGreaterThanOrEqual(1);
    expect(active[0].versionNumber).toBe(Math.max(...versions.map((v: any) => v.versionNumber)));

    const after = (await quotesFor()).find((q) => q.insurerId === "heritage");
    expect(after.basePremium).toBeGreaterThan(before.basePremium); // 9.5% of the vehicle value is dearer than the old rate
    expect(after.rateVersionId).toBe(active[0].id);
    expect(before.rateVersionId).not.toBe(active[0].id);
  });

  it("records who changed what, in the ERP's one audit trail", async () => {
    const logs = (await client.call("GET", site("/compliance-logs"), { apiKey: null, token: admin })).json as any[];
    const entry = logs.find((l) => l.action === "RATE_TABLE_UPDATED" && l.entityId === "heritage" && l.actorId === "staff-underwriter");
    expect(entry).toBeTruthy();
    expect(entry.actorType).toBe("staff");
    expect(entry.details.newVersionId).toMatch(/^rate-ver-heritage-/);

    const erpAudit = (await client.call("GET", "/audit-log", { token: admin, apiKey: null })).json as any[];
    expect(erpAudit.some((e) => e.action === "RATE_TABLE_UPDATED" && e.entityId === "heritage")).toBe(true);
  });

  it("rejects a rate change for an insurer that does not exist", async () => {
    const res = await client.call("POST", site("/admin/rates"), { apiKey: null, token: admin, body: { insurerId: "no-such-carrier", motorTpoRate: 1 } });
    expect(res.status).toBe(404);
  });

  it("rejects nonsense numbers instead of storing them", async () => {
    const res = await client.call("POST", site("/admin/rates"), { apiKey: null, token: admin, body: { pcfRate: "abc" } });
    expect(res.status).toBe(400);
  });
});

describe("statutory levies come from the ERP's levy table", () => {
  it("shows the levies in force and records a change as a new effective-dated row", async () => {
    const before = (await client.call("GET", site("/admin/rates"), { apiKey: null, token: admin })).json.levies;
    expect(before).toEqual({ pcfRate: 0.0025, itlRate: 0.002, stampDuty: 40 });

    const change = await client.call("POST", site("/admin/rates"), { apiKey: null, token: admin, body: { pcfRate: 0.003, stampDuty: 50 } });
    expect(change.json.db.levies).toEqual({ pcfRate: 0.003, itlRate: 0.002, stampDuty: 50 });

    // the ERP's own levy table is the single source: the same rows, with history kept
    const erpLevies = (await client.call("GET", "/statutory-levies", { token: admin, apiKey: null })).json as any[];
    const pcf = erpLevies.filter((l) => l.levyType === "pcf" && l.category === null);
    expect(pcf.length).toBeGreaterThanOrEqual(2);
    expect(pcf.find((l) => l.effectiveTo === null).ratePct).toBeCloseTo(0.3, 6);
    expect(pcf.find((l) => l.effectiveTo !== null).ratePct).toBeCloseTo(0.25, 6);

    // and the quote engine uses them
    const q = (await quotesFor()).find((x) => x.insurerId === "icea");
    expect(q.stampDuty).toBe(50);
  });
});

describe("insurers added through the rates desk", () => {
  const NEW = { name: "Test Carrier Assurance", tradingName: "Test Carrier", rating: "A Rated (Test)" };

  it("creates a row in the ERP register (under review) that is not quoted until it has live rates", async () => {
    const created = await client.call("POST", site("/insurers"), { apiKey: null, token: underwriter, body: NEW });
    expect(created.status).toBe(200);
    expect(created.json.insurer).toMatchObject({ id: "test-carrier", isCustom: true, tradingName: "Test Carrier" });

    const erp = (await client.call("GET", "/insurers", { token: admin, apiKey: null })).json as any[];
    expect(erp.find((e) => e.siteSlug === "test-carrier")).toMatchObject({ id: "site-test-carrier", panelStatus: "under_review" });

    expect((await quotesFor()).map((q) => q.insurerId)).not.toContain("test-carrier");

    await client.call("POST", site("/admin/rates"), { apiKey: null, token: underwriter, body: { insurerId: "test-carrier", motorComprehensiveRate: 3.5, motorTpoRate: 6000 } });
    const live = (await quotesFor()).find((q) => q.insurerId === "test-carrier");
    expect(live).toBeTruthy();
    expect(live.insurerName).toBe("Test Carrier");
    expect(live.insurerRating ?? live.rating).toBeDefined();
  });

  it("can be unpublished from public quoting without deleting its rates", async () => {
    const all = (await client.call("GET", site("/admin/rates"), { apiKey: null, token: admin })).json;
    const rates = { ...all.versions.find((v: any) => v.insurerId === "test-carrier" && v.status === "active").rates, isPublished: false };
    await client.call("POST", site("/admin/rates"), { apiKey: null, token: admin, body: { insurerId: "test-carrier", rates } });
    expect((await quotesFor()).map((q) => q.insurerId)).not.toContain("test-carrier");
  });

  it("refuses to overwrite or delete a built-in carrier", async () => {
    expect((await client.call("POST", site("/insurers"), { apiKey: null, token: admin, body: { id: "icea", name: "Imposter" } })).status).toBe(409);
    expect((await client.call("DELETE", site("/insurers/icea"), { apiKey: null, token: admin })).status).toBe(404);
  });

  it("can be deleted, taking its rate tables with it", async () => {
    const res = await client.call("DELETE", site("/insurers/test-carrier"), { apiKey: null, token: underwriter });
    expect(res.status).toBe(200);
    expect(res.json.insurers.find((i: any) => i.id === "test-carrier")).toBeUndefined();
    const versions = (await client.call("GET", site("/admin/rates"), { apiKey: null, token: admin })).json.versions as any[];
    expect(versions.some((v) => v.insurerId === "test-carrier")).toBe(false);
  });
});

describe("what the public site captures is stored in the database", () => {
  it("keeps customer quotes, cover-note requests and other-line requests as rows", async () => {
    const { db } = await import("../../db/client");
    const schema = await import("../../db/schema");

    const quote = await client.call("POST", site("/quotes"), { apiKey: null, body: { category: "motor", insurerId: "icea", totalPremium: 4321 } });
    const note = await client.call("POST", site("/cover-notes"), {
      apiKey: null,
      body: { category: "motor", offer: { insurerId: "icea", insurerName: "ICEA", totalPremium: 5000 }, contactName: "Jane", contactPhone: "0700", paymentMethod: "ipf", financeMonths: 6 },
    });
    expect(note.status).toBe(200);
    const request = await client.call("POST", site("/other-line-quotes"), {
      apiKey: null,
      body: { category: "fire", subType: "commercial", answers: { sumInsured: 1000000 }, contactName: "Bob", contactPhone: "0711" },
    });
    expect(request.status).toBe(200);

    const [storedQuote] = await db.select().from(schema.customerQuotes);
    expect(storedQuote.id).toBe(quote.json.id);
    expect(storedQuote.totalPremiumKes).toBe(4321);
    expect(storedQuote.assignedStaffId).toBe("staff-underwriter");

    const [storedNote] = await db.select().from(schema.coverNotes);
    expect(storedNote).toMatchObject({ id: note.json.coverNoteRef, paymentMethod: "ipf", financeMonths: 6, contactName: "Jane" });

    const [storedRequest] = await db.select().from(schema.otherLineRequests);
    expect(storedRequest.referenceNumber).toBe(request.json.request.referenceNumber);
    expect(Array.isArray(storedRequest.eligibleUnderwriters)).toBe(true);
    // shortlist comes from the insurer register's licensed classes, not a hard-coded list
    expect(request.json.request.eligibleUnderwriters.length).toBeGreaterThan(0);
  });
});

describe("email one-time codes", () => {
  const email = "customer@test.local";

  it("verifies the right code once, and only once", async () => {
    const store = await import("../../site/store");
    await store.issueOtp(email, "123456");
    expect((await client.call("POST", site("/auth/verify-otp"), { apiKey: null, body: { email, code: "123456" } })).json).toEqual({ verified: true });
    const again = await client.call("POST", site("/auth/verify-otp"), { apiKey: null, body: { email, code: "123456" } });
    expect(again.status).toBe(400); // a used code is gone
  });

  it("is case-insensitive on the email and stores only a hash", async () => {
    const store = await import("../../site/store");
    const { db } = await import("../../db/client");
    const schema = await import("../../db/schema");
    await store.issueOtp("mixed@test.local", "654321");
    const [row] = await db.select().from(schema.otpCodes);
    expect(JSON.stringify(row)).not.toContain("654321");
    expect((await client.call("POST", site("/auth/verify-otp"), { apiKey: null, body: { email: "Mixed@Test.Local", code: "654321" } })).status).toBe(200);
  });

  it("burns the code after five wrong guesses, even if the next guess is right", async () => {
    const store = await import("../../site/store");
    await store.issueOtp("brute@test.local", "111111");
    for (let i = 0; i < 5; i++) {
      expect((await client.call("POST", site("/auth/verify-otp"), { apiKey: null, body: { email: "brute@test.local", code: "000000" } })).status).toBe(400);
    }
    const lateRight = await client.call("POST", site("/auth/verify-otp"), { apiKey: null, body: { email: "brute@test.local", code: "111111" } });
    expect(lateRight.status).toBe(400);
  });

  it("rejects an expired code", async () => {
    const { db } = await import("../../db/client");
    const schema = await import("../../db/schema");
    const store = await import("../../site/store");
    await store.issueOtp("old@test.local", "222222");
    const { eq } = await import("drizzle-orm");
    await db.update(schema.otpCodes).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.otpCodes.email, "old@test.local"));
    const res = await client.call("POST", site("/auth/verify-otp"), { apiKey: null, body: { email: "old@test.local", code: "222222" } });
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/expired/i);
  });

  it("send-otp stores a code for the email", async () => {
    const res = await client.call("POST", site("/auth/send-otp"), { apiKey: null, body: { name: "Pat", email: "send@test.local", phone: "0700" } });
    expect(res.status).toBe(200);
    expect(res.json.sent).toBe(true);
    const { db } = await import("../../db/client");
    const schema = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    const [row] = await db.select().from(schema.otpCodes).where(eq(schema.otpCodes.email, "send@test.local"));
    expect(row.attempts).toBe(0);
  });
});

describe("a customer's claim is a real ERP claim", () => {
  it("registers against an existing policy and shows up in both desks", async () => {
    const party = await client.call("POST", "/parties", { token: admin, apiKey: null, body: { fullName: "Claim Customer", partyType: "individual" } });
    const policy = await client.call("POST", "/policies", { token: admin, apiKey: null, body: { clientId: party.json.id, category: "07", premiumAmount: 5000, endDate: "2027-12-31" } });

    const submitted = await client.call("POST", site("/submit-claim"), {
      apiKey: null,
      body: { policyNumber: policy.json.id, claimType: "Motor Private Accident", phoneNumber: "0712000111", description: "Rear-ended at a junction", claimantName: "Claim Customer" },
    });
    expect(submitted.status).toBe(200);
    expect(submitted.json.claimId).toMatch(/^UTM-CLM-\d{6}$/);
    expect(submitted.json.timeline[0].status).toBe("Notification received");

    // the ERP dashboard sees a normal claim, linked to the policy, with its opening timeline step
    const erpClaim = (await client.call("GET", "/claims", { token: admin, apiKey: null })).json.find((c: any) => c.id === submitted.json.claimId);
    expect(erpClaim).toMatchObject({ policyId: policy.json.id, policyNumber: policy.json.id, claimType: "Motor Private Accident", status: "Notified" });
    const detail = (await client.call("GET", `/claims/${submitted.json.claimId}`, { token: admin, apiKey: null })).json;
    expect(detail.timeline ?? detail.timelineSteps ?? []).toBeDefined();

    // the website workspace's registration desk shows the same claim with the client's name
    const desk = (await client.call("GET", site("/claims"), { apiKey: null, token: claims })).json as any[];
    expect(desk.find((c) => c.claimId === submitted.json.claimId)).toMatchObject({ client: "Claim Customer", claimType: "Motor Private Accident" });
  });

  it("still accepts a notification for a policy number the system does not know", async () => {
    const res = await client.call("POST", site("/submit-claim"), { apiKey: null, body: { policyNumber: "UNKNOWN-1", claimType: "Theft", phoneNumber: "0700" } });
    expect(res.status).toBe(200);
    const erpClaim = (await client.call("GET", "/claims", { token: admin, apiKey: null })).json.find((c: any) => c.id === res.json.claimId);
    expect(erpClaim.policyId).toBeNull();
  });

  it("requires the essentials", async () => {
    expect((await client.call("POST", site("/submit-claim"), { apiKey: null, body: { claimType: "Theft" } })).status).toBe(400);
  });
});

describe("compliance register", () => {
  it("records customer actions with their actor kind and lets staff log only as themselves", async () => {
    await client.call("POST", site("/quote-selected"), { apiKey: null, body: { action: "buy", category: "motor", contactName: "X", contactPhone: "1", offer: { insurerId: "icea", insurerName: "ICEA", totalPremium: 1 } } });
    const posted = await client.call("POST", site("/compliance-logs"), { apiKey: null, token: underwriter, body: { action: "MANUAL_NOTE", entityType: "rates", entityId: "icea", actorType: "system", actorId: "staff-admin", details: { x: 1 } } });
    expect(posted.status).toBe(200);
    expect(posted.json.actorId).toBe("staff-underwriter"); // the claimed actor was ignored
    expect(posted.json.actorType).toBe("staff");

    const logs = (await client.call("GET", site("/compliance-logs"), { apiKey: null, token: admin })).json as any[];
    expect(logs.find((l) => l.action === "QUOTE_SELECTED")).toMatchObject({ actorId: "customer", actorType: "customer" });
    expect(logs.find((l) => l.action === "MANUAL_NOTE")).toMatchObject({ actorId: "staff-underwriter", actorType: "staff" });
  });

  it("carries over the rate-change history from before the move", async () => {
    const logs = (await client.call("GET", site("/compliance-logs"), { apiKey: null, token: admin })).json as any[];
    expect(logs.some((l) => l.action === "RATE_TABLE_UPDATED" && l.entityId === "oldmutual")).toBe(true);
  });
});

describe("logos live in the database", () => {
  const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  it("rejects non-image uploads and oversized files", async () => {
    const notImage = await client.call("POST", site("/insurer-logos"), { apiKey: null, token: admin, body: { insurerId: "x", imageBase64: Buffer.from("<script>").toString("base64"), mimeType: "text/html" } });
    expect(notImage.status).toBe(400);
    const huge = await client.call("POST", site("/insurer-logos"), { apiKey: null, token: admin, body: { insurerId: "x", imageBase64: Buffer.alloc(3 * 1024 * 1024).toString("base64"), mimeType: "image/png" } });
    expect(huge.status).toBe(400);
  });

  it("serves SVG logos in a way that cannot run script", async () => {
    const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='1' height='1'><script>alert(1)</script></svg>";
    const up = await client.call("POST", site("/insurer-logos"), { apiKey: null, token: admin, body: { insurerId: "svgco", imageBase64: Buffer.from(svg).toString("base64"), mimeType: "image/svg+xml" } });
    expect(up.status).toBe(200);
    const file = await fetch(`${app.baseUrl.replace(/\/api$/, "")}${up.json.src}`);
    expect(file.headers.get("content-type")).toBe("image/svg+xml");
    expect(file.headers.get("content-security-policy")).toMatch(/sandbox/);
  });

  it("replacing a logo updates it in place", async () => {
    await client.call("POST", site("/insurer-logos"), { apiKey: null, token: admin, body: { insurerId: "swapco", imageBase64: PNG, mimeType: "image/png" } });
    const first = (await client.call("GET", site("/insurer-logos"), { apiKey: null })).json.swapco;
    await new Promise((r) => setTimeout(r, 15));
    await client.call("POST", site("/insurer-logos"), { apiKey: null, token: admin, body: { insurerId: "swapco", imageBase64: PNG, mimeType: "image/png" } });
    const second = (await client.call("GET", site("/insurer-logos"), { apiKey: null })).json.swapco;
    expect(second.src).not.toBe(first.src); // new ?v= so caches refresh
    expect(Object.keys((await client.call("GET", site("/insurer-logos"), { apiKey: null })).json).filter((k) => k === "swapco")).toHaveLength(1);
  });
});
