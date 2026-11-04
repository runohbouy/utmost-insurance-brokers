// ---------------------------------------------------------------------------
// Creates one test account per role in a RUNNING ERP, through its own API, and
// shows what each one gets (menu and abilities). Safe to run again: accounts that
// already exist are left as they are.
//
//   npm run test-users                      against http://localhost:3100 (your development server)
//   npm run test-users -- --url http://localhost:3101     against the demo
//
// It only ever talks to localhost, so it cannot create well-known-password accounts
// on a real deployment by mistake. Needs the development admin (the seeded
// amina@utmostbrokers.co.ke) and the migrations applied (npm run db:migrate:all).
// ---------------------------------------------------------------------------
import { visibleViews } from "../src/navAccess";
import { TEST_PASSWORD, TEST_USERS } from "./test-users-roster";

const arg = (name: string) => { const i = process.argv.indexOf(name); return i === -1 ? undefined : process.argv[i + 1]; };
const url = new URL(arg("--url") ?? "http://localhost:3100");
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
  console.error(`Refusing to create test accounts on ${url.hostname}: this only runs against a local server.`);
  process.exit(1);
}
const base = `${url.origin}/api`;

async function call(method: string, p: string, token?: string, body?: unknown): Promise<{ status: number; json: any }> {
  let res: Response;
  try {
    res = await fetch(base + p, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    console.error(`Could not reach ${url.origin}. Is the ERP running (npm run dev, or npm run demo for 3101)?`);
    process.exit(1);
  }
  const text = await res.text();
  let json: any; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

const adminLogin = await call("POST", "/auth/login", undefined, { email: "amina@utmostbrokers.co.ke", password: TEST_PASSWORD });
if (adminLogin.status !== 200) {
  console.error(`Could not sign in as the development admin (amina@utmostbrokers.co.ke): ${JSON.stringify(adminLogin.json)}`);
  process.exit(1);
}
const admin: string = adminLogin.json.token;

const roles: { id: string }[] = (await call("GET", "/roles", admin)).json;
const missing = [...new Set(TEST_USERS.map((u) => u.roleId))].filter((r) => !roles.some((x) => x.id === r));
if (missing.length) {
  console.error(`These roles do not exist in the database yet: ${missing.join(", ")}. Apply the migrations first: npm run db:migrate:all (stop the dev server while it runs).`);
  process.exit(1);
}

const existing: { email: string | null }[] = (await call("GET", "/staff", admin)).json;
const rows: string[][] = [];
for (const u of TEST_USERS) {
  let state = "exists";
  if (!existing.some((s) => s.email === u.email)) {
    const created = await call("POST", "/staff", admin, {
      fullName: u.fullName, email: u.email, roleId: u.roleId, password: TEST_PASSWORD, jobTitle: u.jobTitle, department: u.department,
      branch: "Nairobi HQ", employmentType: "full_time", hireDate: new Date().toISOString().slice(0, 10),
    });
    if (created.status !== 200) { console.error(`Could not create ${u.email}: ${JSON.stringify(created.json)}`); process.exit(1); }
    state = "created";
  }
  // prove the account works and show what it gets
  const session = await call("POST", "/auth/login", undefined, { email: u.email, password: TEST_PASSWORD });
  if (session.status !== 200) { rows.push([u.kind, u.email, state, `LOGIN FAILED (${session.status})`, ""]); continue; }
  const me = (await call("GET", "/auth/me", session.json.token)).json;
  const views = visibleViews(me.permissions as string[]); // the menu the dashboard will actually show
  const abilities = (me.permissions as string[]).filter((p) => !p.startsWith("view."));
  rows.push([u.kind, u.email, state, views.join(", "), abilities.join(", ") || "(none beyond the basics)"]);
}

console.log(`\nTest accounts on ${url.origin}  ·  password for all: ${TEST_PASSWORD}\n`);
for (const [kind, email, state, views, abilities] of rows) {
  console.log(`${kind}  [${state}]\n  ${email}\n  menu:       ${views}\n  can also:   ${abilities}\n`);
}
