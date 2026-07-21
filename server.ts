import express from "express";
import path from "path";
import dotenv from "dotenv";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { calculateDynamicMedicalQuotes } from "./src/utils/medicalCalculator";
import { mockInsurers } from "./src/data/mockInsurers";
import { EXTRA_LICENSED_CLASSES } from "./src/data/extraLicensedClasses";

// Load environment variables
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Wraps an async route handler so a rejected promise becomes a 500
// instead of an unhandled rejection (Express 4 doesn't catch these).
function asyncRoute(handler: (req: express.Request, res: express.Response) => Promise<unknown>) {
  return (req: express.Request, res: express.Response) => {
    handler(req, res).catch((err) => {
      console.error(err);
      const status = Number.isInteger(err?.status) ? err.status : 500;
      res.status(status).json({ error: err?.message || "Internal server error" });
    });
  };
}

// ----------------------------------------------------
// crm client — the separate CRM/policy/claims/compliance service that
// owns the database (see ../CRM). This app only generates quotes;
// anything past that (parties, policies, …) is proxied there.
// ----------------------------------------------------
const CRM_API_URL = process.env.CRM_API_URL || "http://localhost:3100";
const CRM_API_KEY = process.env.CRM_API_KEY || "";

async function crmApi(path: string, init?: RequestInit) {
  const response = await fetch(`${CRM_API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": CRM_API_KEY,
      ...(init?.headers || {}),
    },
  });
  const body = await response.json().catch(() => undefined);
  if (!response.ok) {
    const error: any = new Error(body?.error || `crm request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return body;
}

// Set up JSON body sizes for large base64 image uploads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// ----------------------------------------------------
// DB File Constants & Generic Read/Write Helpers
// ----------------------------------------------------
const AUTHORIZED_PERSON_FILE = "authorizedPersonDb.json";
const BENEFICIAL_OWNER_FILE = "beneficialOwnerDb.json";
const STAFF_FILE = "staffDb.json";
const QUOTE_FILE = "quoteDb.json";
const CLAIM_FILE = "claimDb.json";
const PREMIUM_CONFIRMED_FILE = "premiumConfirmationDb.json";
const COMPLAINT_FILE = "complaintDb.json";
const ENDORSEMENT_FILE = "endorsementDb.json";
const PENDING_APPROVAL_FILE = "pendingApprovalDb.json";
const PREMIUM_ADJUSTMENT_FILE = "premiumAdjustmentDb.json";
const AUDIT_LOG_FILE = "complianceAuditLogDb.json";
const ROOM_SCAN_FILE = "roomScanResultDb.json";
const INSURER_FILE = "insurersDb.json";
const OTHER_LINE_REQUEST_FILE = "otherLineRequestsDb.json";

function loadDbFile(filename: string, defaultData: any) {
  try {
    const dbPath = path.join(process.cwd(), "src", "data", filename);
    if (fs.existsSync(dbPath)) {
      const data = fs.readFileSync(dbPath, "utf-8");
      return JSON.parse(data);
    } else {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(dbPath, JSON.stringify(defaultData, null, 2), "utf-8");
      return defaultData;
    }
  } catch (error) {
    console.error(`Error reading database file ${filename}:`, error);
    return defaultData;
  }
}

function saveDbFile(filename: string, data: any) {
  try {
    const dbPath = path.join(process.cwd(), "src", "data", filename);
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), "utf-8");
    return true;
  } catch (error) {
    console.error(`Error writing database file ${filename}:`, error);
    return false;
  }
}

function addAuditLog(logEntry: {
  action: string;
  entityType: string;
  entityId: string;
  actorId: string;
  actorType: string;
  details: any;
}) {
  const logs = loadDbFile(AUDIT_LOG_FILE, []);
  const newLog = {
    id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    ...logEntry
  };
  logs.unshift(newLog);
  saveDbFile(AUDIT_LOG_FILE, logs);
  return newLog;
}

function logFallbackUsed(reason: string, details: any) {
  console.warn(`[WARNING] RATE_FALLBACK_USED: ${reason}`);
  addAuditLog({
    action: "RATE_FALLBACK_USED",
    entityType: "rates",
    entityId: details.insurerId || "fallback",
    actorId: "system",
    actorType: "system",
    details: {
      reason,
      ...details
    }
  });
}

