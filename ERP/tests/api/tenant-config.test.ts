import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEEDED, makeClient, seedExtraStaff, startApp, type TestApp } from "../helpers";

let app: TestApp;
let api: ReturnType<typeof makeClient>;
let admin: string;
let accountant: string;

async function q<T = any>(text: string): Promise<T[]> {
  const { db } = await import("../../db/client");
  const { sql } = await import("drizzle-orm");
  return ((await db.execute(sql.raw(text))) as unknown as { rows: T[] }).rows;
}

beforeAll(async () => {
  app = await startApp();
  api = makeClient(app.baseUrl);
  await seedExtraStaff();
  admin = await api.login(SEEDED.admin);
  accountant = await api.login("accountant@test.local");
});
afterAll(() => app.close());

describe("effective configuration", () => {
  it("is published for the existing tenant from the Kenya pack", async () => {
    const r = await api.call("GET", "/config/effective", { token: accountant });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({
      tenantId: "utmost", version: 1,
      regional: { currency: "KES", timeZone: "Africa/Nairobi", countryCode: "KE" },
      localization: { locale: "en-KE" },
      brand: { displayName: "Utmost Insurance Brokers" },
      tax: { pricing: "exclusive" },
    });
    expect(r.json.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does not leak entitlement limits or finance rules to ordinary staff", async () => {
    const r = await api.call("GET", "/config/effective", { token: accountant });
    expect(r.json.finance).toBeUndefined();
    expect(r.json.entitlements).toBeUndefined();
  });

  it("requires a session", async () => {
    expect((await api.call("GET", "/config/effective")).status).toBe(401);
  });

  it("serves the brand as CSS custom properties", async () => {
    const r = await api.call("GET", "/config/brand.css", { token: accountant });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toMatch(/text\/css/);
    expect(r.text).toContain("--brand-primary: #0b5c3b;");
  });
});

describe("changing configuration needs tenant_config.manage", () => {
  it("lets admin only", async () => {
    expect((await api.call("GET", "/config/versions", { token: accountant })).status).toBe(403);
    expect((await api.call("PUT", "/config/draft", { token: accountant, body: { regionPack: "KE", overrides: {} } })).status).toBe(403);
    expect((await api.call("POST", "/config/draft/publish", { token: accountant })).status).toBe(403);
    expect((await api.call("GET", "/config/versions", { token: admin })).status).toBe(200);
  });
});

describe("draft → validate → publish", () => {
  it("accepts a draft that is structurally fine but reports why it cannot be published", async () => {
    const r = await api.call("PUT", "/config/draft", { token: admin, body: { regionPack: "KE", overrides: { brand: { primaryColor: "#eeeeee", onPrimaryColor: "#ffffff" } } } });
    expect(r.status).toBe(200);
    expect(r.json.status).toBe("draft");
    expect(r.json.validation.valid).toBe(false);
    expect(r.json.validation.issues.some((i: any) => i.path === "brand.onPrimaryColor")).toBe(true);
  });

  it("refuses to publish an invalid draft, listing every problem as a 7807 document", async () => {
    await api.call("PUT", "/config/draft", { token: admin, body: { regionPack: "KE", overrides: { brand: { primaryColor: "#eeeeee" }, entitlements: { modules: ["portal"] } } } });
    const r = await api.call("POST", "/config/draft/publish", { token: admin });
    expect(r.status).toBe(422);
    expect(r.headers.get("content-type")).toMatch(/application\/problem\+json/);
    expect(r.json.type).toMatch(/config-invalid$/);
    const fields = r.json.errors.map((e: any) => e.field);
    expect(fields).toContain("entitlements.modules");
    expect(fields.some((f: string) => f.startsWith("brand."))).toBe(true);
    // nothing changed
    expect((await api.call("GET", "/config/effective", { token: accountant })).json.version).toBe(1);
  });

  it("rejects malformed overrides outright (unknown keys, wrong types)", async () => {
    const unknown = await api.call("PUT", "/config/draft", { token: admin, body: { regionPack: "KE", overrides: { brand: { colour: "red" } } } });
    expect(unknown.status).toBe(422);
    const wrongType = await api.call("PUT", "/config/draft", { token: admin, body: { regionPack: "KE", overrides: { finance: { feesFirst: "yes" } } } });
    expect(wrongType.status).toBe(422);
    const badZone = await api.call("PUT", "/config/draft", { token: admin, body: { regionPack: "KE", overrides: { regional: { timeZone: "Atlantis/Lost" } } } });
    expect(badZone.status).toBe(422);
    expect(badZone.json.errors[0].field).toBe("regional.timeZone");
    const noPack = await api.call("PUT", "/config/draft", { token: admin, body: { regionPack: "ZZ", overrides: {} } });
    expect(noPack.status).toBe(422);
  });

  it("publishes a valid draft as the next version and supersedes the old one", async () => {
    await api.call("PUT", "/config/draft", { token: admin, body: { regionPack: "KE", overrides: { brand: { displayName: "Utmost Brokers Ltd" }, finance: { returnedChequeFeeMinor: 200000 } }, note: "Rebrand and cheque fee" } });
    const pub = await api.call("POST", "/config/draft/publish", { token: admin });
    expect(pub.status).toBe(201);
    expect(pub.json.version).toBe(2);
    expect(pub.json.finance.returnedChequeFeeMinor).toBe(200000);

    const eff = await api.call("GET", "/config/effective", { token: accountant });
    expect(eff.json.version).toBe(2);
    expect(eff.json.brand.displayName).toBe("Utmost Brokers Ltd");

    const versions = (await api.call("GET", "/config/versions", { token: admin })).json;
    expect(versions.map((v: any) => [v.version, v.status])).toEqual([[2, "published"], [1, "superseded"]]);
    expect((await api.call("GET", "/config/draft", { token: admin })).status).toBe(404); // the draft became version 2
  });

  it("will not publish a draft that changes nothing", async () => {
    await api.call("PUT", "/config/draft", { token: admin, body: { regionPack: "KE", overrides: { brand: { displayName: "Utmost Brokers Ltd" }, finance: { returnedChequeFeeMinor: 200000 } } } });
    const r = await api.call("POST", "/config/draft/publish", { token: admin });
    expect(r.status).toBe(409);
    expect(r.json.type).toMatch(/config-unchanged$/);
    await api.call("DELETE", "/config/draft", { token: admin });
  });

  it("returns the exact historical snapshot of any version", async () => {
    const versions = (await api.call("GET", "/config/versions", { token: admin })).json;
    const v1 = versions.find((v: any) => v.version === 1);
    const snap = await api.call("GET", `/config/versions/${v1.id}`, { token: admin });
    expect(snap.json.brand.displayName).toBe("Utmost Insurance Brokers");
    expect(snap.json.finance.returnedChequeFeeMinor).toBe(0);
  });

  it("writes the publication to the audit log", async () => {
    const log = await q(`SELECT 1 FROM compliance.audit_log WHERE action='CONFIG_PUBLISHED'`);
    expect(log.length).toBeGreaterThanOrEqual(1);
  });
});

describe("editing from what is live", () => {
  it("starts a draft that carries the current overrides, so a change is a delta", async () => {
    const draft = await api.call("POST", "/config/draft/from-current", { token: admin });
    expect(draft.status).toBe(200);
    expect(draft.json.status).toBe("draft");
    expect(draft.json.overrides).toMatchObject({ brand: { displayName: "Utmost Brokers Ltd" }, finance: { returnedChequeFeeMinor: 200000 } });
    expect(draft.json.validation.valid).toBe(true);
    // asking again returns the same draft instead of clobbering it
    const again = await api.call("POST", "/config/draft/from-current", { token: admin });
    expect(again.json.id).toBe(draft.json.id);
    expect((await api.call("POST", "/config/draft/from-current", { token: accountant })).status).toBe(403);
    await api.call("DELETE", "/config/draft", { token: admin });
  });
});

describe("published versions are immutable", () => {
  it("the database refuses to edit or delete a published or superseded version", async () => {
    await expect(q(`UPDATE config.tenant_config_versions SET overrides = '{}'::jsonb WHERE status = 'published'`)).rejects.toThrow();
    await expect(q(`UPDATE config.tenant_config_versions SET resolved = '{}'::jsonb WHERE status = 'superseded'`)).rejects.toThrow();
    await expect(q(`DELETE FROM config.tenant_config_versions WHERE status IN ('published','superseded')`)).rejects.toThrow();
  });

  it("allows only one published version per tenant", async () => {
    await expect(q(`INSERT INTO config.tenant_config_versions (id, tenant_id, version, status, region_pack, resolved, content_hash, effective_from)
      SELECT 'dup-pub', tenant_id, 99, 'published', region_pack, resolved, 'x', now() FROM config.tenant_config_versions WHERE status = 'published'`)).rejects.toThrow();
  });
});

describe("region packs", () => {
  it("returns a whole pack, and the whole configuration in force, to admins", async () => {
    const pack = await api.call("GET", "/config/region-packs/DE", { token: admin });
    expect(pack.json.regional).toMatchObject({ currency: "EUR", timeZone: "Europe/Berlin" });
    expect(pack.json.tax.taxes[0]).toMatchObject({ code: "insurance_tax", rateBps: 1900 });
    expect((await api.call("GET", "/config/region-packs/ZZ", { token: admin })).status).toBe(404);
    const current = await api.call("GET", "/config/current", { token: admin });
    expect(current.json.finance).toBeDefined();
    expect(current.json.entitlements.modules).toContain("finance");
    expect((await api.call("GET", "/config/current", { token: accountant })).status).toBe(403);
  });

  it("lists the shipped packs for the settings screen", async () => {
    const r = await api.call("GET", "/config/region-packs", { token: admin });
    expect(r.json.map((p: any) => p.code).sort()).toEqual(["DE", "KE", "US"]);
    expect(r.json.find((p: any) => p.code === "DE")).toMatchObject({ currency: "EUR", taxPricing: "inclusive" });
  });
});
