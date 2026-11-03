// ---------------------------------------------------------------------------
// Performance check against a real PostgreSQL server.
//
//   TEST_DATABASE_URL=postgres://uib:uib_dev_password@localhost:5432/postgres npm run perf
//
// Clones the migrated test template into a scratch database, loads a realistic
// volume of receipts / invoices / allocations with set-based SQL, then
//   1. measures p50 / p95 of the hot read endpoints through the real HTTP app
//   2. times a worst-case allocation (one receipt across 50 open invoices)
//   3. prints EXPLAIN (ANALYZE, BUFFERS) for the queries that matter
// and fails (exit 1) if a target in the brief is missed:
//   reads p95 < 400 ms,  50-invoice allocation < 2 s.
// ---------------------------------------------------------------------------
import { Pool } from "pg";

const ADMIN_URL = process.env.TEST_DATABASE_URL;
if (!ADMIN_URL) throw new Error("Set TEST_DATABASE_URL to a PostgreSQL server (the tests' template database must exist: run `npm test` once).");

const CLIENTS = Number(process.env.PERF_CLIENTS ?? 3000);
const POLICIES_PER_CLIENT = 3;
const name = `erp_perf_${Date.now().toString(36)}`;
const url = new URL(ADMIN_URL);
url.pathname = `/${name}`;

const READ_P95_MS = 400;
const ALLOCATION_MS = 2000;

const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))];
let failed = false;

