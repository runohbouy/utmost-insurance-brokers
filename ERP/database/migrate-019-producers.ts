import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Producer/sub-broker management + commission splits — the blueprint's
// "Agency, Producer & Sub-Broker Management" module. A producer
// (agent or sub-broker) introduces business; opportunities/policies
// optionally carry a producer_id so the split can be computed when
// premium is confirmed. Splits are tracked as their own payable
// record (finance.producer_commission_splits), not by editing the
// brokerage's own commission income — see server.ts
// confirmPremiumForPolicy, which now reduces the GL's Commission
// Income line by whatever's owed to the producer and credits a new
// liability account instead, and postProducerCommissionPayment, which
// clears that liability against Bank when the producer is actually
// paid. Safe to re-run.
const SQL = `
CREATE TABLE IF NOT EXISTS sales.producers (
  id                    TEXT PRIMARY KEY,
  producer_type         TEXT NOT NULL CHECK (producer_type IN ('agent','sub_broker')),
  name                  TEXT NOT NULL,
  contact_person        TEXT,
  phone_number          TEXT,
  email                 TEXT,
  kra_pin               TEXT,
  licence_number        TEXT,
  commission_split_pct  NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (commission_split_pct >= 0 AND commission_split_pct <= 100),
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  contract_start_date   DATE,
  contract_end_date     DATE,
  target_premium_kes    NUMERIC(14,2),
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE crm.opportunities ADD COLUMN IF NOT EXISTS producer_id TEXT REFERENCES sales.producers(id);
ALTER TABLE policy.policies ADD COLUMN IF NOT EXISTS producer_id TEXT REFERENCES sales.producers(id);

CREATE TABLE IF NOT EXISTS finance.producer_commission_splits (
  id                       TEXT PRIMARY KEY,
  producer_id              TEXT NOT NULL REFERENCES sales.producers(id),
  policy_id                TEXT NOT NULL REFERENCES policy.policies(id),
  premium_confirmation_id  TEXT REFERENCES policy.premium_confirmations(id),
  commission_amount_kes    NUMERIC(14,2) NOT NULL,
  split_pct                NUMERIC(5,2) NOT NULL,
  split_amount_kes         NUMERIC(14,2) NOT NULL,
  status                   TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid')),
  paid_at                  TIMESTAMPTZ,
  payment_reference        TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO finance.gl_accounts (code, name, account_type, normal_balance, parent_account_code, is_system_account) VALUES
  ('2010', 'Producer Commissions Payable', 'liability', 'credit', NULL, true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO access.permissions (id, description) VALUES
  ('producer.manage', 'Create/edit producers and pay out producer commission splits')
ON CONFLICT (id) DO NOTHING;

INSERT INTO access.role_permissions (role_id, permission_id) VALUES
  ('admin', 'producer.manage'),
  ('accountant', 'producer.manage')
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
  console.log("Producers, opportunity/policy producer_id links, and producer commission splits added.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
