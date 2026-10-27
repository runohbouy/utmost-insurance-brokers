import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// HR core: employee profiles (the blueprint's "employee record" is
// distinct from access.staff's "user account" — hr.employees is a 1:1
// HR extension of a staff row, not a replacement for it), leave
// management with balance enforcement, and performance reviews.
// Recruitment/payroll/attendance/training are deliberately out of
// scope for this pass — see README. Safe to re-run.
const SQL = `
CREATE SCHEMA IF NOT EXISTS hr;

CREATE TABLE IF NOT EXISTS hr.employees (
  staff_id                TEXT PRIMARY KEY REFERENCES access.staff(id),
  job_title               TEXT,
  department              TEXT,
  branch                  TEXT,
  employment_type         TEXT NOT NULL DEFAULT 'full_time' CHECK (employment_type IN ('full_time','part_time','contract','intern')),
  employment_status       TEXT NOT NULL DEFAULT 'active' CHECK (employment_status IN ('active','on_leave','suspended','terminated')),
  hire_date               DATE,
  termination_date        DATE,
  termination_reason      TEXT,
  national_id             TEXT,
  kra_pin                 TEXT,
  emergency_contact_name  TEXT,
  emergency_contact_phone TEXT,
  base_salary_kes         NUMERIC(12,2),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hr.leave_types (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  default_days_per_year NUMERIC(5,1) NOT NULL DEFAULT 0,
  paid                  BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS hr.leave_balances (
  id                 TEXT PRIMARY KEY,
  staff_id           TEXT NOT NULL REFERENCES access.staff(id),
  leave_type_id      TEXT NOT NULL REFERENCES hr.leave_types(id),
  year               INTEGER NOT NULL,
  allocated_days     NUMERIC(5,1) NOT NULL DEFAULT 0,
  used_days          NUMERIC(5,1) NOT NULL DEFAULT 0,
  carried_over_days  NUMERIC(5,1) NOT NULL DEFAULT 0,
  UNIQUE (staff_id, leave_type_id, year)
);

CREATE TABLE IF NOT EXISTS hr.leave_requests (
  id              TEXT PRIMARY KEY,
  staff_id        TEXT NOT NULL REFERENCES access.staff(id),
  leave_type_id   TEXT NOT NULL REFERENCES hr.leave_types(id),
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  days_requested  NUMERIC(5,1) NOT NULL,
  reason          TEXT,
  status          TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','rejected','cancelled')),
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by      TEXT REFERENCES access.staff(id),
  decided_at      TIMESTAMPTZ,
  decision_notes  TEXT
);

CREATE TABLE IF NOT EXISTS hr.performance_reviews (
  id                    TEXT PRIMARY KEY,
  staff_id              TEXT NOT NULL REFERENCES access.staff(id),
  reviewer_id           TEXT REFERENCES access.staff(id),
  period_start          DATE NOT NULL,
  period_end            DATE NOT NULL,
  rating                TEXT CHECK (rating IN ('exceeds','meets','below','unsatisfactory')),
  strengths             TEXT,
  areas_for_improvement TEXT,
  goals                 TEXT,
  status                TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','acknowledged')),
  submitted_at          TIMESTAMPTZ,
  acknowledged_at       TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO hr.leave_types (id, name, default_days_per_year, paid) VALUES
  ('annual', 'Annual leave', 21, true),
  ('sick', 'Sick leave', 14, true),
  ('maternity', 'Maternity leave', 90, true),
  ('paternity', 'Paternity leave', 14, true),
  ('compassionate', 'Compassionate leave', 5, true),
  ('unpaid', 'Unpaid leave', 0, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO hr.employees (staff_id, job_title, department, branch, employment_type, employment_status, hire_date) VALUES
  ('staff-admin', 'Operations Director', 'Management', 'Nairobi HQ', 'full_time', 'active', '2022-01-10'),
  ('staff-underwriter', 'Underwriter', 'Underwriting', 'Nairobi HQ', 'full_time', 'active', '2023-03-01'),
  ('staff-claims', 'Claims Officer', 'Claims', 'Nairobi HQ', 'full_time', 'active', '2023-06-15')
ON CONFLICT (staff_id) DO NOTHING;

INSERT INTO hr.leave_balances (id, staff_id, leave_type_id, year, allocated_days) VALUES
  ('lb-staff-admin-annual-2026', 'staff-admin', 'annual', 2026, 21),
  ('lb-staff-admin-sick-2026', 'staff-admin', 'sick', 2026, 14),
  ('lb-staff-underwriter-annual-2026', 'staff-underwriter', 'annual', 2026, 21),
  ('lb-staff-underwriter-sick-2026', 'staff-underwriter', 'sick', 2026, 14),
  ('lb-staff-claims-annual-2026', 'staff-claims', 'annual', 2026, 21),
  ('lb-staff-claims-sick-2026', 'staff-claims', 'sick', 2026, 14)
ON CONFLICT (staff_id, leave_type_id, year) DO NOTHING;

INSERT INTO access.permissions (id, description) VALUES
  ('employee.manage', 'Create/edit employee profiles and leave types'),
  ('leave.decide', 'Approve/reject leave requests'),
  ('performance_review.manage', 'Create, submit and acknowledge performance reviews')
ON CONFLICT (id) DO NOTHING;

INSERT INTO access.role_permissions (role_id, permission_id) VALUES
  ('admin', 'employee.manage'),
  ('admin', 'leave.decide'),
  ('admin', 'performance_review.manage'),
  ('supervisor', 'leave.decide'),
  ('supervisor', 'performance_review.manage')
ON CONFLICT DO NOTHING;
`;

async function main() {
  if (process.env.PGLITE_DEV === "true") {
    const pglite = new PGlite(process.env.PGLITE_DATA_DIR || path.join(__dirname, ".pgdata-embedded"));
    await pglite.exec(SQL);
    await pglite.close();
  } else {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query(SQL);
    await pool.end();
  }
  console.log("HR core (employee profiles, leave management, performance reviews) added.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
