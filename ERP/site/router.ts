// ---------------------------------------------------------------------------
// Website API — everything the public quote-generator site (../studio) and its
// staff workspace need from a server: the quote engine, the AI helpers, lead
// email/OTP, claim intake and the rates desk. Mounted by server.ts at /api/site.
//
// This used to be the studio app's own Express server. It now lives in the ERP
// so there is ONE backend; studio is a plain front end that calls it.
//
//  * Public routes (quotes, AI, OTP, claim intake, insurer list) need no login
//    and are rate-limited — see server.ts for the limits.
//  * Staff routes (rates desk, insurer + logo admin, claims/room-scan/audit
//    reads) require a staff session: the same JWT the ERP dashboard uses.
//
// Data lives in the ERP's one database (see ./store.ts) — insurers, premium
// rate tables, levies, claims, quotes and the audit trail. There are no data
// files: nothing here reads or writes the disk.
// ---------------------------------------------------------------------------
import express, { Router } from "express";
import crypto from "crypto";
import { GoogleGenAI, Type } from "@google/genai";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import * as store from "./store";
import { recordAudit, type SiteAuditEntry } from "./store";
import { calculateDynamicMedicalQuotes, MEMBER_AGE_BANDS, OUTPATIENT_AGE_BANDS } from "./lib/medicalCalculator";
import { OTHER_LINE_CATEGORIES, OTHER_LINE_LIVE_CATEGORY_IDS } from "./lib/otherLineCategories";

// This module is evaluated before server.ts runs its own dotenv.config().
dotenv.config();

export interface StaffIdentity { staffId: string; fullName: string; role: string; permissions: string[] }

// What the website router needs from the ERP, injected so this file doesn't
// depend on server.ts (and so tests can fake it).
export interface SiteDeps {
  login: (email: string, password: string) => Promise<{ token: string; expiresAt: number } & StaffIdentity | null>;
  authenticate: (token: string) => Promise<StaffIdentity | null>;
  listStaff: () => Promise<{ id: string; fullName: string; role: string; active: boolean }[]>;
}

// Wraps an async handler so a rejected promise becomes a response instead of
// an unhandled rejection. Only errors that carry an explicit 4xx status show
// their message; everything else is a generic 500 (no internals leaked).
function asyncRoute(handler: (req: express.Request, res: express.Response) => Promise<unknown>) {
  return (req: express.Request, res: express.Response) => {
    handler(req, res).catch((err) => {
      console.error(err);
      const status = Number.isInteger(err?.status) ? err.status : 500;
      res.status(status).json({ error: status < 500 ? err?.message || "Bad request" : "Internal server error" });
    });
  };
}

export function createSiteRouter(deps: SiteDeps): Router {
const router = Router();
// Large base64 image uploads (room photos, claim evidence).
router.use(express.json({ limit: "50mb" }));

// A staff session (the ERP JWT), optionally also holding one ERP permission.
function requireStaff(permission?: string) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) return res.status(401).json({ error: "Staff authentication required." });
    deps.authenticate(token)
      .then((staff) => {
        if (!staff) return res.status(401).json({ error: "Staff authentication required." });
        if (permission && !staff.permissions.includes(permission)) {
          return res.status(403).json({ error: `Missing permission: ${permission}` });
        }
        (req as any).staff = staff;
        next();
      })
      .catch(() => res.status(401).json({ error: "Staff authentication required." }));
  };
}
const requireStaffAuth = requireStaff();

// Staff sign-in for the website's workspace: the same accounts and JWT as the
// ERP dashboard (the old hard-coded shared-password list is gone). The login
// field takes the staff email address.
router.post("/staff/login", asyncRoute(async (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
    return res.status(400).json({ error: "Enter your staff email and password." });
  }
  const session = await deps.login(username.trim(), password);
  if (!session) return res.status(401).json({ error: "Invalid staff email or password." });
  res.json(session);
}));

// Tokens are stateless JWTs, so there is nothing to revoke server-side; the
// client just discards it. Kept so the existing sign-out call still succeeds.
router.post("/staff/logout", (_req, res) => res.json({ success: true }));

// Directory used by the workspace to show who did what.
router.get("/staff", requireStaffAuth, asyncRoute(async (_req, res) => {
  res.json((await deps.listStaff()).map((s) => ({ id: s.id, fullName: s.fullName, role: s.role, active: s.active })));
}));

// Uploaded insurer logos are rows in product.insurer_logos (bytea) — served here so
// no file ever touches the disk. The URL carries ?v=<upload time>, so a replaced logo
// busts the cache and the response can be cached for good.
router.get("/files/logos/:key", asyncRoute(async (req, res) => {
  const logo = await store.getLogo(req.params.key);
  if (!logo) return res.status(404).json({ error: "Logo not found." });
  res.setHeader("Content-Type", logo.mimeType);
  res.setHeader("X-Content-Type-Options", "nosniff");
  // The website (another origin) embeds these in <img> tags; helmet's default would block that.
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  // An SVG can carry script: let it render as an image but never run anything.
  if (logo.mimeType === "image/svg+xml") res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.send(logo.data);
}));

// ----------------------------------------------------
// Outbound email: lead notifications, AI risk-analysis and claims-assistant
// handoffs, all forwarded to LEADS_EMAIL. Configured via SMTP_* env vars -
// see .env.example. When unset (e.g. local dev without real credentials),
// sendLeadEmail logs what it would have sent and resolves without throwing,
// so no feature is blocked on email delivery being configured.
// ----------------------------------------------------
const LEADS_EMAIL = process.env.LEADS_EMAIL || "info@utmostkenya.com";
const SMTP_CONFIGURED = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const mailTransporter = SMTP_CONFIGURED
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    })
  : null;

interface LeadEmailAttachment {
  filename: string;
  contentBase64: string; // raw base64 or a data: URL - both accepted
  contentType?: string;
}

async function sendLeadEmail(opts: { subject: string; html: string; attachments?: LeadEmailAttachment[] }) {
  const attachments = (opts.attachments || []).map((a) => {
    const match = a.contentBase64.match(/^data:([^;]+);base64,(.*)$/s);
    return {
      filename: a.filename,
      content: Buffer.from(match ? match[2] : a.contentBase64, "base64"),
      contentType: a.contentType || (match ? match[1] : undefined)
    };
  });

  if (!mailTransporter) {
    console.log(`[email:not-configured] Would send "${opts.subject}" to ${LEADS_EMAIL} (${attachments.length} attachment(s)). Set SMTP_HOST/SMTP_USER/SMTP_PASS to enable real delivery.`);
    return { sent: false, reason: "SMTP not configured" };
  }

  try {
    await mailTransporter.sendMail({
      from: process.env.SMTP_FROM || `"Utmost Insurance Brokers" <${process.env.SMTP_USER}>`,
      to: LEADS_EMAIL,
      subject: opts.subject,
      html: opts.html,
      attachments
    });
    return { sent: true };
  } catch (error: any) {
    console.error(`Error sending lead email "${opts.subject}":`, error?.message || error);
    return { sent: false, reason: error?.message || "send failed" };
  }
}

