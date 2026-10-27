// Populates the running dev server with a realistic, interconnected
// showcase dataset spanning every module (parties through compliance),
// via the real HTTP API — so every business rule (levies/commission
// calc, appetite exclusions, settlement gates, correspondence
// templates) runs exactly as it would for a real user, rather than
// hand-crafting rows that might violate a constraint or skip a
// computed field.
//
// Every created entity's id is captured into a manifest file
// (database/.showcase-manifest.json) grouped by table, because the API
// has no DELETE routes for most tables (by design — this is an
// audit-trailed CRM) and ids are server-generated. database/
// delete-showcase.ts reads that manifest to remove exactly this data
// later, nothing else.
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

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => undefined);
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${json?.error || JSON.stringify(json)}`);
  }
  return json;
}
const get = (p: string) => call("GET", p);
const post = (p: string, body?: unknown) => call("POST", p, body);
const patch = (p: string, body?: unknown) => call("PATCH", p, body);

function daysFromNow(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log("Logging in...");
  const login = await post("/auth/login", { email: "amina@utmostbrokers.co.ke", password: "ChangeMe123!" });
  token = login.token;

  const insurers = await get("/insurers");
  const byId = (id: string) => insurers.find((i: any) => i.id === id);
  const aar = byId("aar-general");
  const apa = byId("apa-general");
  const britam = byId("britam-general");
  const jubilee = byId("jubilee-health");
  if (!aar || !apa || !britam || !jubilee) throw new Error("Expected seeded insurers not found — run db:seed:insurers first.");

  // ---------------------------------------------------------------
  // 0. Negotiated commission rates — without these, quotations still
  //    price correctly (levies are separate) but no commission ever
  //    gets projected on premium confirmation, so this must run before
  //    any quotation/premium-confirmation below.
  // ---------------------------------------------------------------
  console.log("Setting negotiated commission rates...");
  const rateDefs: [string, string, number][] = [
    ["aar-general", "07", 10],
    ["apa-general", "07", 9.5],
    ["apa-general", "09", 15],
    ["cic-general", "07", 10],
    ["cic-general", "11", 15],
    ["cic-general", "06", 15],
    ["britam-general", "04", 20],
    ["ga-general", "04", 17.5],
    ["heritage-general", "05", 15],
    ["jubilee-health", "12", 8],
  ];
  for (const [insurerId, category, commissionRatePct] of rateDefs) {
    const created = await post("/insurer-rates", { insurerId, category, commissionRatePct });
    track("insurerRates", created.id);
  }

  // ---------------------------------------------------------------
  // 1. Parties
  // ---------------------------------------------------------------
  console.log("Creating parties...");
  const partyDefs = [
    { fullName: "Wanjiru Kamau", partyType: "individual", phoneNumber: "0722100001", nationalId: "23456781", kraPin: "A012345678B", email: "wanjiru.kamau@example.com", county: "Nairobi", riskRating: "low" },
    { fullName: "James Otieno", partyType: "individual", phoneNumber: "0733100002", nationalId: "23456782", kraPin: "A012345679B", email: "james.otieno@example.com", county: "Mombasa", riskRating: "low" },
    { fullName: "Fatuma Hassan", partyType: "individual", phoneNumber: "0711100003", nationalId: "23456783", kraPin: "A012345680B", email: "fatuma.hassan@example.com", county: "Nairobi", leadSource: "web_enquiry", riskRating: "low" },
    { fullName: "Savanna Logistics Ltd", partyType: "corporate", phoneNumber: "0700100004", companyRegNo: "CPR/2018/104521", kraPin: "P051234567C", email: "accounts@savannalogistics.co.ke", county: "Nairobi", riskRating: "medium" },
    { fullName: "Coastal Traders Co Ltd", partyType: "corporate", phoneNumber: "0700100005", companyRegNo: "CPR/2016/088213", kraPin: "P051234568C", email: "finance@coastaltraders.co.ke", county: "Mombasa", riskRating: "low" },
    { fullName: "David Mwangi", partyType: "individual", phoneNumber: "0722100006", nationalId: "23456784", kraPin: "A012345681B", email: "david.mwangi@example.com", county: "Nakuru", leadSource: "referral", riskRating: "low" },
    { fullName: "Nairobi Tech Hub Ltd", partyType: "corporate", phoneNumber: "0700100007", companyRegNo: "CPR/2020/152233", kraPin: "P051234569C", email: "ops@nairobitechhub.co.ke", county: "Nairobi", riskRating: "medium" },
    { fullName: "Grace Njeri", partyType: "individual", phoneNumber: "0733100008", nationalId: "23456785", kraPin: "A012345682B", email: "grace.njeri@example.com", county: "Kisumu", riskRating: "low" },
    { fullName: "Timothy Kiptoo", partyType: "individual", phoneNumber: "0711100009", nationalId: "23456786", kraPin: "A012345683B", email: "timothy.kiptoo@example.com", county: "Uasin Gishu", leadSource: "walk_in", riskRating: "low" },
    { fullName: "Amani Retailers Ltd", partyType: "corporate", phoneNumber: "0700100010", companyRegNo: "CPR/2019/133456", kraPin: "P051234570C", email: "info@amaniretailers.co.ke", county: "Nairobi", riskRating: "high" },
  ];
  const parties: Record<string, any> = {};
  for (const def of partyDefs) {
    const { fullName, partyType, phoneNumber, nationalId, kraPin, companyRegNo, ...rest } = def;
    const created = await post("/parties", { fullName, partyType, phoneNumber, nationalId, kraPin });
    track("parties", created.id);
    // companyRegNo isn't set by POST /api/parties — only PATCH writes it.
    const updated = await patch(`/parties/${created.id}`, { ...rest, companyRegNo });
    parties[fullName] = updated;
  }

  // ---------------------------------------------------------------
  // 2. Client accounts (the 7 "active" parties)
  // ---------------------------------------------------------------
  console.log("Creating client accounts...");
  const accountDefs: [string, string, string, string][] = [
    ["Wanjiru Kamau", "retail", "Nairobi CBD", "approved"],
    ["James Otieno", "retail", "Mombasa", "approved"],
    ["Savanna Logistics Ltd", "corporate", "Nairobi CBD", "approved"],
    ["Coastal Traders Co Ltd", "sme", "Mombasa", "approved"],
    ["Nairobi Tech Hub Ltd", "sme", "Nairobi CBD", "review_due"],
    ["Grace Njeri", "retail", "Kisumu", "approved"],
    ["Amani Retailers Ltd", "sme", "Nairobi CBD", "compliance_review"],
  ];
  for (const [name, segment, branch, kycStatus] of accountDefs) {
    const created = await post("/client-accounts", { partyId: parties[name].id, segment, branch, kycStatus });
    track("clientAccounts", created.id);
  }

  // ---------------------------------------------------------------
  // 3. Opportunities across the full pipeline
  // ---------------------------------------------------------------
  console.log("Creating opportunities...");
  const oppDefs: [string, string, string][] = [
    ["Timothy Kiptoo", "07", "New"],
    ["Fatuma Hassan", "12", "Contacted"],
    ["David Mwangi", "09", "Qualified"],
    ["Amani Retailers Ltd", "04", "Discovery"],
    ["Coastal Traders Co Ltd", "06", "Data Collection"],
    ["Nairobi Tech Hub Ltd", "05", "Marketed"],
    ["Grace Njeri", "11", "Quoted"],
    ["James Otieno", "07", "Presented"],
    ["Savanna Logistics Ltd", "08", "Decision"],
    ["Wanjiru Kamau", "07", "New"], // will progress to Won below
    ["Savanna Logistics Ltd", "04", "New"], // will progress to Won below
    ["David Mwangi", "10", "New"], // will progress to Lost below
    ["Amani Retailers Ltd", "14", "New"], // will progress to Deferred below
  ];
  const opps: Record<string, any> = {};
  let i = 0;
  for (const [name, klass, stage] of oppDefs) {
    const created = await post("/opportunities", { partyId: parties[name].id, class: klass, source: "referral" });
    track("opportunities", created.id);
    if (stage !== "New") await patch(`/opportunities/${created.id}`, { stage });
    opps[`${name}#${i++}`] = { ...created, stage };
  }
  // Give the terminal-stage ones their outcome reasons directly.
  const lostOpp = opps["David Mwangi#11"];
  await patch(`/opportunities/${lostOpp.id}`, { stage: "Lost", outcomeReason: "Client chose a competitor's lower premium" });
  const deferredOpp = opps["Amani Retailers Ltd#12"];
  await patch(`/opportunities/${deferredOpp.id}`, { stage: "Deferred", outcomeReason: "Budget deferred to next financial year" });

  // ---------------------------------------------------------------
  // 4. Full placement chains (risk -> strategy -> submission ->
  //    quotations -> recommendation -> clearance) for four opportunities
  //    at different points in the chain, to showcase every stage.
  // ---------------------------------------------------------------
  console.log("Building placement chains...");

  async function buildRisk(oppId: string, partyId: string, klass: string, subjectMatter: string, valuationKes: number) {
    const risk = await post("/risks", { opportunityId: oppId, partyId, class: klass, subjectMatter, valuationKes });
    track("risks", risk.id);
    return risk;
  }
  async function buildStrategy(riskId: string, strategyType: string, rationale: string) {
    const strategy = await post("/market-strategies", { riskId, strategyType, rationale });
    track("marketStrategies", strategy.id);
    return strategy;
  }
  async function buildSubmission(riskId: string, markets: string[], justification?: string) {
    const submission = await post("/submissions", { riskId, markets, singleSourceJustification: justification });
    track("submissions", submission.id);
    return submission;
  }
  async function buildQuote(submissionId: string, clientId: string, category: string, insurerId: string, sumInsuredKes: number, basePremiumKes: number) {
    const quote = await post("/quotations", { submissionId, clientId, category, insurerId, sumInsuredKes, basePremiumKes });
    track("quotations", quote.id);
    return quote;
  }
  async function buildRecommendation(submissionId: string, comparedQuotationIds: string[], recommendedQuotationId: string, reasons: string, disclosures?: string) {
    const rec = await post("/recommendations", { submissionId, comparedQuotationIds, recommendedQuotationId, reasons, disclosures });
    track("recommendations", rec.id);
    return rec;
  }
  async function buildClearance(riskId: string, sanctionsScreeningResult: string, pepStatus: boolean, conflictOfInterestChecked: boolean, notes?: string) {
    const clearance = await post("/risk-clearances", { riskId, sanctionsScreeningResult, pepStatus, conflictOfInterestChecked, conflictOfInterestNotes: notes });
    track("riskClearances", clearance.id);
    return clearance;
  }

  // Chain A: Wanjiru Kamau Motor Private -> Won -> bound policy (clean clearance path)
  const wanjiruOpp = opps["Wanjiru Kamau#9"];
  const riskA = await buildRisk(wanjiruOpp.id, parties["Wanjiru Kamau"].id, "07", "KDA 245B Toyota Axio", 1_450_000);
  await buildStrategy(riskA.id, "remarketing", "New client, no incumbent — broad remarket to compare terms.");
  const subA = await buildSubmission(riskA.id, ["aar-general", "apa-general", "britam-general"]);
  const qA1 = await buildQuote(subA.id, parties["Wanjiru Kamau"].id, "07", "aar-general", 1_450_000, 58_000);
  const qA2 = await buildQuote(subA.id, parties["Wanjiru Kamau"].id, "07", "apa-general", 1_450_000, 61_500);
  await buildQuote(subA.id, parties["Wanjiru Kamau"].id, "07", "britam-general", 1_450_000, 63_200);
  const recA = await buildRecommendation(subA.id, [qA1.id, qA2.id], qA1.id, "Lowest total premium among comparable comprehensive covers.", "AAR requires a tracking device fitted within 14 days.");
  await buildClearance(riskA.id, "clear", false, true);
  await patch(`/recommendations/${recA.id}`, { clientDecision: "accepted" });
  const policyA = await post("/policies", {
    quotationId: qA1.id, clientId: parties["Wanjiru Kamau"].id, insurerId: "aar-general", category: "07",
    premiumAmount: (await get(`/quotations?submissionId=${subA.id}`)).find((q: any) => q.id === qA1.id).totalPremiumKes,
    endDate: daysFromNow(365),
  });
  track("policies", policyA.id);
  await patch(`/opportunities/${wanjiruOpp.id}`, { stage: "Won" });

  // Chain B: Savanna Logistics Fire Industrial -> Won -> bound policy (override clearance path)
  const savannaOpp = opps["Savanna Logistics Ltd#10"];
  const riskB = await buildRisk(savannaOpp.id, parties["Savanna Logistics Ltd"].id, "04", "Warehouse & contents, Industrial Area, Nairobi", 45_000_000);
  await buildStrategy(riskB.id, "co_insurance", "High-value industrial risk — spreading capacity across two insurers.");
  const subB = await buildSubmission(riskB.id, ["britam-general", "ga-general"]);
  const qB1 = await buildQuote(subB.id, parties["Savanna Logistics Ltd"].id, "04", "britam-general", 45_000_000, 900_000);
  const qB2 = await buildQuote(subB.id, parties["Savanna Logistics Ltd"].id, "04", "ga-general", 45_000_000, 875_000);
  const recB = await buildRecommendation(subB.id, [qB1.id, qB2.id], qB2.id, "GA Insurance offered the more competitive rate with equivalent wording.");
  await buildClearance(riskB.id, "override", false, true, "Initial sanctions screening returned a false-positive name match, resolved with the client's national ID; approved to proceed.");
  await patch(`/recommendations/${recB.id}`, { clientDecision: "accepted" });
  const policyB = await post("/policies", {
    quotationId: qB2.id, clientId: parties["Savanna Logistics Ltd"].id, insurerId: "ga-general", category: "04",
    premiumAmount: (await get(`/quotations?submissionId=${subB.id}`)).find((q: any) => q.id === qB2.id).totalPremiumKes,
    endDate: daysFromNow(365),
  });
  track("policies", policyB.id);
  await patch(`/opportunities/${savannaOpp.id}`, { stage: "Won" });

  // Chain C: Grace Njeri WIBA (Quoted) — mid-flight, no recommendation yet.
  const graceWibaOpp = opps["Grace Njeri#6"];
  const riskC = await buildRisk(graceWibaOpp.id, parties["Grace Njeri"].id, "11", "4 employees — Njeri General Store", 0);
  await buildStrategy(riskC.id, "remarketing", "First WIBA cover for this risk — comparing two markets.");
  const subC = await buildSubmission(riskC.id, ["cic-general", "heritage-general"]);
  await buildQuote(subC.id, parties["Grace Njeri"].id, "11", "cic-general", 0, 18_000);
  await buildQuote(subC.id, parties["Grace Njeri"].id, "11", "heritage-general", 0, 19_500);

  // Chain D: James Otieno Motor Private (Presented) — recommendation
  // pending client decision, clearance NOT yet recorded — deliberately
  // left in the blocked state to showcase the SOP-23 gate live.
  const jamesOpp = opps["James Otieno#7"];
  const riskD = await buildRisk(jamesOpp.id, parties["James Otieno"].id, "07", "KDB 118C Subaru Forester", 2_200_000);
  await buildStrategy(riskD.id, "remarketing", "Renewal shopping — client wants comparative quotes.");
  const subD = await buildSubmission(riskD.id, ["apa-general", "cic-general"]);
  const qD1 = await buildQuote(subD.id, parties["James Otieno"].id, "07", "apa-general", 2_200_000, 88_000);
  const qD2 = await buildQuote(subD.id, parties["James Otieno"].id, "07", "cic-general", 2_200_000, 91_000);
  await buildRecommendation(subD.id, [qD1.id, qD2.id], qD1.id, "APA's rate is more competitive for this profile.");

  // ---------------------------------------------------------------
  // 5. Two more policies created directly (not via full placement
  //    chain) to showcase issuance checking / discrepancies / renewals.
  // ---------------------------------------------------------------
  console.log("Creating additional policies for issuance checking + renewals...");
  const policyC = await post("/policies", {
    clientId: parties["Coastal Traders Co Ltd"].id, insurerId: "cic-general", category: "06",
    premiumAmount: 340_000, endDate: daysFromNow(300),
  });
  track("policies", policyC.id);

  const policyD = await post("/policies", {
    clientId: parties["Nairobi Tech Hub Ltd"].id, insurerId: "heritage-general", category: "05",
    premiumAmount: 210_000, endDate: daysFromNow(300),
  });
  track("policies", policyD.id);

  const policyE = await post("/policies", {
    clientId: parties["Grace Njeri"].id, insurerId: "jubilee-health", category: "12",
    premiumAmount: 96_000, endDate: daysFromNow(21), // renewal due soon
  });
  track("policies", policyE.id);

  // Issuance checking: policy C — every item passes -> Delivered.
  const checksC = await post(`/policies/${policyC.id}/start-check`);
  for (const c of checksC) await patch(`/policy-checks/${c.id}`, { status: "pass", checkedBy: "staff-claims" });
  await patch(`/policies/${policyC.id}`, { status: "Delivered", deliveryMethod: "email", clientAcknowledgedAt: new Date().toISOString() });

  // Issuance checking: policy D — one item fails -> open discrepancy -> stays in Discrepancy/Under Check.
  const checksD = await post(`/policies/${policyD.id}/start-check`);
  for (const c of checksD) {
    if (c.checkItem.toLowerCase().includes("sum insured")) {
      await patch(`/policy-checks/${c.id}`, { status: "fail", notes: "Sum insured on the schedule doesn't match the placement instruction." });
      const disc = await post("/discrepancies", { policyId: policyD.id, policyCheckId: c.id, description: "Schedule shows KES 18,000,000 sum insured; instruction specified KES 21,000,000.", raisedBy: "staff-claims" });
      track("discrepancies", disc.id);
    } else {
      await patch(`/policy-checks/${c.id}`, { status: "pass", checkedBy: "staff-claims" });
    }
  }

  // Endorsement + renewal on policy E (Grace Njeri Medical).
  const endorsement = await post("/endorsements", {
    policyId: policyE.id, endorsementType: "Add dependant", description: "Add spouse as a dependant on the medical cover.",
    premiumAdjustmentKes: 12_000, effectiveDate: daysFromNow(0),
  });
  track("endorsements", endorsement.id);
  await patch(`/endorsements/${endorsement.id}`, { status: "Instructed" });

  const renewalE = await post("/renewals", { policyId: policyE.id, renewalStatus: "upcoming", dueDate: daysFromNow(21) });
  track("renewals", renewalE.id);
  const renewalA = await post("/renewals", { policyId: policyA.id, renewalStatus: "upcoming", dueDate: daysFromNow(340) });
  track("renewals", renewalA.id);

  // ---------------------------------------------------------------
  // 6. Premium confirmations (Active gate) for policies A, B, C.
  // ---------------------------------------------------------------
  console.log("Confirming premiums...");
  const quoteAFull = (await get(`/quotations?submissionId=${subA.id}`)).find((q: any) => q.id === qA1.id);
  const pcfA = await post("/premium-confirmations", { policyId: policyA.id, confirmedAmountKes: quoteAFull.totalPremiumKes, paymentReference: "MPESA-QGT7X4KL9P", method: "mpesa" });
  track("premiumConfirmations", pcfA.id);

  const quoteBFull = (await get(`/quotations?submissionId=${subB.id}`)).find((q: any) => q.id === qB2.id);
  const pcfB = await post("/premium-confirmations", { policyId: policyB.id, confirmedAmountKes: quoteBFull.totalPremiumKes, paymentReference: "RTGS-2026071900341", method: "bank" });
  track("premiumConfirmations", pcfB.id);

  const pcfC = await post("/premium-confirmations", { policyId: policyC.id, confirmedAmountKes: 340_000, paymentReference: "MPESA-QHT2Y5MN3Q", method: "mpesa" });
  track("premiumConfirmations", pcfC.id);

  const pcfE = await post("/premium-confirmations", { policyId: policyE.id, confirmedAmountKes: 96_000, paymentReference: "MPESA-QJT9K1LP2R", method: "mpesa" });
  track("premiumConfirmations", pcfE.id);

  // ---------------------------------------------------------------
  // 7. Commission statement reconciliation — one clean match, one
  //    deliberate discrepancy.
  // ---------------------------------------------------------------
  console.log("Reconciling commission statements...");
  const txns = await get("/financial-transactions");
  const commissionA = txns.find((t: any) => t.policyId === policyA.id && t.transactionType === "commission");
  const commissionB = txns.find((t: any) => t.policyId === policyB.id && t.transactionType === "commission");

  const stmtAar = await post("/commission-statements", { insurerId: "aar-general", periodStart: daysFromNow(-30), periodEnd: daysFromNow(0), totalCommissionKes: commissionA?.amountKes ?? 0 });
  track("commissionStatements", stmtAar.id);
  const lineAar = await post("/commission-lines", { statementId: stmtAar.id, policyId: policyA.id, commissionRatePct: 10, commissionAmountKes: commissionA?.amountKes ?? 0 });
  track("commissionLines", lineAar.id);
  await post(`/commission-statements/${stmtAar.id}/reconcile`);

  const stmtGa = await post("/commission-statements", { insurerId: "ga-general", periodStart: daysFromNow(-30), periodEnd: daysFromNow(0), totalCommissionKes: (commissionB?.amountKes ?? 0) - 5000 });
  track("commissionStatements", stmtGa.id);
  const lineGa = await post("/commission-lines", { statementId: stmtGa.id, policyId: policyB.id, commissionRatePct: 10, commissionAmountKes: (commissionB?.amountKes ?? 0) - 5000 });
  track("commissionLines", lineGa.id);
  await post(`/commission-statements/${stmtGa.id}/reconcile`);

  // ---------------------------------------------------------------
  // 8. Correspondence templates + a couple of standalone notifications.
  // ---------------------------------------------------------------
  console.log("Creating correspondence templates...");
  const templateDefs = [
    { code: "claim_closed", area: "claims", channel: "email", subject: "Your claim has been settled", bodyTemplate: "Dear {{clientName}}, your claim {{claimId}} has been closed. Thank you for your patience." },
    { code: "claim_payment", area: "claims", channel: "sms", bodyTemplate: "Utmost: Your claim {{claimId}} payment has been processed." },
    { code: "claim_documents", area: "claims", channel: "email", subject: "Documents needed for your claim", bodyTemplate: "Dear {{clientName}}, please submit the outstanding documents for claim {{claimId}} at your earliest convenience." },
    { code: "policy_issued", area: "policy", channel: "email", subject: "Your policy documents are ready", bodyTemplate: "Dear {{clientName}}, your policy {{policyId}} has been issued and is attached." },
    { code: "renewal_reminder", area: "policy", channel: "sms", bodyTemplate: "Utmost: Your policy {{policyId}} renews on {{dueDate}}. Contact us to review your cover." },
  ];
  for (const t of templateDefs) {
    const created = await post("/correspondence-templates", t);
    track("correspondenceTemplates", created.id);
  }
  const notif1 = await post("/notifications", { partyId: parties["Grace Njeri"].id, templateCode: "renewal_reminder" });
  track("notifications", notif1.id);
  await patch(`/notifications/${notif1.id}`, { status: "sent" });
  const notif2 = await post("/notifications", { partyId: parties["Wanjiru Kamau"].id, templateCode: "policy_issued" });
  track("notifications", notif2.id);

  // ---------------------------------------------------------------
  // 9. Claims across the full lifecycle.
  // ---------------------------------------------------------------
  console.log("Registering claims...");

  async function newClaim(policyId: string, policyNumber: string, claimType: string, phoneNumber: string, description: string, lossDate: string) {
    const claim = await post("/claims", { policyId, policyNumber, claimType, phoneNumber, description, lossDate });
    track("claims", claim.id);
    return claim;
  }
  async function addReserveLine(claimId: string, reserveCode: string, amountKes: number, notes?: string) {
    const line = await post("/claim-reserve-lines", { claimId, reserveCode, amountKes, notes });
    track("claimReserveLines", line.id);
  }
  async function addPaymentLine(claimId: string, paymentCode: string, amountKes: number, paymentReference: string, notes?: string) {
    const line = await post("/claim-payment-lines", { claimId, paymentCode, amountKes, paymentReference, paidAt: new Date().toISOString() });
    track("claimPaymentLines", line.id);
  }
  async function addChecklistItem(claimId: string, documentType: string, status?: string) {
    const item = await post("/claim-checklist-items", { claimId, documentType });
    track("claimChecklistItems", item.id);
    if (status && status !== "requested") await patch(`/claim-checklist-items/${item.id}`, { status });
    return item;
  }
  async function addDiaryEntry(claimId: string, note: string, commitmentDueAt?: string) {
    const entry = await post("/claim-diary", { claimId, note, commitmentDueAt });
    track("claimDiary", entry.id);
  }

  // Claim 1 — Wanjiru Kamau Motor Private — cleanly closed.
  const claim1 = await newClaim(policyA.id, policyA.id, "accident_damage", "0722100001", "Rear-end collision on Waiyaki Way, moderate bumper and boot damage.", daysFromNow(-20));
  await patch(`/claims/${claim1.id}`, { status: "Acknowledged", priority: "green", assignedOfficerId: "staff-claims" });
  await addChecklistItem(claim1.id, "police_abstract", "reviewed");
  await addChecklistItem(claim1.id, "photos", "reviewed");
  await addChecklistItem(claim1.id, "repair_quotation", "reviewed");
  await patch(`/claims/${claim1.id}`, { status: "Assessment" });
  await addReserveLine(claim1.id, "indemnity", 85_000, "Panel beating + repaint estimate");
  await addReserveLine(claim1.id, "loss_adjuster_fees", 6_000);
  await patch(`/claims/${claim1.id}`, { status: "Decision", reserveAmountKes: 91_000 });
  await patch(`/claims/${claim1.id}`, { status: "Offer" });
  await addDiaryEntry(claim1.id, "Offer accepted by client; garage instructed to proceed with repairs.");
  await patch(`/claims/${claim1.id}`, { status: "Payment", paidAmountKes: 91_000 });
  await addPaymentLine(claim1.id, "indemnity", 85_000, "MPESA-QCL1A2B3C4");
  await addPaymentLine(claim1.id, "loss_adjuster_fees", 6_000, "RTGS-2026070100112");
  await patch(`/claims/${claim1.id}`, { status: "Closed", settlementReason: "Repair cost settled in full to the garage." });

  // Claim 2 — Savanna Logistics Fire Industrial — in payment, amber priority.
  const claim2 = await newClaim(policyB.id, policyB.id, "fire_damage", "0700100004", "Electrical fault caused a small fire in the loading bay, smoke damage to stored goods.", daysFromNow(-35));
  await patch(`/claims/${claim2.id}`, { status: "Documents", priority: "amber", assignedOfficerId: "staff-underwriter" });
  await addChecklistItem(claim2.id, "fire_department_report", "received");
  await addChecklistItem(claim2.id, "stock_inventory", "received");
  await addChecklistItem(claim2.id, "loss_adjuster_report", "requested");
  await patch(`/claims/${claim2.id}`, { status: "Assessment" });
  await addReserveLine(claim2.id, "indemnity", 1_800_000, "Damaged stock replacement value");
  await addReserveLine(claim2.id, "loss_adjuster_fees", 65_000);
  await addReserveLine(claim2.id, "investigation_fees", 25_000, "Fire cause investigation");
  await patch(`/claims/${claim2.id}`, { status: "Decision", reserveAmountKes: 1_890_000 });
  await patch(`/claims/${claim2.id}`, { status: "Offer" });
  await patch(`/claims/${claim2.id}`, { status: "Payment", paidAmountKes: 1_700_000 });
  await addPaymentLine(claim2.id, "indemnity", 1_650_000, "RTGS-2026071500223");
  await addPaymentLine(claim2.id, "investigation_fees", 25_000, "RTGS-2026071500224");
  await addDiaryEntry(claim2.id, "Final loss adjuster fee invoice awaited before closing.", daysFromNow(5));

  // Claim 3 — Coastal Traders Marine — red priority, fraud flag, overdue diary commitment.
  const claim3 = await newClaim(policyC.id, policyC.id, "cargo_loss", "0700100005", "Container reported short-landed at Mombasa port; discrepancy between manifest and delivered count.", daysFromNow(-15));
  await patch(`/claims/${claim3.id}`, { status: "Documents", priority: "red", assignedOfficerId: "staff-underwriter", fraudFlag: true, fraudScore: 0.72 });
  await addChecklistItem(claim3.id, "bill_of_lading");
  await addChecklistItem(claim3.id, "port_discharge_report");
  await addChecklistItem(claim3.id, "surveyor_report");
  await addDiaryEntry(claim3.id, "Requested surveyor's report from port authority; following up.", daysFromNow(-3));

  // Claim 4 — Nairobi Tech Hub Liability — repudiated then closed via manager review, showcasing the settlement gate.
  const claim4 = await newClaim(policyD.id, policyD.id, "public_liability", "0700100007", "Visitor slipped on wet floor in reception, claiming injury compensation.", daysFromNow(-50));
  await patch(`/claims/${claim4.id}`, { status: "Acknowledged", priority: "amber", assignedOfficerId: "staff-claims" });
  await addChecklistItem(claim4.id, "incident_report", "reviewed");
  await patch(`/claims/${claim4.id}`, { status: "Assessment" });
  await addReserveLine(claim4.id, "legal_fees", 40_000);
  await patch(`/claims/${claim4.id}`, { status: "Decision", reserveAmountKes: 40_000 });
  await patch(`/claims/${claim4.id}`, { status: "Repudiated", settlementReason: "Investigation found the wet-floor warning signage was in place and visible; no liability established." });
  await post(`/claims/${claim4.id}/manager-review`);
  await patch(`/claims/${claim4.id}`, { status: "Closed" });

  // Claim 5 — Grace Njeri Medical — brand new FNOL.
  await newClaim(policyE.id, policyE.id, "medical_inpatient", "0733100008", "Admitted for appendectomy at Aga Khan Hospital, Kisumu.", daysFromNow(-1));

  // ---------------------------------------------------------------
  // 10. Complaints.
  // ---------------------------------------------------------------
  console.log("Logging complaints...");
  const complaint1 = await post("/complaints", {
    partyId: parties["Coastal Traders Co Ltd"].id, claimId: claim3.id, category: "claims_handling_delay",
    severity: "medium", subject: "Slow progress on cargo claim", description: "Client says they have not received an update on the marine cargo claim in two weeks.", channel: "email",
  });
  track("complaints", complaint1.id);
  await patch(`/complaints/${complaint1.id}`, { status: "Investigation", assignedStaffId: "staff-underwriter" });

  const complaint2 = await post("/complaints", {
    partyId: parties["Nairobi Tech Hub Ltd"].id, policyId: policyD.id, category: "billing",
    severity: "low", subject: "Query on premium invoice", description: "Client disputes a levy line item on the latest invoice.", channel: "portal",
  });
  track("complaints", complaint2.id);

  const complaint3 = await post("/complaints", {
    partyId: parties["Wanjiru Kamau"].id, policyId: policyA.id, category: "service",
    severity: "low", subject: "Delay in receiving policy schedule", description: "Client asked for a copy of the policy schedule and waited three days.", channel: "call",
  });
  track("complaints", complaint3.id);
  await patch(`/complaints/${complaint3.id}`, {
    status: "Closed", remedy: "Schedule re-sent same day and confirmed received.",
    correctiveAction: "Added a same-day schedule dispatch checklist item to the bind process.", resolvedDate: daysFromNow(-2),
  });

  // ---------------------------------------------------------------
  // 11. Compliance obligations.
  // ---------------------------------------------------------------
  console.log("Adding compliance obligations...");
  const oblig1 = await post("/obligations", { obligationType: "regulatory_return", source: "IRA", requirement: "Quarterly market conduct return", dueDate: daysFromNow(10), recurrence: "quarterly" });
  track("obligations", oblig1.id);
  const oblig2 = await post("/obligations", { obligationType: "training", source: "AIBK", requirement: "AML/CFT refresher training for all client-facing staff", dueDate: daysFromNow(45), recurrence: "annual" });
  track("obligations", oblig2.id);
  const oblig3 = await post("/obligations", { obligationType: "licence_renewal", source: "IRA", requirement: "Brokerage licence renewal", dueDate: daysFromNow(-4), recurrence: "annual" });
  track("obligations", oblig3.id);
  const oblig4 = await post("/obligations", { obligationType: "regulatory_return", source: "IRA", requirement: "Annual AML/CFT compliance return", dueDate: daysFromNow(-60), recurrence: "annual" });
  track("obligations", oblig4.id);
  await patch(`/obligations/${oblig4.id}`, { status: "submitted", submittedAt: daysFromNow(-58), outcome: "Filed on time, no findings.", nextDueDate: daysFromNow(305) });

  // ---------------------------------------------------------------
  // 12. Standalone workflow tasks.
  // ---------------------------------------------------------------
  console.log("Creating workflow tasks...");
  const task1 = await post("/tasks", { taskType: "follow_up_client", queue: "servicing", priority: "high", dueAt: daysFromNow(-1) });
  track("tasks", task1.id);
  const task2 = await post("/tasks", { taskType: "prepare_renewal_terms", queue: "placement", priority: "normal", dueAt: daysFromNow(14) });
  track("tasks", task2.id);
  const task3 = await post("/tasks", { taskType: "chase_outstanding_document", queue: "claims", priority: "normal", dueAt: daysFromNow(3) });
  track("tasks", task3.id);
  await patch(`/tasks/${task3.id}`, { status: "done", outcome: "Client emailed the missing document." });

  // ---------------------------------------------------------------
  // 13. Product catalog + insurer appetite.
  // ---------------------------------------------------------------
  console.log("Populating product catalog and insurer appetite...");
  const productDefs = [
    { insurerId: "aar-general", category: "07", name: "AAR Motor Comprehensive Plus", description: "Enhanced motor private cover with courtesy car and windscreen cover." },
    { insurerId: "apa-general", category: "09", name: "APA Personal Accident Gold", description: "Enhanced personal accident cover with higher weekly benefit." },
    { insurerId: "britam-general", category: "04", name: "Britam Fire Shield SME", description: "Fire and allied perils cover bundled for small and medium enterprises." },
    { insurerId: "jubilee-health", category: "12", name: "Jubilee Family Medical Cover", description: "Inpatient and outpatient family medical cover." },
  ];
  for (const p of productDefs) {
    const created = await post("/products", p);
    track("products", created.id);
  }
  const appetite1 = await post("/insurer-appetite", { insurerId: "apa-general", classCode: "09", appetiteLevel: "excluded", notes: "Poor claims service on Personal Accident historically." });
  track("insurerAppetite", appetite1.id);
  const appetite2 = await post("/insurer-appetite", { insurerId: "aar-general", classCode: "09", appetiteLevel: "restricted", notes: "Capacity limited this quarter." });
  track("insurerAppetite", appetite2.id);

  // ---------------------------------------------------------------
  // 14. A couple of sample documents (tiny placeholder text content —
  //     this is dev-only local disk storage, not real scanned files).
  // ---------------------------------------------------------------
  console.log("Uploading sample documents...");
  const textToBase64 = (s: string) => Buffer.from(s, "utf-8").toString("base64");
  const doc1 = await post("/documents", {
    fileName: "wanjiru-kamau-national-id.txt", mimeType: "text/plain",
    fileBase64: textToBase64("Placeholder KYC document — National ID copy for Wanjiru Kamau."),
    ownerEntityType: "party", ownerEntityId: parties["Wanjiru Kamau"].id, documentType: "kyc", sensitivity: "restricted",
  });
  track("documents", doc1.id);
  const doc2 = await post("/documents", {
    fileName: `${policyA.id}-schedule.txt`, mimeType: "text/plain",
    fileBase64: textToBase64(`Placeholder policy schedule for ${policyA.id} — Motor Private, AAR Insurance (Kenya) Limited.`),
    ownerEntityType: "policy", ownerEntityId: policyA.id, documentType: "policy_wording", sensitivity: "internal",
  });
  track("documents", doc2.id);

  // ---------------------------------------------------------------
  // Write the manifest so this data can be cleanly removed later.
  // ---------------------------------------------------------------
  const manifestPath = path.join(__dirname, ".showcase-manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nDone. Manifest written to ${manifestPath}`);
  console.log(Object.entries(manifest).map(([k, v]) => `  ${k}: ${v.length}`).join("\n"));
}

main().catch((err) => {
  console.error("\nSeed script failed:", err.message);
  process.exit(1);
});
