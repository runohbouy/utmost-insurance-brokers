import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEEDED, makeClient, seedExtraStaff, startApp, type TestApp } from "../helpers";

let app: TestApp;
let client: ReturnType<typeof makeClient>;
let admin: string;
let accountant: string;

beforeAll(async () => {
  app = await startApp();
  client = makeClient(app.baseUrl);
  await seedExtraStaff();
  admin = await client.login(SEEDED.admin);
  accountant = await client.login("accountant@test.local");
});
afterAll(() => app.close());

const currentPeriod = () => new Date().toISOString().slice(0, 7);

function sumLines(lines: { accountCode: string; debitKes: number | string; creditKes: number | string }[]) {
  const byAccount: Record<string, { debit: number; credit: number }> = {};
  for (const l of lines) {
    const row = (byAccount[l.accountCode] ??= { debit: 0, credit: 0 });
    row.debit += Number(l.debitKes);
    row.credit += Number(l.creditKes);
  }
  return byAccount;
}

describe("premium confirmation → policy, commission, producer split and ledger", () => {
  let policyId: string;
  let confirmationId: string;
  let producerId: string;

  beforeAll(async () => {
    const insurer = await client.call("POST", "/insurers", { token: admin, body: { name: "Test Insurer", authorizedClasses: ["07"] } });
    expect(insurer.status).toBe(200);

    // Motor private: the Commission Guide caps it at 10%.
    const rate = await client.call("POST", "/insurer-rates", { token: admin, body: { insurerId: insurer.json.id, category: "07", commissionRatePct: 10 } });
    expect(rate.status).toBe(200);

    const producer = await client.call("POST", "/producers", { token: admin, body: { producerType: "agent", name: "Test Agent", commissionSplitPct: 30 } });
    expect(producer.status).toBe(200);
    producerId = producer.json.id;

    const party = await client.call("POST", "/parties", { body: { fullName: "Premium Test Client", partyType: "individual" } });
    expect(party.status).toBe(200);

    // The quote-generator creates policies with the API key alone.
    const policy = await client.call("POST", "/policies", {
      body: { clientId: party.json.id, insurerId: insurer.json.id, producerId, category: "07", premiumAmount: 100000, endDate: "2027-12-31" },
    });
    expect(policy.status).toBe(200);
    expect(policy.json.status).toBe("Pending");
    policyId = policy.json.id;

    const confirmation = await client.call("POST", "/premium-confirmations", { token: accountant, body: { policyId, confirmedAmountKes: 100000 } });
    expect(confirmation.status).toBe(200);
    confirmationId = confirmation.json.id;
  });

  it("activates the policy only once premium is confirmed", async () => {
    const policies = await client.call("GET", "/policies");
    expect(policies.json.find((p: any) => p.id === policyId).status).toBe("Active");
  });

  it("projects commission at the insurer's rate", async () => {
    const txns = await client.call("GET", "/financial-transactions", { token: accountant });
    const commission = txns.json.find((t: any) => t.policyId === policyId && t.transactionType === "commission");
    expect(Number(commission.amountKes)).toBe(10000);
    expect(commission.status).toBe("pending");
  });

  it("owes the producer their negotiated share of that commission", async () => {
    const splits = await client.call("GET", `/producer-commission-splits?producerId=${producerId}`, { token: accountant });
    expect(splits.json).toHaveLength(1);
    expect(Number(splits.json[0].splitAmountKes)).toBe(3000);
  });

  it("posts a balanced journal entry: bank, insurer payable, our net income, producer payable", async () => {
    const entries = await client.call("GET", `/journal-entries?periodId=${currentPeriod()}`, { token: accountant });
    const entry = entries.json.find((e: any) => e.sourceType === "premium_confirmation" && e.sourceId === confirmationId);
    expect(entry).toBeDefined();

    const accounts = sumLines(entry.lines);
    expect(accounts["1000"]).toEqual({ debit: 100000, credit: 0 }); // Bank & Cash
    expect(accounts["2000"]).toEqual({ debit: 0, credit: 90000 }); // Insurer Premiums Payable
    expect(accounts["4000"]).toEqual({ debit: 0, credit: 7000 }); // our net commission (10000 - 3000)
    expect(accounts["2010"]).toEqual({ debit: 0, credit: 3000 }); // Producer Commissions Payable

    const totalDebit = Object.values(accounts).reduce((s, a) => s + a.debit, 0);
    const totalCredit = Object.values(accounts).reduce((s, a) => s + a.credit, 0);
    expect(totalDebit).toBe(totalCredit);
  });

  it("keeps the whole trial balance balanced", async () => {
    const tb = await client.call("GET", `/gl/trial-balance?periodId=${currentPeriod()}`, { token: accountant });
    expect(tb.status).toBe(200);
    expect(tb.json.balanced).toBe(true);
    expect(tb.json.totalDebitKes).toBe(tb.json.totalCreditKes);
  });

  it("rejects a commission rate above the Commission Guide ceiling", async () => {
    const insurer = await client.call("POST", "/insurers", { token: admin, body: { name: "Greedy Insurer" } });
    const res = await client.call("POST", "/insurer-rates", { token: admin, body: { insurerId: insurer.json.id, category: "07", commissionRatePct: 25 } });
    expect(res.status).toBe(400);
  });
});