// Sends directly to a customer's own inbox (e.g. OTP codes) rather than to
// LEADS_EMAIL - same "log and continue" fallback when SMTP isn't configured,
// so the OTP flow never hard-blocks a local/demo environment.
async function sendTransactionalEmail(to: string, subject: string, html: string) {
  if (!mailTransporter) {
    console.log(`[email:not-configured] Would send "${subject}" to ${to}. Set SMTP_HOST/SMTP_USER/SMTP_PASS to enable real delivery.`);
    return { sent: false, reason: "SMTP not configured" };
  }
  try {
    await mailTransporter.sendMail({
      from: process.env.SMTP_FROM || `"Utmost Insurance Brokers" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html
    });
    return { sent: true };
  } catch (error: any) {
    console.error(`Error sending email to ${to}:`, error?.message || error);
    return { sent: false, reason: error?.message || "send failed" };
  }
}

// ----------------------------------------------------
// Data access lives in ./store.ts. These two helpers are fire-and-forget:
// failing to write the audit trail must never fail the request being logged.
// ----------------------------------------------------
function addAuditLog(entry: SiteAuditEntry) {
  void recordAudit(entry);
}

function logFallbackUsed(reason: string, details: any) {
  console.warn(`[WARNING] RATE_FALLBACK_USED: ${reason}`);
  addAuditLog({
    action: "RATE_FALLBACK_USED",
    entityType: "rates",
    entityId: details.insurerId || "fallback",
    actorId: "system",
    actorType: "system",
    details: { reason, ...details }
  });
}

// The pricing tables, as the engine reads them (only the live versions matter per request).
function getActiveRatesList(ratesDb: any) {
  if (ratesDb && ratesDb.versions) {
    return ratesDb.versions
      .filter((v: any) => v.status === "active")
      .map((v: any) => ({
        insurerId: v.insurerId,
        insurerName: v.rates.insurerName || v.insurerId,
        isPublished: v.rates.isPublished !== false,
        motorComprehensiveRate: v.rates.motorComprehensiveRate,
        motorTpoRate: v.rates.motorTpoRate,
        medicalMultiplier: v.rates.medicalMultiplier,
        medicalMaternityRate: v.rates.medicalMaternityRate,
        medicalDentalOptRate: v.rates.medicalDentalOptRate,
        medicalRateTable: v.rates.medicalRateTable,
        memberRateTable: v.rates.memberRateTable,
        sumInsuredBands: v.rates.sumInsuredBands || [],
        vehicleTypes: v.rates.vehicleTypes || [],
        riders: v.rates.riders || []
      }));
  }
  return [];
}

// Lazy initializer for Gemini Client
let aiClient: GoogleGenAI | null = null;
function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("Waring: GEMINI_API_KEY is not defined in the environment. AI features will fallback to mock data.");
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey || "MOCK_KEY",
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// ----------------------------------------------------
// API 1: AI Room Organizer & Hazard Analyzer Proxy
// ----------------------------------------------------
router.post("/analyze-room", async (req, res) => {
  try {
    const { imageBase64, mimeType, roomType } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: "Missing room image payload." });
    }

    // fallback to mock if API key isn't provided or is a placeholder
    const isMock = !process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "MY_GEMINI_API_KEY";

    if (isMock) {
      console.log("Using local simulated AI analyzer due to missing/default GEMINI_API_KEY.");
      // Provide high fidelity simulated organization feedback matching the room classification
      const selectedType = roomType || "Living Room";
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Simulate AI delay

      const simulatedResponse = {
        roomType: selectedType,
        status: "Cluttered",
        clutterScore: 7,
        organizationSuggestions: [
          `Clear the floor of loose cords, papers and laundry to instantly enlarge the path inside this ${selectedType}.`,
          "Introduce a multi-tier modular storage rack or shelving unit along the main wall to move items vertical.",
          "Categorize all items on open surfaces into 'Keep', 'Donate', and 'Recycle' bins.",
          "Label container storage bins to maintain long-term organization and prevent future clutter accumulations.",
          "Maximize corner spaces by using custom triangular desks, floating bookshelves or nested stackable stool units."
        ],
        safetyHazards: [
          {
            hazardName: "Cable Cluttered Path",
            description: "Multiple electrical wires laying completely exposed across the main walkways.",
            fixAction: "Install self-adhesive cable raceways or zip-ties along the baseboard to completely clear the path."
          },
          {
            hazardName: "Overloaded Multi-plug Socket",
            description: "A single extension block with multiple heavy heaters or high-power electronics plugged in.",
            fixAction: "Distribute electronic plugs into separate wall outlets and use high-quality surge protectors."
          },
          {
            hazardName: "Blocked Doorways / Air Ventilation",
            description: "Stacked boxes and containers piled up directly behind the door and in front of vents.",
            fixAction: "Clear all emergency egress exits and ensure a minimum 3-foot clearance for ventilation grills and heating units."
          }
        ],
        estimatedItems: [
          {
            itemName: "Smart Television & Soundbar",
            estimatedValueKES: 85000,
            insuranceTip: "Mount TV securely to the wall to avoid accidental tip-over and plug into an automatic voltage switcher (AVS) to prevent power surge burnouts."
          },
          {
            itemName: "Multi-seater Sofa Set & Rug",
            estimatedValueKES: 120000,
            insuranceTip: "Keep fabric sofas away from direct sunlight or fireplace corners and cover under standard fire & theft insurance policies."
          },
          {
            itemName: "Storage Cabinet & Bookcases",
            estimatedValueKES: 45000,
            insuranceTip: "Keep records of high-value books or collectibles in the cabinet and secure cabinet units to walls."
          },
          {
            itemName: "Home Office Laptop & Monitor",
            estimatedValueKES: 140000,
            insuranceTip: "Add a portable electronic endorsement if you frequently travel outside Nairobi with this equipment."
          }
        ],
        totalContentsValueKES: 390000,
        domesticPackageIndicativePremiumKES: 5850 // ~1.5% of total contents KES
      };

      sendLeadEmail({
        subject: `AI Risk Analysis Used - ${selectedType} (Property Scan)`,
        html: `<h2>AI Home Risk Evaluator - Room Scan</h2><p><strong>Room type:</strong> ${selectedType}</p><p><strong>Clutter score:</strong> ${simulatedResponse.clutterScore}/10</p><p><strong>Estimated contents value:</strong> KES ${simulatedResponse.totalContentsValueKES.toLocaleString()}</p><p>See attached photo.</p>`,
        attachments: [{ filename: `room-scan-${Date.now()}.jpg`, contentBase64: imageBase64, contentType: mimeType || "image/jpeg" }]
      }).catch(() => {});

      return res.json(simulatedResponse);
    }

    // Call real Google Gen AI
    const ai = getAiClient();
    
    // Base64 cleaning
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const imagePart = {
      inlineData: {
        mimeType: mimeType || "image/jpeg",
        data: base64Data,
      },
    };

    const textPart = {
      text: `Analyze this Room Photo for a user of Utmost Insurance Brokers Kenya (Premium Domestic Package).
      - Target Room Focus: ${roomType || "Indoor Area"}
      - Provide a comprehensive, professional decluttering, organizing assessment and safety hazards checklist.
      - Estimate valuable contents/assets to prepare home property inventory list in KES (Kenyan Shillings).
      - Provide the response strictly in JSON matching the responseSchema requirements exactly.`
    };

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: { parts: [imagePart, textPart] },
      config: {
        systemInstruction: `You are an elite professional home organizer, safety consultant, and insurance risk surveyor. You work with Utmost Insurance Brokers Limited (Kenya) to help customers organize their indoor areas, decrease physical and fire risks, and build property inventories for Domestic Package contents insurance.
        
        CRITICAL PRIVACY & SAFETY MANDATE: First, inspect the uploaded photo for privacy violations. If the image contains any visible human faces, recognizable people, or exposed PII (such as identity cards, passports, bank statements, driver's licenses, or legible papers with names, addresses, or financial records), you MUST immediately stop analysis and set the "privacyViolationError" field to: "Analysis stopped: A visible human face or sensitive personal documents (PII) were detected in your photograph. To protect your privacy, please take a photograph of only the room or contents, ensuring no people or personal documents are visible." When this happens, leave all other fields as empty strings or empty arrays.

        Produce a premium-quality, realistic, and highly practical report. Ensure KES estimations are realistic for middle-to-high income Kenyan households (e.g. TVs, fridges, sofa sets, electronics) and premiums are accurately estimated based on KES contents value (generally around 1.0% to 1.5% of contents value, with standard policy levies, or a minimum fee of KES 5,000 per year).`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            privacyViolationError: { 
              type: Type.STRING,
              description: "Populated only when a visible face or sensitive document (PII) is detected in the image."
            },
            roomType: { type: Type.STRING },
            status: { type: Type.STRING },
            clutterScore: { type: Type.INTEGER },
            organizationSuggestions: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            safetyHazards: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  hazardName: { type: Type.STRING },
                  description: { type: Type.STRING },
                  fixAction: { type: Type.STRING }
                },
                required: ["hazardName", "description", "fixAction"]
              }
            },
            estimatedItems: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  itemName: { type: Type.STRING },
                  estimatedValueKES: { type: Type.INTEGER },
                  insuranceTip: { type: Type.STRING }
                },
                required: ["itemName", "estimatedValueKES", "insuranceTip"]
              }
            },
            totalContentsValueKES: { type: Type.INTEGER },
            domesticPackageIndicativePremiumKES: { type: Type.INTEGER }
          },
          required: [
            "privacyViolationError",
            "roomType",
            "status",
            "clutterScore",
            "organizationSuggestions",
            "safetyHazards",
            "estimatedItems",
            "totalContentsValueKES",
            "domesticPackageIndicativePremiumKES"
          ]
        }
      }
    });

    const aiText = response.text;
    if (!aiText) {
      throw new Error("Empty response received from Gemini.");
    }

    const report = JSON.parse(aiText.trim());
    
    // Check if the model flagged a privacy or PII violation
    if (report.privacyViolationError && report.privacyViolationError.trim() !== "") {
      return res.status(400).json({ error: report.privacyViolationError });
    }

    store.recordRoomScan(report).catch((err) => console.error("room scan not recorded:", err));

    sendLeadEmail({
      subject: `AI Risk Analysis Used - ${report.roomType || roomType || "Property Scan"}`,
      html: `<h2>AI Home Risk Evaluator - Room Scan</h2><p><strong>Room type:</strong> ${report.roomType || roomType}</p><p><strong>Clutter score:</strong> ${report.clutterScore}/10</p><p><strong>Estimated contents value:</strong> KES ${Number(report.totalContentsValueKES || 0).toLocaleString()}</p><p><strong>Safety hazards flagged:</strong> ${(report.safetyHazards || []).length}</p><p>See attached photo.</p>`,
      attachments: [{ filename: `room-scan-${Date.now()}.jpg`, contentBase64: imageBase64, contentType: mimeType || "image/jpeg" }]
    }).catch(() => {});

    return res.json(report);

  } catch (error: any) {
    console.error("Error in /api/analyze-room:", error);
    return res.status(500).json({ error: error.message || "Failed to analyze room photo." });
  }
});

// ----------------------------------------------------
// API 1a: General Insurance Education & Risk Analysis Assistant
// Broader than the room-photo scanner above - answers general "how does X
// insurance work" questions and can assess a photo of an asset/property for
// risk factors, without being scoped to Domestic Package contents only.
// ----------------------------------------------------
const RISK_ADVISOR_DISCLAIMER = "This is AI-generated general guidance for educational purposes only. It is not a formal risk survey, a quote, or professional insurance advice, and it does not consider your specific policy wording. Speak to an Utmost advisor before making any insurance decision.";

router.post("/insurance-advisor-chat", async (req, res) => {
  try {
    const { question, imageBase64, mimeType } = req.body;

    if (!question || !question.trim()) {
      return res.status(400).json({ error: "Please provide a question." });
    }

    const isMock = !process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "MY_GEMINI_API_KEY";

    if (isMock) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const mockAnswer = `Here's general guidance on "${question.trim()}": Kenyan insurance is regulated by the IRA and split into General (motor, fire, marine, liability, etc.), Medical, and Long-Term (life) classes. For a precise answer tailored to your situation, an Utmost advisor can review your specific circumstances - use the "Get a Quote" or advisory line to reach one directly. (Simulated response - GEMINI_API_KEY not configured.)`;
      const mockRecommendedPolicies = imageBase64
        ? [
            { policyName: "Fire & Perils / Domestic Package", reason: "General cover for fire, storm, and structural damage to a property or its contents (simulated - GEMINI_API_KEY not configured)." },
            { policyName: "Burglary / Theft", reason: "Protects contents and equipment against break-in and theft (simulated response)." }
          ]
        : [];
      sendLeadEmail({
        subject: `AI Risk Evaluator Used - Risk Analysis / Policy Recommendation`,
        html: `<h2>AI Risk Evaluator</h2><p><strong>Question:</strong> ${question.trim()}</p><p><strong>Answer given:</strong> ${mockAnswer}</p>${imageBase64 ? "<p>See attached photo.</p>" : ""}`,
        attachments: imageBase64 ? [{ filename: `risk-analysis-${Date.now()}.jpg`, contentBase64: imageBase64, contentType: mimeType || "image/jpeg" }] : []
      }).catch(() => {});
      return res.json({
        answer: mockAnswer,
        riskFactors: [],
        suggestedInsuranceLines: [],
        recommendedPolicies: mockRecommendedPolicies,
        disclaimer: RISK_ADVISOR_DISCLAIMER
      });
    }

    const ai = getAiClient();
    const parts: any[] = [];
    if (imageBase64) {
      parts.push({ inlineData: { mimeType: mimeType || "image/jpeg", data: imageBase64.replace(/^data:image\/\w+;base64,/, "") } });
    }
    parts.push({
      text: `A prospective or existing customer of Utmost Insurance Brokers (Kenya) is asking: "${question.trim()}"${imageBase64 ? " They have also attached a photo of an asset or property (this could be anything - a vehicle, a shop or business premises, machinery/equipment, a home or its contents, livestock, goods for transit, etc. - not just a house) and want to know what insurance they should take up for it." : ""} Answer helpfully and specifically to the Kenyan insurance market. If a photo is attached, identify what the asset/property actually is, note visible risk factors (fire, theft, structural, liability, accident, weather), and recommend the SPECIFIC named insurance policies/classes of cover most relevant to protecting it, with a short reason for each grounded in what's actually visible. Respond strictly as JSON matching the schema.`
    });

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: { parts },
      config: {
        systemInstruction: `You are a risk-analysis and insurance-recommendation assistant for Utmost Insurance Brokers Limited, an independent Kenyan insurance intermediary. Your job covers ANY asset or property a user asks about or photographs - not just homes: vehicles, shops, offices, machinery, construction sites, goods in transit, livestock, and personal property all apply equally. You help the public understand how insurance works and, when given a photo, recommend the SPECIFIC named insurance policies/classes of cover (e.g. "Motor Comprehensive", "Fire Industrial", "Burglary/Theft", "Goods in Transit", "Public Liability", "Machinery Breakdown", "Personal Accident") that genuinely fit what's shown, each with a concrete reason tied to a visible risk factor - not a generic list.

        CRITICAL PRIVACY MANDATE: if any image contains visible human faces, ID documents, or other exposed PII, do not analyze it - set privacyViolationError instead and leave other fields empty.

        You are NOT a licensed financial/insurance advisor and must never: state a binding premium, guarantee coverage or claims outcomes, or tell someone not to buy insurance they may need. Keep answers factual, balanced, and always steer decisions that matter back to a qualified Utmost advisor. Answers should be genuinely useful and specific, not generic filler. If no image was provided, recommendedPolicies can be an empty array unless the question itself clearly asks about a specific class of cover.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            privacyViolationError: { type: Type.STRING },
            answer: { type: Type.STRING },
            riskFactors: { type: Type.ARRAY, items: { type: Type.STRING } },
            suggestedInsuranceLines: { type: Type.ARRAY, items: { type: Type.STRING } },
            recommendedPolicies: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  policyName: { type: Type.STRING },
                  reason: { type: Type.STRING }
                },
                required: ["policyName", "reason"]
              }
            }
          },
          required: ["privacyViolationError", "answer", "riskFactors", "suggestedInsuranceLines", "recommendedPolicies"]
        }
      }
    });

    const aiText = response.text;
    if (!aiText) throw new Error("Empty response received from Gemini.");
    const report = JSON.parse(aiText.trim());

    if (report.privacyViolationError && report.privacyViolationError.trim() !== "") {
      return res.status(400).json({ error: report.privacyViolationError });
    }

    sendLeadEmail({
      subject: `AI Risk Evaluator Used - Risk Analysis / Policy Recommendation`,
      html: `<h2>AI Risk Evaluator</h2><p><strong>Question:</strong> ${question.trim()}</p><p><strong>Answer given:</strong> ${report.answer}</p>${(report.recommendedPolicies || []).length > 0 ? `<p><strong>Recommended policies:</strong> ${report.recommendedPolicies.map((p: any) => p.policyName).join(", ")}</p>` : ""}${imageBase64 ? "<p>See attached photo.</p>" : ""}`,
      attachments: imageBase64 ? [{ filename: `risk-analysis-${Date.now()}.jpg`, contentBase64: imageBase64, contentType: mimeType || "image/jpeg" }] : []
    }).catch(() => {});

    return res.json({ ...report, disclaimer: RISK_ADVISOR_DISCLAIMER });
  } catch (error: any) {
    console.error("Error in /api/insurance-advisor-chat:", error);
    return res.status(500).json({ error: error.message || "Failed to process your question." });
  }
});

// ----------------------------------------------------
// API 1c: AI Claims Reporting Assistant - guides a claimant on what evidence
// to collect (photos, documents) for their specific type of incident before
// they formally submit a claim. Educational guidance only, not a claims
// decision or coverage confirmation.
// ----------------------------------------------------
const CLAIMS_ASSISTANT_DISCLAIMER = "This AI-generated checklist is general guidance to help you gather evidence faster. It does not confirm cover, assess liability, or guarantee any claim outcome - your claim will be reviewed by an Utmost claims officer against your actual policy terms.";

router.post("/claims-assistant", async (req, res) => {
  try {
    const { claimType, description } = req.body;

    if (!claimType || !claimType.trim()) {
      return res.status(400).json({ error: "Please select or describe the type of incident." });
    }

    const isMock = !process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "MY_GEMINI_API_KEY";

    if (isMock) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const mockGuidance = {
        photosToTake: [
          "Wide shot showing the full scene/vehicle/property from several angles",
          "Close-ups of all visible damage with something for scale (a coin, hand, ruler)",
          "Registration plates, serial numbers, or identifying marks",
          "Any third-party involvement (other vehicles, injuries, surroundings)"
        ],
        documentsToGather: [
          "Copy of your policy/cover note number",
          "National ID or passport",
          "Police abstract (if applicable)",
          "Any receipts or proof of value for damaged/lost items"
        ],
        nextSteps: [
          "Report the incident to police within 24 hours if it involves theft, an accident, or third parties",
          "Notify Utmost as soon as possible - delays can affect your claim",
          "Do not repair or dispose of damaged property until it has been assessed"
        ]
      };
      sendLeadEmail({
        subject: `AI Claims Assistant Used - ${claimType.trim()}`,
        html: `<h2>AI Claims Reporting Assistant</h2><p><strong>Claim type:</strong> ${claimType.trim()}</p><p><strong>Description given:</strong> ${description || "Not provided"}</p><p>Guidance was generated to help this user prepare their claim - no submission has necessarily been made yet.</p>`
      }).catch(() => {});
      return res.json({ ...mockGuidance, disclaimer: CLAIMS_ASSISTANT_DISCLAIMER });
    }

    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: {
        parts: [{
          text: `A customer is about to file an insurance claim in Kenya. Incident type: "${claimType.trim()}". ${description ? `Additional details: "${description.trim()}"` : ""} Give them a specific, practical checklist of what to photograph, what documents to gather, and immediate next steps, tailored to this exact incident type. Respond strictly as JSON matching the schema.`
        }]
      },
      config: {
        systemInstruction: `You are a claims-preparation assistant for Utmost Insurance Brokers Limited, an independent Kenyan insurance intermediary. You help claimants gather the right evidence BEFORE they submit a claim, so processing is faster - you do not assess liability, confirm coverage, or estimate settlement amounts. Be specific to the incident type described (e.g. motor accident vs fire vs burglary vs medical need different evidence). Keep guidance practical and actionable, grounded in how Kenyan claims (police abstracts, IRA timelines, etc.) actually work.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            photosToTake: { type: Type.ARRAY, items: { type: Type.STRING } },
            documentsToGather: { type: Type.ARRAY, items: { type: Type.STRING } },
            nextSteps: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["photosToTake", "documentsToGather", "nextSteps"]
        }
      }
    });

    const aiText = response.text;
    if (!aiText) throw new Error("Empty response received from Gemini.");
    const report = JSON.parse(aiText.trim());

    sendLeadEmail({
      subject: `AI Claims Assistant Used - ${claimType.trim()}`,
      html: `<h2>AI Claims Reporting Assistant</h2><p><strong>Claim type:</strong> ${claimType.trim()}</p><p><strong>Description given:</strong> ${description || "Not provided"}</p><p>Guidance was generated to help this user prepare their claim - no submission has necessarily been made yet.</p>`
    }).catch(() => {});

    return res.json({ ...report, disclaimer: CLAIMS_ASSISTANT_DISCLAIMER });
  } catch (error: any) {
    console.error("Error in /api/claims-assistant:", error);
    return res.status(500).json({ error: error.message || "Failed to generate claims guidance." });
  }
});

