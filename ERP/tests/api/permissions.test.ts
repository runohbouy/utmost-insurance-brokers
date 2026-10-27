import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEEDED, makeClient, seedExtraStaff, startApp, type TestApp } from "../helpers";

// The role/permission matrix, enforced route by route. For each route we
// list the roles that SHOULD pass the permission gate; every other role must
// get 403. "Passing the gate" means any status except 401/403 — an empty
// body usually lands on a 400/404/500 inside the handler, which is fine: the
// point is that the permission check itself let the request through.

type Role = "admin" | "underwriter" | "claims" | "accountant" | "supervisor" | "sales";
const ALL_ROLES: Role[] = ["admin", "underwriter", "claims", "accountant", "supervisor", "sales"];

const EMAIL: Record<Role, string> = {
  admin: SEEDED.admin,
  underwriter: SEEDED.underwriter,
  claims: SEEDED.claims,
  accountant: "accountant@test.local",
  supervisor: "supervisor@test.local",
  sales: "sales@test.local",
};

// [method, path, roles allowed through]
const MATRIX: [string, string, Role[]][] = [
  // finance.record — admin, accountant
  ["POST", "/payments", ["admin", "accountant"]],
  ["POST", "/payments/x/allocations", ["admin", "accountant"]],
  ["POST", "/premium-confirmations", ["admin", "accountant"]],
  ["POST", "/commission-clawbacks", ["admin", "accountant"]],
  ["POST", "/petty-cash-floats", ["admin", "accountant"]],
  ["PATCH", "/petty-cash-floats/x", ["admin", "accountant"]],
  ["POST", "/petty-cash-transactions", ["admin", "accountant"]],
  ["POST", "/office-expenses", ["admin", "accountant"]],
  ["PATCH", "/office-expenses/x", ["admin", "accountant"]],
  // finance.view — admin, accountant, supervisor
  ["GET", "/journal-entries", ["admin", "accountant", "supervisor"]],
  ["GET", "/gl-accounts", ["admin", "accountant", "supervisor"]],
  ["GET", "/accounting-periods", ["admin", "accountant", "supervisor"]],
  ["GET", "/petty-cash-floats", ["admin", "accountant", "supervisor"]],
  ["GET", "/petty-cash-transactions", ["admin", "accountant", "supervisor"]],
  ["GET", "/office-expenses", ["admin", "accountant", "supervisor"]],
  ["GET", "/gl/trial-balance?periodId=2026-08", ["admin", "accountant", "supervisor"]],
  ["GET", "/gl/income-statement?periodId=2026-08", ["admin", "accountant", "supervisor"]],
  // gl.manage — admin, accountant; gl.period_close — admin, supervisor
  ["POST", "/gl-accounts", ["admin", "accountant"]],
  ["POST", "/journal-entries", ["admin", "accountant"]],
  ["PATCH", "/accounting-periods/x", ["admin", "supervisor"]],
  // commission_statement.reconcile — admin, accountant
  ["POST", "/commission-statements", ["admin", "accountant"]],
  ["PATCH", "/commission-statements/x", ["admin", "accountant"]],
  ["POST", "/commission-lines", ["admin", "accountant"]],
  ["POST", "/commission-statements/x/reconcile", ["admin", "accountant"]],
  // claim.decide — admin, claims
  ["POST", "/claim-reserve-lines", ["admin", "claims"]],
  ["POST", "/claim-payment-lines", ["admin", "claims"]],
  ["POST", "/claims/x/manager-review", ["admin", "claims"]],
  // insurer_rate.manage — admin, underwriter
  ["POST", "/insurers", ["admin", "underwriter"]],
  ["PATCH", "/insurers/x", ["admin", "underwriter"]],
  ["DELETE", "/insurers/x", ["admin", "underwriter"]],
  ["POST", "/statutory-levies", ["admin", "underwriter"]],
  ["PATCH", "/statutory-levies/x", ["admin", "underwriter"]],
  ["POST", "/insurer-rates", ["admin", "underwriter"]],
  ["POST", "/products", ["admin", "underwriter"]],
  // underwriting.approve — admin, underwriter, supervisor
  ["PATCH", "/underwriting-approvals/x", ["admin", "underwriter", "supervisor"]],
  // audit.view — admin
  ["GET", "/audit-log", ["admin"]],
  // HR + producers
  ["POST", "/staff", ["admin"]],
  ["PATCH", "/staff/x", ["admin"]],
  ["PATCH", "/employees/x", ["admin"]],
  ["POST", "/performance-reviews", ["admin", "supervisor"]],
  ["POST", "/producers", ["admin", "accountant"]],
  ["PATCH", "/producers/x", ["admin", "accountant"]],
  ["POST", "/producer-commission-splits/x/pay", ["admin", "accountant"]],
  // obligation.manage — admin, supervisor
  ["POST", "/obligations", ["admin", "supervisor"]],
  ["PATCH", "/obligations/x", ["admin", "supervisor"]],
  // recommendation.decide — admin, supervisor
  ["POST", "/risk-clearances", ["admin", "supervisor"]],
];

let app: TestApp;
let client: ReturnType<typeof makeClient>;
const tokens = {} as Record<Role, string>;

beforeAll(async () => {
  app = await startApp();
  client = makeClient(app.baseUrl);
  await seedExtraStaff();
  for (const role of ALL_ROLES) tokens[role] = await client.login(EMAIL[role]);
});
afterAll(() => app.close());

describe("route permission matrix", () => {
  for (const [method, path, allowed] of MATRIX) {
    describe(`${method} ${path}`, () => {
      for (const role of ALL_ROLES) {
        const shouldPass = allowed.includes(role);
        it(`${role} is ${shouldPass ? "allowed through" : "denied (403)"}`, async () => {
          const res = await client.call(method, path, { token: tokens[role], body: {} });
          if (shouldPass) {
            expect([401, 403]).not.toContain(res.status);
          } else {
            expect(res.status).toBe(403);
          }
        });
      }
    });
  }
});