// ----------------------------------------------------
// Underwriter specific Rates Versioning and Migration Database
// ----------------------------------------------------
function loadRatesDb() {
  const defaultRates = {
    versions: [
      {
        id: "rate-ver-jubilee-1",
        versionNumber: 1,
        insurerId: "jubilee",
        category: "all",
        status: "active",
        timestamp: "2026-07-14T01:00:00.000Z",
        updatedByStaffId: "staff-1",
        rates: {
          insurerName: "Jubilee Health Insurance Limited",
          motorComprehensiveRate: 4.0,
          motorTpoRate: 7500,
          medicalMultiplier: 1.0,
          medicalMaternityRate: 34818,
          medicalDentalOptRate: 14302,
          sumInsuredBands: [
            { min: 0, max: 1999999, rate: 4.5 },
            { min: 2000000, max: 4999999, rate: 4.0 },
            { min: 5000000, max: 99999999, rate: 3.75 }
          ],
          vehicleTypes: [
            { typeId: "saloon", typeName: "Saloon / Hatchback / Wagon", allowedComprehensive: true, rate: 4.25, minPremium: 35000 },
            { typeId: "suv", typeName: "SUV / 4x4 / Luxury", allowedComprehensive: true, rate: 4.0, minPremium: 45000 },
            { typeId: "pickup", typeName: "Commercial Pickups / Vans", allowedComprehensive: true, rate: 5.0, minPremium: 50000 },
            { typeId: "sports", typeName: "High-Performance Sports Cars", allowedComprehensive: false, rate: 6.5, minPremium: 120000 }
          ],
          riders: [
            { riderId: "excess_protector", riderName: "Excess Protector", rate: 0.25, minPremium: 2500 },
            { riderId: "pvt", riderName: "Political Violence & Terrorism", rate: 0.25, minPremium: 2000 },
            { riderId: "windscreen", riderName: "Windscreen Cover", rate: 10.0, minPremium: 1500 }
          ]
        }
      },
      {
        id: "rate-ver-icea-1",
        versionNumber: 1,
        insurerId: "icea",
        category: "all",
        status: "active",
        timestamp: "2026-07-14T01:00:00.000Z",
        updatedByStaffId: "staff-1",
        rates: {
          insurerName: "ICEA LION General Insurance Company Limited",
          motorComprehensiveRate: 4.3,
          motorTpoRate: 8000,
          medicalMultiplier: 1.05,
          medicalMaternityRate: 18000,
          medicalDentalOptRate: 8500,
          sumInsuredBands: [
            { min: 0, max: 1999999, rate: 4.75 },
            { min: 2000000, max: 4999999, rate: 4.25 },
            { min: 5000000, max: 99999999, rate: 4.0 }
          ],
          vehicleTypes: [
            { typeId: "saloon", typeName: "Saloon / Hatchback / Wagon", allowedComprehensive: true, rate: 4.5, minPremium: 38000 },
            { typeId: "suv", typeName: "SUV / 4x4 / Luxury", allowedComprehensive: true, rate: 4.25, minPremium: 48000 },
            { typeId: "pickup", typeName: "Commercial Pickups / Vans", allowedComprehensive: true, rate: 5.25, minPremium: 55000 },
            { typeId: "sports", typeName: "High-Performance Sports Cars", allowedComprehensive: true, rate: 7.0, minPremium: 150000 }
          ],
          riders: [
            { riderId: "excess_protector", riderName: "Excess Protector", rate: 0.30, minPremium: 3000 },
            { riderId: "pvt", riderName: "Political Violence & Terrorism", rate: 0.30, minPremium: 2500 },
            { riderId: "windscreen", riderName: "Windscreen Cover", rate: 10.0, minPremium: 2000 }
          ]
        }
      },
      {
        id: "rate-ver-heritage-1",
        versionNumber: 1,
        insurerId: "heritage",
        category: "all",
        status: "active",
        timestamp: "2026-07-14T01:00:00.000Z",
        updatedByStaffId: "staff-1",
        rates: {
          insurerName: "The Heritage Insurance Company Limited",
          motorComprehensiveRate: 4.6,
          motorTpoRate: 8500,
          medicalMultiplier: 0.95,
          medicalMaternityRate: 15000,
          medicalDentalOptRate: 6800,
          sumInsuredBands: [
            { min: 0, max: 1999999, rate: 4.85 },
            { min: 2000000, max: 4999999, rate: 4.5 },
            { min: 5000000, max: 99999999, rate: 4.15 }
          ],
          vehicleTypes: [
            { typeId: "saloon", typeName: "Saloon / Hatchback / Wagon", allowedComprehensive: true, rate: 4.6, minPremium: 32000 },
            { typeId: "suv", typeName: "SUV / 4x4 / Luxury", allowedComprehensive: true, rate: 4.4, minPremium: 42000 },
            { typeId: "pickup", typeName: "Commercial Pickups / Vans", allowedComprehensive: true, rate: 5.5, minPremium: 48000 },
            { typeId: "sports", typeName: "High-Performance Sports Cars", allowedComprehensive: false, rate: 7.5, minPremium: 130000 }
          ],
          riders: [
            { riderId: "excess_protector", riderName: "Excess Protector", rate: 0.25, minPremium: 2000 },
            { riderId: "pvt", riderName: "Political Violence & Terrorism", rate: 0.25, minPremium: 2000 },
            { riderId: "windscreen", riderName: "Windscreen Cover", rate: 8.0, minPremium: 1200 }
          ]
        }
      },
      {
        id: "rate-ver-cic-1",
        versionNumber: 1,
        insurerId: "cic",
        category: "all",
        status: "active",
        timestamp: "2026-07-14T01:00:00.000Z",
        updatedByStaffId: "staff-1",
        rates: {
          insurerName: "CIC General Insurance Limited",
          motorComprehensiveRate: 4.9,
          motorTpoRate: 9000,
          medicalMultiplier: 0.9,
          medicalMaternityRate: 18000,
          medicalDentalOptRate: 10500,
          sumInsuredBands: [
            { min: 0, max: 1999999, rate: 5.0 },
            { min: 2000000, max: 4999999, rate: 4.75 },
            { min: 5000000, max: 99999999, rate: 4.5 }
          ],
          vehicleTypes: [
            { typeId: "saloon", typeName: "Saloon / Hatchback / Wagon", allowedComprehensive: true, rate: 4.9, minPremium: 30000 },
            { typeId: "suv", typeName: "SUV / 4x4 / Luxury", allowedComprehensive: true, rate: 4.7, minPremium: 40000 },
            { typeId: "pickup", typeName: "Commercial Pickups / Vans", allowedComprehensive: true, rate: 5.0, minPremium: 45000 },
            { typeId: "sports", typeName: "High-Performance Sports Cars", allowedComprehensive: false, rate: 8.0, minPremium: 140000 }
          ],
          riders: [
            { riderId: "excess_protector", riderName: "Excess Protector", rate: 0.35, minPremium: 2500 },
            { riderId: "pvt", riderName: "Political Violence & Terrorism", rate: 0.35, minPremium: 2500 },
            { riderId: "windscreen", riderName: "Windscreen Cover", rate: 10.0, minPremium: 1500 }
          ]
        }
      },
      {
        id: "rate-ver-kenindia-1",
        versionNumber: 1,
        insurerId: "kenindia",
        category: "all",
        status: "active",
        timestamp: "2026-07-14T01:00:00.000Z",
        updatedByStaffId: "staff-1",
        rates: {
          insurerName: "Kenindia Assurance Company Limited",
          motorComprehensiveRate: 5.2,
          motorTpoRate: 9500,
          medicalMultiplier: 1.0,
          medicalMaternityRate: 18000,
          medicalDentalOptRate: 8500,
          sumInsuredBands: [
            { min: 0, max: 1999999, rate: 5.3 },
            { min: 2000000, max: 4999999, rate: 5.0 },
            { min: 5000000, max: 99999999, rate: 4.8 }
          ],
          vehicleTypes: [
            { typeId: "saloon", typeName: "Saloon / Hatchback / Wagon", allowedComprehensive: true, rate: 5.2, minPremium: 36000 },
            { typeId: "suv", typeName: "SUV / 4x4 / Luxury", allowedComprehensive: true, rate: 5.0, minPremium: 46000 },
            { typeId: "pickup", typeName: "Commercial Pickups / Vans", allowedComprehensive: true, rate: 6.0, minPremium: 52000 },
            { typeId: "sports", typeName: "High-Performance Sports Cars", allowedComprehensive: false, rate: 8.5, minPremium: 160000 }
          ],
          riders: [
            { riderId: "excess_protector", riderName: "Excess Protector", rate: 0.40, minPremium: 3500 },
            { riderId: "pvt", riderName: "Political Violence & Terrorism", rate: 0.40, minPremium: 3000 },
            { riderId: "windscreen", riderName: "Windscreen Cover", rate: 12.0, minPremium: 2500 }
          ]
        }
      }
    ],
    levies: { pcfRate: 0.0025, itlRate: 0.0020, stampDuty: 40 }
  };

  try {
    const dbPath = path.join(process.cwd(), "src", "data", "insurerRatesDb.json");
    if (fs.existsSync(dbPath)) {
      const data = fs.readFileSync(dbPath, "utf-8");
      const parsed = JSON.parse(data);

      // Perform auto-migration from legacy "rates" array to versioned format
      if (parsed && !parsed.versions && parsed.rates) {
        console.log("Migrating legacy insurerRatesDb.json to versioned snapshot schema...");
        parsed.versions = parsed.rates.map((r: any) => ({
          id: `rate-ver-${r.insurerId}-initial`,
          versionNumber: 1,
          insurerId: r.insurerId,
          category: "all",
          status: "active",
          timestamp: new Date().toISOString(),
          updatedByStaffId: "staff-1",
          rates: {
            insurerName: r.insurerName,
            motorComprehensiveRate: r.motorComprehensiveRate,
            motorTpoRate: r.motorTpoRate,
            medicalMultiplier: r.medicalMultiplier,
            medicalMaternityRate: r.medicalMaternityRate,
            medicalDentalOptRate: r.medicalDentalOptRate,
            sumInsuredBands: r.sumInsuredBands || [],
            vehicleTypes: r.vehicleTypes || [],
            riders: r.riders || []
          }
        }));
        delete parsed.rates;
        fs.writeFileSync(dbPath, JSON.stringify(parsed, null, 2), "utf-8");
      }
      return parsed;
    } else {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(dbPath, JSON.stringify(defaultRates, null, 2), "utf-8");
      return defaultRates;
    }
  } catch (error) {
    console.error("Error loading/migrating rates database:", error);
    return defaultRates;
  }
}