// ----------------------------------------------------
// API 1d: AI Claims Photo Evidence Review - after a claimant has taken
// incident-scene photos (but before/at formal submission), assess whether
// each photo is actually useful enough to help defend the claim: what it
// shows well, what's missing or unclear, and a plain recommendation on
// whether to retake/add more photos. This is a photo-quality/evidence
// assessment only - it never confirms liability or a claim outcome.
// ----------------------------------------------------
const CLAIMS_PHOTO_REVIEW_DISCLAIMER = "This AI-generated evidence review is general guidance on photo quality and completeness only. It does not assess liability, confirm coverage, or guarantee any claim outcome - your claim will be reviewed by an Utmost claims officer against your actual policy terms and the full evidence submitted.";

router.post("/claims-photo-review", async (req, res) => {
  try {
    const { claimType, description, photoBase64, mimeType } = req.body;

    if (!photoBase64) {
      return res.status(400).json({ error: "Please attach a photo of the incident/damage to review." });
    }

    const isMock = !process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "MY_GEMINI_API_KEY";

    if (isMock) {
      await new Promise((resolve) => setTimeout(resolve, 1300));
      const mockReview = {
        evidenceQuality: "Moderate",
        strengths: [
          "Shows the damaged area with reasonable clarity",
          "Lighting is adequate to make out the extent of the damage"
        ],
        gaps: [
          "No wide shot showing the full vehicle/property or scene context",
          "No visible registration plate, serial number, or other identifying mark",
          "No object for scale (coin, hand, ruler) to judge the size of the damage"
        ],
        recommendation: "This photo alone is unlikely to fully defend your claim. Add a wide establishing shot, a close-up with something for scale, and a shot of the identifying mark (plate/serial number) before you submit.",
        disclaimer: CLAIMS_PHOTO_REVIEW_DISCLAIMER
      };
      sendLeadEmail({
        subject: `AI Claims Photo Review Used - ${claimType ? claimType.trim() : "Incident"}`,
        html: `<h2>AI Claims Photo Evidence Review</h2><p><strong>Claim type:</strong> ${claimType ? claimType.trim() : "Not specified"}</p><p><strong>Description given:</strong> ${description || "Not provided"}</p><p><strong>Evidence quality assessed:</strong> ${mockReview.evidenceQuality}</p><p>See attached photo.</p>`,
        attachments: [{ filename: `claim-evidence-${Date.now()}.jpg`, contentBase64: photoBase64, contentType: mimeType || "image/jpeg" }]
      }).catch(() => {});
      return res.json(mockReview);
    }

    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: {
        parts: [
          { inlineData: { mimeType: mimeType || "image/jpeg", data: photoBase64.replace(/^data:image\/\w+;base64,/, "") } },
          {
            text: `A customer is preparing to submit an insurance claim in Kenya${claimType ? ` for a "${claimType.trim()}" incident` : ""}.${description ? ` Additional details: "${description.trim()}"` : ""} They have taken this photo as evidence. Assess whether this photo, on its own, is useful enough to help defend/support the claim - what it shows well, what is missing or unclear, and whether they should take additional or better photos before submitting. Respond strictly as JSON matching the schema.`
          }
        ]
      },
      config: {
        systemInstruction: `You are a claims-evidence quality reviewer for Utmost Insurance Brokers Limited, an independent Kenyan insurance intermediary. You assess whether a claimant's incident/damage photo is clear and complete enough to be useful evidence - you do NOT assess liability, confirm coverage, or predict the claim outcome. Be specific and practical: comment on framing, lighting, whether damage/identifying marks (plates, serial numbers) are visible, whether scale is clear, and whether scene context is shown. CRITICAL PRIVACY MANDATE: if the image contains a visible human face, a national ID/passport, or other exposed personal identifying document, do not analyze it - set privacyViolationError to a short explanation instead and leave the other fields as empty strings/arrays. You are NOT a licensed loss adjuster or claims officer; never state or imply the claim will be approved, rejected, or settled at a given amount.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            privacyViolationError: { type: Type.STRING },
            evidenceQuality: { type: Type.STRING },
            strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
            gaps: { type: Type.ARRAY, items: { type: Type.STRING } },
            recommendation: { type: Type.STRING }
          },
          required: ["privacyViolationError", "evidenceQuality", "strengths", "gaps", "recommendation"]
        }
      }
    });

    const aiText = response.text;
    if (!aiText) throw new Error("Empty response received from Gemini.");
    const report = JSON.parse(aiText.trim());

    if (report.privacyViolationError && report.privacyViolationError.trim() !== "") {
      return res.status(400).json({ error: report.privacyViolationError });
    }

    sendLeadEmail({
      subject: `AI Claims Photo Review Used - ${claimType ? claimType.trim() : "Incident"}`,
      html: `<h2>AI Claims Photo Evidence Review</h2><p><strong>Claim type:</strong> ${claimType ? claimType.trim() : "Not specified"}</p><p><strong>Description given:</strong> ${description || "Not provided"}</p><p><strong>Evidence quality assessed:</strong> ${report.evidenceQuality}</p><p><strong>Recommendation given:</strong> ${report.recommendation}</p><p>See attached photo.</p>`,
      attachments: [{ filename: `claim-evidence-${Date.now()}.jpg`, contentBase64: photoBase64, contentType: mimeType || "image/jpeg" }]
    }).catch(() => {});

    return res.json({ ...report, disclaimer: CLAIMS_PHOTO_REVIEW_DISCLAIMER });
  } catch (error: any) {
    console.error("Error in /api/claims-photo-review:", error);
    return res.status(500).json({ error: error.message || "Failed to review the claim photo." });
  }
});


// ----------------------------------------------------
// Admin API: Get and Update Underwriter specific rates
// ----------------------------------------------------
router.get("/admin/rates", requireStaff("insurer_rate.manage"), asyncRoute(async (_req, res) => {
  res.json(await store.loadRatesDb());
}));

// Publishes a new pricing table for one insurer (the live one is retired, never overwritten)
// and/or records new statutory levies. Replying with the refreshed tables keeps the desk in sync.
router.post("/admin/rates", requireStaff("insurer_rate.manage"), asyncRoute(async (req, res) => {
  const { levies, insurerId, rates, motorComprehensiveRate, motorTpoRate, medicalMultiplier, pcfRate, itlRate, stampDuty } = req.body ?? {};
  // The authenticated session's identity, never a client-supplied one.
  const actorId = (req as any).staff.staffId;

  const levyChange: Partial<store.Levies> = {};
  const num = (v: unknown, name: string) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw Object.assign(new Error(`${name} must be a non-negative number.`), { status: 400 });
    return n;
  };
  if (levies) {
    if (levies.pcfRate !== undefined) levyChange.pcfRate = num(levies.pcfRate, "pcfRate");
    if (levies.itlRate !== undefined) levyChange.itlRate = num(levies.itlRate, "itlRate");
    if (levies.stampDuty !== undefined) levyChange.stampDuty = num(levies.stampDuty, "stampDuty");
  }
  if (pcfRate !== undefined) levyChange.pcfRate = num(pcfRate, "pcfRate");
  if (itlRate !== undefined) levyChange.itlRate = num(itlRate, "itlRate");
  if (stampDuty !== undefined) levyChange.stampDuty = num(stampDuty, "stampDuty");
  if (Object.keys(levyChange).length > 0) await store.saveLevies(levyChange, actorId);

  if (insurerId) {
    const { oldVersionId, newVersionId } = await store.publishRateVersion(String(insurerId), (current, insurerName) => {
      // A full replacement table wins; otherwise tweak individual fields of the live one
      // (or start from sensible defaults when the insurer has no live table yet).
      let next: Record<string, any> = rates ? JSON.parse(JSON.stringify(rates)) : current ?? {
        insurerName,
        motorComprehensiveRate: 4.0,
        motorTpoRate: 7500,
        medicalMultiplier: 1.0,
        medicalMaternityRate: 18000,
        medicalDentalOptRate: 8500,
        sumInsuredBands: [],
        vehicleTypes: [],
        riders: []
      };
      if (!rates) {
        if (motorComprehensiveRate !== undefined) {
          next.motorComprehensiveRate = Number(motorComprehensiveRate);
          if (next.vehicleTypes) {
            next.vehicleTypes = next.vehicleTypes.map((v: any) =>
              v.typeId === "saloon" || v.typeId === "suv" ? { ...v, rate: Number(motorComprehensiveRate) } : v);
          }
        }
        if (motorTpoRate !== undefined) next.motorTpoRate = Number(motorTpoRate);
        if (medicalMultiplier !== undefined) next.medicalMultiplier = Number(medicalMultiplier);
      }
      return next;
    }, actorId);

    addAuditLog({
      action: "RATE_TABLE_UPDATED",
      entityType: "rates",
      entityId: String(insurerId),
      actorId,
      actorType: "staff",
      details: {
        oldVersionId,
        newVersionId,
        changes: `Rates changed: motorComp: ${motorComprehensiveRate || 'unchanged'}%, TPO: ${motorTpoRate || 'unchanged'}, medMult: ${medicalMultiplier || 'unchanged'}x`
      }
    });
  }

  res.json({ success: true, db: await store.loadRatesDb() });
}));

// ----------------------------------------------------
// Admin API: Insurer Registry (admin-added underwriters, on top of the
// built-in insurer set already wired into the motor quote engine below)
// ----------------------------------------------------
// Quote-engine settings the front end needs to render its forms and the rates desk. They
// are served from here — never bundled into the site — so there is one copy to maintain.
router.get("/config", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json({
    otherLineCategories: OTHER_LINE_CATEGORIES,
    otherLineLiveCategoryIds: OTHER_LINE_LIVE_CATEGORY_IDS,
    medical: { memberAgeBands: MEMBER_AGE_BANDS, outpatientAgeBands: OUTPATIENT_AGE_BANDS },
  });
});

// The public insurer list: every insurer the site presents, one profile object each
// (profileComplete: false marks carriers that have no marketing profile, only a name and
// licensed classes — the rates desk lists them, the public insurer pages do not).
router.get("/insurers", asyncRoute(async (_req, res) => {
  res.json(await store.listInsurerProfiles());
}));

router.post("/insurers", requireStaff("insurer_rate.manage"), asyncRoute(async (req, res) => {
  const body = req.body ?? {};
  const id = (body.id || body.tradingName || body.name || "")
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  if (!id) {
    return res.status(400).json({ error: "Could not derive a valid insurer ID from the supplied name." });
  }

  const year = new Date().getFullYear();
  const { created, profile } = await store.upsertAdminInsurer({
    id,
    name: body.name || body.tradingName || id,
    tradingName: body.tradingName || body.name || id,
    logoEmoji: body.logoEmoji || "🏢",
    established: Number(body.established) || year,
    licenseYear: Number(body.licenseYear) || year,
    licenseStatus: body.licenseStatus || "Active",
    iraLicenseMotor: body.iraLicenseMotor || "Pending Registration",
    iraLicenseMedical: body.iraLicenseMedical || "Pending Registration",
    odpcRegistered: body.odpcRegistered !== undefined ? !!body.odpcRegistered : false,
    memberOfAibk: body.memberOfAibk !== undefined ? !!body.memberOfAibk : false,
    rating: body.rating || "Unrated (New Carrier)",
    strengthReason: body.strengthReason || "",
    availableProducts: Array.isArray(body.availableProducts) ? body.availableProducts : [],
    claimTurnaroundDays: Number(body.claimTurnaroundDays) || 7,
    emergencyPhone: body.emergencyPhone || "",
  });

  addAuditLog({
    action: created ? "INSURER_CREATED" : "INSURER_UPDATED",
    entityType: "insurer",
    entityId: id,
    actorId: (req as any).staff.staffId,
    actorType: "staff",
    details: { tradingName: profile.tradingName }
  });

  res.json({ success: true, insurer: profile, insurers: await store.listInsurerProfiles() });
}));

router.delete("/insurers/:id", requireStaff("insurer_rate.manage"), asyncRoute(async (req, res) => {
  if (!(await store.deleteAdminInsurer(req.params.id))) {
    return res.status(404).json({ error: "Insurer not found in the custom registry." });
  }
  addAuditLog({
    action: "INSURER_DELETED",
    entityType: "insurer",
    entityId: req.params.id,
    actorId: (req as any).staff.staffId,
    actorType: "staff",
    details: {}
  });
  res.json({ success: true, insurers: await store.listInsurerProfiles() });
}));

// ----------------------------------------------------
// Underwriter Logo Manager: lets staff upload/replace a carrier's logo for any
// insurer id (built-in or admin-added). The image itself is stored in the database
// (product.insurer_logos); InsurerLogo.tsx checks this map before falling back to the
// built-in image/SVG logos.
// ----------------------------------------------------
const ALLOWED_LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

router.get("/insurer-logos", asyncRoute(async (_req, res) => {
  res.json(await store.listLogos());
}));

router.post("/insurer-logos", requireStaff("insurer_rate.manage"), asyncRoute(async (req, res) => {
  const { insurerId, imageBase64, mimeType } = req.body ?? {};
  if (!insurerId || !imageBase64) {
    return res.status(400).json({ error: "Missing insurerId or image data." });
  }

  const match = String(imageBase64).match(/^data:([^;]+);base64,(.*)$/s);
  const type = String(match ? match[1] : mimeType || "image/png").toLowerCase().replace("image/jpg", "image/jpeg");
  if (!ALLOWED_LOGO_TYPES.has(type)) {
    return res.status(400).json({ error: "Logos must be PNG, JPEG, WebP or SVG images." });
  }
  const buffer = Buffer.from(match ? match[2] : String(imageBase64), "base64");
  if (buffer.length === 0 || buffer.length > MAX_LOGO_BYTES) {
    return res.status(400).json({ error: "Logo must be between 1 byte and 2 MB." });
  }

  const safeId = insurerId.toString().toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!safeId) {
    return res.status(400).json({ error: "Invalid insurerId." });
  }

  const entry = await store.saveLogo(safeId, type, buffer, (req as any).staff.staffId);
  addAuditLog({
    action: "INSURER_LOGO_UPDATED",
    entityType: "insurer",
    entityId: safeId,
    actorId: (req as any).staff.staffId,
    actorType: "staff",
    details: { mimeType: type, bytes: buffer.length }
  });

  res.json({ success: true, insurerId: safeId, src: entry.src });
}));

router.delete("/insurer-logos/:id", requireStaff("insurer_rate.manage"), asyncRoute(async (req, res) => {
  if (!(await store.deleteLogo(req.params.id))) {
    return res.status(404).json({ error: "No uploaded logo found for this insurer." });
  }
  addAuditLog({
    action: "INSURER_LOGO_REMOVED",
    entityType: "insurer",
    entityId: req.params.id,
    actorId: (req as any).staff.staffId,
    actorType: "staff",
    details: {}
  });
  res.json({ success: true });
}));

// ----------------------------------------------------
// API 1b: Other (non-motor, non-medical) Product Line quote intake
// ----------------------------------------------------
// Other-line submissions don't ask the customer to pick one underwriter (the same proposal
// gets shopped to several by staff), but staff still need to know at intake time which carriers
// are actually licensed for this IRA class. That comes straight from the insurer register
// in the database (product.insurers.authorized_classes), so it can never drift from it.

router.post("/other-line-quotes", asyncRoute(async (req, res) => {
  const { category, subType, answers, contactName, contactPhone, contactEmail } = req.body;

  if (!category || !subType || !answers) {
    return res.status(400).json({ error: "Missing category, subType, or answers." });
  }

  const categoryDef = OTHER_LINE_CATEGORIES.find((c) => c.id === category);
  if (!categoryDef) {
    return res.status(400).json({ error: `Unknown other-line category '${category}'.` });
  }

  // No single insurer is picked by the customer for these classes - the completed proposal form
  // is shared with several underwriters by staff for competing quotations, so every submission
  // is logged for underwriter placement rather than rated against one carrier's own book.
  // We still resolve which carriers are actually licensed for this IRA class, purely so staff
  // have a ready shortlist of who to approach.
  const eligibleUnderwriters = await store.licensedInsurerNames(categoryDef.code);

  const referenceNumber = `OL-${category.slice(0, 3).toUpperCase()}-${Date.now()}`;
  const record = {
    id: `oline-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    referenceNumber,
    timestamp: new Date().toISOString(),
    category,
    subType,
    eligibleUnderwriters,
    answers,
    status: "pending_underwriter_review" as const
  };
  await store.insertOtherLineRequest({
    id: record.id, referenceNumber, category, subType, status: record.status, eligibleUnderwriters, answers,
  });

  addAuditLog({
    action: "OTHER_LINE_QUOTE_SUBMITTED",
    entityType: "other_line_quote",
    entityId: record.id,
    actorId: "customer",
    actorType: "customer",
    details: { category, subType, referenceNumber, eligibleUnderwriters }
  });

  if (contactName && contactPhone) {
    sendLeadEmail({
      subject: `New Quote Request - ${category.charAt(0).toUpperCase() + category.slice(1)} (${contactName})`,
      html: `
        <h2>New Other Lines Quote Request</h2>
        <p><strong>Name:</strong> ${contactName}</p>
        <p><strong>Phone:</strong> ${contactPhone}</p>
        <p><strong>Email:</strong> ${contactEmail || "Not provided"}</p>
        <p><strong>Class:</strong> ${category} / ${subType}</p>
        <p><strong>Reference:</strong> ${referenceNumber}</p>
        <p><strong>Underwriters licensed for this class (share for competing quotes):</strong> ${eligibleUnderwriters.length ? eligibleUnderwriters.join(", ") : "None on file yet - verify licensing manually"}</p>
        <p><strong>Submitted details:</strong> ${JSON.stringify(answers)}</p>
      `
    }).catch(() => {});
  }

  res.json({ success: true, request: record });
}));

