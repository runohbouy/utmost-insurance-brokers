import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEEDED, makeClient, seedExtraStaff, startApp, type TestApp } from "../helpers";

let app: TestApp;
let client: ReturnType<typeof makeClient>;
let admin: string, claims: string, underwriter: string, supervisor: string, sales: string;

beforeAll(async () => {
  app = await startApp();
  client = makeClient(app.baseUrl);
  await seedExtraStaff();
  [admin, claims, underwriter, supervisor, sales] = await Promise.all([
    client.login(SEEDED.admin),
    client.login(SEEDED.claims),
    client.login(SEEDED.underwriter),
    client.login("supervisor@test.local"),
    client.login("sales@test.local"),
  ]);
});
afterAll(() => app.close());

describe("employee records", () => {
  it("hides salary and identity numbers from everyone but HR and the employee", async () => {
    const patched = await client.call("PATCH", "/employees/staff-underwriter", { token: admin, body: { baseSalaryKes: 150000, nationalId: "12345678", kraPin: "A001234567Z" } });
    expect(patched.status).toBe(200);

    const asAdmin = (await client.call("GET", "/employees", { token: admin })).json.find((e: any) => e.staffId === "staff-underwriter");
    expect(Number(asAdmin.baseSalaryKes)).toBe(150000);

    const asSelf = (await client.call("GET", "/employees", { token: underwriter })).json.find((e: any) => e.staffId === "staff-underwriter");
    expect(Number(asSelf.baseSalaryKes)).toBe(150000);

    const asColleague = (await client.call("GET", "/employees", { token: claims })).json.find((e: any) => e.staffId === "staff-underwriter");
    expect(asColleague.baseSalaryKes).toBeNull();
    expect(asColleague.nationalId).toBeNull();
    expect(asColleague.kraPin).toBeNull();
    expect(asColleague.jobTitle).toBe("Underwriter"); // org-chart fields stay visible
  });

  it("never returns password hashes from /staff", async () => {
    const res = await client.call("GET", "/staff", { token: sales });
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/passwordHash|\$2[aby]\$/);
  });

  it("requires a decent password when creating staff", async () => {
    const res = await client.call("POST", "/staff", { token: admin, body: { fullName: "Weak Password", password: "short" } });
    expect(res.status).toBe(400);
  });
});

describe("leave rules", () => {
  let supervisorLeaveId: string;

  it("lets staff request leave only for themselves", async () => {
    const forSelf = await client.call("POST", "/leave-requests", { token: sales, body: { staffId: "staff-test-sales", leaveTypeId: "annual", startDate: "2026-11-02", endDate: "2026-11-03" } });
    expect(forSelf.status).toBe(200);
    const forOther = await client.call("POST", "/leave-requests", { token: sales, body: { staffId: "staff-admin", leaveTypeId: "annual", startDate: "2026-11-02", endDate: "2026-11-03" } });
    expect(forOther.status).toBe(403);
  });

  it("blocks approving your own leave", async () => {
    const filed = await client.call("POST", "/leave-requests", { token: supervisor, body: { staffId: "staff-test-supervisor", leaveTypeId: "annual", startDate: "2026-12-01", endDate: "2026-12-02" } });
    expect(filed.status).toBe(200);
    supervisorLeaveId = filed.json.id;

    const selfApprove = await client.call("PATCH", `/leave-requests/${supervisorLeaveId}`, { token: supervisor, body: { status: "approved" } });
    expect(selfApprove.status).toBe(403);
  });

  it("blocks someone else cancelling it, but lets the requester and an approver", async () => {
    const byColleague = await client.call("PATCH", `/leave-requests/${supervisorLeaveId}`, { token: claims, body: { status: "cancelled" } });
    expect(byColleague.status).toBe(403);

    const approved = await client.call("PATCH", `/leave-requests/${supervisorLeaveId}`, { token: admin, body: { status: "approved" } });
    expect(approved.status).toBe(200);

    const byRequester = await client.call("PATCH", `/leave-requests/${supervisorLeaveId}`, { token: supervisor, body: { status: "cancelled" } });
    expect(byRequester.status).toBe(200);
  });

  it("cannot approve more days than the balance allows", async () => {
    const filed = await client.call("POST", "/leave-requests", { token: sales, body: { staffId: "staff-test-sales", leaveTypeId: "annual", startDate: "2026-06-01", endDate: "2026-07-30" } });
    const approve = await client.call("PATCH", `/leave-requests/${filed.json.id}`, { token: admin, body: { status: "approved" } });
    expect(approve.status).toBe(400);
    expect(approve.json.error).toMatch(/insufficient leave balance/i);
  });
});