async function main() {
  const admin = new Pool({ connectionString: ADMIN_URL });
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${name}" TEMPLATE "erp_test_template"`);

  const pool = new Pool({ connectionString: url.toString() });
  try {
    await seed(pool);

    process.env.PGLITE_DEV = "false";
    process.env.DATABASE_URL = url.toString();
    process.env.VITEST = "1"; // do not bind the dashboard port
    process.env.NODE_ENV = "test";
    process.env.JWT_SECRET ??= "perf-run-secret-perf-run-secret-0000";
    process.env.INTERNAL_API_KEY ??= "perf-run-key-perf-run-key-perf-run-key";
    const { app } = await import("../server");
    const server = await new Promise<import("http").Server>((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
    const base = `http://127.0.0.1:${(server.address() as import("net").AddressInfo).port}/api`;

    const login = await fetch(`${base}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "amina@utmostbrokers.co.ke", password: "ChangeMe123!" }) });
    const token = (await login.json()).token as string;
    const get = async (path: string) => {
      const t0 = performance.now();
      const res = await fetch(`${base}${path}`, { headers: { authorization: `Bearer ${token}` } });
      await res.arrayBuffer();
      if (!res.ok) throw new Error(`${path} -> ${res.status}`);
      return performance.now() - t0;
    };

    const sample = await pool.query(`SELECT client_id FROM finance.invoices GROUP BY client_id ORDER BY random() LIMIT 1`);
    const sampleClient = sample.rows[0].client_id as string;

    console.log(`\nReads (${CLIENTS} clients, ${(await pool.query("SELECT COUNT(*)::int n FROM finance.receipts")).rows[0].n} receipts, ${(await pool.query("SELECT COUNT(*)::int n FROM finance.invoices")).rows[0].n} invoices)`);
    const endpoints = [
      "/receipts?limit=25", "/receipts?limit=25&q=RCT-2026", "/receipts?limit=25&status=cleared&holding=any",
      "/invoices?limit=25", "/invoices?limit=25&state=open", `/invoices?clientId=${sampleClient}`,
      `/clients/${sampleClient}/position`, "/kpis/summary", "/config/effective", "/parties?limit=25&offset=1000", "/policies?limit=25&offset=1000",
    ];
    for (const path of endpoints) {
      await get(path); // warm
      const times: number[] = [];
      for (let i = 0; i < 30; i++) times.push(await get(path));
      const p95 = pct(times, 95);
      const ok = p95 < READ_P95_MS;
      if (!ok) failed = true;
      console.log(`  ${ok ? "ok  " : "SLOW"} p50 ${pct(times, 50).toFixed(0).padStart(4)} ms  p95 ${p95.toFixed(0).padStart(4)} ms  ${path.slice(0, 70)}`);
    }

    console.log("\nAllocation, one receipt across 50 open invoices");
    const heavy = (await pool.query(`SELECT id FROM crm.parties WHERE id = 'perf-heavy'`)).rows[0].id as string;
    const t0 = performance.now();
    const res = await fetch(`${base}/receipts`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ clientId: heavy, amountMinor: 50 * 1_000_000, method: "bank" }),
    });
    const body = await res.json();
    const ms = performance.now() - t0;
    const ok = res.status === 201 && body.allocations.length === 50 && ms < ALLOCATION_MS;
    if (!ok) failed = true;
    console.log(`  ${ok ? "ok  " : "SLOW"} ${ms.toFixed(0)} ms  (status ${res.status}, ${body.allocations?.length ?? 0} allocations)  target < ${ALLOCATION_MS} ms`);

    // and the reverse: everything that receipt paid, taken back at once (returned cheque)
    const b0 = performance.now();
    const bounce = await fetch(`${base}/receipts/${body.id}/bounce`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: "{}" });
    const bounced = await bounce.json();
    const bms = performance.now() - b0;
    const bok = bounce.status === 200 && bounced.bounce?.reversed?.length === 50 && bms < ALLOCATION_MS;
    if (!bok) failed = true;
    console.log(`  ${bok ? "ok  " : "SLOW"} ${bms.toFixed(0)} ms  bounce reversing ${bounced.bounce?.reversed?.length ?? 0} allocations  target < ${ALLOCATION_MS} ms`);

    console.log("\nQuery plans");
    await explain(pool, "open invoices with live balances for a client (allocation input)", `
      SELECT i.id, l.id, l.amount_minor - COALESCE((SELECT SUM(al.amount_minor) FROM finance.allocation_lines al WHERE al.invoice_line_id = l.id), 0)
      FROM finance.invoices i JOIN finance.invoice_lines l ON l.invoice_id = i.id
      WHERE i.tenant_id = 'utmost' AND i.client_id = '${sampleClient}' AND i.status = 'open' ORDER BY i.id, l.sort_order`);
    await explain(pool, "receipts list, newest first", `
      SELECT r.* FROM finance.receipts r WHERE r.tenant_id = 'utmost' ORDER BY r.received_at DESC, r.id LIMIT 25`);
    await explain(pool, "suspense / client credit held", `
      SELECT SUM(r.amount_minor - COALESCE((SELECT SUM(a.amount_minor) FROM finance.allocations a WHERE a.receipt_id = r.id), 0))
      FROM finance.receipts r WHERE r.tenant_id = 'utmost' AND r.status = 'cleared' AND r.holding_kind = 'suspense'`);
    await explain(pool, "KPI: cleared receipts per day (one month)", `
      SELECT (e.occurred_at AT TIME ZONE 'Africa/Nairobi')::date, SUM(r.amount_minor)
      FROM finance.receipt_events e JOIN finance.receipts r ON r.id = e.receipt_id
      WHERE r.tenant_id = 'utmost' AND e.occurred_at >= now() - interval '30 days' AND e.occurred_at < now() + interval '1 day'
        AND (e.to_status = 'cleared' OR (e.to_status = 'bounced' AND e.from_status = 'cleared')) GROUP BY 1`);
    await explain(pool, "receivable position", `
      SELECT COALESCE(SUM(i.total_minor - COALESCE(a.paid, 0)), 0) FROM finance.invoices i
      LEFT JOIN LATERAL (SELECT SUM(amount_minor) AS paid FROM finance.allocations WHERE invoice_id = i.id) a ON true
      WHERE i.tenant_id = 'utmost' AND i.status = 'open'`);

    await new Promise<void>((r) => server.close(() => r()));
    const { closeDb } = await import("../db/client");
    await closeDb();
  } finally {
    await pool.end();
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.end();
  }
  console.log(failed ? "\nPERFORMANCE TARGET MISSED" : "\nAll performance targets met.");
  process.exit(failed ? 1 : 0);
}

async function explain(pool: Pool, title: string, query: string) {
  await pool.query("ANALYZE");
  const { rows } = await pool.query(`EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF) ${query}`);
  const lines = rows.map((r) => r["QUERY PLAN"] as string);
  const seq = lines.filter((l) => /Seq Scan/.test(l)).map((l) => l.trim());
  console.log(`\n-- ${title}`);
  console.log(lines.slice(0, 14).map((l) => "   " + l).join("\n"));
  console.log(seq.length ? `   >> sequential scans: ${seq.join(" | ")}` : "   >> no sequential scans");
}

/** Set-based load: no per-row round trips, so 10^5 rows seed in seconds. */
async function seed(pool: Pool) {
  const t0 = performance.now();
  const cfg = (await pool.query(`SELECT id FROM config.tenant_config_versions WHERE tenant_id = 'utmost' AND status = 'published'`)).rows[0].id;
  const insurer = (await pool.query(`SELECT id FROM product.insurers ORDER BY id LIMIT 1`)).rows[0].id;
  await pool.query(`INSERT INTO crm.parties (id, party_type, full_name) SELECT 'perf-' || g, 'individual', 'Perf Client ' || g FROM generate_series(1, ${CLIENTS}) g`);
  await pool.query(`INSERT INTO crm.parties (id, party_type, full_name) VALUES ('perf-heavy', 'individual', 'Perf Heavy Client')`);
  await pool.query(`
    INSERT INTO policy.policies (id, client_id, insurer_id, category, premium_amount, status, start_date, end_date)
    SELECT 'perf-pol-' || c || '-' || p, 'perf-' || c, '${insurer}', '07', 20000, 'Active', date '2026-01-01', date '2026-12-31'
    FROM generate_series(1, ${CLIENTS}) c, generate_series(1, ${POLICIES_PER_CLIENT}) p`);
  await pool.query(`
    INSERT INTO policy.policies (id, client_id, insurer_id, category, premium_amount, status, start_date, end_date)
    SELECT 'perf-pol-h-' || g, 'perf-heavy', '${insurer}', '07', 10000, 'Pending', date '2026-01-01', date '2026-12-31' FROM generate_series(1, 50) g`);

  // one premium invoice per policy (net + tax lines), due over the next year
  await pool.query(`
    INSERT INTO finance.invoices (id, tenant_id, invoice_no, kind, policy_id, client_id, insurer_id, product_type, currency, issue_date, due_date, total_minor, config_version_id)
    SELECT 'perf-inv-' || po.id, 'utmost', 'PERF-' || row_number() OVER (), 'premium', po.id, po.client_id, po.insurer_id, '07', 'KES',
           date '2026-01-01', date '2026-01-01' + (random() * 300)::int, 2_000_000 + 5_000, '${cfg}'
    FROM policy.policies po WHERE po.id LIKE 'perf-pol-%' AND po.client_id <> 'perf-heavy'`);
  await pool.query(`
    INSERT INTO finance.invoices (id, tenant_id, invoice_no, kind, policy_id, client_id, insurer_id, product_type, currency, issue_date, due_date, total_minor, config_version_id)
    SELECT 'perf-inv-h-' || g, 'utmost', 'PERF-H-' || g, 'premium', 'perf-pol-h-' || g, 'perf-heavy', '${insurer}', '07', 'KES', date '2026-01-01', date '2026-02-01' + g, 1_000_000, '${cfg}'
    FROM generate_series(1, 50) g`);
  await pool.query(`
    INSERT INTO finance.invoice_lines (id, invoice_id, kind, code, description, amount_minor, sort_order)
    SELECT i.id || '-n', i.id, 'net', 'premium', 'Premium', CASE WHEN i.client_id = 'perf-heavy' THEN 950_000 ELSE 2_000_000 END, 0 FROM finance.invoices i WHERE i.id LIKE 'perf-inv-%'
    UNION ALL
    SELECT i.id || '-t', i.id, 'tax', 'pcf', 'Levy', CASE WHEN i.client_id = 'perf-heavy' THEN 50_000 ELSE 5_000 END, 1 FROM finance.invoices i WHERE i.id LIKE 'perf-inv-%'`);

  // receipts for ~70% of invoices, each fully applied; a share of them bounced later (reversals)
  await pool.query(`
    INSERT INTO finance.receipts (id, tenant_id, receipt_no, client_id, amount_minor, currency, method, status, received_at, cleared_at, config_version_id)
    SELECT 'perf-rct-' || i.id, 'utmost', 'RCT-2026-P' || row_number() OVER (), i.client_id, i.total_minor, 'KES',
           (ARRAY['mpesa','bank','cash'])[1 + (random()*2)::int], 'cleared',
           now() - (random() * 60) * interval '1 day', now() - (random() * 60) * interval '1 day', '${cfg}'
    FROM finance.invoices i WHERE i.id LIKE 'perf-inv-perf-pol-%' AND random() < 0.7`);
  await pool.query(`
    INSERT INTO finance.receipt_events (receipt_id, from_status, to_status, occurred_at)
    SELECT id, NULL, 'cleared', cleared_at FROM finance.receipts WHERE id LIKE 'perf-rct-%'`);
  await pool.query(`
    INSERT INTO finance.allocation_batches (id, tenant_id, receipt_id, trigger, strategy, config_version_id)
    SELECT 'perf-b-' || id, 'utmost', id, 'on_clearing', 'fifo', '${cfg}' FROM finance.receipts WHERE id LIKE 'perf-rct-%'`);
  await pool.query(`
    INSERT INTO finance.allocations (id, tenant_id, batch_id, receipt_id, invoice_id, kind, amount_minor, currency)
    SELECT 'perf-a-' || r.id, 'utmost', 'perf-b-' || r.id, r.id, substr(r.id, 10), 'apply', r.amount_minor, 'KES' FROM finance.receipts r WHERE r.id LIKE 'perf-rct-%'`);
  await pool.query(`
    INSERT INTO finance.allocation_lines (allocation_id, invoice_line_id, amount_minor)
    SELECT a.id, l.id, l.amount_minor FROM finance.allocations a JOIN finance.invoice_lines l ON l.invoice_id = a.invoice_id WHERE a.id LIKE 'perf-a-%'`);
  // a thousand receipts in suspense, for the held-money queries
  await pool.query(`
    INSERT INTO finance.receipts (id, tenant_id, receipt_no, client_id, amount_minor, currency, method, status, received_at, cleared_at, holding_kind, config_version_id)
    SELECT 'perf-susp-' || g, 'utmost', 'RCT-2026-S' || g, 'perf-' || g, 100_000, 'KES', 'bank', 'cleared', now() - g * interval '1 hour', now() - g * interval '1 hour', 'suspense', '${cfg}'
    FROM generate_series(1, 1000) g`);
  await pool.query("ANALYZE");
  console.log(`Seeded in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
}

main().catch((err) => { console.error(err); process.exit(1); });