// ----------------------------------------------------
// API 2: Insurance Quote Calculation (Motor, Medical, Property)
// ----------------------------------------------------
router.post("/generate-quotes", asyncRoute(async (req, res) => {
  const { category, params } = req.body;

  if (!category) {
    return res.status(400).json({ error: "Missing quote category." });
  }

  // Load the live premium rate tables and the statutory levies in force from the database.
  const ratesDb: any = await store.loadActiveRatesDb();

  // Resolve active rates to preserve backward compatibility with existing formulas
  const activeRates = getActiveRatesList(ratesDb);
  ratesDb.rates = activeRates;

  // Which insurers get priced is data, not code: the quote pool in product.insurers (built-in
  // carriers in a fixed order, plus any staff added through the rates desk once they have
  // live rates). Jubilee (Medical only) and AAR (not licensed for classes 07/08) are simply not
  // in the pool, per their real IRA 2026 class licensing.
  const pool = await store.getQuotePool();

  // Publish toggle: staff can uncheck "Published for Public Quoting" per insurer in the
  // Database Rates Desk to pull them out of live customer-facing quoting without deleting their
  // rate configuration. Only insurers with an actual rate record on file are affected - one with
  // no active version yet falls back to prior default behavior rather than being silently hidden.
  const unpublishedInsurerIds = new Set(activeRates.filter((r: any) => r.isPublished === false).map((r: any) => r.insurerId));
  const insurers = pool.filter((ins) => !unpublishedInsurerIds.has(ins.id));

  let quotes: any[] = [];

  if (category === "motor") {
    if (!params) {
      return res.status(400).json({ error: "Missing quote parameters." });
    }
    if (!params.vehicleUse || params.vehicleUse.trim() === "") {
      return res.status(400).json({ error: "Missing required parameter: vehicleUse" });
    }
    if (!params.vehicleType || params.vehicleType.trim() === "") {
      return res.status(400).json({ error: "Missing required parameter: vehicleType" });
    }

    const isComp = params.coverType === "comprehensive";
    const selectedVehicleType = params.vehicleType;

    // Vehicle value only drives pricing for Comprehensive - TPO is a flat rate by usage
    // class regardless of vehicle value, so it's never collected or required for TPO.
    const val = Number(params.vehicleValue) || 0;
    if (isComp && (isNaN(val) || val <= 0)) {
      return res.status(400).json({ error: "Missing or invalid parameter: vehicleValue" });
    }

    quotes = insurers.map((ins, idx) => {
      // Locate the active version in the db to record its reference
      const activeVersion = ratesDb.versions?.find((v: any) => v.insurerId === ins.id && v.status === "active");
      
      if (!activeVersion) {
        logFallbackUsed(`Active rates config for motor insurer '${ins.id}' was missing. Using hardcoded defaults.`, {
          insurerId: ins.id,
          category: "motor"
        });
      }

      const rateVersionId = activeVersion ? activeVersion.id : "fallback-default";
      const rateSnapshot = activeVersion ? activeVersion.rates : {
        insurerName: ins.name,
        motorComprehensiveRate: 4.0,
        motorTpoRate: 7500,
        medicalMultiplier: 1.0,
        medicalMaternityRate: 18000,
        medicalDentalOptRate: 8500,
        sumInsuredBands: [],
        vehicleTypes: [],
        riders: []
      };

      // Lookup this underwriter's specific rates from the resolved snapshot/activeVersion
      const underwriterRates = activeVersion ? {
        insurerId: ins.id,
        insurerName: ins.name,
        ...activeVersion.rates
      } : (ratesDb.rates?.find((r: any) => r.insurerId === ins.id) || {
        motorTpoRate: 7500,
        sumInsuredBands: [],
        vehicleTypes: [],
        riders: []
      });

      // Per-class publish toggle: staff can disable a specific vehicle class/cover-type
      // combination for this insurer (e.g. Directline Motor Private Comprehensive) without
      // touching the insurer-wide "Published for Public Quoting" toggle above, which affects
      // every class at once. Returning null here (filtered out below) means the quote doesn't
      // appear at all - not shown as declined - matching the insurer-wide toggle's behavior.
      const classStatus = underwriterRates.classPublishStatus?.[params.vehicleUse];
      const coverKey = isComp ? "comprehensive" : "tpo";
      if (classStatus && classStatus[coverKey] === false) {
        return null;
      }

      let basePremium = 0;
      let finalRateUsed = 0;
      let isDeclined = false;
      let declineReason = "";
      let appliedMinPremium = 0;
      let isMinPremiumTriggered = false;
      let isHighExposureApplied = false;
      let highExposureNote = "";
      let isTonnageApplied = false;

      // Rider costs tracking
      let excessProtectorCost = 0;
      let pvtCost = 0;
      let windscreenCost = 0;
      let windscreenLimit = 50000;
      // "included": bundled free into this underwriter's base rate regardless of selection.
      // "selected": customer opted in and the underwriter charged an additional premium for it.
      // "available": underwriter offers it at additional cost but the customer did not opt in.
      // "unavailable": underwriter doesn't publish this rider at all.
      let excessProtectorStatus: "included" | "selected" | "available" | "unavailable" = "unavailable";
      let pvtStatus: "included" | "selected" | "available" | "unavailable" = "unavailable";

      const levies = ratesDb.levies || { pcfRate: 0.0025, itlRate: 0.002, stampDuty: 40 };

      // Check if this underwriter has specific comprehensive rates for this usage class
      let hasSpecificCommercialRate = false;
      let commercialRateBands: any[] = [];
      let commercialMinPremium = 0;
      // Tonnage is how underwriters actually tier commercial goods/cartage rates (both
      // comprehensive and TPO) per the binder terms - up to 3T, 3-8T, 8-20T etc. carry
      // different rates/min premiums, not just a single flat rate for the whole class.
      let commercialTonnageBands: any[] = [];

      if (underwriterRates.commercialRates && underwriterRates.commercialRates[params.vehicleUse]) {
        hasSpecificCommercialRate = true;
        commercialRateBands = underwriterRates.commercialRates[params.vehicleUse].bands || [];
        commercialMinPremium = underwriterRates.commercialRates[params.vehicleUse].minPremium || 0;
        commercialTonnageBands = underwriterRates.commercialRates[params.vehicleUse].tonnageBands || [];
      }

      // Apply a provisional, clearly-labeled loading factor when no usageClass-specific entry exists.
      // (100% of underwriters currently lack usageClass data in the database, so we apply this consistently)
      let isProvisionalRate = false;
      let provisionalLoadingFactor = 1.0;

      if (isComp) {
        if (hasSpecificCommercialRate) {
          provisionalLoadingFactor = 1.0;
          isProvisionalRate = false;
        } else if (params.vehicleUse === "commercial_goods") {
          provisionalLoadingFactor = 1.25;
          isProvisionalRate = true;
        } else if (params.vehicleUse === "psv_chaufeur") {
          provisionalLoadingFactor = 1.4;
          isProvisionalRate = true;
        } else if (params.vehicleUse === "private") {
          provisionalLoadingFactor = 1.0;
          isProvisionalRate = false;
        } else {
          isDeclined = true;
          declineReason = `The vehicle usage class '${params.vehicleUse || "unknown"}' is excluded from automated online ratings for Comprehensive cover. Specialized or high-risk classes (such as motorcycle, tricycle, or commercial cartage) require customized manual review.`;
        }
      } else {
        // TPO cover type: no decline for any usage class.
        // If the usage class is anything other than "private", it uses fallback placeholder estimates and is marked provisional.
        if (params.vehicleUse === "private") {
          isProvisionalRate = false;
        } else {
          isProvisionalRate = true;
        }
        provisionalLoadingFactor = 1.0;

        const allowedTpoClasses = ["private", "commercial_goods", "psv_chaufeur", "commercial_general_cartage", "institutional", "motorcycle", "tricycle"];
        if (!allowedTpoClasses.includes(params.vehicleUse)) {
          isDeclined = true;
          declineReason = `The vehicle usage class '${params.vehicleUse || "unknown"}' is not supported for third-party cover.`;
        }
      }

      if (isComp) {
        // 1. Check vehicle type eligibility
        const vTypeConfig = underwriterRates.vehicleTypes?.find((v: any) => v.typeId === selectedVehicleType);
        if (vTypeConfig && vTypeConfig.allowedComprehensive === false) {
          isDeclined = true;
          declineReason = `Comprehensive cover declined by underwriter: ${vTypeConfig.typeName} is excluded under their risk guidelines.`;
        }

        // 1b. Check vehicle age against this underwriter's own maximum age for
        // automated comprehensive rating (staff-configurable per insurer in the
        // rates desk; defaults to 15 years when the underwriter hasn't set one).
        if (!isDeclined && typeof params.mfgYear === "number" && params.mfgYear > 1900) {
          const maxVehicleAge = typeof underwriterRates.maxVehicleAgeComprehensive === "number" ? underwriterRates.maxVehicleAgeComprehensive : 15;
          const vehicleAge = new Date().getFullYear() - params.mfgYear;
          if (vehicleAge > maxVehicleAge) {
            isDeclined = true;
            declineReason = `Comprehensive cover declined: vehicle manufactured in ${params.mfgYear} (${vehicleAge} years old) exceeds this underwriter's maximum age of ${maxVehicleAge} years for automated comprehensive rating.`;
          }
        }

        if (!isDeclined) {
          // 1c. Check for a high-exposure unit override - specific make/model combinations that
          // this underwriter rates differently from their standard sum-insured schedule (certain
          // high-theft or high-claims models). Staff-configurable per insurer in the Rates Desk;
          // matched case-insensitively, and an entry's model is optional (omitted = applies to
          // every model of that make). An entry may also scope itself to a sum-insured range
          // (e.g. only override the rate for this model above Kshs 3M) - minValue/maxValue are
          // optional, so an entry with neither applies at any value. Takes precedence over every
          // other rate source below - it's a named-unit override, not just another schedule tier.
          let highExposureMatch: any = null;
          if (underwriterRates.highExposureUnits?.length && params.vehicleMake) {
            const makeInput = String(params.vehicleMake).trim().toLowerCase();
            const modelInput = String(params.vehicleModel || "").trim().toLowerCase();
            highExposureMatch = underwriterRates.highExposureUnits.find((u: any) =>
              // Scoped to the specific motor class it was configured under (e.g. Motor Private) -
              // an entry with no vehicleClass set predates this scoping and is treated as Private
              // only, since that was the sole class this feature was ever configured for before.
              (u.vehicleClass || "private") === params.vehicleUse &&
              String(u.make || "").trim().toLowerCase() === makeInput &&
              (!u.model || String(u.model).trim().toLowerCase() === modelInput) &&
              (typeof u.minValue !== "number" || val >= u.minValue) &&
              (typeof u.maxValue !== "number" || val <= u.maxValue)
            );
          }

          // 2. Resolve rating: a high-exposure override takes precedence, then specific vehicle
          // body type rating, falling back to sumInsuredBands if neither is defined.
          // Track whichever sum-insured band actually matched (high-exposure, commercial, or
          // private) so its own minPremium can be applied below - underwriters commonly charge a
          // different minimum premium per bracket (e.g. Heritage: Kshs 50,000 min under 1M, Kshs
          // 87,500 min above 3M), not one flat minimum across every bracket.
          let matchingBand: any = null;
          if (highExposureMatch) {
            finalRateUsed = highExposureMatch.rate;
            matchingBand = highExposureMatch;
            isHighExposureApplied = true;
            highExposureNote = highExposureMatch.note || `${params.vehicleMake}${highExposureMatch.model ? " " + highExposureMatch.model : ""} is rated as a high-exposure unit by this underwriter.`;
          } else if (hasSpecificCommercialRate && commercialTonnageBands.length > 0 && typeof params.vehicleTonnage === "number") {
            // Tonnage-tiered rating takes precedence over the sum-insured band for this class,
            // when the underwriter has tonnage brackets configured and the customer supplied one.
            matchingBand = commercialTonnageBands.find((b: any) => params.vehicleTonnage! >= b.minTons && params.vehicleTonnage! <= b.maxTons);
            if (matchingBand && typeof matchingBand.rate === "number") {
              finalRateUsed = matchingBand.rate;
              isTonnageApplied = true;
            } else {
              // Tonnage fell outside every configured bracket - fall back to the sum-insured
              // band rather than declining outright, since that's still a valid rate source.
              matchingBand = commercialRateBands.find((b: any) => val >= b.min && val <= b.max);
              if (matchingBand && typeof matchingBand.rate === "number") {
                finalRateUsed = matchingBand.rate;
              } else {
                isDeclined = true;
                declineReason = `Rate not configured for the specified tonnage or sum-insured for Commercial ${params.vehicleUse}`;
              }
            }
          } else if (hasSpecificCommercialRate) {
            matchingBand = commercialRateBands.find((b: any) => val >= b.min && val <= b.max);
            if (matchingBand && typeof matchingBand.rate === "number") {
              finalRateUsed = matchingBand.rate;
            } else {
              isDeclined = true;
              declineReason = `Rate not configured in the specified sum-insured band for Commercial ${params.vehicleUse}`;
            }
          } else if (vTypeConfig && typeof vTypeConfig.rate === "number") {
            finalRateUsed = vTypeConfig.rate;
          } else {
            matchingBand = underwriterRates.sumInsuredBands?.find((b: any) => val >= b.min && val <= b.max);
            if (matchingBand && typeof matchingBand.rate === "number") {
              finalRateUsed = matchingBand.rate;
            } else {
              isDeclined = true;
              declineReason = "Rate not configured for this usage/vehicle combination";
            }
          }

          if (!isDeclined) {
            // 3. Compute initial rate premium
            const calculatedBase = Math.round(val * (finalRateUsed / 100));
            basePremium = Math.round(calculatedBase * provisionalLoadingFactor);

            // 4. Check & apply minimum premium rules. The matched band's own minPremium (bracket-
            // specific) takes precedence; insurers not yet migrated to band-level minimums fall
            // back to the older flat per-class/per-body-type minimum so they keep working unchanged.
            const bandMinPremium = typeof matchingBand?.minPremium === "number" ? matchingBand.minPremium : null;
            appliedMinPremium = hasSpecificCommercialRate
              ? bandMinPremium ?? commercialMinPremium
              : bandMinPremium ?? (vTypeConfig?.minPremium || 0);
            if (appliedMinPremium && basePremium < appliedMinPremium) {
              basePremium = appliedMinPremium;
              isMinPremiumTriggered = true;
            }

            // 5. Riders calculation - inclusive riders are bundled free into the base
            // rate regardless of whether the customer opted in (they have no choice
            // in the matter and already get the benefit); non-inclusive riders only
            // cost extra when the customer explicitly opts in via the checkbox.
            if (underwriterRates.riders) {
              // Some underwriters (e.g. Geminia) bundle Excess Protector/PVT free at low sum-insured
              // values but charge for it above a threshold - real binder terms show this as a flag on
              // the matched sum-insured/tonnage band itself (isExcessProtectorInclusive/isPvtInclusive),
              // not a fixed insurer-wide toggle. Checking matchingBand here (already shared across the
              // Private/Commercial/tonnage/high-exposure lookup above) means any insurer's admin can
              // set this per range without new schema surface, and it works for every vehicle class.
              const epConfig = underwriterRates.riders.find((r: any) => r.riderId === "excess_protector");
              if (epConfig) {
                if (matchingBand?.isExcessProtectorInclusive === true || epConfig.isInclusive || epConfig.status === "unsourced_fully_inclusive") {
                  excessProtectorStatus = "included";
                  excessProtectorCost = 0;
                } else if (params.excessProtector) {
                  if (typeof epConfig.minPremium !== "number" || typeof epConfig.rate !== "number") {
                    isDeclined = true;
                    declineReason = "Excess protector rate or minimum premium not configured for this underwriter";
                  } else {
                    excessProtectorCost = Math.max(Math.round(val * (epConfig.rate / 100)), epConfig.minPremium);
                    excessProtectorStatus = "selected";
                  }
                } else {
                  excessProtectorStatus = "available";
                }
              }
              if (!isDeclined) {
                const pvtConfig = underwriterRates.riders.find((r: any) => r.riderId === "pvt");
                if (pvtConfig) {
                  if (matchingBand?.isPvtInclusive === true || pvtConfig.isInclusive || pvtConfig.status === "unsourced_fully_inclusive") {
                    pvtStatus = "included";
                    pvtCost = 0;
                  } else if (params.pvt) {
                    if (typeof pvtConfig.minPremium !== "number" || typeof pvtConfig.rate !== "number") {
                      isDeclined = true;
                      declineReason = "Political Violence & Terrorism rate or minimum premium not configured for this underwriter";
                    } else {
                      pvtCost = Math.max(Math.round(val * (pvtConfig.rate / 100)), pvtConfig.minPremium);
                      pvtStatus = "selected";
                    }
                  } else {
                    pvtStatus = "available";
                  }
                }
              }
              if (params.windscreen && !isDeclined) {
                const rConfig = underwriterRates.riders.find((r: any) => r.riderId === "windscreen");
                if (rConfig) {
                  if (rConfig.limitType === "threshold") {
                    const thresholds = rConfig.thresholds;
                    const matchingThreshold = thresholds?.find((t: any) => val >= t.min && val <= t.max);
                    if (matchingThreshold) {
                      windscreenLimit = matchingThreshold.limit;
                      const minPrem = typeof rConfig.minPremium === "number" ? rConfig.minPremium : 0;
                      windscreenCost = Math.max(Math.round(windscreenLimit * (rConfig.rate / 100)), minPrem);
                    } else {
                      isDeclined = true;
                      declineReason = "Windscreen limit not configured for this sum-insured range";
                    }
                  } else {
                    // Standard windscreen sub-limit/declared limit depending on body type from rates DB
                    const limits = rConfig.limits;
                    const configLimit = (limits && typeof limits === "object") ? limits[selectedVehicleType] : undefined;
                    if (configLimit === undefined || configLimit === null) {
                      isDeclined = true;
                      declineReason = "Windscreen sub-limit not configured for this vehicle type";
                    } else {
                      windscreenLimit = configLimit;
                      // Deliberate exception: windscreen has no sourced minimum premium across all Kenyan underwriters, so we default to 0 floor.
                      const minPrem = typeof rConfig.minPremium === "number" ? rConfig.minPremium : 0;
                      windscreenCost = Math.max(Math.round(windscreenLimit * (rConfig.rate / 100)), minPrem);
                    }
                  }
                }
              }
            }
          }
        }
      } else {
        // TPO flat rate
        if (!isDeclined) {
          // Check if underwriter has customized tpoRates for different usage classes in database, fallback to flat TPO
          const tpoRates = underwriterRates.tpoRates || {
            private: underwriterRates.motorTpoRate || 7500,
            commercial_goods: 10000,
            psv_chaufeur: 12500,
            motorcycle: 3500,
            tricycle: 5000,
            commercial_general_cartage: 15000,
            institutional: 15000
          };
          const flatTpo = tpoRates[params.vehicleUse] || underwriterRates.motorTpoRate || (7500 + idx * 250);

          // Tonnage-tiered TPO takes precedence for commercial_goods/commercial_general_cartage
          // when the underwriter has tonnage tiers configured and the customer supplied one -
          // TPO premiums for these classes are commonly set per tonnage bracket, not one flat
          // figure for the whole usage class (e.g. up to 3T vs 3-8T vs 8-20T).
          const tonnageTiers = underwriterRates.tpoTonnageRates?.[params.vehicleUse] as any[] | undefined;
          let tonnageTpo: number | null = null;
          if (tonnageTiers?.length && typeof params.vehicleTonnage === "number") {
            const tier = tonnageTiers.find((t: any) => params.vehicleTonnage! >= t.minTons && params.vehicleTonnage! <= t.maxTons);
            if (tier && typeof tier.premium === "number") {
              tonnageTpo = tier.premium;
              isTonnageApplied = true;
            }
          }

          basePremium = tonnageTpo ?? flatTpo; // Used flat as-is without loading factor or multiplier!
        }
      }

      // Add base premium plus all active riders
      const grossPremium = basePremium + excessProtectorCost + pvtCost + windscreenCost;

      // Standard levies in Kenya loaded from database applied on gross
      const pcf = isDeclined ? 0 : Math.round(grossPremium * levies.pcfRate);
      const trainingLevy = isDeclined ? 0 : Math.round(grossPremium * levies.itlRate);
      const stampDuty = isDeclined ? 0 : levies.stampDuty;
      const totalPremium = isDeclined ? 0 : grossPremium + pcf + trainingLevy + stampDuty;

      // Broker recommended rules: Highlight ICEA LION or Jubilee
      let isRecommended = false;
      let recommendationReason = "";
      if (!isDeclined && !isProvisionalRate) {
        if (ins.id === "icea" && isComp) {
          isRecommended = true;
          recommendationReason = "Broadest medical/towing limits, no excess on windscreen claims, premium underwriter status.";
        } else if (ins.id === "jubilee" && !isComp) {
          isRecommended = true;
          recommendationReason = "Instant digital certificates & 24/7 dedicated client rescue assistance.";
        }
      }

      const typeLabel = selectedVehicleType === "saloon" ? "Saloon"
                     : selectedVehicleType === "suv" ? "SUV/Luxury"
                     : selectedVehicleType === "pickup" ? "Commercial Pickup"
                     : "Sports Car";

      // Default (not explicitly selected) windscreen/radio limits shown in mainBenefits -
      // previously hardcoded to "50,000 included" for every insurer regardless of their
      // actual configured limit, so a corrected per-insurer figure never reached the
      // customer unless they separately ticked the windscreen add-on. Resolves the same
      // way the optional-addon path above does (body-type limit, or threshold band),
      // falling back to 50,000 only when this insurer has no windscreen rider configured.
      let includedWindscreenLimit = 50000;
      const windscreenRiderConfig = underwriterRates.riders?.find((r: any) => r.riderId === "windscreen");
      if (windscreenRiderConfig) {
        if (windscreenRiderConfig.limitType === "threshold") {
          const matchingThreshold = windscreenRiderConfig.thresholds?.find((t: any) => val >= t.min && val <= t.max);
          if (matchingThreshold) includedWindscreenLimit = matchingThreshold.limit;
        } else if (windscreenRiderConfig.limits && typeof windscreenRiderConfig.limits === "object") {
          const configLimit = windscreenRiderConfig.limits[selectedVehicleType];
          if (typeof configLimit === "number") includedWindscreenLimit = configLimit;
        }
      }
      const radioRiderConfig = underwriterRates.riders?.find((r: any) => r.riderId === "radio");

      return {
        id: `quote-${Date.now()}-${idx}-${Math.floor(Math.random() * 1000)}`,
        rateVersionId,
        rateSnapshot,
        insurerName: ins.name,
        insurerId: ins.id,
        rating: ins.rating,
        sumInsured: val,
        basePremium: isDeclined ? 0 : basePremium,
        pcf,
        trainingLevy,
        stampDuty,
        totalPremium,
        isDeclined,
        declineReason,
        finalRateUsed,
        appliedMinPremium,
        isMinPremiumTriggered,
        isHighExposureApplied,
        highExposureNote: isHighExposureApplied ? highExposureNote : undefined,
        isTonnageRated: isTonnageApplied,
        vehicleTypeLabel: typeLabel,
        vehicleUse: params.vehicleUse,
        vehicleType: selectedVehicleType,
        isProvisionalRate,
        provisionalLoadingFactor,
        riderBreakdown: {
          excessProtector: isDeclined ? 0 : excessProtectorCost,
          pvt: isDeclined ? 0 : pvtCost,
          windscreen: isDeclined ? 0 : windscreenCost
        },
        riderStatus: isDeclined || !isComp ? undefined : {
          excessProtector: excessProtectorStatus,
          pvt: pvtStatus
        },
        excessTerms: isDeclined
          ? "Not applicable (Quote declined)"
          : (isComp
              ? `Non-Standard: 2.5% of value (Min KES 15,000). ${
                  excessProtectorStatus === "included"
                    ? "Excess Protector is included at no extra cost and cuts general road excess to NIL."
                    : excessProtectorStatus === "selected"
                    ? "Excess Protector rider (ACTIVE) cuts general road excess to NIL."
                    : excessProtectorStatus === "available"
                    ? "Excess Protector available as an optional rider (not selected) to cut general road excess to NIL."
                    : "Excess Protector rider not offered by this underwriter."
                }`
              : "No excess applicable to third-party only policies."),
        mainBenefits: isDeclined
          ? []
          : (isComp
              ? [
                  `Windscreen Extension Limit: KES ${(params.windscreen ? windscreenLimit : includedWindscreenLimit).toLocaleString()} included`,
                  ...(radioRiderConfig && typeof radioRiderConfig.freeLimit === "number"
                    ? [`Radio & Entertainment Unit Limit: KES ${radioRiderConfig.freeLimit.toLocaleString()} included`]
                    : []),
                  `Excess Protector Protection: ${
                    excessProtectorStatus === "included" ? "YES - Included at no extra cost (Nil excess on own damage)" :
                    excessProtectorStatus === "selected" ? "YES - Added as rider (Nil excess on own damage)" :
                    excessProtectorStatus === "available" ? "Available as optional add-on (not selected)" :
                    "Not offered by this underwriter"
                  }`,
                  `Political Violence & PVT: ${
                    pvtStatus === "included" ? "YES - Included at no extra cost" :
                    pvtStatus === "selected" ? "YES - Added as rider (Fully covered)" :
                    pvtStatus === "available" ? "Available as optional add-on (not selected)" :
                    "Not offered by this underwriter"
                  }`,
                  "Authorized Medical Expense up to KES 50,000",
                  "24-Hour Accident Towing rescue"
                ]
              : [
                  "Third Party Bodily Injury: Unlimited coverage under Kenyan Cap 405",
                  "Third Party Property Damage: up to KES 5,000,000",
                  "Emergency Medical Costs covered up to KES 25,000",
                  "Standard basic cover note immediate dispatch"
                ]),
        waitingPeriod: isDeclined ? "N/A" : "Immediate cover note issuance upon approval",
        isRecommended,
        recommendationReason,
        priceTag: (isDeclined || isProvisionalRate) ? "" : (idx === 5 ? "Lowest Premium" : (isRecommended ? "Best Value" : ""))
      };
    }).filter((q) => q !== null);
  } else if (category === "medical") {
    // Call the calculator passing down the dynamic loaded rates database
    const rawQuotes = calculateDynamicMedicalQuotes(params, ratesDb);
    quotes = rawQuotes.map((q: any, idx: number) => {
      const activeVersion = ratesDb.versions?.find((v: any) => v.insurerId === q.insurerId && v.status === "active");
      
      if (!activeVersion) {
        logFallbackUsed(`Active rates config for medical insurer '${q.insurerId}' was missing. Using hardcoded defaults.`, {
          insurerId: q.insurerId,
          category: "medical"
        });
      }

      return {
        id: `quote-${Date.now()}-${idx}-${Math.floor(Math.random() * 1000)}`,
        rateVersionId: activeVersion ? activeVersion.id : "fallback-default",
        rateSnapshot: activeVersion ? activeVersion.rates : { medicalMultiplier: 1.0 },
        ...q
      };
    });
  }

  // Forward a lead notification for every completed calculation - even before OTP verification,
  // since the contact fields on the motor/medical forms are already required inputs at this point.
  const contactName = category === "motor" ? params?.ownerName : params?.principalName;
  const contactPhone = category === "motor" ? params?.ownerPhone : params?.principalPhone;
  const contactEmail = category === "motor" ? params?.ownerEmail : params?.principalEmail;
  if (contactName && contactPhone) {
    const activeQuotes = quotes.filter((q: any) => !q.isDeclined);
    const cheapest = activeQuotes.length > 0 ? activeQuotes.reduce((a: any, b: any) => (b.totalPremium < a.totalPremium ? b : a)) : null;
    sendLeadEmail({
      subject: `New Quote Request - ${category === "motor" ? "Motor" : "Medical"} (${contactName})`,
      html: `
        <h2>New ${category === "motor" ? "Motor" : "Medical"} Quote Request</h2>
        <p><strong>Name:</strong> ${contactName}</p>
        <p><strong>Phone:</strong> ${contactPhone}</p>
        <p><strong>Email:</strong> ${contactEmail || "Not provided"}</p>
        <p><strong>Quotes generated:</strong> ${activeQuotes.length} of ${quotes.length} carriers</p>
        ${cheapest ? `<p><strong>Lowest premium:</strong> ${cheapest.insurerName} - KES ${cheapest.totalPremium.toLocaleString()}</p>` : ""}
        <p><strong>Parameters:</strong> ${JSON.stringify(params)}</p>
      `
    }).catch(() => {});
  }

  res.json({ quotes });
}));