describe("performance reviews", () => {
  let reviewId: string;

  beforeAll(async () => {
    const created = await client.call("POST", "/performance-reviews", {
      token: admin,
      body: { staffId: "staff-test-sales", periodStart: "2026-01-01", periodEnd: "2026-06-30", rating: "meets" },
    });
    expect(created.status).toBe(200);
    reviewId = created.json.id;
    const submitted = await client.call("PATCH", `/performance-reviews/${reviewId}`, { token: admin, body: { status: "submitted" } });
    expect(submitted.status).toBe(200);
  });

  it("is visible to the reviewee and review managers, and hidden from colleagues", async () => {
    const ids = async (token: string) => (await client.call("GET", "/performance-reviews", { token })).json.map((r: any) => r.id);
    expect(await ids(sales)).toContain(reviewId);
    expect(await ids(admin)).toContain(reviewId);
    expect(await ids(claims)).not.toContain(reviewId);
  });

  it("can be acknowledged only by the person reviewed (or a review manager)", async () => {
    const byColleague = await client.call("PATCH", `/performance-reviews/${reviewId}`, { token: claims, body: { status: "acknowledged" } });
    expect(byColleague.status).toBe(403);
    const byReviewee = await client.call("PATCH", `/performance-reviews/${reviewId}`, { token: sales, body: { status: "acknowledged" } });
    expect(byReviewee.status).toBe(200);
  });
});

describe("documents", () => {
  const upload = (token: string, sensitivity: string, fileName: string, mimeType: string, content: string) =>
    client.call("POST", "/documents", {
      token,
      body: { fileName, mimeType, fileBase64: Buffer.from(content).toString("base64"), ownerEntityType: "party", ownerEntityId: "p1", documentType: "other", sensitivity },
    });

  it("hides restricted documents from staff without document.restricted", async () => {
    const restricted = await upload(admin, "restricted", "board-minutes.pdf", "application/pdf", "secret");
    const internal = await upload(admin, "internal", "brochure.pdf", "application/pdf", "ok");
    expect([restricted.status, internal.status]).toEqual([200, 200]);

    const listFor = async (token: string) => (await client.call("GET", "/documents", { token })).json.map((d: any) => d.id);
    expect(await listFor(admin)).toContain(restricted.json.id);
    expect(await listFor(claims)).not.toContain(restricted.json.id);
    expect(await listFor(claims)).toContain(internal.json.id);

    expect((await client.call("GET", `/documents/${restricted.json.id}/download`, { token: claims })).status).toBe(404);
    expect((await client.call("GET", `/documents/${restricted.json.id}/download`, { token: admin })).status).toBe(200);
  });

  it("serves uploaded HTML as an inert download, never as a page", async () => {
    const evil = await upload(admin, "internal", "evil.html", "text/html", "<script>alert(1)</script>");
    const res = await client.call("GET", `/documents/${evil.json.id}/download`, { token: admin });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/octet-stream/);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment/);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("keeps a safe type for a normal PDF", async () => {
    const pdf = await upload(admin, "internal", "policy.pdf", "application/pdf", "%PDF-1.4");
    const res = await client.call("GET", `/documents/${pdf.json.id}/download`, { token: admin });
    expect(res.headers.get("content-type")).toMatch(/application\/pdf/);
  });

  it("strips header-injection characters from the download filename", async () => {
    const odd = await upload(admin, "internal", "a\"b\r\nSet-Cookie: x=1.txt", "text/plain", "hi");
    const res = await client.call("GET", `/documents/${odd.json.id}/download`, { token: admin });
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});
