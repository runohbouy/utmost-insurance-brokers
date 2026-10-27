import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Adds product.commission_guide — the market's own maximum permitted
// commission rate per line of business (Commission Guide Insurance.xlsx),
// a ceiling insurer_rate_versions.commission_rate_pct is validated
// against, not a rate itself. Safe to re-run: CREATE TABLE IF NOT
// EXISTS / ON CONFLICT DO NOTHING throughout.
const SQL = `
CREATE TABLE IF NOT EXISTS product.commission_guide (
  id                            TEXT PRIMARY KEY,
  category                      TEXT NOT NULL,
  policy_name                   TEXT NOT NULL,
  class_code                    TEXT,
  max_permitted_commission_pct  NUMERIC(5,2) NOT NULL,
  source                        TEXT,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO product.commission_guide (id, category, policy_name, class_code, max_permitted_commission_pct, source) VALUES
  ('cg-contractors-all-risks', 'ENGINEERING', 'Contractors All Risks', '02', 20.00, 'Commission Guide Insurance'),
  ('cg-electronic-equipment', 'ENGINEERING', 'Electronic Equipment', '02', 20.00, 'Commission Guide Insurance'),
  ('cg-machinery-breakdown', 'ENGINEERING', 'Machinery Breakdown', '02', 20.00, 'Commission Guide Insurance'),
  ('cg-machinery-consequential-loss', 'ENGINEERING', 'Machinery Consequential Loss', '02', 20.00, 'Commission Guide Insurance'),
  ('cg-erection-all-risks', 'ENGINEERING', 'Erection All Risks', '02', 20.00, 'Commission Guide Insurance'),
  ('cg-contractors-plant-machinery', 'ENGINEERING', 'Contractors Plant & Machinery', '02', 20.00, 'Commission Guide Insurance'),
  ('cg-deterioration-of-stock', 'ENGINEERING', 'Deterioration of Stock', '02', 20.00, 'Commission Guide Insurance'),
  ('cg-domestic-package', 'FIRE DOMESTIC', 'Domestic Package', '03', 20.00, 'Commission Guide Insurance'),
  ('cg-fire-and-perils', 'FIRE COMMERCIAL', 'Fire and Perils', '04', 25.00, 'Commission Guide Insurance'),
  ('cg-industrial-all-risks', 'FIRE COMMERCIAL', 'Industrial All Risks', '04', 25.00, 'Commission Guide Insurance'),
  ('cg-fire-consequential-loss', 'FIRE COMMERCIAL', 'Fire Consequential Loss', '04', 25.00, 'Commission Guide Insurance'),
  ('cg-assets-all-risks', 'FIRE COMMERCIAL', 'Assets All Risks', '04', 25.00, 'Commission Guide Insurance'),
  ('cg-public-liability', 'LIABILITY', 'Public Liability', '05', 20.00, 'Commission Guide Insurance'),
  ('cg-professional-indemnity', 'LIABILITY', 'Professional Indemnity', '05', 20.00, 'Commission Guide Insurance'),
  ('cg-employers-liability', 'LIABILITY', 'Employers Liability', '05', 20.00, 'Commission Guide Insurance'),
  ('cg-products-liability', 'LIABILITY', 'Products Liability', '05', 20.00, 'Commission Guide Insurance'),
  ('cg-contractual-liability', 'LIABILITY', 'Contractual Liability', '05', 20.00, 'Commission Guide Insurance'),
  ('cg-carriers-liability', 'LIABILITY', 'Carriers Liability', '05', 20.00, 'Commission Guide Insurance'),
  ('cg-directors-officers-liability', 'LIABILITY', 'Directors & Officers Liability', '05', 20.00, 'Commission Guide Insurance'),
  ('cg-pension-trustees-liability', 'LIABILITY', 'Pension Trustees Liability', '05', 20.00, 'Commission Guide Insurance'),
  ('cg-marine-cargo-sea', 'MARINE', 'Marine Cargo Sea', '06', 17.50, 'Commission Guide Insurance'),
  ('cg-marine-cargo-air', 'MARINE', 'Marine Cargo Air', '06', 17.50, 'Commission Guide Insurance'),
  ('cg-marine-open-cover', 'MARINE', 'Marine open Cover', '06', 17.50, 'Commission Guide Insurance'),
  ('cg-marine-hull', 'MARINE', 'Marine Hull', '06', 17.50, 'Commission Guide Insurance'),
  ('cg-goods-in-transit', 'MARINE', 'Goods in Transit', '06', 17.50, 'Commission Guide Insurance'),
  ('cg-motor-private', 'MOTOR', 'Motor Private', '07', 10.00, 'Commission Guide Insurance'),
  ('cg-private-motor-cycle', 'MOTOR', 'Private Motor Cycle', '07', 10.00, 'Commission Guide Insurance'),
  ('cg-motor-commercial-own-goods', 'MOTOR', 'Motor Commercial Own Goods', '08', 10.00, 'Commission Guide Insurance'),
  ('cg-motor-commercial-agric-vehicles', 'MOTOR', 'Motor Commercial Agric. vehicles', '08', 10.00, 'Commission Guide Insurance'),
  ('cg-motor-trade', 'MOTOR', 'Motor Trade', '08', 10.00, 'Commission Guide Insurance'),
  ('cg-psv-chauffeur-driven', 'MOTOR', 'PSV Chauffeur Driven', '08', 10.00, 'Commission Guide Insurance'),
  ('cg-petroleum-tankers-own-goods', 'MOTOR', 'Petroleum Tankers Own Goods', '08', 10.00, 'Commission Guide Insurance'),
  ('cg-petroleum-tankers-hire-reward', 'MOTOR', 'Petroleum Tankers for Hire/Reward', '08', 10.00, 'Commission Guide Insurance'),
  ('cg-motor-commercial-general-cartage', 'MOTOR', 'Motor Commercial General Cartage', '08', 10.00, 'Commission Guide Insurance'),
  ('cg-motor-commercial-special-vehicles', 'MOTOR', 'Motor Commercial Special vehicles', '08', 10.00, 'Commission Guide Insurance'),
  ('cg-psv-motor-asset', 'MOTOR', 'PSV Motor Asset', '08', 10.00, 'Commission Guide Insurance'),
  ('cg-motor-comesa', 'MOTOR', 'Motor (COMESA)', NULL, 5.00, 'Commission Guide Insurance'),
  ('cg-personal-accident', 'ACCIDENT', 'Personal Accident', '09', 20.00, 'Commission Guide Insurance'),
  ('cg-group-personal-accident', 'ACCIDENT', 'Group Personal Accident', '09', 20.00, 'Commission Guide Insurance'),
  ('cg-money', 'THEFT', 'Money', '10', 10.00, 'Commission Guide Insurance'),
  ('cg-burglary', 'THEFT', 'Burglary', '10', 20.00, 'Commission Guide Insurance'),
  ('cg-fidelity-guarantee', 'THEFT', 'Fidelity Guarantee', '10', 10.00, 'Commission Guide Insurance'),
  ('cg-theft-all-risks', 'THEFT', 'All Risks', '10', 10.00, 'Commission Guide Insurance'),
  ('cg-wiba', 'WIBA', 'Work Injury Benefits Act', '11', 20.00, 'Commission Guide Insurance'),
  ('cg-micro-health', 'HEALTHCARE/MEDICAL', 'Micro Health (Micro Medical Insurance)', '13', 10.00, 'Commission Guide Insurance'),
  ('cg-group-medical-schemes', 'HEALTHCARE/MEDICAL', 'Group Medical Schemes', '12', 10.00, 'Commission Guide Insurance'),
  ('cg-smes-business-combined', 'PACKAGE/COMBINED', 'SMEs Business combined', NULL, 20.00, 'Commission Guide Insurance'),
  ('cg-business-combined', 'PACKAGE/COMBINED', 'Business Combined', NULL, 20.00, 'Commission Guide Insurance'),
  ('cg-plate-glass', 'MISCELLANEOUS', 'Plate Glass', '14', 10.00, 'Commission Guide Insurance'),
  ('cg-political-violence-terrorism', 'MISCELLANEOUS', 'Political Violence & Terrorism', '14', 10.00, 'Commission Guide Insurance'),
  ('cg-travel', 'MISCELLANEOUS', 'Travel', '14', 20.00, 'Commission Guide Insurance'),
  ('cg-tender-bid-bond', 'MISCELLANEOUS', 'Tender/Bid Bond', '14', 10.00, 'Commission Guide Insurance'),
  ('cg-security-immigration-bond', 'MISCELLANEOUS', 'Security/Immigration Bond', '14', 10.00, 'Commission Guide Insurance'),
  ('cg-custom-bond', 'MISCELLANEOUS', 'Custom Bond', '14', 10.00, 'Commission Guide Insurance'),
  ('cg-performance-bond', 'MISCELLANEOUS', 'Performance Bond', '14', 10.00, 'Commission Guide Insurance')
ON CONFLICT (id) DO NOTHING;
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
  console.log("Commission guide (max permitted commission rate per line of business) seeded.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