// Fired once a customer picks a specific carrier's offer and completes OTP verification
// (download quote sheet or proceed to buy) - a higher-intent signal than the raw calculation
// above, with verified contact details from the auth step.
router.post("/quote-selected", (req, res) => {
  const { action, category, contactName, contactPhone, contactEmail, offer } = req.body;

  if (!contactName || !contactPhone || !offer) {
    return res.status(400).json({ error: "Missing contactName, contactPhone, or offer." });
  }

  sendLeadEmail({
    subject: `Quote Selected (${action === "buy" ? "Buy & Bind" : "Download"}) - ${offer.insurerName} (${contactName})`,
    html: `
      <h2>Quote Selected - ${action === "buy" ? "Proceeding to Buy & Bind" : "Downloaded Quotation PDF"}</h2>
      <p><strong>Name:</strong> ${contactName}</p>
      <p><strong>Phone:</strong> ${contactPhone}</p>
      <p><strong>Email:</strong> ${contactEmail || "Not provided"}</p>
      <p><strong>Category:</strong> ${category}</p>
      <p><strong>Selected Carrier:</strong> ${offer.insurerName}</p>
      <p><strong>Total Premium:</strong> KES ${Number(offer.totalPremium || 0).toLocaleString()}</p>
    `
  }).catch(() => {});

  addAuditLog({
    action: "QUOTE_SELECTED",
    entityType: "quote",
    entityId: offer.insurerId || "unknown",
    actorId: "customer",
    actorType: "customer",
    details: { action, category, insurerName: offer.insurerName, totalPremium: offer.totalPremium }
  });

  res.json({ success: true });
});

