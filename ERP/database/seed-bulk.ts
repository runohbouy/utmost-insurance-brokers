// Bulk volume data generator — a companion to seed-showcase.ts, not a
// replacement. seed-showcase.ts hand-crafts a small narrative dataset
// that demonstrates every workflow state; this script instead
// generates a LARGE randomized-but-realistic volume across every
// module (hundreds of parties/opportunities/policies/claims/etc.) so
// list views, tables and dashboards can be exercised at real scale.
// Runs against the live HTTP API, same reasoning as seed-showcase.ts:
// every business rule (levies, commission calc, appetite exclusions,
// leave balance checks, GL auto-posting) fires exactly as it would
// for a real user. Every created id is tracked into
// database/.bulk-manifest.json; database/delete-bulk.ts removes
// exactly this data later.
import { writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://localhost:3100/api";
const API_KEY = "dev-only-change-me";

let token = "";
const manifest: Record<string, string[]> = {};
function track(table: string, id: string | number) {
  (manifest[table] ||= []).push(String(id));
}

async function call(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => undefined);
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${json?.error || JSON.stringify(json)}`);
  return json;
}
const get = (p: string): Promise<any> => call("GET", p);
const post = (p: string, body?: unknown): Promise<any> => call("POST", p, body);
const patch = (p: string, body?: unknown): Promise<any> => call("PATCH", p, body);

// ---------------------------------------------------------------
// Randomization helpers
// ---------------------------------------------------------------
function pick(arr: any[]): any { return arr[Math.floor(Math.random() * arr.length)]; }
function pickWeighted<T>(pairs: [T, number][]): T {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [v, w] of pairs) { if ((r -= w) <= 0) return v; }
  return pairs[pairs.length - 1][0];
}
function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function daysFromNow(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function maybe<T>(fn: () => T, probability: number, fallback: T): T { return Math.random() < probability ? fn() : fallback; }

const FIRST_NAMES_M = ["James", "David", "Peter", "John", "Samuel", "Daniel", "Joseph", "Michael", "Paul", "Kevin", "Brian", "Dennis", "Eric", "Felix", "George", "Isaac", "Julius", "Kennedy", "Moses", "Victor"];
const FIRST_NAMES_F = ["Mary", "Grace", "Faith", "Joyce", "Ann", "Ruth", "Esther", "Naomi", "Lucy", "Jane", "Susan", "Beatrice", "Catherine", "Diana", "Eunice", "Florence", "Irene", "Judith", "Loise", "Winnie"];
const SURNAMES = ["Kamau", "Otieno", "Mwangi", "Wanjiru", "Njoroge", "Kariuki", "Odhiambo", "Achieng", "Njeri", "Kiptoo", "Cherono", "Wafula", "Barasa", "Kilonzo", "Mutua", "Hassan", "Abdi", "Wekesa", "Chebet", "Korir", "Ochieng", "Auma", "Wambui", "Gitau", "Maina", "Mburu", "Onyango", "Adhiambo", "Simiyu", "Rotich"];
const COMPANY_WORDS = ["Savanna", "Coastal", "Highland", "Rift Valley", "Equator", "Sunrise", "Prime", "Metro", "Summit", "Horizon", "Pearl", "Baobab", "Acacia", "Zenith", "Delta", "Apex", "Kilimanjaro", "Nyati", "Simba", "Tembo"];
const COMPANY_TYPES = ["Logistics", "Traders", "Enterprises", "Holdings", "Ventures", "Investments", "Manufacturers", "Distributors", "Motors", "Constructors", "Agrivet", "Technologies", "Foods", "Textiles", "Freight"];
const COMPANY_SUFFIX = ["Ltd", "Limited", "Co Ltd"];
const COUNTIES = ["Nairobi", "Mombasa", "Kisumu", "Nakuru", "Uasin Gishu", "Kiambu", "Machakos", "Kajiado", "Kilifi", "Meru", "Nyeri", "Kakamega", "Bungoma", "Trans Nzoia", "Laikipia"];
const VEHICLE_MAKES = [["Toyota", "Axio"], ["Toyota", "Premio"], ["Toyota", "Prado"], ["Toyota", "Hilux"], ["Nissan", "Note"], ["Nissan", "X-Trail"], ["Subaru", "Forester"], ["Subaru", "Impreza"], ["Mazda", "Demio"], ["Honda", "Fit"], ["Isuzu", "D-Max"], ["Mitsubishi", "Outlander"]];

function randomIndividualName() {
  const isMale = Math.random() < 0.5;
  const first = pick(isMale ? FIRST_NAMES_M : FIRST_NAMES_F);
  const surname = pick(SURNAMES);
  return `${first} ${surname}`;
}
function randomCompanyName() {
  return `${pick(COMPANY_WORDS)} ${pick(COMPANY_TYPES)} ${pick(COMPANY_SUFFIX)}`;
}
function randomPhone() { return `07${randInt(10, 59)}${randInt(100000, 999999)}`; }
function randomNationalId() { return String(randInt(20000000, 39999999)); }
function randomKraPinIndividual() { return `A0${randInt(10000000, 99999999)}B`; }
function randomKraPinCorporate() { return `P0${randInt(10000000, 99999999)}C`; }
function randomCompanyRegNo() { return `CPR/${randInt(2015, 2024)}/${randInt(100000, 199999)}`; }
function randomVehicleReg() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const l = () => letters[randInt(0, letters.length - 1)];
  return `K${l()}${l()} ${randInt(100, 999)}${l()}`;
}
// Mirrors src/data/riskClassFields.ts's required fields — POST
// /api/submissions rejects a risk missing any of these for its class
// (see Task #20), so a bulk-generated risk needs realistic values
// here, not just a subjectMatter string.
function exposureAttributesFor(category: string): Record<string, unknown> | undefined {
  switch (category) {
    case "07": case "08": {
      const [make, model] = pick(VEHICLE_MAKES);
      return { registrationNumber: randomVehicleReg(), makeModel: `${make} ${model}`, yearOfManufacture: randInt(2010, 2025), usage: category === "07" ? "private" : pick(["general_cartage", "own_goods"]) };
    }
    case "12": return { dateOfBirth: `${randInt(1955, 2003)}-${String(randInt(1, 12)).padStart(2, "0")}-${String(randInt(1, 28)).padStart(2, "0")}`, preExistingConditions: pick(["None", "Hypertension, controlled", "None declared"]) };
    case "03": case "04": return { constructionType: pick(["Brick & mortar", "Steel frame", "Reinforced concrete"]), occupancy: pick(["Warehouse", "Office", "Retail", "Light industrial"]) };
    case "05": return { businessActivity: pick(["Retail trading", "Logistics", "Manufacturing", "Professional services"]), turnoverKes: randInt(2_000_000, 80_000_000) };
    case "09": return { occupation: pick(["Office administrator", "Sales executive", "Driver", "Teacher", "Consultant"]) };
    default: return undefined;
  }
}
function randomSubjectMatter(category: string, name: string) {
  switch (category) {
    case "07": case "08": { const [make, model] = pick(VEHICLE_MAKES); return `${randomVehicleReg()} ${make} ${model}`; }
    case "04": case "03": return `Premises & contents, ${pick(COUNTIES)}`;
    case "05": return `${randInt(2, 80)} employees — ${name}`;
    case "11": return `${randInt(2, 80)} employees — ${name}`;
    case "06": return "Cargo shipment, Mombasa port";
    case "02": return `Plant & machinery, ${pick(COUNTIES)}`;
    case "10": return `Stock & contents, ${pick(COUNTIES)}`;
    case "09": case "12": return `Individual — ${name}`;
    default: return `${name} risk`;
  }
}

async function main() {
  console.log("Logging in...");
  const login = await post("/auth/login", { email: "amina@utmostbrokers.co.ke", password: "ChangeMe123!" });
  token = login.token;

  const insurers = (await get("/insurers")).filter((i: any) => i.id.endsWith("-general") && i.authorizedClasses.includes("07"));
  const insurerFor = (category: string) => pick(insurers.filter((i: any) => i.authorizedClasses.includes(category)) || insurers);
  const CLASSES = ["04", "05", "06", "07", "07", "07", "08", "09", "10", "11", "12", "14"]; // weighted toward motor

  // ---------------------------------------------------------------
  // 1. Parties (120: 84 individual, 36 corporate)
  // ---------------------------------------------------------------
  console.log("Creating 120 parties...");
  const parties: any[] = [];
  for (let n = 0; n < 120; n++) {
    const isCorporate = n % 10 < 3;
    const fullName = isCorporate ? randomCompanyName() : randomIndividualName();
    const body: Record<string, unknown> = isCorporate
      ? { fullName, partyType: "corporate", phoneNumber: randomPhone(), kraPin: randomKraPinCorporate() }
      : { fullName, partyType: "individual", phoneNumber: randomPhone(), nationalId: randomNationalId(), kraPin: randomKraPinIndividual() };
    const created = await post("/parties", body);
    track("parties", created.id);
    const patchBody: Record<string, unknown> = { county: pick(COUNTIES), riskRating: pickWeighted([["low", 6], ["medium", 3], ["high", 1]]) };
    if (isCorporate) patchBody.companyRegNo = randomCompanyRegNo();
    const updated = await patch(`/parties/${created.id}`, patchBody);
    parties.push(updated);
  }

  // ---------------------------------------------------------------
  // 2. Client accounts for ~55 of them
  // ---------------------------------------------------------------
  console.log("Creating client accounts...");
  const withAccounts = parties.slice(0, 55);
  for (const party of withAccounts) {
    const segment = party.partyType === "corporate" ? pick(["sme", "corporate"]) : "retail";
    const kycStatus = pickWeighted<string>([["approved", 6], ["review_due", 2], ["compliance_review", 1], ["pending", 1]]);
    if (kycStatus === "approved") {
      // The KYC gate (see README) rejects 'approved' unless every
      // auto-seeded checklist item is verified or waived first.
      const items = await get(`/kyc-checklist-items?partyId=${party.id}`);
      for (const item of items) await patch(`/kyc-checklist-items/${item.id}`, { status: "waived" });
    }
    const created = await post("/client-accounts", {
      partyId: party.id, segment, branch: pick(["Nairobi CBD", "Mombasa", "Kisumu", "Nakuru"]), kycStatus,
    });
    track("clientAccounts", created.id);
  }

  // ---------------------------------------------------------------
  // 3. Opportunities (160), weighted pipeline distribution
  // ---------------------------------------------------------------
  console.log("Creating 160 opportunities...");
  const STAGE_WEIGHTS: [string, number][] = [
    ["New", 25], ["Contacted", 10], ["Qualified", 10], ["Discovery", 8], ["Data Collection", 8],
    ["Marketed", 8], ["Quoted", 9], ["Presented", 6], ["Decision", 5], ["Won", 7], ["Lost", 3], ["Deferred", 1],
  ];
  const opportunities: any[] = [];
  for (let n = 0; n < 160; n++) {
    const party = pick(parties);
    const klass = pick(CLASSES);
    const created = await post("/opportunities", { partyId: party.id, class: klass, source: pick(["referral", "web_enquiry", "walk_in", "cold_call", "renewal"]) });
    track("opportunities", created.id);
    const stage = pickWeighted(STAGE_WEIGHTS);
    if (stage !== "New") {
      const patchBody: Record<string, unknown> = { stage };
      if (stage === "Lost") patchBody.outcomeReason = pick(["Client chose a competitor's lower premium", "Client deferred the purchase decision", "No response after multiple follow-ups"]);
      if (stage === "Deferred") patchBody.outcomeReason = pick(["Budget deferred to next financial year", "Client requested to revisit next quarter"]);
      await patch(`/opportunities/${created.id}`, patchBody);
    }
    opportunities.push({ ...created, stage, party, klass });
  }

  // ---------------------------------------------------------------
  // 4. Placement chains: full bind for Won opportunities, partial
  //    chains (risk through quotes/recommendation) for Quoted/
  //    Presented/Decision ones.
  // ---------------------------------------------------------------
  console.log("Building placement chains...");
  const boundPolicies: any[] = [];

  async function buildChain(opp: any, bindIt: boolean) {
    const insurerA = insurerFor(opp.klass);
    const insurerB = insurerFor(opp.klass);
    const sumInsured = ["07", "08"].includes(opp.klass) ? randInt(800_000, 4_500_000) : ["04", "02", "10"].includes(opp.klass) ? randInt(2_000_000, 60_000_000) : 0;
    const basePremium = Math.round(sumInsured > 0 ? sumInsured * (randInt(2, 5) / 100) : randInt(15_000, 120_000));

    const risk = await post("/risks", { opportunityId: opp.id, partyId: opp.party.id, class: opp.klass, subjectMatter: randomSubjectMatter(opp.klass, opp.party.fullName), valuationKes: sumInsured, exposureAttributes: exposureAttributesFor(opp.klass) });
    track("risks", risk.id);
    const strategy = await post("/market-strategies", { riskId: risk.id, strategyType: pick(["remarketing", "incumbent_renewal", "co_insurance", "specialist_facility"]), rationale: "Bulk-generated placement for volume testing." });
    track("marketStrategies", strategy.id);
    const submission = await post("/submissions", { riskId: risk.id, markets: [insurerA.id, insurerB.id] });
    track("submissions", submission.id);
    const q1 = await post("/quotations", { submissionId: submission.id, clientId: opp.party.id, category: opp.klass, insurerId: insurerA.id, sumInsuredKes: sumInsured, basePremiumKes: basePremium });
    track("quotations", q1.id);
    const q2 = await post("/quotations", { submissionId: submission.id, clientId: opp.party.id, category: opp.klass, insurerId: insurerB.id, sumInsuredKes: sumInsured, basePremiumKes: Math.round(basePremium * 1.08) });
    track("quotations", q2.id);

    if (["Quoted"].includes(opp.stage)) return;

    const rec = await post("/recommendations", { submissionId: submission.id, comparedQuotationIds: [q1.id, q2.id], recommendedQuotationId: q1.id, reasons: "Best combination of premium and terms among comparable quotes." });
    track("recommendations", rec.id);

    if (!bindIt) return;

    await post("/risk-clearances", { riskId: risk.id, sanctionsScreeningResult: "clear", pepStatus: false, conflictOfInterestChecked: true });
    await patch(`/recommendations/${rec.id}`, { clientDecision: "accepted" });
    const q1Full = (await get(`/quotations?submissionId=${submission.id}`)).find((q: any) => q.id === q1.id);
    const policy = await post("/policies", {
      quotationId: q1.id, clientId: opp.party.id, insurerId: insurerA.id, category: opp.klass,
      premiumAmount: q1Full.totalPremiumKes, endDate: daysFromNow(randInt(-30, 365)),
    });
    track("policies", policy.id);
    await patch(`/opportunities/${opp.id}`, { stage: "Won" });
    boundPolicies.push(policy);
  }

  const wonOpps = opportunities.filter((o) => o.stage === "Won");
  const partialOpps = opportunities.filter((o) => ["Quoted", "Presented", "Decision"].includes(o.stage)).slice(0, 20);
  let chainFailures = 0;
  for (const opp of [...wonOpps, ...partialOpps]) {
    try {
      await buildChain(opp, wonOpps.includes(opp));
    } catch (err: any) {
      // Insurer-appetite exclusions, single-market justification rules
      // etc. can legitimately reject a randomly-picked combination —
      // skip that one opportunity's chain and keep generating volume.
      chainFailures++;
      console.warn(`  skipped placement chain for ${opp.id}: ${err.message}`);
    }
  }
  console.log(`  built ${wonOpps.length + partialOpps.length - chainFailures}/${wonOpps.length + partialOpps.length} placement chains`);

  // ---------------------------------------------------------------
  // 5. Standalone policies (45 more, not tied to a placement chain)
  // ---------------------------------------------------------------
  console.log("Creating 45 standalone policies...");
  for (let n = 0; n < 45; n++) {
    const party = pick(parties);
    const klass = pick(CLASSES);
    const insurer = insurerFor(klass);
    const premium = randInt(15_000, 900_000);
    try {
      const created = await post("/policies", { clientId: party.id, insurerId: insurer.id, category: klass, premiumAmount: premium, endDate: daysFromNow(randInt(-20, 400)) });
      track("policies", created.id);
      boundPolicies.push(created);
    } catch (err: any) { console.warn(`  skipped standalone policy: ${err.message}`); }
  }

  // ---------------------------------------------------------------
  // 6. Premium confirmations for ~70% of eligible policies — also
  //    drives commission projections and GL auto-posting.
  // ---------------------------------------------------------------
  console.log("Confirming premiums (drives GL auto-posting)...");
  const allPolicies = await get("/policies");
  let confirmedCount = 0;
  for (const policy of allPolicies) {
    if (!["Pending", "Received", "Under Check"].includes(policy.status)) continue;
    if (Math.random() > 0.7) continue;
    try {
      const pcf = await post("/premium-confirmations", {
        policyId: policy.id, confirmedAmountKes: policy.premiumAmount,
        paymentReference: `MPESA-Q${randInt(100000, 999999)}`, method: pick(["mpesa", "bank", "cheque"]),
      });
      track("premiumConfirmations", pcf.id);
      confirmedCount++;
    } catch { /* skip on any per-row validation edge case, continue bulk generation */ }
  }
  console.log(`  confirmed ${confirmedCount} premiums`);

  // ---------------------------------------------------------------
  // 7. Endorsements — a curated set of easy-to-generate types across
  //    a random sample of policies, ~60% completed (real effects).
  // ---------------------------------------------------------------
  console.log("Creating endorsements...");
  const endorsementDefs: { category: string; type: string; afterValue?: Record<string, unknown> }[] = [
    { category: "financial_valuation", type: "adjust_sum_insured", afterValue: { sumInsuredKes: randInt(1_000_000, 5_000_000) } },
    { category: "financial_valuation", type: "modify_premium_rate" },
    { category: "financial_valuation", type: "apply_premium_credit" },
    { category: "coverage_expansion", type: "schedule_new_asset", afterValue: { assetDescription: "Additional office equipment", assetValueKes: randInt(50_000, 500_000) } },
    { category: "contractual_legal", type: "extend_policy_lifespan", afterValue: { newEndDate: daysFromNow(randInt(400, 700)) } },
    { category: "administrative", type: "update_physical_address", afterValue: { newAddress: `${pick(COUNTIES)}, Kenya` } },
  ];
  const policiesForEndorsement = allPolicies.filter((p: any) => !["Cancelled", "Expired"].includes(p.status));
  for (let n = 0; n < 50 && policiesForEndorsement.length > 0; n++) {
    const policy = pick(policiesForEndorsement);
    const def = pick(endorsementDefs);
    try {
      const created = await post("/endorsements", {
        policyId: policy.id, endorsementCategory: def.category, endorsementType: def.type,
        description: `Bulk-generated ${def.type.replace(/_/g, " ")}`,
        premiumAdjustmentKes: ["modify_premium_rate", "apply_premium_credit"].includes(def.type) ? randInt(-15_000, 15_000) : 0,
        afterValue: def.afterValue, effectiveDate: daysFromNow(0),
      });
      track("endorsements", created.id);
      if (Math.random() < 0.6) {
        for (const status of ["Information", "Terms", "Client Approval", "Instructed", "Issued", "Checked", "Completed"]) {
          await patch(`/endorsements/${created.id}`, { status });
        }
      }
    } catch { /* skip edge cases (e.g. policy already cancelled by an earlier endorsement in this loop) */ }
  }

  // ---------------------------------------------------------------
  // 8. Renewals for policies expiring within ~120 days
  // ---------------------------------------------------------------
  console.log("Creating renewal cases...");
  const soonToExpire = (await get("/policies")).filter((p: any) => p.status === "Active" && p.endDate && new Date(p.endDate).getTime() - Date.now() < 120 * 86400000);
  for (const policy of soonToExpire.slice(0, 25)) {
    const created = await post("/renewals", { policyId: policy.id, renewalStatus: pick(["upcoming", "quoted", "confirmed"]), dueDate: policy.endDate });
    track("renewals", created.id);
  }

  // ---------------------------------------------------------------
  // 9. Claims — 55 across random policies, randomized progress depth.
  // ---------------------------------------------------------------
  console.log("Registering 55 claims...");
  const CLAIM_TYPES = ["accident_damage", "fire_damage", "cargo_loss", "public_liability", "medical_inpatient", "theft", "windscreen", "third_party_property"];
  const DOC_TYPES = ["police_abstract", "photos", "repair_quotation", "incident_report", "medical_report", "loss_adjuster_report"];
  const claimPool = allPolicies.filter((p: any) => !["Pending"].includes(p.status));
  for (let n = 0; n < 55 && claimPool.length > 0; n++) {
    try {
      const policy = pick(claimPool);
      const claim = await post("/claims", {
        policyId: policy.id, policyNumber: policy.id, claimType: pick(CLAIM_TYPES),
        phoneNumber: randomPhone(), description: `Bulk-generated claim — ${pick(CLAIM_TYPES).replace(/_/g, " ")} incident.`,
        lossDate: daysFromNow(-randInt(1, 90)),
      });
      track("claims", claim.id);

      const depth = pickWeighted<"fnol" | "documents" | "assessment" | "decision" | "payment" | "closed">([
        ["fnol", 3], ["documents", 3], ["assessment", 3], ["decision", 2], ["payment", 2], ["closed", 4],
      ]);
      if (depth === "fnol") continue;

      await patch(`/claims/${claim.id}`, { status: "Documents", priority: pick(["green", "amber", "red"]), assignedOfficerId: pick(["staff-claims", "staff-underwriter"]) });
      for (const docType of [pick(DOC_TYPES), pick(DOC_TYPES)]) {
        const item = await post("/claim-checklist-items", { claimId: claim.id, documentType: docType });
        track("claimChecklistItems", item.id);
      }
      if (depth === "documents") continue;

      await patch(`/claims/${claim.id}`, { status: "Assessment" });
      const reserve = randInt(15_000, 1_200_000);
      const reserveLine = await post("/claim-reserve-lines", { claimId: claim.id, reserveCode: "indemnity", amountKes: reserve });
      track("claimReserveLines", reserveLine.id);
      await patch(`/claims/${claim.id}`, { status: "Decision", reserveAmountKes: reserve });
      if (depth === "assessment" || depth === "decision") continue;

      await patch(`/claims/${claim.id}`, { status: "Offer" });
      const paid = Math.round(reserve * (randInt(70, 100) / 100));
      await patch(`/claims/${claim.id}`, { status: "Payment", paidAmountKes: paid });
      const paymentLine = await post("/claim-payment-lines", { claimId: claim.id, paymentCode: "indemnity", amountKes: paid, paymentReference: `RTGS-Q${randInt(100000, 999999)}`, paidAt: new Date().toISOString() });
      track("claimPaymentLines", paymentLine.id);
      if (depth === "payment") continue;

      await patch(`/claims/${claim.id}`, { status: "Closed", settlementReason: "Bulk-generated settlement — claim finalized." });
    } catch (err: any) { console.warn(`  skipped a claim mid-generation: ${err.message}`); }
  }

  // ---------------------------------------------------------------
  // 10. Complaints
  // ---------------------------------------------------------------
  console.log("Logging complaints...");
  const CATEGORIES = ["claims_handling_delay", "billing", "service", "policy_wording", "premium_dispute"];
  for (let n = 0; n < 25; n++) {
    const party = pick(parties);
    const created = await post("/complaints", {
      partyId: party.id, category: pick(CATEGORIES), severity: pick(["low", "medium", "high"]),
      subject: `Bulk-generated complaint #${n + 1}`, description: "Auto-generated complaint for volume testing.",
      channel: pick(["email", "call", "portal", "walk_in"]),
    });
    track("complaints", created.id);
    if (Math.random() < 0.5) await patch(`/complaints/${created.id}`, { status: pick(["Acknowledged", "Investigation", "Decision"]), assignedStaffId: pick(["staff-claims", "staff-underwriter"]) });
    if (Math.random() < 0.2) await patch(`/complaints/${created.id}`, { status: "Closed", remedy: "Issue resolved and confirmed with client.", resolvedDate: daysFromNow(-randInt(1, 20)) });
  }

  // ---------------------------------------------------------------
  // 11. Compliance obligations
  // ---------------------------------------------------------------
  console.log("Adding compliance obligations...");
  const OBLIGATION_TYPES = ["regulatory_return", "training", "licence_renewal", "audit", "policy_review"];
  for (let n = 0; n < 12; n++) {
    const created = await post("/obligations", {
      obligationType: pick(OBLIGATION_TYPES), source: pick(["IRA", "AIBK", "Internal"]),
      requirement: `Bulk-generated obligation #${n + 1}`, dueDate: daysFromNow(randInt(-30, 90)), recurrence: pick(["annual", "quarterly", "monthly", "once"]),
    });
    track("obligations", created.id);
  }

  // ---------------------------------------------------------------
  // 12. Workflow tasks
  // ---------------------------------------------------------------
  console.log("Creating workflow tasks...");
  const TASK_TYPES = ["follow_up_client", "prepare_renewal_terms", "chase_outstanding_document", "collect_outstanding_premium", "schedule_survey"];
  for (let n = 0; n < 35; n++) {
    const created = await post("/tasks", { taskType: pick(TASK_TYPES), queue: pick(["servicing", "placement", "claims", "finance"]), priority: pick(["low", "normal", "high"]), dueAt: daysFromNow(randInt(-10, 30)) });
    track("tasks", created.id);
    if (Math.random() < 0.3) await patch(`/tasks/${created.id}`, { status: "done", outcome: "Completed via bulk seed." });
  }

  // ---------------------------------------------------------------
  // 13. Correspondence templates + notifications
  // ---------------------------------------------------------------
  console.log("Creating correspondence + notifications...");
  const templateDefs = [
    { code: "welcome_client", area: "crm", channel: "email", subject: "Welcome to Utmost", bodyTemplate: "Dear {{clientName}}, welcome aboard." },
    { code: "complaint_ack", area: "complaints", channel: "email", subject: "We've received your complaint", bodyTemplate: "Dear {{clientName}}, we've logged your complaint and will respond shortly." },
    { code: "obligation_due", area: "compliance", channel: "email", subject: "Compliance obligation due", bodyTemplate: "Reminder: {{requirement}} is due on {{dueDate}}." },
  ];
  const existingTemplates = await get("/correspondence-templates");
  const templateCodes = new Set(existingTemplates.map((t: any) => t.code));
  for (const t of templateDefs) {
    if (templateCodes.has(t.code)) continue;
    const created = await post("/correspondence-templates", t);
    track("correspondenceTemplates", created.id);
    templateCodes.add(t.code);
  }
  const allTemplates = await get("/correspondence-templates");
  for (let n = 0; n < 45; n++) {
    const party = pick(parties);
    const template = pick(allTemplates);
    const created = await post("/notifications", { partyId: party.id, templateCode: template.code });
    track("notifications", created.id);
    if (Math.random() < 0.6) await patch(`/notifications/${created.id}`, { status: "sent" });
  }

  // ---------------------------------------------------------------
  // 14. Documents
  // ---------------------------------------------------------------
  console.log("Uploading placeholder documents...");
  const textToBase64 = (s: string) => Buffer.from(s, "utf-8").toString("base64");
  for (let n = 0; n < 15; n++) {
    const party = pick(parties);
    const created = await post("/documents", {
      fileName: `bulk-doc-${n + 1}.txt`, mimeType: "text/plain",
      fileBase64: textToBase64(`Placeholder document #${n + 1} for ${party.fullName}.`),
      ownerEntityType: "party", ownerEntityId: party.id, documentType: pick(["kyc", "policy_wording", "correspondence"]), sensitivity: pick(["internal", "restricted"]),
    });
    track("documents", created.id);
  }

  // ---------------------------------------------------------------
  // 15. Product catalog + insurer appetite (a few more entries)
  // ---------------------------------------------------------------
  console.log("Adding products + insurer appetite...");
  for (let n = 0; n < 8; n++) {
    const klass = pick(CLASSES);
    const insurer = insurerFor(klass);
    const created = await post("/products", { insurerId: insurer.id, category: klass, name: `${insurer.name.split(" ")[0]} ${pick(["Plus", "Gold", "Select", "Advantage"])} Cover`, description: "Bulk-generated product entry." });
    track("products", created.id);
  }

  // ---------------------------------------------------------------
  // 16. Extra commission statements
  // ---------------------------------------------------------------
  console.log("Creating additional commission statements...");
  const financialTxns = await get("/financial-transactions");
  const commissionsByInsurer = new Map<string, any[]>();
  for (const p of allPolicies) {
    if (!p.insurerId) continue;
    const txn = financialTxns.find((t: any) => t.policyId === p.id && t.transactionType === "commission");
    if (!txn) continue;
    (commissionsByInsurer.get(p.insurerId) || commissionsByInsurer.set(p.insurerId, []).get(p.insurerId)!).push({ policyId: p.id, amount: txn.amountKes });
  }
  let stmtCount = 0;
  for (const [insurerId, lines] of commissionsByInsurer) {
    if (stmtCount >= 8) break;
    const total = lines.reduce((s, l) => s + l.amount, 0);
    const stmt = await post("/commission-statements", { insurerId, periodStart: daysFromNow(-30), periodEnd: daysFromNow(0), totalCommissionKes: total });
    track("commissionStatements", stmt.id);
    for (const l of lines.slice(0, 5)) {
      const line = await post("/commission-lines", { statementId: stmt.id, policyId: l.policyId, commissionRatePct: 10, commissionAmountKes: l.amount });
      track("commissionLines", line.id);
    }
    if (Math.random() < 0.7) await post(`/commission-statements/${stmt.id}/reconcile`);
    stmtCount++;
  }

  // ---------------------------------------------------------------
  // 17. HR — more staff/employees, leave requests, performance reviews
  // ---------------------------------------------------------------
  console.log("Creating HR data...");
  const roles = await get("/roles");
  const DEPARTMENTS: [string, string][] = [["Underwriting", "underwriter"], ["Claims", "claims_officer"], ["Finance", "accountant"], ["Sales", "sales_agent"]];
  const newStaff: any[] = [];
  for (let n = 0; n < 12; n++) {
    const fullName = randomIndividualName();
    const [department, roleId] = pick(DEPARTMENTS);
    const role = roles.find((r: any) => r.id === roleId);
    const created = await post("/staff", {
      fullName, email: `${fullName.toLowerCase().replace(/\s+/g, ".")}@utmostbrokers.co.ke`, phoneNumber: randomPhone(),
      roleId: role?.id, jobTitle: `${department} Officer`, department, branch: "Nairobi HQ",
      employmentType: pickWeighted([["full_time", 8], ["part_time", 2], ["contract", 1], ["intern", 1]]),
      hireDate: daysFromNow(-randInt(30, 1200)), baseSalaryKes: randInt(45_000, 220_000),
    });
    track("staff", created.staffId || created.id);
    newStaff.push(created);
  }
  // Terminate a couple to exercise the login-revocation effect.
  for (const emp of newStaff.slice(0, 2)) {
    await patch(`/employees/${emp.staffId}`, { employmentStatus: "terminated", terminationDate: daysFromNow(-randInt(1, 30)), terminationReason: "Bulk-generated termination for volume testing." });
  }

  // Leave requests and performance reviews are scoped to the staff
  // created in this run, not the original three seeded staff — an
  // approved leave request mutates that staff member's real
  // leave_balances row, which delete-bulk.ts has no way to precisely
  // roll back later since it isn't itself a tracked entity.
  const leaveTypes = await get("/leave-types");
  console.log("Creating leave requests...");
  for (let n = 0; n < 55; n++) {
    const staffMember = pick(newStaff);
    const leaveType = pick(leaveTypes);
    const start = randInt(-60, 90);
    const length = randInt(1, 10);
    try {
      const created = await post("/leave-requests", {
        staffId: staffMember.id, leaveTypeId: leaveType.id, startDate: daysFromNow(start), endDate: daysFromNow(start + length),
        reason: "Bulk-generated leave request.",
      });
      track("leaveRequests", created.id);
      const decision = pickWeighted<"none" | "approved" | "rejected" | "cancelled">([["none", 3], ["approved", 5], ["rejected", 2], ["cancelled", 1]]);
      if (decision !== "none") await patch(`/leave-requests/${created.id}`, { status: decision });
    } catch { /* insufficient balance or similar — skip and continue */ }
  }

  console.log("Creating performance reviews...");
  for (let n = 0; n < 20; n++) {
    const staffMember = pick(newStaff);
    const created = await post("/performance-reviews", {
      staffId: staffMember.id, periodStart: daysFromNow(-180), periodEnd: daysFromNow(0),
      rating: pick(["exceeds", "meets", "below"]), strengths: "Consistent delivery and good client feedback.",
      areasForImprovement: "Documentation turnaround time.", goals: "Improve SLA adherence next period.",
    });
    track("performanceReviews", created.id);
    const stage = pickWeighted<"draft" | "submitted" | "acknowledged">([["draft", 3], ["submitted", 3], ["acknowledged", 4]]);
    if (stage === "submitted" || stage === "acknowledged") await patch(`/performance-reviews/${created.id}`, { status: "submitted" });
    if (stage === "acknowledged") await patch(`/performance-reviews/${created.id}`, { status: "acknowledged" });
  }

  // ---------------------------------------------------------------
  // 18. General ledger — manual entries, office expenses, petty cash
  // ---------------------------------------------------------------
  console.log("Adding GL activity (manual entries, office expenses, petty cash)...");
  const glAccounts = await get("/gl-accounts");
  const periods = await get("/accounting-periods");
  const openPeriod = periods.find((p: any) => p.status === "open") || periods[0];
  const expenseAccounts = glAccounts.filter((a: any) => a.accountType === "expense" && a.code !== "5000");
  for (let n = 0; n < 12 && openPeriod; n++) {
    const amount = randInt(500, 25_000);
    try {
      const entry = await post("/journal-entries", {
        periodId: openPeriod.id, entryDate: daysFromNow(-randInt(0, 20)), description: `Bulk-generated adjustment #${n + 1}`,
        lines: [{ accountCode: pick(expenseAccounts).code, debitKes: amount }, { accountCode: "1000", creditKes: amount }],
      });
      track("journalEntries", entry.id);
    } catch { /* skip if period closed mid-run or similar */ }
  }

  const EXPENSE_CATEGORIES = ["rent", "utilities", "salaries", "supplies", "marketing", "professional_fees", "insurance", "other"];
  for (let n = 0; n < 20; n++) {
    const created = await post("/office-expenses", {
      category: pick(EXPENSE_CATEGORIES), description: `Bulk-generated expense #${n + 1}`, amountKes: randInt(2_000, 150_000),
      vendor: pick(["Kenya Power", "Safaricom", "Landlord Ltd", "Office Supplies Co", "Media Agency Ltd"]),
      paymentMethod: pick(["mpesa", "bank", "cheque"]), incurredAt: daysFromNow(-randInt(0, 30)),
    });
    track("officeExpenses", created.id);
    if (Math.random() < 0.7) await patch(`/office-expenses/${created.id}`, { status: "paid" });
  }

  for (let n = 0; n < 4; n++) {
    const float = await post("/petty-cash-floats", { openingBalanceKes: randInt(5_000, 30_000) });
    track("pettyCashFloats", float.id);
    for (let t = 0; t < 4; t++) {
      const txn = await post("/petty-cash-transactions", {
        floatId: float.id, transactionType: pick(["disbursement", "disbursement", "disbursement", "replenishment"]),
        amountKes: randInt(500, 3_000), purpose: pick(["Stationery", "Transport", "Tea & refreshments", "Courier", "Printing"]),
      });
      track("pettyCashTransactions", txn.id);
    }
  }

  // ---------------------------------------------------------------
  // Write the manifest.
  // ---------------------------------------------------------------
  const manifestPath = path.join(__dirname, ".bulk-manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nDone. Manifest written to ${manifestPath}`);
  console.log(Object.entries(manifest).map(([k, v]) => `  ${k}: ${v.length}`).join("\n"));
}

main().catch((err) => {
  console.error("\nBulk seed script failed:", err.message);
  process.exit(1);
});