function saveRatesDb(data: any) {
  try {
    const dbPath = path.join(process.cwd(), "src", "data", "insurerRatesDb.json");
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), "utf-8");
    return true;
  } catch (error) {
    console.error("Error writing rates db:", error);
    return false;
  }
}

function getActiveRatesList(ratesDb: any) {
  if (ratesDb && ratesDb.versions) {
    return ratesDb.versions
      .filter((v: any) => v.status === "active")
      .map((v: any) => ({
        insurerId: v.insurerId,
        insurerName: v.rates.insurerName || v.insurerId,
        motorComprehensiveRate: v.rates.motorComprehensiveRate,
        motorTpoRate: v.rates.motorTpoRate,
        medicalMultiplier: v.rates.medicalMultiplier,
        medicalMaternityRate: v.rates.medicalMaternityRate,
        medicalDentalOptRate: v.rates.medicalDentalOptRate,
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
app.post("/api/analyze-room", async (req, res) => {
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

    return res.json(report);

  } catch (error: any) {
    console.error("Error in /api/analyze-room:", error);
    return res.status(500).json({ error: error.message || "Failed to analyze room photo." });
  }
});

// ----------------------------------------------------
// Admin API: Get and Update Underwriter specific rates
// ----------------------------------------------------
app.get("/api/admin/rates", (req, res) => {
  const db = loadRatesDb();
  res.json(db);
});

app.post("/api/admin/rates", (req, res) => {
  const { db: fullDb, levies, insurerId, rates, motorComprehensiveRate, motorTpoRate, medicalMultiplier, pcfRate, itlRate, stampDuty, updatedByStaffId } = req.body;

  let db = loadRatesDb();
  const actorId = updatedByStaffId || "staff-1";

  // If a full DB is passed, overwrite it
  if (fullDb) {
    db = fullDb;
  } else {
    if (levies) {
      db.levies = levies;
    }

    if (pcfRate !== undefined) db.levies.pcfRate = Number(pcfRate);
    if (itlRate !== undefined) db.levies.itlRate = Number(itlRate);
    if (stampDuty !== undefined) db.levies.stampDuty = Number(stampDuty);

    if (insurerId) {
      // Find current active version for this insurer
      const activeVerIndex = db.versions?.findIndex((v: any) => v.insurerId === insurerId && v.status === "active") ?? -1;
      
      let baseRates: any = {
        insurerName: insurerId === "jubilee" ? "Jubilee Health Insurance Limited" : insurerId === "icea" ? "ICEA LION General Insurance Company Limited" : insurerId === "heritage" ? "The Heritage Insurance Company Limited" : insurerId === "cic" ? "CIC General Insurance Limited" : insurerId === "kenindia" ? "Kenindia Assurance Company Limited" : "Other Insurer",
        motorComprehensiveRate: 4.0,
        motorTpoRate: 7500,
        medicalMultiplier: 1.0,
        medicalMaternityRate: 18000,
        medicalDentalOptRate: 8500,
        sumInsuredBands: [],
        vehicleTypes: [],
        riders: []
      };
      
      let nextVerNumber = 1;
      let oldVersionId = "none";

      if (activeVerIndex !== -1) {
        const activeVer = db.versions[activeVerIndex];
        baseRates = JSON.parse(JSON.stringify(activeVer.rates));
        nextVerNumber = (activeVer.versionNumber || 1) + 1;
        oldVersionId = activeVer.id;
        
        // Mark old as inactive
        activeVer.status = "inactive";
      }

      if (rates) {
        baseRates = JSON.parse(JSON.stringify(rates));
      } else {
        // Update specific rates fields
        if (motorComprehensiveRate !== undefined) {
          baseRates.motorComprehensiveRate = Number(motorComprehensiveRate);
          if (baseRates.vehicleTypes) {
            baseRates.vehicleTypes = baseRates.vehicleTypes.map((v: any) => {
              if (v.typeId === "saloon" || v.typeId === "suv") {
                return { ...v, rate: Number(motorComprehensiveRate) };
              }
              return v;
            });
          }
        }
        if (motorTpoRate !== undefined) baseRates.motorTpoRate = Number(motorTpoRate);
        if (medicalMultiplier !== undefined) baseRates.medicalMultiplier = Number(medicalMultiplier);
      }

      const newVersionId = `rate-ver-${insurerId}-${nextVerNumber}`;
      const newVersion = {
        id: newVersionId,
        versionNumber: nextVerNumber,
        insurerId,
        category: "all",
        status: "active",
        timestamp: new Date().toISOString(),
        updatedByStaffId: actorId,
        rates: baseRates
      };

      if (!db.versions) {
        db.versions = [];
      }
      db.versions.push(newVersion);

      // Write RATE_TABLE_UPDATED to ComplianceAuditLog
      addAuditLog({
        action: "RATE_TABLE_UPDATED",
        entityType: "rates",
        entityId: insurerId,
        actorId: actorId,
        actorType: "staff",
        details: {
          oldVersionId,
          newVersionId,
          changes: `Rates changed: motorComp: ${motorComprehensiveRate || 'unchanged'}%, TPO: ${motorTpoRate || 'unchanged'}, medMult: ${medicalMultiplier || 'unchanged'}x`
        }
      });
    }
  }

  saveRatesDb(db);
  res.json({ success: true, db });
});

// ----------------------------------------------------
// Admin API: Insurer Registry (admin-added underwriters, on top of the
// built-in insurer set already wired into the motor quote engine below)
// ----------------------------------------------------
app.get("/api/insurers", (req, res) => {
  res.json(loadDbFile(INSURER_FILE, []));
});

app.post("/api/insurers", (req, res) => {
  const insurers = loadDbFile(INSURER_FILE, []);
  const actorId = req.body.updatedByStaffId || "staff-1";

  const id = (req.body.id || req.body.tradingName || req.body.name || "")
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  if (!id) {
    return res.status(400).json({ error: "Could not derive a valid insurer ID from the supplied name." });
  }

  const BUILT_IN_IDS = ["jubilee", "icea", "heritage", "cic", "kenindia", "stardiscover", "britam", "aar", "oldmutual", "geminia", "mua", "cannon"];
  const existingIndex = insurers.findIndex((i: any) => i.id === id);

  if (existingIndex === -1 && BUILT_IN_IDS.includes(id)) {
    return res.status(409).json({ error: `An insurer with ID '${id}' already exists as a built-in carrier.` });
  }

  const record = {
    id,
    name: req.body.name || req.body.tradingName || id,
    tradingName: req.body.tradingName || req.body.name || id,
    logoEmoji: req.body.logoEmoji || "🏢",
    established: Number(req.body.established) || new Date().getFullYear(),
    licenseYear: Number(req.body.licenseYear) || new Date().getFullYear(),
    licenseStatus: req.body.licenseStatus || "Active",
    iraLicenseMotor: req.body.iraLicenseMotor || "Pending Registration",
    iraLicenseMedical: req.body.iraLicenseMedical || "Pending Registration",
    odpcRegistered: req.body.odpcRegistered !== undefined ? !!req.body.odpcRegistered : false,
    memberOfAibk: req.body.memberOfAibk !== undefined ? !!req.body.memberOfAibk : false,
    rating: req.body.rating || "Unrated (New Carrier)",
    strengthReason: req.body.strengthReason || "",
    availableProducts: Array.isArray(req.body.availableProducts) ? req.body.availableProducts : [],
    claimTurnaroundDays: Number(req.body.claimTurnaroundDays) || 7,
    emergencyPhone: req.body.emergencyPhone || "",
    isCustom: true,
    createdAt: existingIndex === -1 ? new Date().toISOString() : insurers[existingIndex].createdAt,
    updatedAt: new Date().toISOString()
  };

  if (existingIndex === -1) {
    insurers.push(record);
  } else {
    insurers[existingIndex] = record;
  }
  saveDbFile(INSURER_FILE, insurers);

  addAuditLog({
    action: existingIndex === -1 ? "INSURER_CREATED" : "INSURER_UPDATED",
    entityType: "insurer",
    entityId: id,
    actorId,
    actorType: "staff",
    details: { tradingName: record.tradingName }
  });

  res.json({ success: true, insurer: record, insurers });
});

app.delete("/api/insurers/:id", (req, res) => {
  const insurers = loadDbFile(INSURER_FILE, []);
  const filtered = insurers.filter((i: any) => i.id !== req.params.id);
  if (filtered.length === insurers.length) {
    return res.status(404).json({ error: "Insurer not found in the custom registry." });
  }
  saveDbFile(INSURER_FILE, filtered);
  addAuditLog({
    action: "INSURER_DELETED",
    entityType: "insurer",
    entityId: req.params.id,
    actorId: req.body.updatedByStaffId || "staff-1",
    actorType: "staff",
    details: {}
  });
  res.json({ success: true, insurers: filtered });
});

// ----------------------------------------------------
// API 1b: Other (non-motor, non-medical) Product Line quote intake
// ----------------------------------------------------
// Maps the "Other Product Lines" category ids (shared with AdminPortalView.tsx's
// OTHER_LINE_CATEGORIES) to their IRA class code, so a submission can be checked against the
// selected insurer's actual licensing before being accepted.
const OTHER_LINE_CATEGORY_CODES: Record<string, string> = {
  liability: "05",
  engineering: "02",
  marine: "06",
  theft: "10",
  wiba: "11",
  personal_accident: "09",
  miscellaneous: "14"
};

function getLicensedGeneralClasses(insurerId: string): string[] | undefined {
  const profile = mockInsurers.find((m) => m.id === insurerId);
  if (profile) return profile.licensedGeneralClasses;
  return EXTRA_LICENSED_CLASSES[insurerId]?.general;
}

app.get("/api/other-line-quotes", (req, res) => {
  res.json(loadDbFile(OTHER_LINE_REQUEST_FILE, []));
});

app.post("/api/other-line-quotes", (req, res) => {
  const { category, subType, insurerId, answers, ratingBasisValue } = req.body;

  if (!category || !subType || !insurerId || !answers) {
    return res.status(400).json({ error: "Missing category, subType, insurerId, or answers." });
  }

  const categoryCode = OTHER_LINE_CATEGORY_CODES[category];
  if (!categoryCode) {
    return res.status(400).json({ error: `Unknown other-line category '${category}'.` });
  }

  // Only block the submission when we have verified licensing data that excludes this class -
  // insurers with no license data on file (e.g. newly admin-added carriers) are allowed through,
  // matching the same "unrestricted when unverified" default used in the admin licensing filter.
  const licensedClasses = getLicensedGeneralClasses(insurerId);
  if (licensedClasses && !licensedClasses.includes(categoryCode)) {
    return res.status(403).json({
      error: `This insurer is not licensed for IRA class ${categoryCode} (required for '${category}') per the Licensed Entities 2026 register.`
    });
  }

  const ratesDb = loadRatesDb();
  const activeVersion = ratesDb.versions?.find((v: any) => v.insurerId === insurerId && v.status === "active");
  const lineConfig = activeVersion?.rates?.otherLines?.[category];
  const ratableItem = lineConfig?.items?.find((it: any) => it.rate && it.rate > 0);

  let status: "quoted" | "pending_underwriter_review" = "pending_underwriter_review";
  let premium: number | null = null;
  let rateApplied: { itemName: string; rateType: string; rate: number } | null = null;

  const basis = Number(ratingBasisValue) || 0;
  if (ratableItem && basis > 0) {
    const computed = ratableItem.rateType === "permille" ? (basis * ratableItem.rate) / 1000 : (basis * ratableItem.rate) / 100;
    premium = Math.round(Math.max(computed, lineConfig.minPremium || 0));
    rateApplied = { itemName: ratableItem.name, rateType: ratableItem.rateType, rate: ratableItem.rate };
    status = "quoted";
  }

  const requests = loadDbFile(OTHER_LINE_REQUEST_FILE, []);
  const referenceNumber = `OL-${category.slice(0, 3).toUpperCase()}-${Date.now()}`;
  const record = {
    id: `oline-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    referenceNumber,
    timestamp: new Date().toISOString(),
    category,
    subType,
    insurerId,
    answers,
    ratingBasisValue: basis,
    status,
    premium,
    rateApplied
  };
  requests.unshift(record);
  saveDbFile(OTHER_LINE_REQUEST_FILE, requests);

  addAuditLog({
    action: status === "quoted" ? "OTHER_LINE_QUOTE_CALCULATED" : "OTHER_LINE_QUOTE_SUBMITTED",
    entityType: "other_line_quote",
    entityId: record.id,
    actorId: "customer",
    actorType: "customer",
    details: { category, subType, insurerId, referenceNumber, status, premium }
  });

  res.json({ success: true, request: record });
});

// ----------------------------------------------------
// API 2: Insurance Quote Calculation (Motor, Medical, Property)
// ----------------------------------------------------
app.post("/api/generate-quotes", (req, res) => {
  const { category, params } = req.body;

  if (!category) {
    return res.status(400).json({ error: "Missing quote category." });
  }

  // Load the current underwriter specific rates from the JSON database
  const ratesDb = loadRatesDb();

  // Resolve active rates to preserve backward compatibility with existing formulas
  const activeRates = getActiveRatesList(ratesDb);
  ratesDb.rates = activeRates;

  // Generate highly customizable quotes matching Kenyan licensed insurers
  // standard prices and benefits.
  // Jubilee (Jubilee Health Insurance Limited, class 12/Medical only) and AAR (not licensed for
  // classes 07/08) are intentionally excluded here per their real IRA 2026 class licensing -
  // see mockInsurers.ts and AdminPortalView's EXTRA_LICENSED_CLASSES for the underlying data.
  const builtInInsurers = [
    { name: "ICEA LION General Insurance Company Limited", id: "icea", rating: "A Rated (Excellent Wealth & Asset Coverage)" },
    { name: "The Heritage Insurance Company Limited", id: "heritage", rating: "A- Rated (Rapid Claims Settlement)" },
    { name: "CIC General Insurance Limited", id: "cic", rating: "BBB+ Rated (Highly Popular Sacco/SME Choice)" },
    { name: "Kenindia Assurance Company Limited", id: "kenindia", rating: "BBB Rated (Strong Corporate Integrity)" },
    { name: "Star Discover Insurance Limited", id: "stardiscover", rating: "BBB Rated (Innovator in Motor Care)" },
    { name: "Britam General Insurance Company (K) Limited", id: "britam", rating: "A Rated (Nationwide Coverage & Strong Trust)" },
    { name: "Old Mutual General Insurance Kenya Limited", id: "oldmutual", rating: "A+ Rated (Premium Corporate Underwriter)" },
    { name: "Geminia Insurance Company Limited", id: "geminia", rating: "BBB Rated (Highly Reputable Corporate & Retail Underwriter)" },
    { name: "MUA Insurance (Kenya) Limited", id: "mua", rating: "A Rated (Excellent Solvency & Commercial Specialist)" },
    { name: "Cannon General Insurance Company Limited", id: "cannon", rating: "B+ Rated (Established Underwriter, Competitive Fleet Terms)" }
  ];

  // Admin-added carriers only enter the live quote pool once they have an active rate
  // version configured (via the Database Rates Desk) - otherwise they'd quote off empty defaults.
  const customInsurers = loadDbFile(INSURER_FILE, [])
    .filter((c: any) => ratesDb.versions?.some((v: any) => v.insurerId === c.id && v.status === "active"))
    .map((c: any) => ({ name: c.tradingName || c.name, id: c.id, rating: c.rating || "Unrated (New Carrier)" }));

  const insurers = [...builtInInsurers, ...customInsurers];

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

    const val = Number(params.vehicleValue);
    if (isNaN(val) || val <= 0) {
      return res.status(400).json({ error: "Missing or invalid parameter: vehicleValue" });
    }
    const isComp = params.coverType === "comprehensive";
    const selectedVehicleType = params.vehicleType;

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

      let basePremium = 0;
      let finalRateUsed = 0;
      let isDeclined = false;
      let declineReason = "";
      let appliedMinPremium = 0;
      let isMinPremiumTriggered = false;

      // Rider costs tracking
      let excessProtectorCost = 0;
      let pvtCost = 0;
      let windscreenCost = 0;
      let windscreenLimit = 50000;

      const levies = ratesDb.levies || { pcfRate: 0.0025, itlRate: 0.002, stampDuty: 40 };

      // Check if this underwriter has specific comprehensive rates for this usage class
      let hasSpecificCommercialRate = false;
      let commercialRateBands: any[] = [];
      let commercialMinPremium = 0;

      if (underwriterRates.commercialRates && underwriterRates.commercialRates[params.vehicleUse]) {
        hasSpecificCommercialRate = true;
        commercialRateBands = underwriterRates.commercialRates[params.vehicleUse].bands || [];
        commercialMinPremium = underwriterRates.commercialRates[params.vehicleUse].minPremium || 0;
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

        if (!isDeclined) {
          // 2. Resolve rating: specific vehicle body type rating takes precedence, falling back to sumInsuredBands if not defined
          if (hasSpecificCommercialRate) {
            const matchingBand = commercialRateBands.find((b: any) => val >= b.min && val <= b.max);
            if (matchingBand && typeof matchingBand.rate === "number") {
              finalRateUsed = matchingBand.rate;
            } else {
              isDeclined = true;
              declineReason = `Rate not configured in the specified sum-insured band for Commercial ${params.vehicleUse}`;
            }
          } else if (vTypeConfig && typeof vTypeConfig.rate === "number") {
            finalRateUsed = vTypeConfig.rate;
          } else {
            const matchingBand = underwriterRates.sumInsuredBands?.find((b: any) => val >= b.min && val <= b.max);
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

            // 4. Check & apply vehicle category minimum premium rules
            if (hasSpecificCommercialRate) {
              appliedMinPremium = commercialMinPremium;
              if (basePremium < appliedMinPremium) {
                basePremium = appliedMinPremium;
                isMinPremiumTriggered = true;
              }
            } else if (vTypeConfig && vTypeConfig.minPremium) {
              appliedMinPremium = vTypeConfig.minPremium;
              if (basePremium < appliedMinPremium) {
                basePremium = appliedMinPremium;
                isMinPremiumTriggered = true;
              }
            }

            // 5. Riders calculation if checkboxes checked
            if (underwriterRates.riders) {
              if (params.excessProtector) {
                const rConfig = underwriterRates.riders.find((r: any) => r.riderId === "excess_protector");
                if (rConfig) {
                  if (rConfig.isInclusive || rConfig.status === "unsourced_fully_inclusive") {
                    excessProtectorCost = 0;
                  } else if (typeof rConfig.minPremium !== "number" || typeof rConfig.rate !== "number") {
                    isDeclined = true;
                    declineReason = "Excess protector rate or minimum premium not configured for this underwriter";
                  } else {
                    excessProtectorCost = Math.max(Math.round(val * (rConfig.rate / 100)), rConfig.minPremium);
                  }
                }
              }
              if (params.pvt && !isDeclined) {
                const rConfig = underwriterRates.riders.find((r: any) => r.riderId === "pvt");
                if (rConfig) {
                  if (rConfig.isInclusive || rConfig.status === "unsourced_fully_inclusive") {
                    pvtCost = 0;
                  } else if (typeof rConfig.minPremium !== "number" || typeof rConfig.rate !== "number") {
                    isDeclined = true;
                    declineReason = "Political Violence & Terrorism rate or minimum premium not configured for this underwriter";
                  } else {
                    pvtCost = Math.max(Math.round(val * (rConfig.rate / 100)), rConfig.minPremium);
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
          basePremium = flatTpo; // Used flat as-is without loading factor or multiplier!
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
        excessTerms: isDeclined 
          ? "Not applicable (Quote declined)"
          : (isComp 
              ? `Non-Standard: 2.5% of value (Min KES 15,000). Excess Protector option (${params.excessProtector ? "ACTIVE" : "INACTIVE"}) cuts general road excess to NIL.` 
              : "No excess applicable to third-party only policies."),
        mainBenefits: isDeclined 
          ? [] 
          : (isComp 
              ? [
                  `Windscreen Extension Limit: KES ${params.windscreen ? windscreenLimit.toLocaleString() : "50,000 included"}`,
                  `Excess Protector Protection: ${params.excessProtector ? "YES (Nil excess on own damage)" : "No (Subject to standard deductibles)"}`,
                  `Political Violence & PVT: ${params.pvt ? "YES (Fully Covered)" : "No (Excluded)"}`,
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
    });
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

  res.json({ quotes });
});

// ----------------------------------------------------
// CRM & Workflow Entity REST API Endpoints
// ----------------------------------------------------

// 1. Party (Client) endpoints — proxied to the crm service (crm.parties)
app.get("/api/parties", asyncRoute(async (req, res) => {
  res.json(await crmApi("/api/parties"));
}));

app.post("/api/parties", asyncRoute(async (req, res) => {
  res.json(await crmApi("/api/parties", { method: "POST", body: JSON.stringify(req.body) }));
}));

app.patch("/api/parties/:id", asyncRoute(async (req, res) => {
  res.json(await crmApi(`/api/parties/${encodeURIComponent(req.params.id)}`, { method: "PATCH", body: JSON.stringify(req.body) }));
}));

// 2. AuthorizedPerson endpoints
app.get("/api/authorized-persons", (req, res) => {
  res.json(loadDbFile(AUTHORIZED_PERSON_FILE, []));
});
app.post("/api/authorized-persons", (req, res) => {
  const list = loadDbFile(AUTHORIZED_PERSON_FILE, []);
  const newItem = { id: `auth-${Date.now()}`, ...req.body };
  list.unshift(newItem);
  saveDbFile(AUTHORIZED_PERSON_FILE, list);
  addAuditLog({
    action: "AUTHORIZED_PERSON_CREATED",
    entityType: "authorized_person",
    entityId: newItem.id,
    actorId: req.body.updatedByStaffId || "staff-1",
    actorType: "staff",
    details: { name: newItem.name }
  });
  res.json(newItem);
});
app.patch("/api/authorized-persons/:id", (req, res) => {
  const list = loadDbFile(AUTHORIZED_PERSON_FILE, []);
  const index = list.findIndex((x: any) => x.id === req.params.id);
  if (index !== -1) {
    list[index] = { ...list[index], ...req.body };
    saveDbFile(AUTHORIZED_PERSON_FILE, list);
    res.json(list[index]);
  } else {
    res.status(404).json({ error: "Authorized person not found" });
  }
});

// 3. BeneficialOwner endpoints
app.get("/api/beneficial-owners", (req, res) => {
  res.json(loadDbFile(BENEFICIAL_OWNER_FILE, []));
});
app.post("/api/beneficial-owners", (req, res) => {
  const list = loadDbFile(BENEFICIAL_OWNER_FILE, []);
  const newItem = { id: `bo-${Date.now()}`, ...req.body };
  list.unshift(newItem);
  saveDbFile(BENEFICIAL_OWNER_FILE, list);
  addAuditLog({
    action: "BENEFICIAL_OWNER_CREATED",
    entityType: "beneficial_owner",
    entityId: newItem.id,
    actorId: req.body.updatedByStaffId || "staff-1",
    actorType: "staff",
    details: { name: newItem.name }
  });
  res.json(newItem);
});
app.patch("/api/beneficial-owners/:id", (req, res) => {
  const list = loadDbFile(BENEFICIAL_OWNER_FILE, []);
  const index = list.findIndex((x: any) => x.id === req.params.id);
  if (index !== -1) {
    list[index] = { ...list[index], ...req.body };
    saveDbFile(BENEFICIAL_OWNER_FILE, list);
    res.json(list[index]);
  } else {
    res.status(404).json({ error: "Beneficial owner not found" });
  }
});

// 4. Staff endpoints
app.get("/api/staff", (req, res) => {
  res.json(loadDbFile(STAFF_FILE, []));
});
app.get("/api/staff/:id", (req, res) => {
  const list = loadDbFile(STAFF_FILE, []);
  const item = list.find((x: any) => x.id === req.params.id);
  if (item) res.json(item);
  else res.status(404).json({ error: "Staff not found" });
});
app.post("/api/staff", (req, res) => {
  const list = loadDbFile(STAFF_FILE, []);
  const newItem = {
    id: `staff-${Date.now()}`,
    createdAt: new Date().toISOString(),
    ...req.body
  };
  list.push(newItem);
  saveDbFile(STAFF_FILE, list);
  res.json(newItem);
});
app.patch("/api/staff/:id", (req, res) => {
  const list = loadDbFile(STAFF_FILE, []);
  const index = list.findIndex((x: any) => x.id === req.params.id);
  if (index !== -1) {
    list[index] = { ...list[index], ...req.body };
    saveDbFile(STAFF_FILE, list);
    res.json(list[index]);
  } else {
    res.status(404).json({ error: "Staff not found" });
  }
});

// 5. Quote endpoints
app.get("/api/quotes", (req, res) => {
  res.json(loadDbFile(QUOTE_FILE, []));
});
app.post("/api/quotes", (req, res) => {
  const list = loadDbFile(QUOTE_FILE, []);
  const reqData = { ...req.body };
  
  // Normalize totalPremium to totalPremiumKES
  if (reqData.totalPremium !== undefined && reqData.totalPremiumKES === undefined) {
    reqData.totalPremiumKES = reqData.totalPremium;
    delete reqData.totalPremium;
  }
  
  // Auto-assign to staff if not provided (e.g. self-service customer quotes)
  if (!reqData.assignedStaffId) {
    const staffList = loadDbFile(STAFF_FILE, []);
    const underwriter = staffList.find((s: any) => s.role === "underwriter" && s.active) || staffList[0];
    if (underwriter) {
      reqData.assignedStaffId = underwriter.id;
    } else {
      reqData.assignedStaffId = "staff-1"; // fallback default
    }
  }
  
  // Enforce assignment history containing assignedBy
  if (reqData.assignedStaffId && (!reqData.assignmentHistory || reqData.assignmentHistory.length === 0)) {
    reqData.assignmentHistory = [
      {
        staffId: reqData.assignedStaffId,
        assignedBy: reqData.createdByStaffId || "system",
        assignedAt: new Date().toISOString(),
        reason: "Initial assignment on quote calculation"
      }
    ];
  }

  const newItem = { id: `quote-pers-${Date.now()}`, timestamp: new Date().toISOString(), ...reqData };
  list.unshift(newItem);
  saveDbFile(QUOTE_FILE, list);
  addAuditLog({
    action: "QUOTE_CALCULATED",
    entityType: "quote",
    entityId: newItem.id,
    actorId: reqData.createdByStaffId || "customer",
    actorType: reqData.createdByStaffId ? "staff" : "customer",
    details: {
      rateVersionId: newItem.rateVersionId,
      totalPremiumKES: newItem.totalPremiumKES
    }
  });
  res.json(newItem);
});
app.patch("/api/quotes/:id", (req, res) => {
  const list = loadDbFile(QUOTE_FILE, []);
  const index = list.findIndex((x: any) => x.id === req.params.id);
  if (index !== -1) {
    const updatedData = { ...req.body };
    
    // Normalize totalPremium to totalPremiumKES
    if (updatedData.totalPremium !== undefined && updatedData.totalPremiumKES === undefined) {
      updatedData.totalPremiumKES = updatedData.totalPremium;
      delete updatedData.totalPremium;
    }

    // Sync assignment history if staff changes
    if (updatedData.assignedStaffId && updatedData.assignedStaffId !== list[index].assignedStaffId) {
      const currentHistory = list[index].assignmentHistory || [];
      const newHistory = [
        ...currentHistory,
        {
          staffId: updatedData.assignedStaffId,
          assignedBy: updatedData.updatedByStaffId || "system",
          assignedAt: new Date().toISOString(),
          reason: updatedData.assignmentReason || "Staff reassignment"
        }
      ];
      updatedData.assignmentHistory = newHistory;
    }

    list[index] = { ...list[index], ...updatedData };
    saveDbFile(QUOTE_FILE, list);
    res.json(list[index]);
  } else {
    res.status(404).json({ error: "Quote not found" });
  }
});

// 6. Policy endpoints — proxied to the crm service (policy.policies)
app.get("/api/policies", asyncRoute(async (req, res) => {
  res.json(await crmApi("/api/policies"));
}));

app.post("/api/policies", asyncRoute(async (req, res) => {
  res.json(await crmApi("/api/policies", { method: "POST", body: JSON.stringify(req.body) }));
}));

app.patch("/api/policies/:id", asyncRoute(async (req, res) => {
  res.json(await crmApi(`/api/policies/${encodeURIComponent(req.params.id)}`, { method: "PATCH", body: JSON.stringify(req.body) }));
}));

// 7. Claim endpoints
app.get("/api/claims", (req, res) => {
  res.json(loadDbFile(CLAIM_FILE, []));
});
app.post("/api/claims", (req, res) => {
  const list = loadDbFile(CLAIM_FILE, []);
  const newItem = { id: `UTM-CLM-${Math.floor(100000 + Math.random() * 900000)}`, timestamp: new Date().toISOString(), ...req.body };
  list.unshift(newItem);
  saveDbFile(CLAIM_FILE, list);
  addAuditLog({
    action: "CLAIM_SUBMITTED",
    entityType: "claim",
    entityId: newItem.id,
    actorId: req.body.createdByStaffId || "customer",
    actorType: req.body.createdByStaffId ? "staff" : "customer",
    details: { policyNumber: newItem.policyNumber, claimType: newItem.claimType }
  });
  res.json(newItem);
});
app.patch("/api/claims/:id", (req, res) => {
  const list = loadDbFile(CLAIM_FILE, []);
  const index = list.findIndex((x: any) => x.id === req.params.id || x.clmId === req.params.id || x.claimId === req.params.id);
  if (index !== -1) {
    const oldStatus = list[index].status;
    list[index] = { ...list[index], ...req.body };
    saveDbFile(CLAIM_FILE, list);
    
    // Log transition
    addAuditLog({
      action: "STATUS_TRANSITION",
      entityType: "claim",
      entityId: list[index].id || req.params.id,
      actorId: req.body.updatedByStaffId || "staff-1",
      actorType: "staff",
      details: {
        field: "status",
        oldValue: oldStatus,
        newValue: list[index].status
      }
    });
    res.json(list[index]);
  } else {
    res.status(404).json({ error: "Claim not found" });
  }
});

// 8. PremiumConfirmation endpoints
app.get("/api/premium-confirmations", (req, res) => {
  res.json(loadDbFile(PREMIUM_CONFIRMED_FILE, []));
});
app.post("/api/premium-confirmations", (req, res) => {
  const list = loadDbFile(PREMIUM_CONFIRMED_FILE, []);
  const newItem = { id: `pcf-${Date.now()}`, confirmedAt: new Date().toISOString(), ...req.body };
  list.unshift(newItem);
  saveDbFile(PREMIUM_CONFIRMED_FILE, list);
  addAuditLog({
    action: "PREMIUM_CONFIRMED",
    entityType: "premium_confirmation",
    entityId: newItem.id,
    actorId: req.body.confirmedByStaffId || "staff-1",
    actorType: "staff",
    details: { amount: newItem.amountConfirmed }
  });
  res.json(newItem);
});
app.patch("/api/premium-confirmations/:id", (req, res) => {
  const list = loadDbFile(PREMIUM_CONFIRMED_FILE, []);
  const index = list.findIndex((x: any) => x.id === req.params.id);
  if (index !== -1) {
    list[index] = { ...list[index], ...req.body };
    saveDbFile(PREMIUM_CONFIRMED_FILE, list);
    res.json(list[index]);
  } else {
    res.status(404).json({ error: "Premium confirmation not found" });
  }
});

// 9. Complaint endpoints
app.get("/api/complaints", (req, res) => {
  res.json(loadDbFile(COMPLAINT_FILE, []));
});
app.post("/api/complaints", (req, res) => {
  const list = loadDbFile(COMPLAINT_FILE, []);
  const newItem = { id: `UTM-COMP-${Math.floor(1000 + Math.random() * 9000)}`, receivedDate: new Date().toISOString().slice(0, 10), ...req.body };
  list.unshift(newItem);
  saveDbFile(COMPLAINT_FILE, list);
  addAuditLog({
    action: "COMPLAINT_REGISTERED",
    entityType: "complaint",
    entityId: newItem.id,
    actorId: req.body.createdByStaffId || "customer",
    actorType: req.body.createdByStaffId ? "staff" : "customer",
    details: { complainantName: newItem.complainantName }
  });
  res.json(newItem);
});
app.patch("/api/complaints/:id", (req, res) => {
  const list = loadDbFile(COMPLAINT_FILE, []);
  const index = list.findIndex((x: any) => x.id === req.params.id);
  if (index !== -1) {
    list[index] = { ...list[index], ...req.body };
    saveDbFile(COMPLAINT_FILE, list);
    res.json(list[index]);
  } else {
    res.status(404).json({ error: "Complaint not found" });
  }
});

// 10. Endorsement endpoints
app.get("/api/endorsements", (req, res) => {
  res.json(loadDbFile(ENDORSEMENT_FILE, []));
});
app.post("/api/endorsements", (req, res) => {
  const list = loadDbFile(ENDORSEMENT_FILE, []);
  const newItem = { id: `UTM-END-${Math.floor(1000 + Math.random() * 9000)}`, requestedDate: new Date().toISOString(), ...req.body };
  list.unshift(newItem);
  saveDbFile(ENDORSEMENT_FILE, list);
  addAuditLog({
    action: "ENDORSEMENT_CREATED",
    entityType: "endorsement",
    entityId: newItem.id,
    actorId: req.body.requestedByStaffId || "staff-1",
    actorType: "staff",
    details: { policyNumber: newItem.policyNumber, changeType: newItem.changeType }
  });
  res.json(newItem);
});
app.patch("/api/endorsements/:id", (req, res) => {
  const list = loadDbFile(ENDORSEMENT_FILE, []);
  const index = list.findIndex((x: any) => x.id === req.params.id);
  if (index !== -1) {
    list[index] = { ...list[index], ...req.body };
    saveDbFile(ENDORSEMENT_FILE, list);
    res.json(list[index]);
  } else {
    res.status(404).json({ error: "Endorsement not found" });
  }
});

// 11. PendingApproval endpoints
app.get("/api/pending-approvals", (req, res) => {
  res.json(loadDbFile(PENDING_APPROVAL_FILE, []));
});
app.post("/api/pending-approvals", (req, res) => {
  const list = loadDbFile(PENDING_APPROVAL_FILE, []);
  const newItem = { id: `appr-${Date.now()}`, submittedAt: new Date().toISOString(), ...req.body };
  list.unshift(newItem);
  saveDbFile(PENDING_APPROVAL_FILE, list);
  res.json(newItem);
});
app.patch("/api/pending-approvals/:id", (req, res) => {
  const list = loadDbFile(PENDING_APPROVAL_FILE, []);
  const index = list.findIndex((x: any) => x.id === req.params.id);
  if (index !== -1) {
    list[index] = { ...list[index], ...req.body };
    saveDbFile(PENDING_APPROVAL_FILE, list);
    res.json(list[index]);
  } else {
    res.status(404).json({ error: "Approval request not found" });
  }
});

// 12. PremiumAdjustment endpoints
app.get("/api/premium-adjustments", (req, res) => {
  res.json(loadDbFile(PREMIUM_ADJUSTMENT_FILE, []));
});
app.post("/api/premium-adjustments", (req, res) => {
  const list = loadDbFile(PREMIUM_ADJUSTMENT_FILE, []);
  const newItem = { id: `adj-${Date.now()}`, createdAt: new Date().toISOString(), ...req.body };
  list.unshift(newItem);
  saveDbFile(PREMIUM_ADJUSTMENT_FILE, list);
  res.json(newItem);
});
app.patch("/api/premium-adjustments/:id", (req, res) => {
  const list = loadDbFile(PREMIUM_ADJUSTMENT_FILE, []);
  const index = list.findIndex((x: any) => x.id === req.params.id);
  if (index !== -1) {
    list[index] = { ...list[index], ...req.body };
    saveDbFile(PREMIUM_ADJUSTMENT_FILE, list);
    res.json(list[index]);
  } else {
    res.status(404).json({ error: "Adjustment request not found" });
  }
});

// 13. ComplianceAuditLog endpoints (append-only ledger: no PATCH or DELETE endpoint at all!)
app.get("/api/compliance-logs", (req, res) => {
  res.json(loadDbFile(AUDIT_LOG_FILE, []));
});
app.post("/api/compliance-logs", (req, res) => {
  const { action, entityType, entityId, actorId, actorType, details } = req.body;
  if (!action || !entityType || !entityId || !actorId || !actorType) {
    return res.status(400).json({ error: "Missing required compliance log fields" });
  }
  const newLog = addAuditLog({ action, entityType, entityId, actorId, actorType, details });
  res.json(newLog);
});

// 14. RoomScanResult endpoints
app.get("/api/room-scans", (req, res) => {
  res.json(loadDbFile(ROOM_SCAN_FILE, []));
});
app.post("/api/room-scans", (req, res) => {
  const list = loadDbFile(ROOM_SCAN_FILE, []);
  const newItem = { id: `scan-${Date.now()}`, date: new Date().toISOString(), ...req.body };
  list.unshift(newItem);
  saveDbFile(ROOM_SCAN_FILE, list);
  addAuditLog({
    action: "ROOM_SCAN_COMPLETED",
    entityType: "room_scan",
    entityId: newItem.id,
    actorId: req.body.actorId || "customer",
    actorType: req.body.actorId ? "staff" : "customer",
    details: { roomType: newItem.analysis?.roomType, clutterScore: newItem.analysis?.clutterScore }
  });
  res.json(newItem);
});
app.patch("/api/room-scans/:id", (req, res) => {
  const list = loadDbFile(ROOM_SCAN_FILE, []);
  const index = list.findIndex((x: any) => x.id === req.params.id);
  if (index !== -1) {
    list[index] = { ...list[index], ...req.body };
    saveDbFile(ROOM_SCAN_FILE, list);
    res.json(list[index]);
  } else {
    res.status(404).json({ error: "Room scan not found" });
  }
});

// ----------------------------------------------------
// Customer Claims Submission helper integration (Dual Support)
// ----------------------------------------------------
app.post("/api/submit-claim", (req, res) => {
  const { policyNumber, claimType, phoneNumber, description } = req.body;

  if (!policyNumber || !claimType || !phoneNumber) {
    return res.status(400).json({ error: "Required fields missing for claims notification." });
  }

  const claimId = `UTM-CLM-${Math.floor(100000 + Math.random() * 900000)}`;
  const timestamp = new Date().toISOString();

  // Create claim entry
  const claimsList = loadDbFile(CLAIM_FILE, []);
  const newClaimRecord = {
    id: claimId,
    clmId: claimId,
    client: "Direct Customer Submission",
    type: claimType,
    claimType: claimType,
    policyNumber: policyNumber,
    insurer: "Processing Placement Panel",
    sum: 0,
    status: "Notification received",
    timestamp,
    phoneNumber,
    description: description || ""
  };
  claimsList.unshift(newClaimRecord);
  saveDbFile(CLAIM_FILE, claimsList);

  addAuditLog({
    action: "CLAIM_SUBMITTED",
    entityType: "claim",
    entityId: claimId,
    actorId: "customer",
    actorType: "customer",
    details: { policyNumber, claimType, phoneNumber }
  });

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
});

// ----------------------------------------------------
// Health Check Checkpoint
// ----------------------------------------------------
app.get("/api/health", (req, res) => {
  res.json({ status: "healthy", time: new Date() });
});

// ----------------------------------------------------
// Vite Dev Server Middleware or Static Build Serving
// ----------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    // Development Environment
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Middlewares integrated in Vite Dev Mode.");
  } else {
    // Production Environment
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("Serving static files in production from dist...");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Utmost Insurance Brokers platform is listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