// ----------------------------------------------------
// Email OTP verification - used to confirm a prospective customer's contact
// details before releasing a final quotation PDF or proceeding to buy/bind.
// Codes are generated and checked server-side (in-memory, 10-minute expiry)
// and delivered by email via the same SMTP infra as lead notifications -
// nothing is ever echoed back to the client in the API response.
// ----------------------------------------------------
const OTP_MESSAGES: Record<Exclude<store.OtpResult, "ok">, string> = {
  none: "No verification code was requested for this email. Please request a new one.",
  expired: "This code has expired. Please request a new one.",
  wrong: "Incorrect verification code.",
  locked: "Too many incorrect attempts. Please request a new code.",
};

router.post("/auth/send-otp", asyncRoute(async (req, res) => {
  const { name, email, phone } = req.body ?? {};
  if (!name || !email || !phone) {
    return res.status(400).json({ error: "Please provide your name, email, and phone number." });
  }
  const code = store.newOtpCode();
  await store.issueOtp(String(email).trim().toLowerCase(), code);

  const result = await sendTransactionalEmail(
    email,
    "Your Utmost Insurance Brokers verification code",
    `<p>Hello ${String(name).replace(/[<>&]/g, "")},</p><p>Your verification code is:</p><h2 style="letter-spacing:4px;">${code}</h2><p>This code expires in 10 minutes. If you did not request this, you can ignore this email.</p>`
  );
  if (!result.sent) {
    console.log(`[otp:dev-fallback] Verification code for ${email}: ${code}`);
  }
  return res.json({ sent: true, emailConfigured: SMTP_CONFIGURED });
}));

