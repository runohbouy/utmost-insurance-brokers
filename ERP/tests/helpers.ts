import fs from "fs";
import os from "os";
import path from "path";
import type { AddressInfo } from "net";
import type { Server } from "http";
import bcrypt from "bcryptjs";

export const API_KEY = process.env.INTERNAL_API_KEY!;
export const PASSWORD = "ChangeMe123!";

export interface TestApp {
  baseUrl: string;
  close: () => Promise<void>;
}

// Boots the real Express app on an ephemeral port. Imported lazily so the
// env set in setup.ts is in place before server.ts and db/client.ts load.
export async function startApp(): Promise<TestApp> {
  const cleanup = await provisionDatabase();

  const { app } = await import("../server");
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}/api`,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await cleanup();
    },
  };
}

// A private, fully-migrated database for this test file: a copy of the cached
// PGlite data directory, or (with TEST_DATABASE_URL) a database cloned from the
// template on a real PostgreSQL server. Returns the teardown.
async function provisionDatabase(): Promise<() => Promise<void>> {
  const adminUrl = process.env.TEST_DATABASE_URL;

  if (!adminUrl) {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-test-db-"));
    fs.cpSync(path.join(process.cwd(), "database", ".pgdata-test-template"), dataDir, { recursive: true });
    process.env.PGLITE_DATA_DIR = dataDir;
    return async () => {
      try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch { /* Windows may still hold a handle; OS temp cleanup will get it */ }
    };
  }

  const { Pool } = await import("pg");
  const name = `erp_test_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const admin = new Pool({ connectionString: adminUrl });
  await admin.query(`CREATE DATABASE "${name}" TEMPLATE "erp_test_template"`);
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  process.env.DATABASE_URL = url.toString();

  return async () => {
    try {
      const { closeDb } = await import("../db/client");
      await closeDb();
    } catch { /* already closed */ }
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.end();
  };
}

interface CallOptions {
  token?: string | null;
  apiKey?: string | null; // defaults to the valid key; pass null to omit
  body?: unknown;
  headers?: Record<string, string>;
}

export function makeClient(baseUrl: string) {
  async function call(method: string, path: string, opts: CallOptions = {}) {
    const headers: Record<string, string> = { "Content-Type": "application/json", ...opts.headers };
    const key = opts.apiKey === undefined ? API_KEY : opts.apiKey;
    if (key) headers["x-api-key"] = key;
    if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: opts.body === undefined || method === "GET" || method === "HEAD" ? undefined : JSON.stringify(opts.body),
    });
    const text = await res.text();
    let json: any;
    try { json = JSON.parse(text); } catch { json = undefined; }
    return { status: res.status, json, text, headers: res.headers };
  }

  async function login(email: string, password = PASSWORD): Promise<string> {
    const res = await call("POST", "/auth/login", { body: { email, password } });
    if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${res.text}`);
    return res.json.token as string;
  }

  return { call, login };
}

// Seeded logins from the base schema: admin / underwriter / claims officer.
export const SEEDED = {
  admin: "amina@utmostbrokers.co.ke",
  underwriter: "peter@utmostbrokers.co.ke",
  claims: "grace@utmostbrokers.co.ke",
};

// Roles the seed has no login for. Inserted straight into the database with
// a real bcrypt hash so tests can sign in as them through the API.
export const EXTRA_STAFF = [
  { id: "staff-test-accountant", name: "Test Accountant", email: "accountant@test.local", role: "accountant" },
  { id: "staff-test-supervisor", name: "Test Supervisor", email: "supervisor@test.local", role: "supervisor" },
  { id: "staff-test-sales", name: "Test Sales Agent", email: "sales@test.local", role: "sales_agent" },
];

export async function seedExtraStaff() {
  const { db } = await import("../db/client");
  const { staff } = await import("../db/schema");
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  for (const s of EXTRA_STAFF) {
    await db.insert(staff).values({ id: s.id, fullName: s.name, email: s.email, roleId: s.role, active: true, passwordHash }).onConflictDoNothing();
  }
}

export async function setStaffActive(id: string, active: boolean) {
  const { db } = await import("../db/client");
  const { staff } = await import("../db/schema");
  const { eq } = await import("drizzle-orm");
  await db.update(staff).set({ active }).where(eq(staff.id, id));
}
