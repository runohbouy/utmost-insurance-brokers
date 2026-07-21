import React, { useState, useEffect } from "react";
import { mockInsurers } from "../data/mockInsurers";
import { EXTRA_LICENSED_CLASSES } from "../data/extraLicensedClasses";
import { OTHER_LINE_CATEGORIES } from "../data/otherLineCategories";
import { ActiveTab } from "../types";
import { Product, PRODUCT_CATEGORIES } from "../data/allProducts";
import { getStoredProducts, saveProducts } from "../data/productStore";
import {
  Settings2, Users, AlertCircle, FileText, CheckCircle, Database,
  TrendingUp, Percent, Award, Download, ShieldAlert, Sparkles, RefreshCw,
  PlusCircle, Edit2, CheckSquare, EyeOff, LayoutGrid, Check, FolderSync, Trash2
} from "lucide-react";

interface AdminPortalViewProps {
  setActiveTab: (tab: ActiveTab) => void;
}

export default function AdminPortalView({ setActiveTab }: AdminPortalViewProps) {
  const [adminRole, setAdminRole] = useState<string>("Underwriting and Placement");
  const [appetiteInsurer, setAppetiteInsurer] = useState<string>("icea");
  const [isAppetiteActive, setIsAppetiteActive] = useState<boolean>(true);
  
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [recentClaims, setRecentClaims] = useState<any[]>([]);
  const [recentRoomScans, setRecentRoomScans] = useState<any[]>([]);

  // Underwriter Rates Database States
  const [ratesData, setRatesData] = useState<any>(null);
  const [selectedInsurerId, setSelectedInsurerId] = useState<string>("icea");
  const [activeRates, setActiveRates] = useState<any>({
    insurerName: "",
    motorTpoRate: 7500,
    medicalMultiplier: 1.0,
    medicalMaternityRate: 18000,
    medicalDentalOptRate: 8500,
    sumInsuredBands: [],
    vehicleTypes: [],
    commercialRates: {},
    riders: [],
    tpoRates: {},
    otherLines: {}
  });

  // Motor classes with their own sum-insured-banded comprehensive rate table.
  const RATE_CLASSES: { id: string; label: string }[] = [
    { id: "private", label: "Motor Private" },
    { id: "commercial_goods", label: "Commercial Own Goods" },
    { id: "commercial_general_cartage", label: "Commercial General Cartage" },
    { id: "institutional", label: "Institutional / School Bus" }
  ];
  const [selectedRateClass, setSelectedRateClass] = useState<string>("private");

  const [selectedOtherLine, setSelectedOtherLine] = useState<string>("domestic_package");

  // Class-code license data for the 3 built-in motor-engine insurers that don't have a
  // mockInsurers profile (they only exist in server.ts's hardcoded insurer list).
  // NOTE on AAR: the IRA notice lists AAR Insurance (Kenya) Limited as licensed for
  // 02,03,04,05,06,09,10,11,12,14 - it does NOT include 07/08 (Motor Private/Commercial),
  // even though this platform currently sells AAR motor quotes. That's a real discrepancy
  // worth checking with AAR/IRA directly - it is intentionally NOT enforced here (AAR's
  // Motor Private/Commercial rate tabs stay usable) since silently pulling a live carrier
  // from the motor engine is a bigger call than this admin-UI change should make alone.
  const getLicensedClasses = (insurerId: string): { general?: string[]; life?: string[] } => {
    const profile = mockInsurers.find((m) => m.id === insurerId);
    if (profile) return { general: profile.licensedGeneralClasses, life: profile.licensedLifeClasses };
    return EXTRA_LICENSED_CLASSES[insurerId] || {};
  };

  // Only restrict the tab list when we actually have license data for this insurer;
  // insurers with no verified match show every category, unrestricted.
  const visibleOtherLineCategories = (() => {
    const licensed = getLicensedClasses(selectedInsurerId);
    if (!licensed.general && !licensed.life) return OTHER_LINE_CATEGORIES;
    return OTHER_LINE_CATEGORIES.filter((cat) => {
      const codes = (cat.kind === "general" ? licensed.general : licensed.life) || [];
      if (cat.code === "33a") return codes.includes("33a") || codes.includes("33b");
      if (cat.code === "37a") return codes.includes("37a") || codes.includes("37b");
      return codes.includes(cat.code);
    });
  })();

  const [pcfRateVal, setPcfRateVal] = useState<number>(0.25);
  const [itlRateVal, setItlRateVal] = useState<number>(0.20);
  const [stampDutyVal, setStampDutyVal] = useState<number>(40);

  // Helper functions to update deeply nested fields in activeRates
  const updateVehicleType = (typeId: string, field: string, value: any) => {
    setActiveRates((prev: any) => {
      const updatedTypes = prev.vehicleTypes.map((vt: any) => {
        if (vt.typeId === typeId) {
          return { ...vt, [field]: value };
        }
        return vt;
      });
      return { ...prev, vehicleTypes: updatedTypes };
    });
  };

  const updateTpoRate = (usageId: string, value: number) => {
    setActiveRates((prev: any) => {
      const updatedTpo = { ...(prev.tpoRates || {}), [usageId]: value };
      return { ...prev, tpoRates: updatedTpo };
    });
  };

  const updateWindscreenLimit = (typeId: string, value: number) => {
    setActiveRates((prev: any) => {
      const updatedRiders = prev.riders.map((r: any) => {
        if (r.riderId === "windscreen") {
          return {
            ...r,
            limits: {
              ...(r.limits || {}),
              [typeId]: value
            }
          };
        }
        return r;
      });
      return { ...prev, riders: updatedRiders };
    });
  };

  // Upserts a single field on a rider by id - creates the rider entry if this insurer's
  // record predates it (e.g. an older insurer with no "radio" or "courtesy_car" rider yet).
  const updateRiderField = (riderId: string, riderName: string, field: string, value: any) => {
    setActiveRates((prev: any) => {
      const riders = prev.riders || [];
      const idx = riders.findIndex((r: any) => r.riderId === riderId);
      if (idx === -1) {
        return { ...prev, riders: [...riders, { riderId, riderName, [field]: value }] };
      }
      return { ...prev, riders: riders.map((r: any, i: number) => (i === idx ? { ...r, [field]: value } : r)) };
    });
  };

  const getRider = (riderId: string) => activeRates.riders?.find((r: any) => r.riderId === riderId) || {};

  // Sum-insured band tables live in two places depending on class:
  // "private" reads/writes the top-level sumInsuredBands array, while every other
  // motor class reads/writes commercialRates[classId].bands (matching the binder-sourced schema).
  const getClassBands = (rates: any, classId: string): any[] =>
    classId === "private" ? (rates.sumInsuredBands || []) : (rates.commercialRates?.[classId]?.bands || []);

  const getClassMinPremium = (rates: any, classId: string): number | null =>
    classId === "private" ? null : (rates.commercialRates?.[classId]?.minPremium ?? 0);

  const updateClassBand = (classId: string, index: number, field: string, value: any) => {
    setActiveRates((prev: any) => {
      if (classId === "private") {
        const bands = prev.sumInsuredBands.map((b: any, idx: number) => (idx === index ? { ...b, [field]: value } : b));
        return { ...prev, sumInsuredBands: bands };
      }
      const cr = prev.commercialRates || {};
      const cls = cr[classId] || { bands: [], minPremium: 0 };
      const bands = cls.bands.map((b: any, idx: number) => (idx === index ? { ...b, [field]: value } : b));
      return { ...prev, commercialRates: { ...cr, [classId]: { ...cls, bands } } };
    });
  };

  const addClassBand = (classId: string) => {
    setActiveRates((prev: any) => {
      const currentBands = classId === "private" ? (prev.sumInsuredBands || []) : (prev.commercialRates?.[classId]?.bands || []);
      const lastBand = currentBands[currentBands.length - 1];
      const newMin = lastBand ? lastBand.max + 1 : 0;
      const newBand = { min: newMin, max: newMin + 1000000, rate: lastBand?.rate ?? 4.0 };

      if (classId === "private") {
        return { ...prev, sumInsuredBands: [...currentBands, newBand] };
      }
      const cr = prev.commercialRates || {};
      const cls = cr[classId] || { bands: [], minPremium: 50000 };
      return { ...prev, commercialRates: { ...cr, [classId]: { ...cls, bands: [...cls.bands, newBand] } } };
    });
  };

  const removeClassBand = (classId: string, index: number) => {
    setActiveRates((prev: any) => {
      if (classId === "private") {
        return { ...prev, sumInsuredBands: (prev.sumInsuredBands || []).filter((_: any, idx: number) => idx !== index) };
      }
      const cr = prev.commercialRates || {};
      const cls = cr[classId] || { bands: [], minPremium: 0 };
      return { ...prev, commercialRates: { ...cr, [classId]: { ...cls, bands: cls.bands.filter((_: any, idx: number) => idx !== index) } } };
    });
  };

  const updateClassMinPremium = (classId: string, value: number) => {
    setActiveRates((prev: any) => {
      const cr = prev.commercialRates || {};
      const cls = cr[classId] || { bands: [], minPremium: 0 };
      return { ...prev, commercialRates: { ...cr, [classId]: { ...cls, minPremium: value } } };
    });
  };

  // Motor Private has no single class-level min premium - the binder sets one uniform
  // min premium across all vehicle body types, stored per-type in vehicleTypes[].minPremium.
  // This convenience setter updates all of them together in one field.
  const updatePrivateMinPremiumAll = (value: number) => {
    setActiveRates((prev: any) => ({
      ...prev,
      vehicleTypes: (prev.vehicleTypes || []).map((vt: any) => ({ ...vt, minPremium: value }))
    }));
  };

  // Helpers for the generic non-motor "Other Product Lines" itemized rate tables.
  const getOtherLine = (categoryId: string) =>
    activeRates.otherLines?.[categoryId] || { label: OTHER_LINE_CATEGORIES.find((c) => c.id === categoryId)?.label || categoryId, minPremium: 0, items: [] };

  const updateOtherLineMinPremium = (categoryId: string, value: number) => {
    setActiveRates((prev: any) => {
      const ol = prev.otherLines || {};
      const cat = ol[categoryId] || { label: categoryId, minPremium: 0, items: [] };
      return { ...prev, otherLines: { ...ol, [categoryId]: { ...cat, minPremium: value } } };
    });
  };

  const updateOtherLineItem = (categoryId: string, index: number, field: string, value: any) => {
    setActiveRates((prev: any) => {
      const ol = prev.otherLines || {};
      const cat = ol[categoryId] || { label: categoryId, minPremium: 0, items: [] };
      const items = cat.items.map((it: any, idx: number) => (idx === index ? { ...it, [field]: value } : it));
      return { ...prev, otherLines: { ...ol, [categoryId]: { ...cat, items } } };
    });
  };

  const addOtherLineItem = (categoryId: string) => {
    setActiveRates((prev: any) => {
      const ol = prev.otherLines || {};
      const label = OTHER_LINE_CATEGORIES.find((c) => c.id === categoryId)?.label || categoryId;
      const cat = ol[categoryId] || { label, minPremium: 0, items: [] };
      const newItem = { name: "New item", rateType: "percent", rate: 0 };
      return { ...prev, otherLines: { ...ol, [categoryId]: { ...cat, items: [...cat.items, newItem] } } };
    });
  };

  const removeOtherLineItem = (categoryId: string, index: number) => {
    setActiveRates((prev: any) => {
      const ol = prev.otherLines || {};
      const cat = ol[categoryId] || { label: categoryId, minPremium: 0, items: [] };
      return { ...prev, otherLines: { ...ol, [categoryId]: { ...cat, items: cat.items.filter((_: any, idx: number) => idx !== index) } } };
    });
  };

  // Product Directory state
  const [productsList, setProductsList] = useState<Product[]>([]);
  const [activeAdminSubTab, setActiveAdminSubTab] = useState<"workspace" | "products">("workspace");
  
  // Edit form state
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [productForm, setProductForm] = useState({
    id: "",
    name: "",
    category: "motor",
    shortDesc: "",
    fullDesc: "",
    icon: "🚗",
    status: "active" as "active" | "inactive",
    featured: false,
    quotationMethod: "Instant Indicative Quote" as any,
    requiredForm: "none" as any,
    availableCustomerTypes: ["individual"] as string[],
    availableInsurers: ["ICEA LION", "Jubilee"] as string[],
    requiredDocuments: ["Logbook copy"] as string[],
    adviserSpecialisation: "Motor Specialist Desk",
    relatedProducts: ["private-motor-comprehensive"] as string[],
    seoTitle: "",
    seoDescription: ""
  });

  const roles = [
    "Super Administrator", "Underwriting and Placement", "Claims", "Finance", "Compliance & Data Protection"
  ];

  // Built-in carriers that already ship with the platform (hardcoded quote engine + rate defaults).
  // Anything the admin adds through the Insurer Registry appends to this list rather than replacing it.
  const BUILT_IN_INSURERS = [
    { id: "jubilee", tradingName: "Jubilee Insurance" },
    { id: "icea", tradingName: "ICEA LION" },
    { id: "heritage", tradingName: "Heritage Insurance" },
    { id: "cic", tradingName: "CIC General Insurance" },
    { id: "kenindia", tradingName: "Kenindia Assurance" },
    { id: "stardiscover", tradingName: "Star Discover Insurance Limited" },
    { id: "britam", tradingName: "Britam Insurance" },
    { id: "aar", tradingName: "AAR Insurance (Kenya) Limited" },
    { id: "oldmutual", tradingName: "Old Mutual General Insurance Kenya Limited" },
    { id: "geminia", tradingName: "Geminia Insurance" },
    { id: "mua", tradingName: "MUA Insurance" },
    { id: "cannon", tradingName: "Cannon General Insurance" }
  ];

  // Insurer Registry state - admin-added underwriters, persisted server-side so they're
  // usable both for quoting (once rated) and for staff-facing carrier selection.
  const [customInsurers, setCustomInsurers] = useState<any[]>([]);
  const [editingInsurerId, setEditingInsurerId] = useState<string | null>(null);
  const [insurerForm, setInsurerForm] = useState({
    id: "",
    name: "",
    tradingName: "",
    logoEmoji: "🏢",
    rating: "",
    established: new Date().getFullYear(),
    claimTurnaroundDays: 7,
    emergencyPhone: "",
    strengthReason: "",
    availableProducts: "" // comma-separated in the form, split into an array on submit
  });

  // mockInsurers.ts holds several profile-only carriers (Madison, Pioneer, Monarch, Capex,
  // Liberty) that never made it into BUILT_IN_INSURERS because they have no motor-engine rates
  // yet - without this they'd be invisible in this dropdown and unconfigurable entirely.
  const profileOnlyInsurers = mockInsurers
    .filter((m) => !BUILT_IN_INSURERS.some((b) => b.id === m.id))
    .map((m) => ({ id: m.id, tradingName: m.tradingName }));

  const allCarrierOptions = [
    ...BUILT_IN_INSURERS,
    ...profileOnlyInsurers,
    ...customInsurers.map((c) => ({ id: c.id, tradingName: c.tradingName || c.name }))
  ];

  const fetchCustomInsurers = async () => {
    try {
      const res = await fetch("/api/insurers");
      if (res.ok) {
        setCustomInsurers(await res.json());
      }
    } catch (err) {
      console.error("Error fetching insurer registry:", err);
    }
  };

  const resetInsurerForm = () => {
    setEditingInsurerId(null);
    setInsurerForm({
      id: "", name: "", tradingName: "", logoEmoji: "🏢", rating: "",
      established: new Date().getFullYear(), claimTurnaroundDays: 7, emergencyPhone: "",
      strengthReason: "", availableProducts: ""
    });
  };

  const handleSelectEditInsurer = (ins: any) => {
    setEditingInsurerId(ins.id);
    setInsurerForm({
      id: ins.id,
      name: ins.name || "",
      tradingName: ins.tradingName || "",
      logoEmoji: ins.logoEmoji || "🏢",
      rating: ins.rating || "",
      established: ins.established || new Date().getFullYear(),
      claimTurnaroundDays: ins.claimTurnaroundDays || 7,
      emergencyPhone: ins.emergencyPhone || "",
      strengthReason: ins.strengthReason || "",
      availableProducts: (ins.availableProducts || []).join(", ")
    });
  };

  const handleInsurerFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!insurerForm.tradingName.trim()) {
      alert("Please provide a Trading Name for the insurer.");
      return;
    }
    try {
      const res = await fetch("/api/insurers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingInsurerId || undefined,
          name: insurerForm.name || insurerForm.tradingName,
          tradingName: insurerForm.tradingName,
          logoEmoji: insurerForm.logoEmoji,
          rating: insurerForm.rating,
          established: Number(insurerForm.established),
          claimTurnaroundDays: Number(insurerForm.claimTurnaroundDays),
          emergencyPhone: insurerForm.emergencyPhone,
          strengthReason: insurerForm.strengthReason,
          availableProducts: insurerForm.availableProducts.split(",").map((s) => s.trim()).filter(Boolean),
          updatedByStaffId: "staff-1"
        })
      });
      const data = await res.json();
      if (res.ok) {
        setCustomInsurers(data.insurers);
        resetInsurerForm();
        await fetchDashboardData();
        alert(`Success: ${data.insurer.tradingName} saved to the Insurer Registry. It's now selectable in the Database Rates Desk and Appetite Register.`);
      } else {
        alert(data.error || "Failed to save insurer.");
      }
    } catch (err) {
      console.error("Error saving insurer:", err);
      alert("Insurer Registry server connection error.");
    }
  };

  const handleDeleteInsurer = async (id: string) => {
    if (!confirm(`Remove ${id} from the Insurer Registry? This does not affect any rates already configured for it.`)) return;
    try {
      const res = await fetch(`/api/insurers/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updatedByStaffId: "staff-1" })
      });
      const data = await res.json();
      if (res.ok) {
        setCustomInsurers(data.insurers);
        if (editingInsurerId === id) resetInsurerForm();
      } else {
        alert(data.error || "Failed to delete insurer.");
      }
    } catch (err) {
      console.error("Error deleting insurer:", err);
    }
  };

  // Default rider set used only when an insurer record has no riders configured yet.
  const DEFAULT_RIDERS = [
    { riderId: "excess_protector", riderName: "Excess Protector", rate: 0.25, minPremium: 2500 },
    { riderId: "pvt", riderName: "Political Violence & Terrorism", rate: 0.25, minPremium: 2000 },
    { riderId: "windscreen", riderName: "Windscreen Cover", rate: 10.0, minPremium: 1500, limits: { saloon: 50000, suv: 100000, pickup: 50000, sports: 150000 } },
    { riderId: "radio", riderName: "Radio & Entertainment Unit", rate: 10.0, freeLimit: 50000 },
    { riderId: "courtesy_car", riderName: "Courtesy Car / Loss of Use", ratePerDay: 3000, maxDays: 10, waitingDays: 3 }
  ];

  // Normalizes a raw rate-version's "rates" payload into the shape the form expects,
  // filling in sane defaults for any fields an older insurer record predates.
  const buildActiveRatesFromSource = (r: any, insurerId: string) => ({
    insurerName: r.insurerName || insurerId,
    motorTpoRate: r.motorTpoRate || 7500,
    medicalMultiplier: r.medicalMultiplier || 1.0,
    medicalMaternityRate: r.medicalMaternityRate || 18000,
    medicalDentalOptRate: r.medicalDentalOptRate || 8500,
    sumInsuredBands: r.sumInsuredBands || [
      { min: 0, max: 1999999, rate: 4.5 },
      { min: 2000000, max: 4999999, rate: 4.0 },
      { min: 5000000, max: 99999999, rate: 3.75 }
    ],
    vehicleTypes: r.vehicleTypes || [
      { typeId: "saloon", typeName: "Saloon / Hatchback / Wagon", allowedComprehensive: true, rate: 4.25, minPremium: 35000 },
      { typeId: "suv", typeName: "SUV / 4x4 / Luxury", allowedComprehensive: true, rate: 4.0, minPremium: 45000 },
      { typeId: "pickup", typeName: "Commercial Pickups / Vans", allowedComprehensive: true, rate: 5.0, minPremium: 50000 },
      { typeId: "sports", typeName: "High-Performance Sports Cars", allowedComprehensive: false, rate: 6.5, minPremium: 120000 }
    ],
    // Per-usage-class comprehensive rate tables (Commercial Own Goods, General Cartage, Institutional).
    // Was previously dropped on load, silently wiping these tables on save - now preserved.
    commercialRates: r.commercialRates || {},
    riders: r.riders && r.riders.length > 0 ? r.riders : DEFAULT_RIDERS,
    tpoRates: r.tpoRates || {
      private: r.motorTpoRate || 7500,
      commercial_goods: 10000,
      psv_chaufeur: 12500,
      motorcycle: 3500,
      tricycle: 5000,
      commercial_general_cartage: 15000,
      institutional: 15000
    },
    // Non-motor product lines (Domestic Package, Fire & Perils, Health/Medical) - empty
    // by default for insurers that haven't been configured with any yet.
    otherLines: r.otherLines || {}
  });

  // Fetch persisted rates from backend database
  const fetchRates = async () => {
    try {
      const res = await fetch("/api/admin/rates");
      if (res.ok) {
        const data = await res.json();
        setRatesData(data);
        if (data && data.versions) {
          const matchedVer = data.versions.find((v: any) => v.insurerId === selectedInsurerId && v.status === "active");
          if (matchedVer && matchedVer.rates) {
            setActiveRates(buildActiveRatesFromSource(matchedVer.rates, selectedInsurerId));
          }
          if (data.levies) {
            setPcfRateVal(data.levies.pcfRate * 100);
            setItlRateVal(data.levies.itlRate * 100);
            setStampDutyVal(data.levies.stampDuty);
          }
        }
      }
    } catch (err) {
      console.error("Error fetching rates from db:", err);
    }
  };

  // Synchronize when selected insurer changes
  useEffect(() => {
    if (ratesData && ratesData.versions) {
      const matchedVer = ratesData.versions.find((v: any) => v.insurerId === selectedInsurerId && v.status === "active");
      // Newly-added carriers (e.g. Pioneer/Monarch/Capex/Liberty, just added to this dropdown)
      // have no rate version yet - reset to clean defaults rather than leaving the previously
      // selected insurer's rates on screen under the new insurer's name.
      setActiveRates(buildActiveRatesFromSource(matchedVer?.rates || {}, selectedInsurerId));
    }
  }, [selectedInsurerId, ratesData]);

  // Reset the Other Product Lines tab to the first one this insurer is actually licensed
  // for whenever the carrier or its license data changes, so switching from e.g. MUA to
  // Capex doesn't leave an unauthorised (or now-hidden) tab selected.
  useEffect(() => {
    if (visibleOtherLineCategories.length > 0 && !visibleOtherLineCategories.some((c) => c.id === selectedOtherLine)) {
      setSelectedOtherLine(visibleOtherLineCategories[0].id);
    }
  }, [selectedInsurerId]);

  const [staffList, setStaffList] = useState<any[]>([]);

  const fetchDashboardData = async () => {
    try {
      // 1. Fetch Staff Directory for lookups
      const staffRes = await fetch("/api/staff");
      let currentStaff: any[] = [];
      if (staffRes.ok) {
        currentStaff = await staffRes.json();
        setStaffList(currentStaff);
      }

      // 2. Fetch live claims from database
      const claimsRes = await fetch("/api/claims");
      if (claimsRes.ok) {
        const claims = await claimsRes.json();
        setRecentClaims(claims);
      }

      // 3. Fetch room scan logs from database
      const scansRes = await fetch("/api/room-scans");
      if (scansRes.ok) {
        const scans = await scansRes.json();
        setRecentRoomScans(scans);
      }

      // 4. Fetch Compliance Audit Logs
      const logsRes = await fetch("/api/compliance-logs");
      if (logsRes.ok) {
        const rawLogs = await logsRes.json();
        
        // Transform server logs to conform to the display fields expected by the UI
        const formatted = rawLogs.map((log: any) => {
          // Resolve staff details dynamically from the Staff store (no hardcoded names)
          const matchedStaff = currentStaff.find((s: any) => s.id === log.actorId);
          const userName = matchedStaff ? (matchedStaff.fullName || matchedStaff.name) : (log.actorId === "system" ? "System Core" : (log.actorId === "customer" ? "Direct Customer" : log.actorId || "System Admin"));
          const roleTitle = matchedStaff ? (
            matchedStaff.role === "underwriter" ? "Underwriting Specialist"
            : matchedStaff.role === "supervisor" ? "Operations Supervisor"
            : matchedStaff.role === "accountant" ? "Financial Accountant"
            : matchedStaff.role === "broker-agent" ? "Broker Agent"
            : matchedStaff.role
          ) : (log.actorId === "system" ? "Engine Core" : (log.actorId === "customer" ? "Public Guest" : "Brokerage Admin"));

          let dateStr = "";
          try {
            const d = new Date(log.timestamp);
            dateStr = d.toLocaleDateString("en-KE") + " " + d.toLocaleTimeString("en-KE").slice(0, 5);
          } catch {
            dateStr = log.timestamp || "";
          }

          let readableAction = log.action;
          if (log.action === "RATE_TABLE_UPDATED") {
            const changesStr = log.details?.changes || "";
            const vId = log.details?.newVersionId || "";
            readableAction = `Overrode risk coefficients & created rate table snapshot '${vId}'. Details: ${changesStr}`;
          } else if (log.action === "RATE_FALLBACK_USED") {
            readableAction = `[SYSTEM FALLBACK WARNING] ${log.details?.reason || "Active rates lookup fell back to defaults."}`;
          } else if (log.action === "CLAIM_SUBMITTED") {
            readableAction = `Registered notification of claim under Policy ${log.details?.policyNumber || ""}`;
          } else if (log.action === "STATUS_TRANSITION") {
            readableAction = `Authorized status transition for Claim ${log.entityId}. Status changed from '${log.details?.oldValue || ""}' to '${log.details?.newValue || ""}'`;
          } else if (log.action === "PARTY_CREATED") {
            readableAction = `Registered new Corporate/Individual Client: ${log.details?.name || ""}`;
          } else if (log.action === "POLICY_CREATED") {
            readableAction = `Bound active risk placement under Carrier ${log.details?.insurer || ""}`;
          } else if (log.action === "PREMIUM_CONFIRMED") {
            readableAction = `Reconciled M-Pesa push receipt. Verified payment confirmation of KES ${(log.details?.amount || 0).toLocaleString()}`;
          } else if (log.action === "ROOM_SCAN_COMPLETED") {
            readableAction = `Processed AI Computer Vision scan of room type '${log.details?.roomType || ""}' (Clutter: ${log.details?.clutterScore || 0}/10)`;
          }

          return {
            date: dateStr,
            user: `${userName} (${roleTitle})`,
            action: readableAction,
            category: log.entityType || log.actorType || "Operations"
          };
        });

        setAuditLogs(formatted);
      }
    } catch (err) {
      console.error("Error loading workspace dashboard from server:", err);
    }
  };

  // Seed simulated realtime records and load rates
  useEffect(() => {
    setProductsList(getStoredProducts());
    fetchRates();
    fetchDashboardData();
    fetchCustomInsurers();
  }, []);

  const handleOverrideRateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const selectedStaffId = adminRole === "Claims" ? "staff-2"
                            : adminRole === "Compliance & Data Protection" ? "staff-3"
                            : adminRole === "Finance" ? "staff-4"
                            : "staff-1";

      const res = await fetch("/api/admin/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          insurerId: selectedInsurerId,
          rates: activeRates,
          pcfRate: pcfRateVal / 100,
          itlRate: itlRateVal / 100,
          stampDuty: stampDutyVal,
          updatedByStaffId: selectedStaffId
        })
      });

      if (res.ok) {
        const updated = await res.json();
        setRatesData(updated.db);
        
        const insName = updated.db?.versions?.find((v: any) => v.insurerId === selectedInsurerId && v.status === "active")?.rates?.insurerName || selectedInsurerId;
        
        // Reload all logs, claims, and data directly from database
        await fetchDashboardData();
        
        alert(`Success: Immutable Snapshot Saved. Rates for ${insName} updated and appended to ComplianceAuditLog.`);
      } else {
        alert("Failed to write rate changes to the database server.");
      }
    } catch (err) {
      console.error("Error updating database rates:", err);
      alert("Quotation Database server connection error.");
    }
  };

  const handleAppetiteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const updatedIns = mockInsurers.find(ins => ins.id === appetiteInsurer) || allCarrierOptions.find(ins => ins.id === appetiteInsurer);
    const selectedStaffId = adminRole === "Claims" ? "staff-2"
                          : adminRole === "Compliance & Data Protection" ? "staff-3"
                          : adminRole === "Finance" ? "staff-4"
                          : "staff-1";

    try {
      // Append a compliance log for appetite change directly to server
      const res = await fetch("/api/compliance-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "STATUS_TRANSITION",
          entityType: "insurer_appetite",
          entityId: appetiteInsurer,
          actorId: selectedStaffId,
          actorType: "staff",
          details: {
            carrierName: updatedIns?.tradingName || "Insurer",
            status: isAppetiteActive ? "Active" : "Closed"
          }
        })
      });

      if (res.ok) {
        await fetchDashboardData();
        alert(`Success: Insurer appetite modified and audited securely on the server.`);
      } else {
        alert("Failed to record appetite change to the server.");
      }
    } catch (err) {
      console.error(err);
      alert("Server connection error when writing appetite change.");
    }
  };

  const handleExportCSV = (table: string) => {
    alert(`Success: Table '${table}' exported in standard Excel CSV format.`);
  };

  // PRODUCT ACTIONS FOR SECTION 13 REQUIREMENT
  const handleFeaturedToggle = (prodId: string) => {
    const updated = productsList.map(p => {
      if (p.id === prodId) {
        const nextState = !p.featured;
        const logMsg = {
          date: new Date().toLocaleDateString("en-KE") + " " + new Date().toLocaleTimeString("en-KE").slice(0, 5),
          user: "Super Administrator",
          action: `Toggled Featured marker on ${p.name} to ${nextState}`,
          category: "Underwriting"
        };
        setAuditLogs(prev => [logMsg, ...prev]);
        return { ...p, featured: nextState };
      }
      return p;
    });
    setProductsList(updated);
    saveProducts(updated);
  };

  const handleStatusToggle = (prodId: string) => {
    const updated = productsList.map(p => {
      if (p.id === prodId) {
        const nextState = p.status === "active" ? "inactive" : "active";
        const logMsg = {
          date: new Date().toLocaleDateString("en-KE") + " " + new Date().toLocaleTimeString("en-KE").slice(0, 5),
          user: "Super Administrator",
          action: `Updated visibility status on product ${p.name} to ${nextState}`,
          category: "Compliance"
        };
        setAuditLogs(prev => [logMsg, ...prev]);
        return { ...p, status: nextState as any };
      }
      return p;
    });
    setProductsList(updated);
    saveProducts(updated);
  };

  const handleSelectEditProduct = (prod: Product) => {
    setEditingProduct(prod);
    setIsAddingNew(false);
    setProductForm({
      id: prod.id,
      name: prod.name,
      category: prod.category,
      shortDesc: prod.shortDesc,
      fullDesc: prod.fullDesc,
      icon: prod.icon,
      status: prod.status,
      featured: prod.featured,
      quotationMethod: prod.quotationMethod,
      requiredForm: prod.requiredForm,
      availableCustomerTypes: prod.availableCustomerTypes,
      availableInsurers: prod.availableInsurers,
      requiredDocuments: prod.requiredDocuments,
      adviserSpecialisation: prod.adviserSpecialisation,
      relatedProducts: prod.relatedProducts || [],
      seoTitle: prod.seoTitle || "",
      seoDescription: prod.seoDescription || ""
    });
  };

  const handleStartAddNew = () => {
    setEditingProduct(null);
    setIsAddingNew(true);
    setProductForm({
      id: `custom-prod-${Date.now()}`,
      name: "",
      category: "business",
      shortDesc: "",
      fullDesc: "",
      icon: "💼",
      status: "active",
      featured: false,
      quotationMethod: "Guided Online Quote",
      requiredForm: "none",
      availableCustomerTypes: ["business"],
      availableInsurers: ["ICEA LION", "Jubilee", "Heritage"],
      requiredDocuments: ["Registration certificate"],
      adviserSpecialisation: "SME Advisory Desk",
      relatedProducts: ["sme-business-combined"],
      seoTitle: "",
      seoDescription: ""
    });
  };

  const handleSaveProductForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productForm.name) {
      alert("Please specify a catalog Product Name.");
      return;
    }

    let updatedList: Product[] = [];
    if (isAddingNew) {
      // Create new
      const newP: Product = {
        ...productForm,
        displayOrder: productsList.length + 1,
        navPosition: "Insurance Products"
      };
      updatedList = [...productsList, newP];
      const logMsg = {
        date: new Date().toLocaleDateString("en-KE") + " " + new Date().toLocaleTimeString("en-KE").slice(0, 5),
        user: "Super Administrator",
        action: `Added NEW Product: ${newP.name} inside category ${newP.category}`,
        category: "Underwriting"
      };
      setAuditLogs(prev => [logMsg, ...prev]);
    } else {
      // Edit existing
      updatedList = productsList.map(p => {
        if (p.id === productForm.id) {
          return {
            ...p,
            ...productForm
          };
        }
        return p;
      });
      const logMsg = {
        date: new Date().toLocaleDateString("en-KE") + " " + new Date().toLocaleTimeString("en-KE").slice(0, 5),
        user: "Super Administrator",
        action: `Edited catalog product parameters on ${productForm.name}`,
        category: "Underwriting"
      };
      setAuditLogs(prev => [logMsg, ...prev]);
    }

    setProductsList(updatedList);
    saveProducts(updatedList);
    setIsAddingNew(false);
    setEditingProduct(null);
    alert("Persistence storage updated successfully!");
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 font-sans text-left space-y-12" id="admin-portal-dashboard">
      
      {/* HEADER SECTION */}
      <div className="border-b border-[#D8E2F0] pb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="text-left">
          <span className="border border-[#316EC9]/30 bg-[#F0F5FC] px-2.5 py-0.5 text-[9px] font-bold text-[#316EC9] uppercase tracking-wider rounded-none mb-2 inline-block">Internal Audit Console</span>
          <h1 className="text-3xl font-serif italic tracking-tight text-[#1A1A1A]">
            Utmost Certified Brokerage Workspace
          </h1>
          <p className="text-xs text-[#8C887D] mt-1.5 max-w-4xl leading-relaxed">
            Maker-checker rate override, compliance registers, data controllers dashboards and claims logs.
          </p>
        </div>

        {/* WORKSPACE ROLE SELECTOR */}
        <div className="space-y-1.5 text-left font-sans">
          <label className="text-[9px] font-bold text-[#8C887D] uppercase tracking-wider">Broker Role Workspace</label>
          <div>
            <select
              value={adminRole}
              onChange={(e) => setAdminRole(e.target.value)}
              className="rounded-none border border-[#D8E2F0] px-3.5 py-2.5 text-xs font-bold text-slate-700 bg-white focus:border-[#316EC9] focus:outline-none"
            >
              {roles.map((r, i) => (
                <option key={i} value={r}>{r}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ADMIN CONTROL TABS SEARCH BAR */}
      <div className="flex border-b border-[#D8E2F0]">
        <button
          onClick={() => setActiveAdminSubTab("workspace")}
          className={`px-5 py-3 text-xs uppercase tracking-widest font-bold font-mono transition-all border-b-2 ${
            activeAdminSubTab === "workspace" 
              ? "border-[#142C54] text-[#142C54]" 
              : "border-transparent text-gray-400 hover:text-black"
          }`}
        >
          📈 Operations Workspace
        </button>
        <button
          onClick={() => setActiveAdminSubTab("products")}
          className={`px-5 py-3 text-xs uppercase tracking-widest font-bold font-mono transition-all border-b-2 ${
            activeAdminSubTab === "products" 
              ? "border-[#142C54] text-[#142C54]" 
              : "border-transparent text-gray-400 hover:text-black"
          }`}
        >
          📂 Product catalog manager (Persisted)
        </button>
      </div>

      {activeAdminSubTab === "workspace" ? (
        <>
          {/* ADMIN LEVEL METRIC COUNTERS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6" id="admin-counters-grid">
            
            {/* KPI 1 */}
            <div className="rounded-none border border-[#D8E2F0] bg-white p-5 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[9px] font-extrabold text-[#8C887D] uppercase tracking-wider block">Total Quotations Placed</span>
                <p className="text-2xl font-serif italic text-[#1A1A1A]">165 Leads</p>
                <span className="text-[10px] text-[#316EC9] font-bold font-mono">↑ 18.2% from Last Week</span>
              </div>
              <div className="border border-[#D8E2F0] bg-[#FAF9F6] p-2.5 rounded-none">
                <TrendingUp className="h-6 w-6 text-[#316EC9]" />
              </div>
            </div>

            {/* KPI 2 */}
            <div className="rounded-none border border-[#D8E2F0] bg-white p-5 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[9px] font-extrabold text-[#8C887D] uppercase tracking-wider block">Total Premium Placed</span>
                <p className="text-2xl font-serif italic text-[#316EC9] font-mono">KES 14.8M</p>
                <span className="text-[10px] text-[#8C887D] font-bold font-mono">↑ KES 1.2M Placed Today</span>
              </div>
              <div className="border border-[#D8E2F0] bg-[#FAF9F6] p-2.5 rounded-none">
                <RefreshCw className="h-6 w-6 text-[#1A1A1A]" />
              </div>
            </div>

            {/* KPI 3 */}
            <div className="rounded-none border border-[#D8E2F0] bg-white p-5 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[9px] font-extrabold text-slate-900 uppercase tracking-wider block font-sans">Active AI scans</span>
                <p className="text-2xl font-serif italic text-slate-900">{recentRoomScans.length} Scans</p>
                <span className="text-[10px] text-emerald-700 font-bold font-mono">100% Inventories saved</span>
              </div>
              <div className="border border-[#D8E2F0] bg-[#FAF9F6] p-2.5 rounded-none">
                <Sparkles className="h-6 w-6 text-[#316EC9]" />
              </div>
            </div>

            {/* KPI 4 */}
            <div className="rounded-none border border-[#D8E2F0] bg-white p-5 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[9px] font-extrabold text-[#8C887D] uppercase tracking-wider block">Resolving Disputes</span>
                <p className="text-2xl font-serif italic text-red-700">{recentClaims.length} Claims Open</p>
                <span className="text-[10px] text-red-600 font-bold font-mono">SLA acknowledge: 4H</span>
              </div>
              <div className="border border-[#D8E2F0] bg-[#FAF9F6] p-2.5 rounded-none font-mono">
                <AlertCircle className="h-6 w-6 text-red-700" />
              </div>
            </div>

          </div>

          {/* WORKSPACE SUBPANELS - three full-width stacked rows */}
          <div className="space-y-6">

              {/* A: DETECTED ROOM SCANS INVENTORY REGISTER */}
              <div className="border border-[#D8E2F0] bg-white p-5 space-y-4 rounded-none">
                <div className="flex justify-between items-center border-b border-[#D8E2F0] pb-3">
                  <h4 className="font-serif italic text-base text-[#1A1A1A]">
                    Underwriting Review: AI Room Inventory Log
                  </h4>
                  <button
                    onClick={() => handleExportCSV("roomScans")}
                    className="uppercase tracking-wider text-[9px] font-bold text-[#1A1A1A] hover:text-[#316EC9] border border-[#D8E2F0] bg-white rounded-none px-2.5 py-1.5 flex items-center space-x-1 cursor-pointer"
                  >
                    <Download className="h-3 w-3 text-[#316EC9]" />
                    <span>Export Inventory</span>
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-slate-600 font-sans" id="analyzer-scans-table">
                    <thead>
                      <tr className="bg-[#FAF9F6] text-[#8C887D] border-b border-[#D8E2F0]">
                        <th className="p-3 text-left font-bold uppercase tracking-wider text-[9px]">Room Class</th>
                        <th className="p-3 text-left font-bold uppercase tracking-wider text-[9px]">Clutter score</th>
                        <th className="p-3 text-left font-bold uppercase tracking-wider text-[9px]">Status Condition</th>
                        <th className="p-3 text-right font-bold uppercase tracking-wider text-[9px]">Contents Val (KES)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentRoomScans.map((scan, idx) => (
                        <tr key={idx} className="border-b border-[#D8E2F0]/70 hover:bg-[#F0F5FC]/40">
                          <td className="p-3 font-serif italic text-[#1A1A1A] text-sm">{scan.analysis?.roomType || "Living Room"}</td>
                          <td className="p-3 font-mono text-xs">{scan.analysis?.clutterScore || 7}/10</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 border text-[9px] font-bold uppercase tracking-wider rounded-none ${
                              scan.analysis?.status === "Highly Organized" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-amber-300 bg-amber-50 text-amber-800"
                            }`}>
                              {scan.analysis?.status || "Cluttered"}
                            </span>
                          </td>
                          <td className="p-3 text-right font-semibold text-[#1A1A1A] font-mono">
                            KES {(scan.analysis?.totalContentsValueKES || 390000).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* B: EMERGENCY CLAIMS LOG */}
              <div className="border border-[#D8E2F0] bg-white p-5 space-y-4 rounded-none">
                <div className="flex justify-between items-center border-b border-[#D8E2F0] pb-3">
                  <h4 className="font-serif italic text-base text-[#1A1A1A]">
                    CRM Active Claims Registration Desk
                  </h4>
                  <button
                    onClick={() => handleExportCSV("claims")}
                    className="uppercase tracking-wider text-[9px] font-bold text-[#1A1A1A] hover:text-[#316EC9] border border-[#D8E2F0] bg-white rounded-none px-2.5 py-1.5 flex items-center space-x-1 cursor-pointer"
                  >
                    <Download className="h-3 w-3 text-[#316EC9]" />
                    <span>Export Claims</span>
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-slate-600 font-sans" id="claims-log-table">
                    <thead>
                      <tr className="bg-[#FAF9F6] text-[#8C887D] border-b border-[#D8E2F0]">
                        <th className="p-3 text-left font-bold uppercase tracking-wider text-[9px]">Claim Ref</th>
                        <th className="p-3 text-left font-bold uppercase tracking-wider text-[9px]">Involved Client</th>
                        <th className="p-3 text-left font-bold uppercase tracking-wider text-[9px]">Category Incident</th>
                        <th className="p-3 text-left font-bold uppercase tracking-wider text-[9px]">Insurer</th>
                        <th className="p-3 text-right font-bold uppercase tracking-wider text-[9px]">SLA status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentClaims.map((clm) => {
                        const claimKey = clm.claimId || clm.id || "UTM-CLM-8419";
                        return (
                          <tr key={claimKey} className="border-b border-[#D8E2F0]/70 hover:bg-[#F0F5FC]/40">
                            <td className="p-3 font-mono font-bold text-red-600 text-xs">{claimKey}</td>
                            <td className="p-3 font-serif italic text-[#1A1A1A] text-xs">{clm.client || "David Kiprop"}</td>
                            <td className="p-3 text-xs">{clm.claimType || clm.type || "Motor Private Accident"}</td>
                            <td className="p-3 text-xs">{clm.insurer || "Jubilee Insurance"}</td>
                            <td className="p-3 text-right">
                              <span className={`px-2 py-0.5 border text-[9px] font-bold uppercase tracking-wider rounded-none ${
                                clm.status === "Submitted to insurer" ? "border-emerald-300 bg-emerald-50 text-emerald-800 font-mono" : "border-amber-300 bg-amber-50 text-amber-800"
                              }`}>
                                {clm.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* UNDERWRITING RATE DATABASE PERSISTENCE PANEL (full page width) */}
              <div className="border border-[#D8E2F0] bg-white p-5 space-y-4 rounded-none" id="coefficient-override-box">
                <h4 className="font-serif italic text-base text-[#1A1A1A] border-b border-[#D8E2F0] pb-2 flex items-center space-x-2">
                  <Database className="h-4 w-4 text-[#316EC9]" />
                  <span>Database Rates Desk</span>
                </h4>
                <p className="text-[11px] text-[#8C887D] leading-relaxed">
                  Configure underwriter-specific quotation rates directly in the active persistent database.
                </p>

                <form onSubmit={handleOverrideRateSubmit} className="space-y-5 text-xs font-semibold">

                  {/* Carrier Select */}
                  <div className="max-w-sm space-y-1">
                    <label className="text-[9px] uppercase tracking-wider text-[#8C887D] font-extrabold">Target Carrier Underwriter</label>
                    <select
                      value={selectedInsurerId}
                      onChange={(e) => setSelectedInsurerId(e.target.value)}
                      className="w-full text-xs font-bold rounded-none border border-[#D8E2F0] bg-white p-2 focus:border-[#316EC9] focus:outline-none"
                    >
                      {allCarrierOptions.map((ins) => (
                        <option key={ins.id} value={ins.id}>{ins.tradingName}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

                    {/* MAIN COLUMN: rate bands by motor class, vehicle eligibility, TPO */}
                    <div className="xl:col-span-2 space-y-5">

                      {/* SECTION 1: Sum Insured Rate Bands by Motor Class - tabular editor */}
                      <div className="border-t border-[#D8E2F0] pt-3">
                        <h5 className="text-[10px] font-extrabold uppercase text-[#142C54] tracking-wider mb-1">
                          Sum Insured Rate Bands by Motor Class
                        </h5>
                        <p className="text-[9px] text-[#8C887D] leading-tight mb-2">
                          Primary rate lookup used to generate comprehensive quotes for this class, sourced from underwriter binder terms. Switch class, then add, remove or resize ranges and adjust each band's rate.
                        </p>

                        {/* Class tabs */}
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {RATE_CLASSES.map((cls) => (
                            <button
                              key={cls.id}
                              type="button"
                              onClick={() => setSelectedRateClass(cls.id)}
                              className={`px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wider border cursor-pointer ${
                                selectedRateClass === cls.id
                                  ? "bg-[#142C54] text-white border-[#142C54]"
                                  : "bg-white text-[#8C887D] border-[#D8E2F0] hover:text-[#142C54]"
                              }`}
                            >
                              {cls.label}
                            </button>
                          ))}
                        </div>

                        {/* Min premium for the selected class */}
                        <div className="max-w-xs mb-3">
                          {selectedRateClass === "private" ? (
                            <>
                              <label className="text-[8px] text-[#8C887D] uppercase block">Min Premium - All Body Types (KES)</label>
                              <input
                                type="number"
                                step="500"
                                min="0"
                                value={activeRates.vehicleTypes?.[0]?.minPremium || 0}
                                onChange={(e) => updatePrivateMinPremiumAll(Number(e.target.value))}
                                className="w-full text-[11px] font-mono font-bold p-1.5 border border-slate-200 bg-white"
                              />
                            </>
                          ) : (
                            <>
                              <label className="text-[8px] text-[#8C887D] uppercase block">
                                Min Premium - {RATE_CLASSES.find((c) => c.id === selectedRateClass)?.label} (KES)
                              </label>
                              <input
                                type="number"
                                step="500"
                                min="0"
                                value={getClassMinPremium(activeRates, selectedRateClass) || 0}
                                onChange={(e) => updateClassMinPremium(selectedRateClass, Number(e.target.value))}
                                className="w-full text-[11px] font-mono font-bold p-1.5 border border-slate-200 bg-white"
                              />
                            </>
                          )}
                        </div>

                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[9px] text-[#8C887D]">{getClassBands(activeRates, selectedRateClass).length} range(s) configured</span>
                          <button
                            type="button"
                            onClick={() => addClassBand(selectedRateClass)}
                            className="text-[9px] font-bold text-[#316EC9] hover:text-[#142C54] flex items-center gap-0.5 uppercase tracking-wider cursor-pointer"
                          >
                            <PlusCircle className="h-3 w-3" />
                            <span>Add Range</span>
                          </button>
                        </div>
                        <div className="overflow-x-auto border border-slate-100">
                          <table className="w-full text-[10px]">
                            <thead>
                              <tr className="bg-slate-50 text-[#8C887D] uppercase tracking-wider text-[8px]">
                                <th className="p-1.5 text-left font-bold">Min SI (KES)</th>
                                <th className="p-1.5 text-left font-bold">Max SI (KES)</th>
                                <th className="p-1.5 text-left font-bold">Rate (%)</th>
                                <th className="p-1.5 w-6"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {getClassBands(activeRates, selectedRateClass).map((band: any, index: number) => (
                                <tr key={index} className="border-t border-slate-100">
                                  <td className="p-1">
                                    <input
                                      type="number"
                                      step="50000"
                                      min="0"
                                      value={band.min ?? 0}
                                      onChange={(e) => updateClassBand(selectedRateClass, index, "min", Number(e.target.value))}
                                      className="w-full text-[10px] font-mono font-bold p-1 border border-slate-200 bg-white"
                                    />
                                  </td>
                                  <td className="p-1">
                                    <input
                                      type="number"
                                      step="50000"
                                      min="0"
                                      value={band.max ?? 0}
                                      onChange={(e) => updateClassBand(selectedRateClass, index, "max", Number(e.target.value))}
                                      className="w-full text-[10px] font-mono font-bold p-1 border border-slate-200 bg-white"
                                    />
                                  </td>
                                  <td className="p-1">
                                    <input
                                      type="number"
                                      step="0.05"
                                      min="0"
                                      max="15"
                                      value={band.rate ?? 0}
                                      onChange={(e) => updateClassBand(selectedRateClass, index, "rate", Number(e.target.value))}
                                      className="w-16 text-[10px] font-mono font-bold p-1 border border-slate-200 bg-white"
                                    />
                                  </td>
                                  <td className="p-1 text-center">
                                    <button
                                      type="button"
                                      onClick={() => removeClassBand(selectedRateClass, index)}
                                      disabled={getClassBands(activeRates, selectedRateClass).length <= 1}
                                      className="text-red-500 hover:text-red-700 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                                      title="Remove range"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* SECTION 2: Vehicle Type Eligibility & legacy body-type rates */}
                      <div className="border-t border-[#D8E2F0] pt-3">
                        <h5 className="text-[10px] font-extrabold uppercase text-[#142C54] tracking-wider mb-1">
                          Vehicle Type Eligibility (Motor Private)
                        </h5>
                        <p className="text-[9px] text-[#8C887D] leading-tight mb-2">
                          Controls which body types qualify for comprehensive cover. Leave "Legacy Rate" at 0 for insurers (like MUA/Cannon) that rate purely by sum insured band above - a non-zero legacy rate here overrides the band lookup for that body type only.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {activeRates.vehicleTypes?.map((vt: any) => (
                            <div key={vt.typeId} className="border border-slate-100 p-2 space-y-1.5 bg-slate-50/50">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-slate-800">{vt.typeName}</span>
                                <label className="flex items-center space-x-1 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={!!vt.allowedComprehensive}
                                    onChange={(e) => updateVehicleType(vt.typeId, "allowedComprehensive", e.target.checked)}
                                    className="h-3.5 w-3.5 rounded-none border-slate-300 text-[#316EC9] focus:ring-[#316EC9]"
                                  />
                                  <span className="text-[9px] text-[#8C887D]">Allowed Comp</span>
                                </label>
                              </div>
                              {vt.allowedComprehensive && (
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[8px] text-[#8C887D] uppercase block">Legacy Rate (%)</label>
                                    <input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      max="15.0"
                                      value={vt.rate || 0}
                                      onChange={(e) => updateVehicleType(vt.typeId, "rate", Number(e.target.value))}
                                      className="w-full text-[11px] font-mono font-bold p-1 border border-slate-200 bg-white"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[8px] text-[#8C887D] uppercase block">Min Premium (KES)</label>
                                    <input
                                      type="number"
                                      step="500"
                                      min="1000"
                                      value={vt.minPremium || 0}
                                      onChange={(e) => updateVehicleType(vt.typeId, "minPremium", Number(e.target.value))}
                                      className="w-full text-[11px] font-mono font-bold p-1 border border-slate-200 bg-white"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* SECTION 3: TPO Flat Rates Matrix */}
                      <div className="border-t border-[#D8E2F0] pt-3">
                        <h5 className="text-[10px] font-extrabold uppercase text-[#142C54] tracking-wider mb-1">
                          TPO Flat Rates by Usage Class
                        </h5>
                        <p className="text-[9px] text-[#8C887D] leading-tight mb-2">
                          New non-private classes are marked as Provisional (Subject to Underwriter Confirmation).
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {[
                            { id: "private", label: "Private Cars", isProvisional: false },
                            { id: "commercial_goods", label: "Commercial Goods", isProvisional: true },
                            { id: "psv_chaufeur", label: "PSV Chauffeur", isProvisional: true },
                            { id: "motorcycle", label: "Motorcycle", isProvisional: true },
                            { id: "tricycle", label: "Tricycle", isProvisional: true },
                            { id: "commercial_general_cartage", label: "General Cartage", isProvisional: true },
                            { id: "institutional", label: "Institutional", isProvisional: true }
                          ].map((u) => (
                            <div key={u.id} className="space-y-1">
                              <label className="text-[8px] uppercase tracking-wider text-slate-700 block leading-none">
                                {u.label} {u.isProvisional && <span className="text-[8px] text-amber-600 font-bold font-sans">(Est)</span>}
                              </label>
                              <input
                                type="number"
                                step="100"
                                min="1000"
                                value={(activeRates.tpoRates && activeRates.tpoRates[u.id]) || 0}
                                onChange={(e) => updateTpoRate(u.id, Number(e.target.value))}
                                className="w-full text-[11px] font-mono font-bold p-1 border border-[#D8E2F0] bg-white focus:outline-none focus:border-[#316EC9]"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* SIDE COLUMN: comprehensive riders, medical base rates, levies */}
                    <div className="space-y-5">

                      {/* SECTION 4: Comprehensive Motor Riders */}
                      <div className="border-t border-[#D8E2F0] pt-3">
                        <h5 className="text-[10px] font-extrabold uppercase text-[#142C54] tracking-wider mb-1">
                          Comprehensive Motor Riders
                        </h5>
                        <p className="text-[9px] text-[#8C887D] leading-tight mb-2">
                          Optional benefits attached to comprehensive cover. Mark a rider "Included Free" when the underwriter bundles it into the base premium at no extra charge (per binder terms) rather than charging a separate rate.
                        </p>
                        <div className="space-y-2">

                          {/* Excess Protector */}
                          {(() => {
                            const rider = getRider("excess_protector");
                            return (
                              <div className="border border-slate-100 p-2 space-y-1.5 bg-slate-50/50">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-slate-800">Excess Protector</span>
                                  <label className="flex items-center space-x-1 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={!!rider.isInclusive}
                                      onChange={(e) => updateRiderField("excess_protector", "Excess Protector", "isInclusive", e.target.checked)}
                                      className="h-3.5 w-3.5 rounded-none border-slate-300 text-[#316EC9] focus:ring-[#316EC9]"
                                    />
                                    <span className="text-[9px] text-[#8C887D]">Included Free</span>
                                  </label>
                                </div>
                                {!rider.isInclusive && (
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="text-[8px] text-[#8C887D] uppercase block">Rate (% of SI)</label>
                                      <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        max="2.0"
                                        value={rider.rate ?? 0.25}
                                        onChange={(e) => updateRiderField("excess_protector", "Excess Protector", "rate", Number(e.target.value))}
                                        className="w-full text-[11px] font-mono font-bold p-1 border border-slate-200 bg-white"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[8px] text-[#8C887D] uppercase block">Min Premium (KES)</label>
                                      <input
                                        type="number"
                                        step="500"
                                        min="0"
                                        value={rider.minPremium ?? 2500}
                                        onChange={(e) => updateRiderField("excess_protector", "Excess Protector", "minPremium", Number(e.target.value))}
                                        className="w-full text-[11px] font-mono font-bold p-1 border border-slate-200 bg-white"
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {/* PVT */}
                          {(() => {
                            const rider = getRider("pvt");
                            return (
                              <div className="border border-slate-100 p-2 space-y-1.5 bg-slate-50/50">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-slate-800">Political Violence & Terrorism</span>
                                  <label className="flex items-center space-x-1 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={!!rider.isInclusive}
                                      onChange={(e) => updateRiderField("pvt", "Political Violence & Terrorism", "isInclusive", e.target.checked)}
                                      className="h-3.5 w-3.5 rounded-none border-slate-300 text-[#316EC9] focus:ring-[#316EC9]"
                                    />
                                    <span className="text-[9px] text-[#8C887D]">Included Free</span>
                                  </label>
                                </div>
                                {!rider.isInclusive && (
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="text-[8px] text-[#8C887D] uppercase block">Rate (% of SI)</label>
                                      <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        max="2.0"
                                        value={rider.rate ?? 0.25}
                                        onChange={(e) => updateRiderField("pvt", "Political Violence & Terrorism", "rate", Number(e.target.value))}
                                        className="w-full text-[11px] font-mono font-bold p-1 border border-slate-200 bg-white"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[8px] text-[#8C887D] uppercase block">Min Premium (KES)</label>
                                      <input
                                        type="number"
                                        step="500"
                                        min="0"
                                        value={rider.minPremium ?? 2000}
                                        onChange={(e) => updateRiderField("pvt", "Political Violence & Terrorism", "minPremium", Number(e.target.value))}
                                        className="w-full text-[11px] font-mono font-bold p-1 border border-slate-200 bg-white"
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {/* Windscreen */}
                          {(() => {
                            const rider = getRider("windscreen");
                            return (
                              <div className="border border-slate-100 p-2 space-y-1.5 bg-slate-50/50">
                                <span className="text-[10px] font-bold text-slate-800 block">Windscreen Cover</span>
                                <div>
                                  <label className="text-[8px] text-[#8C887D] uppercase block">Rate Above Free Limit (%)</label>
                                  <input
                                    type="number"
                                    step="0.5"
                                    min="0"
                                    max="20"
                                    value={rider.rate ?? 10}
                                    onChange={(e) => updateRiderField("windscreen", "Windscreen Cover", "rate", Number(e.target.value))}
                                    className="w-full text-[11px] font-mono font-bold p-1 border border-slate-200 bg-white"
                                  />
                                </div>
                                <label className="text-[8px] text-[#8C887D] uppercase block pt-1">Free Limit by Body Type (KES)</label>
                                <div className="grid grid-cols-2 gap-2">
                                  {activeRates.vehicleTypes?.map((vt: any) => (
                                    <div key={vt.typeId}>
                                      <label className="text-[8px] text-slate-500 block leading-none">{vt.typeName.split(" / ")[0]}</label>
                                      <input
                                        type="number"
                                        step="5000"
                                        min="0"
                                        value={rider.limits?.[vt.typeId] || 50000}
                                        onChange={(e) => updateWindscreenLimit(vt.typeId, Number(e.target.value))}
                                        className="w-full text-[11px] font-mono font-bold p-1 border border-slate-200 bg-white"
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}

                          {/* Radio & Entertainment Unit */}
                          {(() => {
                            const rider = getRider("radio");
                            return (
                              <div className="border border-slate-100 p-2 space-y-1.5 bg-slate-50/50">
                                <span className="text-[10px] font-bold text-slate-800 block">Radio & Entertainment Unit</span>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[8px] text-[#8C887D] uppercase block">Free Limit (KES)</label>
                                    <input
                                      type="number"
                                      step="5000"
                                      min="0"
                                      value={rider.freeLimit ?? 50000}
                                      onChange={(e) => updateRiderField("radio", "Radio & Entertainment Unit", "freeLimit", Number(e.target.value))}
                                      className="w-full text-[11px] font-mono font-bold p-1 border border-slate-200 bg-white"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[8px] text-[#8C887D] uppercase block">Rate Above Limit (%)</label>
                                    <input
                                      type="number"
                                      step="0.5"
                                      min="0"
                                      max="20"
                                      value={rider.rate ?? 0}
                                      onChange={(e) => updateRiderField("radio", "Radio & Entertainment Unit", "rate", Number(e.target.value))}
                                      className="w-full text-[11px] font-mono font-bold p-1 border border-slate-200 bg-white"
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          })()}

                          {/* Courtesy Car / Loss of Use */}
                          {(() => {
                            const rider = getRider("courtesy_car");
                            return (
                              <div className="border border-slate-100 p-2 space-y-1.5 bg-slate-50/50">
                                <span className="text-[10px] font-bold text-slate-800 block">Courtesy Car / Loss of Use</span>
                                <p className="text-[8px] text-[#8C887D] leading-tight">Premium = Rate per Day &times; days claimed, capped at Max Days.</p>
                                <div className="grid grid-cols-3 gap-2">
                                  <div>
                                    <label className="text-[8px] text-[#8C887D] uppercase block">Rate/Day (KES)</label>
                                    <input
                                      type="number"
                                      step="500"
                                      min="0"
                                      value={rider.ratePerDay ?? 3000}
                                      onChange={(e) => updateRiderField("courtesy_car", "Courtesy Car / Loss of Use", "ratePerDay", Number(e.target.value))}
                                      className="w-full text-[11px] font-mono font-bold p-1 border border-slate-200 bg-white"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[8px] text-[#8C887D] uppercase block">Max Days</label>
                                    <input
                                      type="number"
                                      step="1"
                                      min="1"
                                      value={rider.maxDays ?? 10}
                                      onChange={(e) => updateRiderField("courtesy_car", "Courtesy Car / Loss of Use", "maxDays", Number(e.target.value))}
                                      className="w-full text-[11px] font-mono font-bold p-1 border border-slate-200 bg-white"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[8px] text-[#8C887D] uppercase block">Waiting Days</label>
                                    <input
                                      type="number"
                                      step="1"
                                      min="0"
                                      value={rider.waitingDays ?? 3}
                                      onChange={(e) => updateRiderField("courtesy_car", "Courtesy Car / Loss of Use", "waitingDays", Number(e.target.value))}
                                      className="w-full text-[11px] font-mono font-bold p-1 border border-slate-200 bg-white"
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          })()}

                        </div>
                      </div>

                      {/* SECTION 5: Medical Plan Base Rates */}
                      <div className="border-t border-[#D8E2F0] pt-3">
                        <h5 className="text-[10px] font-extrabold uppercase text-[#142C54] tracking-wider mb-2">
                          Medical Plan Base Rates
                        </h5>
                        <div className="space-y-2 bg-slate-50/50 p-2 border border-slate-100">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[8px] text-[#8C887D] uppercase block">Medical Multiplier</label>
                              <input
                                type="number"
                                step="0.01"
                                min="0.5"
                                max="2.0"
                                value={activeRates.medicalMultiplier || 1.0}
                                onChange={(e) => setActiveRates({ ...activeRates, medicalMultiplier: Number(e.target.value) })}
                                className="w-full text-[11px] font-mono font-bold p-1 border border-slate-200 bg-white"
                              />
                            </div>
                            <div>
                              <label className="text-[8px] text-[#8C887D] uppercase block">Maternity Plan Base</label>
                              <input
                                type="number"
                                step="500"
                                min="1000"
                                value={activeRates.medicalMaternityRate || 18000}
                                onChange={(e) => setActiveRates({ ...activeRates, medicalMaternityRate: Number(e.target.value) })}
                                className="w-full text-[11px] font-mono font-bold p-1 border border-slate-200 bg-white"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="text-[8px] text-[#8C887D] uppercase block">Dental/Opt Base</label>
                            <input
                              type="number"
                              step="500"
                              min="1000"
                              value={activeRates.medicalDentalOptRate || 8500}
                              onChange={(e) => setActiveRates({ ...activeRates, medicalDentalOptRate: Number(e.target.value) })}
                              className="w-full text-[11px] font-mono font-bold p-1 border border-slate-200 bg-white"
                            />
                          </div>
                        </div>
                      </div>

                      {/* SECTION 6: Levies */}
                      <div className="border-t border-[#D8E2F0] pt-3">
                        <p className="text-[10px] font-extrabold uppercase text-[#142C54] tracking-wider mb-2">Global Kenya Statutory Levies</p>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[8px] uppercase tracking-wider text-[#8C887D]">PCF Rate (%)</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0.1"
                              max="1.0"
                              value={pcfRateVal}
                              onChange={(e) => setPcfRateVal(Number(e.target.value))}
                              className="w-full text-xs font-semibold rounded-none border border-[#D8E2F0] p-1.5 font-mono text-slate-800 bg-white focus:border-[#316EC9] focus:outline-none"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[8px] uppercase tracking-wider text-[#8C887D]">ITL Rate (%)</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0.1"
                              max="1.0"
                              value={itlRateVal}
                              onChange={(e) => setItlRateVal(Number(e.target.value))}
                              className="w-full text-xs font-semibold rounded-none border border-[#D8E2F0] p-1.5 font-mono text-slate-800 bg-white focus:border-[#316EC9] focus:outline-none"
                            />
                          </div>
                        </div>

                        <div className="space-y-1 mt-1.5">
                          <label className="text-[8px] uppercase tracking-wider text-[#8C887D]">Stamp Duty (KES)</label>
                          <input
                            type="number"
                            step="10"
                            min="10"
                            max="200"
                            value={stampDutyVal}
                            onChange={(e) => setStampDutyVal(Number(e.target.value))}
                            className="w-full text-xs font-semibold rounded-none border border-[#D8E2F0] p-1.5 font-mono text-slate-800 bg-white focus:border-[#316EC9] focus:outline-none"
                          />
                        </div>
                      </div>

                    </div>
                  </div>

                  {/* OTHER PRODUCT LINES: non-motor rate configuration per insurer */}
                  <div className="border-t border-[#D8E2F0] pt-4">
                    <h5 className="text-[10px] font-extrabold uppercase text-[#142C54] tracking-wider mb-1">
                      Other Product Lines
                    </h5>
                    <p className="text-[9px] text-[#8C887D] leading-tight mb-2">
                      Non-motor rate lines for this carrier. Each item is priced as a rate (% or per mille) of sum insured, plus a policy-level minimum premium.
                    </p>
                    {(() => {
                      const licensed = getLicensedClasses(selectedInsurerId);
                      if (!licensed.general && !licensed.life) {
                        return (
                          <p className="text-[9px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 mb-2">
                            No verified IRA licensing data for this carrier - showing all product lines unrestricted.
                          </p>
                        );
                      }
                      const licensedLabels = visibleOtherLineCategories.map((c) => c.label);
                      return (
                        <p className="text-[9px] text-[#8C887D] bg-slate-50 border border-slate-100 px-2 py-1 mb-2">
                          <strong className="text-[#142C54]">Authorised classes (IRA 2026):</strong> {licensedLabels.length > 0 ? licensedLabels.join(", ") : "None outside Motor"}
                        </p>
                      );
                    })()}

                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {visibleOtherLineCategories.map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setSelectedOtherLine(cat.id)}
                          className={`px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wider border cursor-pointer ${
                            selectedOtherLine === cat.id
                              ? "bg-[#142C54] text-white border-[#142C54]"
                              : "bg-white text-[#8C887D] border-[#D8E2F0] hover:text-[#142C54]"
                          }`}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>

                    <div className="max-w-xs mb-3">
                      <label className="text-[8px] text-[#8C887D] uppercase block">
                        Min Premium - {visibleOtherLineCategories.find((c) => c.id === selectedOtherLine)?.label || "N/A"} (KES)
                      </label>
                      <input
                        type="number"
                        step="500"
                        min="0"
                        value={getOtherLine(selectedOtherLine).minPremium || 0}
                        onChange={(e) => updateOtherLineMinPremium(selectedOtherLine, Number(e.target.value))}
                        className="w-full text-[11px] font-mono font-bold p-1.5 border border-slate-200 bg-white"
                      />
                    </div>

                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[9px] text-[#8C887D]">{getOtherLine(selectedOtherLine).items.length} item(s) configured</span>
                      <button
                        type="button"
                        onClick={() => addOtherLineItem(selectedOtherLine)}
                        className="text-[9px] font-bold text-[#316EC9] hover:text-[#142C54] flex items-center gap-0.5 uppercase tracking-wider cursor-pointer"
                      >
                        <PlusCircle className="h-3 w-3" />
                        <span>Add Item</span>
                      </button>
                    </div>
                    <div className="overflow-x-auto border border-slate-100">
                      <table className="w-full text-[10px]">
                        <thead>
                          <tr className="bg-slate-50 text-[#8C887D] uppercase tracking-wider text-[8px]">
                            <th className="p-1.5 text-left font-bold">Item Name</th>
                            <th className="p-1.5 text-left font-bold w-24">Rate</th>
                            <th className="p-1.5 text-left font-bold w-24">Rate Type</th>
                            <th className="p-1.5 w-6"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {getOtherLine(selectedOtherLine).items.map((item: any, index: number) => (
                            <tr key={index} className="border-t border-slate-100">
                              <td className="p-1">
                                <input
                                  type="text"
                                  value={item.name ?? ""}
                                  onChange={(e) => updateOtherLineItem(selectedOtherLine, index, "name", e.target.value)}
                                  className="w-full text-[10px] font-semibold p-1 border border-slate-200 bg-white"
                                />
                              </td>
                              <td className="p-1">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={item.rate ?? 0}
                                  onChange={(e) => updateOtherLineItem(selectedOtherLine, index, "rate", Number(e.target.value))}
                                  className="w-full text-[10px] font-mono font-bold p-1 border border-slate-200 bg-white"
                                />
                              </td>
                              <td className="p-1">
                                <select
                                  value={item.rateType ?? "percent"}
                                  onChange={(e) => updateOtherLineItem(selectedOtherLine, index, "rateType", e.target.value)}
                                  className="w-full text-[10px] font-semibold p-1 border border-slate-200 bg-white"
                                >
                                  <option value="percent">% of SI</option>
                                  <option value="permille">‰ of SI</option>
                                </select>
                              </td>
                              <td className="p-1 text-center">
                                <button
                                  type="button"
                                  onClick={() => removeOtherLineItem(selectedOtherLine, index)}
                                  className="text-red-500 hover:text-red-700 cursor-pointer"
                                  title="Remove item"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-[#142C54] hover:bg-[#316EC9] text-white border border-[#142C54] hover:border-[#316EC9] font-bold py-3 text-[10px] uppercase tracking-widest transition-all rounded-none cursor-pointer flex items-center justify-center space-x-1.5"
                    id="rate-adjustment-button"
                  >
                    <span>Persist Rates to Database</span>
                  </button>
                </form>
              </div>

              {/* INSURER REGISTRY: add brand-new underwriters at runtime */}
              <div className="border border-[#D8E2F0] bg-white p-5 space-y-4 rounded-none" id="insurer-registry-box">
                <h4 className="font-serif italic text-base text-[#1A1A1A] border-b border-[#D8E2F0] pb-2 flex items-center space-x-2">
                  <Database className="h-4 w-4 text-[#316EC9]" />
                  <span>Insurer Registry</span>
                </h4>
                <p className="text-[11px] text-[#8C887D] leading-relaxed">
                  Register new insurance companies so staff can configure their rates above and customers can see them across the platform. Built-in carriers aren't listed here since they already ship with the platform.
                </p>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* List of custom insurers */}
                  <div className="overflow-x-auto border border-slate-100">
                    <table className="w-full text-[10px]">
                      <thead>
                        <tr className="bg-slate-50 text-[#8C887D] uppercase tracking-wider text-[8px]">
                          <th className="p-2 text-left font-bold">Trading Name</th>
                          <th className="p-2 text-left font-bold">Rating</th>
                          <th className="p-2 text-right font-bold">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customInsurers.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="p-4 text-center text-[10px] text-[#8C887D] font-sans">
                              No custom insurers added yet. Use the form to register one.
                            </td>
                          </tr>
                        ) : (
                          customInsurers.map((ins) => (
                            <tr key={ins.id} className="border-t border-slate-100">
                              <td className="p-2 font-bold text-[#142C54]">{ins.logoEmoji} {ins.tradingName}</td>
                              <td className="p-2 text-[#8C887D]">{ins.rating}</td>
                              <td className="p-2 text-right">
                                <button type="button" onClick={() => handleSelectEditInsurer(ins)} className="text-[#316EC9] hover:text-[#142C54] mr-2 cursor-pointer" title="Edit">
                                  <Edit2 className="h-3.5 w-3.5 inline" />
                                </button>
                                <button type="button" onClick={() => handleDeleteInsurer(ins.id)} className="text-red-500 hover:text-red-700 cursor-pointer" title="Remove">
                                  <Trash2 className="h-3.5 w-3.5 inline" />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Add / Edit form */}
                  <form onSubmit={handleInsurerFormSubmit} className="space-y-2.5 text-xs font-semibold">
                    <p className="text-[9px] font-extrabold uppercase text-[#142C54] tracking-wider">
                      {editingInsurerId ? `Editing: ${editingInsurerId}` : "Register New Insurer"}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[8px] text-[#8C887D] uppercase block">Trading Name *</label>
                        <input
                          type="text"
                          required
                          value={insurerForm.tradingName}
                          onChange={(e) => setInsurerForm({ ...insurerForm, tradingName: e.target.value })}
                          placeholder="e.g. Pioneer Assurance"
                          disabled={!!editingInsurerId}
                          className="w-full text-[11px] font-semibold p-1.5 border border-slate-200 bg-white disabled:opacity-50"
                        />
                      </div>
                      <div>
                        <label className="text-[8px] text-[#8C887D] uppercase block">Logo Emoji</label>
                        <input
                          type="text"
                          value={insurerForm.logoEmoji}
                          onChange={(e) => setInsurerForm({ ...insurerForm, logoEmoji: e.target.value })}
                          className="w-full text-[11px] font-semibold p-1.5 border border-slate-200 bg-white text-center"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[8px] text-[#8C887D] uppercase block">Legal / Full Name</label>
                      <input
                        type="text"
                        value={insurerForm.name}
                        onChange={(e) => setInsurerForm({ ...insurerForm, name: e.target.value })}
                        placeholder="e.g. Pioneer Assurance Company Limited"
                        className="w-full text-[11px] font-semibold p-1.5 border border-slate-200 bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-[8px] text-[#8C887D] uppercase block">Rating / Strength Tag</label>
                      <input
                        type="text"
                        value={insurerForm.rating}
                        onChange={(e) => setInsurerForm({ ...insurerForm, rating: e.target.value })}
                        placeholder="e.g. BBB Rated (New Market Entrant)"
                        className="w-full text-[11px] font-semibold p-1.5 border border-slate-200 bg-white"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[8px] text-[#8C887D] uppercase block">Established</label>
                        <input
                          type="number"
                          value={insurerForm.established}
                          onChange={(e) => setInsurerForm({ ...insurerForm, established: Number(e.target.value) })}
                          className="w-full text-[11px] font-mono font-bold p-1.5 border border-slate-200 bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[8px] text-[#8C887D] uppercase block">Claim Turnaround (Days)</label>
                        <input
                          type="number"
                          value={insurerForm.claimTurnaroundDays}
                          onChange={(e) => setInsurerForm({ ...insurerForm, claimTurnaroundDays: Number(e.target.value) })}
                          className="w-full text-[11px] font-mono font-bold p-1.5 border border-slate-200 bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[8px] text-[#8C887D] uppercase block">Emergency Phone</label>
                        <input
                          type="text"
                          value={insurerForm.emergencyPhone}
                          onChange={(e) => setInsurerForm({ ...insurerForm, emergencyPhone: e.target.value })}
                          placeholder="+254 7XX XXXXXX"
                          className="w-full text-[11px] font-semibold p-1.5 border border-slate-200 bg-white"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[8px] text-[#8C887D] uppercase block">Available Products (comma separated)</label>
                      <input
                        type="text"
                        value={insurerForm.availableProducts}
                        onChange={(e) => setInsurerForm({ ...insurerForm, availableProducts: e.target.value })}
                        placeholder="Motor Private, Domestic Package, Fire & Perils"
                        className="w-full text-[11px] font-semibold p-1.5 border border-slate-200 bg-white"
                      />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        type="submit"
                        className="flex-1 bg-[#142C54] hover:bg-[#316EC9] text-white border border-[#142C54] font-bold py-2 text-[10px] uppercase tracking-widest transition-all rounded-none cursor-pointer"
                      >
                        {editingInsurerId ? "Save Changes" : "Register Insurer"}
                      </button>
                      {editingInsurerId && (
                        <button
                          type="button"
                          onClick={resetInsurerForm}
                          className="px-3 border border-slate-300 text-slate-600 hover:text-slate-900 text-[10px] uppercase font-bold tracking-widest cursor-pointer"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </form>
                </div>
              </div>

              {/* INSURER APPETITE REGISTER (kept narrower - it's a two-field toggle form, not a data table) */}
              <div className="max-w-xl border border-[#D8E2F0] bg-white p-5 space-y-4 rounded-none" id="appetite-reg-box">
                <h4 className="font-serif italic text-base text-[#1A1A1A] border-b border-[#D8E2F0] pb-2 flex items-center space-x-2">
                  <Database className="h-4 w-4 text-[#316EC9]" />
                  <span>Appetite Register Catalogs</span>
                </h4>

                <form onSubmit={handleAppetiteSubmit} className="space-y-3.5 text-xs font-semibold">
                  <div className="space-y-1.5">
                    <label className="text-[9px] uppercase tracking-wider text-[#8C887D]">Underwriter Carrier</label>
                    <div>
                      <select
                        value={appetiteInsurer}
                        onChange={(e) => setAppetiteInsurer(e.target.value)}
                        className="w-full text-xs font-bold rounded-none border border-[#D8E2F0] bg-white p-2.5 focus:border-[#316EC9] focus:outline-none"
                      >
                        {allCarrierOptions.map((ins) => (
                          <option key={ins.id} value={ins.id}>{ins.tradingName}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] uppercase tracking-wider text-[#8C887D]">Appetite List Status</label>
                    <div>
                      <select
                        value={isAppetiteActive ? "active" : "closed"}
                        onChange={(e) => setIsAppetiteActive(e.target.value === "active")}
                        className="w-full text-xs font-bold rounded-none border border-[#D8E2F0] bg-white p-2.5 focus:border-[#316EC9] focus:outline-none"
                      >
                        <option value="active">Active (Quoting live)</option>
                        <option value="closed">Closed / Under audit</option>
                      </select>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-[#142C54] hover:bg-[#316EC9] text-white border border-[#142C54] hover:border-[#316EC9] font-bold py-3 text-[10px] uppercase tracking-widest transition-all rounded-none cursor-pointer flex items-center justify-center space-x-1"
                    id="appetite-adjustment-button"
                  >
                    <span>Modify Appetite Profile</span>
                  </button>
                </form>
              </div>

          </div>
        </>
      ) : (
        /* PERSISTED PRODUCT CONFIGURATION DECK (SECTION 13 REQUIREMENT) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left: Product Table & Controls */}
          <div className="lg:col-span-7 bg-white border border-[#D8E2F0] p-6 space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-gray-100">
              <h3 className="text-sm font-bold uppercase text-[#142C54] tracking-wider flex items-center gap-1.5">
                <FolderSync className="h-4 w-4 text-[#316EC9]" />
                Live Product Catalog ({productsList.length})
              </h3>
              
              <button
                onClick={handleStartAddNew}
                className="bg-[#142C54] hover:bg-[#316EC9] text-white text-[10px] uppercase tracking-wider font-bold py-1.5 px-3 rounded-none flex items-center gap-1 cursor-pointer"
              >
                <PlusCircle className="h-3.5 w-3.5" />
                <span>Add Product</span>
              </button>
            </div>

            <p className="text-[11px] text-[#8C887D]">
              Select and adjust specific parameters of catalog objects below. Deactivating policies immediately removes them from all client discoverable mega menus and dropdown lists.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left text-gray-700 divide-y divide-[#D8E2F0]">
                <thead>
                  <tr className="bg-slate-50 font-bold uppercase tracking-wider text-[8px] text-gray-500">
                    <th className="p-2">Name</th>
                    <th className="p-2">Category</th>
                    <th className="p-2 text-center">Featured</th>
                    <th className="p-2 text-center">Status</th>
                    <th className="p-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-mono text-[11px]">
                  {productsList.map(prod => (
                    <tr key={prod.id} className="hover:bg-slate-50/50">
                      <td className="p-2 font-sans font-bold text-[#142C54] flex items-center gap-1">
                        <span>{prod.icon}</span>
                        <span className="truncate max-w-[130px]">{prod.name}</span>
                      </td>
                      <td className="p-2 text-gray-500 uppercase">{prod.category}</td>
                      <td className="p-2 text-center">
                        <button
                          onClick={() => handleFeaturedToggle(prod.id)}
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded-none border ${
                            prod.featured 
                              ? "bg-amber-50 text-amber-800 border-amber-300" 
                              : "bg-slate-50 text-slate-400 border-slate-200"
                          }`}
                        >
                          {prod.featured ? "Featured" : "Standard"}
                        </button>
                      </td>
                      <td className="p-2 text-center">
                        <button
                          onClick={() => handleStatusToggle(prod.id)}
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded-none border ${
                            prod.status === "active" 
                              ? "bg-green-50 text-green-800 border-green-300" 
                              : "bg-red-50 text-red-800 border-red-300"
                          }`}
                        >
                          {prod.status === "active" ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td className="p-2 text-right">
                        <button
                          onClick={() => handleSelectEditProduct(prod)}
                          className="bg-slate-100 hover:bg-[#316EC9]/10 text-slate-600 hover:text-[#316EC9] px-2 py-1 rounded-none flex items-center gap-1 text-[10px] uppercase font-bold justify-end ml-auto"
                        >
                          <Edit2 className="h-3 w-3" />
                          <span>Edit</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right: Dynamic Edit Form or Add Form */}
          <div className="lg:col-span-5 bg-white border border-[#D8E2F0] p-6 space-y-4">
            <h3 className="text-xs uppercase font-bold text-[#142C54] tracking-widest border-b border-gray-100 pb-2">
              {isAddingNew ? "Create New Insurance Product" : editingProduct ? `Edit ${editingProduct.name}` : "Product Schema Editor"}
            </h3>

            {editingProduct || isAddingNew ? (
              <form onSubmit={handleSaveProductForm} className="space-y-4 text-xs font-semibold">
                
                {/* ID (Unique URL parameter) */}
                <div>
                  <label className="block text-[9px] uppercase tracking-wider text-gray-500 mb-1">Product ID (Unique Identifier) *</label>
                  <input
                    type="text"
                    required
                    disabled={!isAddingNew}
                    value={productForm.id}
                    onChange={(e) => setProductForm({ ...productForm, id: e.target.value })}
                    className="w-full bg-slate-50 border border-[#D8E2F0] p-2 uppercase font-mono disabled:opacity-50 focus:outline-none rounded-none text-[#142C54]"
                  />
                </div>

                {/* Name */}
                <div>
                  <label className="block text-[9px] uppercase tracking-wider text-gray-500 mb-1">Product Name *</label>
                  <input
                    type="text"
                    required
                    value={productForm.name}
                    onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                    placeholder="e.g. Professional Indemnity"
                    className="w-full bg-slate-50 border border-[#D8E2F0] p-2 focus:outline-none rounded-none text-[#142C54]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {/* Category select */}
                  <div>
                    <label className="block text-[9px] uppercase tracking-wider text-gray-500 mb-1">Insurance Category</label>
                    <select
                      value={productForm.category}
                      onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                      className="w-full bg-slate-50 border border-[#D8E2F0] p-2 focus:outline-none rounded-none text-[#142C54]"
                    >
                      {PRODUCT_CATEGORIES.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Icon */}
                  <div>
                    <label className="block text-[9px] uppercase tracking-wider text-gray-500 mb-1">ASCII Icon Class</label>
                    <input
                      type="text"
                      value={productForm.icon}
                      onChange={(e) => setProductForm({ ...productForm, icon: e.target.value })}
                      className="w-full bg-slate-50 border border-[#D8E2F0] p-2 text-center rounded-none focus:outline-none text-[#142C54]"
                    />
                  </div>
                </div>

                {/* Digital Maturity Level (quotationMethod) */}
                <div>
                  <label className="block text-[9px] uppercase tracking-wider text-gray-500 mb-1">Digital Maturity Tier (quotationMethod)</label>
                  <select
                    value={productForm.quotationMethod}
                    onChange={(e) => setProductForm({ ...productForm, quotationMethod: e.target.value as any })}
                    className="w-full bg-slate-50 border border-[#D8E2F0] p-2 focus:outline-none rounded-none text-[#142C54]"
                  >
                    <option value="Instant Indicative Quote">Level 1: Instant Indicative Quote</option>
                    <option value="Guided Online Quote">Level 2: Guided Online Quote</option>
                    <option value="Expert Specialist Desk">Level 3: Expert Specialist Placement</option>
                  </select>
                </div>

                {/* Short Desc */}
                <div>
                  <label className="block text-[9px] uppercase tracking-wider text-gray-500 mb-1">Short Summary Description *</label>
                  <input
                    type="text"
                    required
                    value={productForm.shortDesc}
                    onChange={(e) => setProductForm({ ...productForm, shortDesc: e.target.value })}
                    className="w-full bg-slate-50 border border-[#D8E2F0] p-2 focus:outline-none rounded-none text-gray-800"
                  />
                </div>

                {/* Full Desc */}
                <div>
                  <label className="block text-[9px] uppercase tracking-wider text-gray-500 mb-1">Complete Descriptive overview</label>
                  <textarea
                    rows={4}
                    value={productForm.fullDesc}
                    onChange={(e) => setProductForm({ ...productForm, fullDesc: e.target.value })}
                    className="w-full bg-slate-50 border border-[#D8E2F0] p-2.5 text-xs text-gray-800 focus:outline-none rounded-none"
                  ></textarea>
                </div>

                {/* Required Documents list */}
                <div>
                  <label className="block text-[9px] uppercase tracking-wider text-gray-500 mb-1">Required Documents Checklist (Comma separated)</label>
                  <input
                    type="text"
                    value={productForm.requiredDocuments.join(", ")}
                    onChange={(e) => setProductForm({ ...productForm, requiredDocuments: e.target.value.split(",").map(s => s.trim()) })}
                    className="w-full bg-slate-50 border border-[#D8E2F0] p-2 font-mono"
                  />
                </div>

                {/* Adviser specialization */}
                <div>
                  <label className="block text-[9px] uppercase tracking-wider text-gray-500 mb-1">Adviser Desk Assignment name</label>
                  <input
                    type="text"
                    value={productForm.adviserSpecialisation}
                    onChange={(e) => setProductForm({ ...productForm, adviserSpecialisation: e.target.value })}
                    className="w-full bg-slate-50 border border-[#D8E2F0] p-2"
                  />
                </div>

                {/* Buttons */}
                <div className="pt-2 flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => { setEditingProduct(null); setIsAddingNew(false); }}
                    className="text-gray-550 hover:text-black uppercase tracking-wider text-[10px] font-bold py-2 px-3"
                  >
                    Cancel Action
                  </button>
                  <button
                    type="submit"
                    className="bg-[#142C54] hover:bg-green-600 text-white uppercase tracking-widest text-[10px] font-bold py-2 px-4 rounded-none cursor-pointer flex items-center gap-1.5"
                  >
                    <Check className="h-4 w-4" />
                    <span>Persist Product schema</span>
                  </button>
                </div>

              </form>
            ) : (
              <div className="text-center py-10 bg-slate-50 text-gray-400 font-mono text-[11px] border border-dashed border-gray-200">
                <LayoutGrid className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <span>Select any product block on the left to edit corporate parameters, digital pathways or visibility status.</span>
              </div>
            )}
          </div>

        </div>
      )}

      {/* IMMUTABLE LOG SHEET */}
      <div className="border border-[#D8E2F0] bg-[#FAF9F6] p-5 space-y-4 rounded-none text-left" id="immutable-audit-log">
        <div className="flex justify-between items-center border-b border-[#D8E2F0] pb-3">
          <h4 className="font-serif italic text-base text-[#1A1A1A] flex items-center space-x-2">
            <ShieldAlert className="h-5 w-5 text-red-700" />
            <span>Immutable Security Audit Log Registers</span>
          </h4>
          <span className="border border-[#D8E2F0] bg-white text-[#1A1A1A] font-mono text-[9px] font-bold px-2 py-0.5 rounded-none">
            Certified Server Log Sync
          </span>
        </div>
        <p className="text-[11px] text-[#8C887D] leading-relaxed italic border-l-2 border-[#316EC9] pl-2 font-mono uppercase tracking-wide">
           "Under IRA and ODPC guidelines, actions concerning rate overrides, claims authorization, and data processing are recorded in real-time."
        </p>

        <div className="space-y-2 pr-1 max-h-48 overflow-y-auto font-mono text-[10px]">
          {auditLogs.map((log, i) => (
            <div key={i} className="bg-white border border-[#D8E2F0]/85 p-3 text-[10px] leading-relaxed flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-none text-[#5E5A51]">
              <span className="text-[#8C887D] font-sans font-bold uppercase tracking-wider text-[9px]">{log.date}</span>
              <span className="flex-1 sm:px-4 text-slate-800 font-sans font-medium"><strong className="text-[#1A1A1A]">{log.user}:</strong> {log.action}</span>
              <span className="border border-[#D8E2F0] bg-[#FAF9F6] px-2 font-sans font-bold text-[#1A1A1A] text-[9px] shrink-0 uppercase tracking-wider">{log.category}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