router.post("/auth/verify-otp", asyncRoute(async (req, res) => {
  const { email, code } = req.body ?? {};
  if (!email || !code) {
    return res.status(400).json({ error: "Missing email or verification code." });
  }
  const result = await store.checkOtp(String(email).trim().toLowerCase(), String(code).trim());
  if (result !== "ok") return res.status(400).json({ error: OTP_MESSAGES[result] });
  return res.json({ verified: true });
}));

// ----------------------------------------------------
// Buy & Bind - registers a real cover-note request once a customer picks an
// offer and completes OTP verification. This is a broker-side placeholder
// record (not a bound policy): it captures the request, assigns a reference
// number, and notifies the claims/underwriting desk by email so a staff
// member can follow up on payment and formal cover note issuance.
// ----------------------------------------------------
router.post("/cover-notes", async (req, res) => {
  try {
    const { category, offer, contactName, contactPhone, contactEmail, paymentMethod, financeMonths } = req.body;
    if (!offer || !contactName || !contactPhone) {
      return res.status(400).json({ error: "Missing contact details or selected offer." });
    }

    const coverNoteRef = `UTM-CVN-${Math.floor(100000 + Math.random() * 900000)}`;
    const newItem = {
      id: coverNoteRef,
      timestamp: new Date().toISOString(),
      status: "Pending Payment Confirmation",
      category,
      insurerId: offer.insurerId,
      insurerName: offer.insurerName,
      totalPremium: offer.totalPremium,
      paymentMethod: paymentMethod === "ipf" ? "ipf" : "full",
      financeMonths: paymentMethod === "ipf" ? financeMonths : undefined,
      contactName,
      contactPhone,
      contactEmail
    };
    await store.insertCoverNote({
      id: newItem.id,
      status: newItem.status,
      category: category ?? null,
      insurerId: offer.insurerId ?? null,
      insurerName: offer.insurerName ?? null,
      totalPremiumKes: Number.isFinite(Number(offer.totalPremium)) ? Number(offer.totalPremium) : null,
      paymentMethod: newItem.paymentMethod,
      financeMonths: newItem.paymentMethod === "ipf" && Number.isInteger(Number(financeMonths)) ? Number(financeMonths) : null,
      contactName,
      contactPhone,
      contactEmail: contactEmail ?? null,
    });

    addAuditLog({
      action: "COVER_NOTE_REQUESTED",
      entityType: "cover_note",
      entityId: coverNoteRef,
      actorId: "customer",
      actorType: "customer",
      details: { insurerName: newItem.insurerName, totalPremium: newItem.totalPremium, paymentMethod: newItem.paymentMethod }
    });

    sendLeadEmail({
      subject: `Buy & Bind Cover Note Requested - ${coverNoteRef}`,
      html: `
        <h2>Cover Note Requested</h2>
        <p><strong>Reference:</strong> ${coverNoteRef}</p>
        <p><strong>Client:</strong> ${contactName} (${contactPhone}${contactEmail ? `, ${contactEmail}` : ""})</p>
        <p><strong>Category:</strong> ${category}</p>
        <p><strong>Insurer:</strong> ${newItem.insurerName}</p>
        <p><strong>Total Premium:</strong> KES ${Number(newItem.totalPremium || 0).toLocaleString()}</p>
        <p><strong>Payment method:</strong> ${newItem.paymentMethod === "ipf" ? `IPF financed over ${newItem.financeMonths} months` : "Full / annual payment"}</p>
        <p>Awaiting M-Pesa STK push payment confirmation and finance/underwriting follow-up to issue the final cover note documents.</p>
      `
    }).catch(() => {});

    return res.json({ coverNoteRef, status: newItem.status });
  } catch (error: any) {
    console.error("Error in /api/cover-notes:", error);
    return res.status(500).json({ error: error.message || "Failed to register the cover note request." });
  }
});
router.post("/quotes", asyncRoute(async (req, res) => {
  // This route is public, so the caller can't choose the record's identity:
  // id, timestamp and who it is assigned to / created by are always set here.
  const { id: _id, timestamp: _timestamp, assignedStaffId: _assignee, createdByStaffId: _creator, assignmentHistory: _history, ...reqData } = (req.body ?? {}) as Record<string, any>;
  
  // Normalize totalPremium to totalPremiumKES
  if (reqData.totalPremium !== undefined && reqData.totalPremiumKES === undefined) {
    reqData.totalPremiumKES = reqData.totalPremium;
    delete reqData.totalPremium;
  }
  
  // Self-service quotes are assigned to the first active underwriter in the ERP's staff table.
  reqData.assignedStaffId = (await store.defaultUnderwriterId()) ?? "staff-1";
  reqData.assignmentHistory = [
    {
      staffId: reqData.assignedStaffId,
      assignedBy: "system",
      assignedAt: new Date().toISOString(),
      reason: "Initial assignment on quote calculation"
    }
  ];

  const newItem: Record<string, any> = { ...reqData, id: `quote-pers-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`, timestamp: new Date().toISOString() };
  await store.insertCustomerQuote(newItem);
  addAuditLog({
    action: "QUOTE_CALCULATED",
    entityType: "quote",
    entityId: newItem.id,
    actorId: "customer",
    actorType: "customer",
    details: {
      rateVersionId: newItem.rateVersionId,
      totalPremiumKES: newItem.totalPremiumKES
    }
  });
  res.json(newItem);
}));