describe("manual journal entries", () => {
  it("rejects an entry that does not balance", async () => {
    const res = await client.call("POST", "/journal-entries", {
      token: accountant,
      body: { periodId: currentPeriod(), entryDate: new Date().toISOString().slice(0, 10), lines: [{ accountCode: "1000", debitKes: 500 }, { accountCode: "4000", creditKes: 400 }] },
    });
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/does not balance/i);
  });

  it("rejects a line that is both debit and credit", async () => {
    const res = await client.call("POST", "/journal-entries", {
      token: accountant,
      body: { periodId: currentPeriod(), entryDate: "2026-01-01", lines: [{ accountCode: "1000", debitKes: 5, creditKes: 5 }, { accountCode: "4000", creditKes: 0 }] },
    });
    expect(res.status).toBe(400);
  });

  it("rejects an unknown account code", async () => {
    const res = await client.call("POST", "/journal-entries", {
      token: accountant,
      body: { periodId: currentPeriod(), entryDate: "2026-01-01", lines: [{ accountCode: "9999", debitKes: 5 }, { accountCode: "4000", creditKes: 5 }] },
    });
    expect(res.status).toBe(400);
  });
});

describe("robustness", () => {
  it("creates unique ids when many parties are created in the same millisecond", async () => {
    const results = await Promise.all(
      Array.from({ length: 25 }, (_, i) => client.call("POST", "/parties", { body: { fullName: `Concurrent ${i}`, partyType: "individual" } })),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(new Set(results.map((r) => r.json.id)).size).toBe(25);
  });

  it("creates unique policy ids under concurrency", async () => {
    const party = await client.call("POST", "/parties", { body: { fullName: "Policy Holder", partyType: "individual" } });
    const results = await Promise.all(
      Array.from({ length: 25 }, () => client.call("POST", "/policies", { body: { clientId: party.json.id, category: "07", premiumAmount: 1000, endDate: "2027-12-31" } })),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(new Set(results.map((r) => r.json.id)).size).toBe(25);
  });

  it("answers bad input with a 4xx instead of a 500", async () => {
    const missingRequired = await client.call("POST", "/risk-clearances", { token: admin, body: {} });
    expect(missingRequired.status).toBe(400);
    expect(JSON.stringify(missingRequired.json)).not.toMatch(/insert into|violates|constraint/i);

    const badReference = await client.call("POST", "/policies", { body: { clientId: "no-such-party", category: "07", premiumAmount: 1, endDate: "2027-12-31" } });
    expect(badReference.status).toBe(400);
  });

  it("attributes writes to the signed-in user, ignoring an actor id in the body", async () => {
    const sales = await client.login("sales@test.local");
    const created = await client.call("POST", "/parties", { token: sales, body: { fullName: "Audit Subject", partyType: "individual", updatedByStaffId: "staff-admin" } });
    const log = await client.call("GET", "/audit-log", { token: admin });
    const entry = log.json.find((e: any) => e.action === "PARTY_CREATED" && e.entityId === created.json.id);
    expect(entry.actorStaffId).toBe("staff-test-sales");
  });
});