// 7. Claim endpoints
router.get("/claims", requireStaffAuth, asyncRoute(async (_req, res) => {
  res.json(await store.listClaimsForDesk());
}));

// 13. ComplianceAuditLog endpoints (append-only ledger: no PATCH or DELETE endpoint at all!)
router.get("/compliance-logs", requireStaff("audit.view"), asyncRoute(async (_req, res) => {
  res.json(await store.listAuditLog());
}));
router.post("/compliance-logs", requireStaffAuth, asyncRoute(async (req, res) => {
  const { action, entityType, entityId, details } = req.body ?? {};
  if (!action || !entityType || !entityId) {
    return res.status(400).json({ error: "Missing required compliance log fields" });
  }
  // A staff member can only ever log as themselves, as staff.
  const entry = { action: String(action).slice(0, 80), entityType: String(entityType).slice(0, 80), entityId: String(entityId).slice(0, 120), actorId: (req as any).staff.staffId, actorType: "staff" as const, details };
  await store.recordAudit(entry);
  res.json({ timestamp: new Date().toISOString(), ...entry });
}));

// 14. RoomScanResult endpoints
router.get("/room-scans", requireStaffAuth, asyncRoute(async (_req, res) => {
  res.json(await store.listRoomScans());
}));

// ----------------------------------------------------
// Customer Claims Submission helper integration (Dual Support)
// ----------------------------------------------------
router.post("/submit-claim", asyncRoute(async (req, res) => {
  const { policyNumber, claimType, phoneNumber, description, claimantName, photoBase64, photoName, photoMimeType } = req.body;

  if (!policyNumber || !claimType || !phoneNumber) {
    return res.status(400).json({ error: "Required fields missing for claims notification." });
  }

  // The notification becomes a real claim in the ERP (claims.claims, with its timeline and
  // workflow case), linked to the policy when the number matches one — not a copy in a side file.
  const { claim } = await store.registerCustomerClaim({
    policyNumber: String(policyNumber).slice(0, 60),
    claimType: String(claimType).slice(0, 120),
    phoneNumber: String(phoneNumber).slice(0, 40),
    description: String(description || "").slice(0, 4000),
  });
  const claimId = claim.id;
  const timestamp = claim.createdAt.toISOString();

  addAuditLog({
    action: "CLAIM_SUBMITTED",
    entityType: "claim",
    entityId: claimId,
    actorId: "customer",
    actorType: "customer",
    details: { policyNumber, claimType, phoneNumber }
  });

  sendLeadEmail({
    subject: `New Claim Submitted - ${claimType} (${claimId})`,
    html: `
      <h2>New Claim Notification</h2>
      <p><strong>Claim ID:</strong> ${claimId}</p>
      <p><strong>Claimant:</strong> ${claimantName || "Not provided"}</p>
      <p><strong>Phone:</strong> ${phoneNumber}</p>
      <p><strong>Policy Number:</strong> ${policyNumber}</p>
      <p><strong>Claim Type:</strong> ${claimType}</p>
      <p><strong>Description:</strong> ${description || "Not provided"}</p>
      ${photoBase64 ? "<p>See attached supporting photo/document.</p>" : "<p>No supporting photo/document was attached.</p>"}
    `,
    attachments: photoBase64 ? [{ filename: photoName || `claim-${claimId}-attachment`, contentBase64: photoBase64, contentType: photoMimeType }] : []
  }).catch(() => {});

  const responseBlob = {
    claimId,
    timestamp,
    policyNumber,
    claimType,
    status: "Notification received",
    assignedOfficer: "Jane Mutheu (Senior Claims Administrator)",
    officerDetails: "Email: jmutheu@utmostkenya.com | Direct extension: +254 707 798701",
    actionGuidance: [
      "DO NOT admit liability to third parties under any circumstances (Motor accident guidelines).",
      "Ensure you obtain a certified Police Abstract as soon as possible.",
      "Take photographs of all damaged items, assets, or vehicles immediately.",
      "Contact our 24h claims hotline for assistance on emergency logistics or immediate advisor dispatch."
    ],
    timeline: [
      { status: "Notification received", date: timestamp, completed: true, detail: "Claim created and registered instantly on the brokerage system." },
      { status: "Initial review", date: null, completed: false, detail: "A claims specialist will review your policy validity and asset scope (usually in 2-4 hours)." },
      { status: "Submitted to insurer", date: null, completed: false, detail: "File submitted to the carrier underwriting panel for liability settlement." },
      { status: "Assessment or investigation", date: null, completed: false, detail: "Surveyor dispatched to appraise damages or hospital medical bills audited." },
      { status: "Settlement processing", date: null, completed: false, detail: "Payment release or voucher signing (Discharge Voucher completion)." },
      { status: "Paid & Closed", date: null, completed: false, detail: "Funds transferred to repair facility, hospital, or client bank account." }
    ]
  };

  res.json(responseBlob);
}));


return router;
}
