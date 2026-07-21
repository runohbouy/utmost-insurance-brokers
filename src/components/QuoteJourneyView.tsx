import React, { useState } from "react";
import { 
  InsuranceQuote, MotorQuoteParams, MedicalQuoteParams, ActiveTab 
} from "../types";
import InsurerLogo from "./InsurerLogo";
import { 
  Car, Heart, ShieldCheck, HelpCircle, ArrowRight, CheckCircle, 
  DownloadCloud, Mail, Phone, Lock, Sparkles, UserCheck, Calculator, AlertCircle, AlertTriangle
} from "lucide-react";

interface QuoteJourneyViewProps {
  initialCategory: "motor" | "medical";
  setActiveTab: (tab: ActiveTab) => void;
  onSavedOffer: (quote: InsuranceQuote, category: "motor" | "medical") => void;
}

export default function QuoteJourneyView({ initialCategory, setActiveTab, onSavedOffer }: QuoteJourneyViewProps) {
  const [category, setCategory] = useState<"motor" | "medical">(initialCategory);
  const [motorParams, setMotorParams] = useState<MotorQuoteParams>({
    vehicleReg: "",
    vehicleMake: "",
    vehicleModel: "",
    mfgYear: 2020,
    vehicleValue: 1500000,
    coverType: "comprehensive",
    vehicleUse: "private",
    vehicleType: "saloon",
    ownerName: "",
    ownerEmail: "",
    ownerPhone: ""
  });

  const [medicalParams, setMedicalParams] = useState<MedicalQuoteParams>({
    principalName: "",
    principalAge: 32,
    principalPhone: "",
    principalEmail: "",
    principalCounty: "Nairobi",
    dependantsCount: 0,
    inpatientLimit: 1000000,
    outpatientLimit: 100000,
    maternityCover: false,
    dentalCover: false
  });

  const [isCalculating, setIsCalculating] = useState<boolean>(false);
  const [quotes, setQuotes] = useState<InsuranceQuote[]>([]);
  const [selectedOffer, setSelectedOffer] = useState<InsuranceQuote | null>(null);
  
  // Registration Portal Modal State
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [authForm, setAuthForm] = useState({ name: "", email: "", phone: "", otp: "" });
  const [otpSent, setOtpSent] = useState<boolean>(false);
  const [isRegistering, setIsRegistering] = useState<boolean>(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [actionAfterAuth, setActionAfterAuth] = useState<"download" | "buy">("download");

  const [premiumFinanceMonths, setPremiumFinanceMonths] = useState<number>(3); // ipf installments

  // Run quotes calculation API
  const handleCalculate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCalculating(true);
    setQuotes([]);
    setSelectedOffer(null);

    // standard validation check to avoid empty files
    if (category === "motor") {
      if (!motorParams.vehicleReg || !motorParams.ownerName || !motorParams.ownerPhone) {
        alert("Please complete all required forms (Registration No., name, and phone).");
        setIsCalculating(false);
        return;
      }
    } else {
      if (!medicalParams.principalName || !medicalParams.principalPhone) {
        alert("Please complete principal member's name and contact number.");
        setIsCalculating(false);
        return;
      }
    }

    try {
      const response = await fetch("/api/generate-quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          params: category === "motor" ? motorParams : medicalParams
        })
      });

      if (!response.ok) {
        throw new Error("Quotation engine failure.");
      }

      const data = await response.json();
      setQuotes(data.quotes);
    } catch (err) {
      console.error(err);
      alert("Failed to compute insurance quotes. Please try again.");
    } finally {
      setIsCalculating(false);
    }
  };

  // Select Quote Option
  const handleSelectOffer = (offer: InsuranceQuote) => {
    setSelectedOffer(offer);
  };

  // PDF Download Trigger - requires account verification first
  const handleDownloadQuotationPDF = (action: "download" | "buy") => {
    setActionAfterAuth(action);
    if (!isAuthenticated) {
      setShowAuthModal(true);
    } else {
      executePDFExport();
    }
  };

  const executePDFExport = () => {
    if (!selectedOffer) return;
    alert(`Success: Quotation Sheet UTM-QT-${Math.floor(100000 + Math.random() * 900000)} exported as PDF. Send copy directly to ${authForm.email || motorParams.ownerEmail || medicalParams.principalEmail || "client"}`);
    onSavedOffer(selectedOffer, category);
  };

  // Secure payment checkout trigger
  const handleBuyCheckout = () => {
    setActionAfterAuth("buy");
    if (!isAuthenticated) {
      setShowAuthModal(true);
    } else {
      executePlacementCheckout();
    }
  };

  const executePlacementCheckout = () => {
    alert("Moving to Payment Checkout. Our Finance system will prompt M-Pesa STK Push sequence on your handset.");
    setActiveTab("portal");
  };

  // Authenticate users / check registers
  const handleSendOtp = () => {
    if (!authForm.name || !authForm.email || !authForm.phone) {
      alert("Please provide name, email, and phone before triggering OTP.");
      return;
    }
    setOtpSent(true);
    alert(`OTP Code '2456' dispatched to: +254 ${authForm.phone}. Please enter to authenticate and proceed.`);
  };

  const handleVerifyOtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsRegistering(true);
    setTimeout(() => {
      if (authForm.otp === "2456" || authForm.otp === "1234") {
        setIsAuthenticated(true);
        setShowAuthModal(false);
        setIsRegistering(false);
        setOtpSent(false);
        
        // Save auth state globally/session for demonstration
        localStorage.setItem("utmost_user_logged_in", "true");
        localStorage.setItem("utmost_user_profile", JSON.stringify(authForm));

        if (actionAfterAuth === "download") {
          executePDFExport();
        } else {
          executePlacementCheckout();
        }
      } else {
        alert("Incorrect code. Please check your text messages and enter key '2456'.");
        setIsRegistering(false);
      }
    }, 1200);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 font-sans text-left space-y-12" id="quote-journey-workspace">
      
      {/* SECTION HEADER */}
      <div className="border-b border-[#D8E2F0] pb-6">
        <p className="text-[10px] uppercase font-bold text-[#316EC9] tracking-[0.25em] mb-1 font-mono">Comparative Calculator</p>
        <h1 className="text-3xl font-serif italic tracking-tight text-[#1A1A1A]">
          Comparative Quotes & Intermediate Advisory Options
        </h1>
        <p className="mt-1.5 text-xs text-[#8C887D] max-w-4xl leading-relaxed">
          Instantly review premiums, waiting periods, sub-limits and excess protections. Standardized itemization of PCF, training levies, and stamp duty is done globally.
        </p>
      </div>

      {/* COMPANION STATE TABS */}
      <div className="flex border-b border-[#D8E2F0] bg-[#FAF9F6] p-1 max-w-sm shrink-0 rounded-none font-mono">
        <button
          onClick={() => { setCategory("motor"); setQuotes([]); setSelectedOffer(null); }}
          className={`flex-grow flex items-center justify-center space-x-2 py-3 text-[10px] uppercase tracking-wider font-bold rounded-none transition-all cursor-pointer ${
            category === "motor" ? "bg-[#142C54] text-white" : "text-[#8C887D] hover:text-[#316EC9]"
          }`}
          id="tab-select-motor"
        >
          <Car className="h-3.5 w-3.5" />
          <span>Motor Private</span>
        </button>
        <button
          onClick={() => { setCategory("medical"); setQuotes([]); setSelectedOffer(null); }}
          className={`flex-grow flex items-center justify-center space-x-2 py-3 text-[10px] uppercase tracking-wider font-bold rounded-none transition-all cursor-pointer ${
            category === "medical" ? "bg-[#142C54] text-white" : "text-[#8C887D] hover:text-[#316EC9]"
          }`}
          id="tab-select-medical"
        >
          <Heart className="h-3.5 w-3.5" />
          <span>Medical Schemes</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT COLUMN: CUSTOM PARAMETERS FORM */}
        <div className="lg:col-span-4 border border-[#D8E2F0] bg-[#FAF9F6] p-6 space-y-5 rounded-none">
          <div className="flex items-center space-x-2 border-b border-[#D8E2F0] pb-3">
            <Calculator className="h-[18px] w-[18px] text-[#316EC9]" />
            <h3 className="font-serif italic text-lg text-[#1A1A1A]">Specifications</h3>
          </div>

          <form onSubmit={handleCalculate} id="quotes-form" className="space-y-4 text-xs font-semibold">
            
            {/* A: MOTOR SPECIFIC FORMS */}
            {category === "motor" && (
              <div className="space-y-3" id="motor-fields-container">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-[#8C887D] uppercase tracking-wider">Vehicle Registration Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. KCY 456A"
                    value={motorParams.vehicleReg}
                    onChange={(e) => setMotorParams({ ...motorParams, vehicleReg: e.target.value.toUpperCase() })}
                    className="w-full bg-white rounded-none border border-[#D8E2F0] p-2.5 text-xs text-slate-800 uppercase focus:border-[#316EC9] focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-[#8C887D] uppercase tracking-wider">Vehicle Make</label>
                    <input
                      type="text"
                      placeholder="e.g. Toyota"
                      value={motorParams.vehicleMake}
                      onChange={(e) => setMotorParams({ ...motorParams, vehicleMake: e.target.value })}
                      className="w-full bg-white rounded-none border border-[#D8E2F0] p-2.5 text-xs text-slate-800 focus:border-[#316EC9] focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-[#8C887D] uppercase tracking-wider">Vehicle Model</label>
                    <input
                      type="text"
                      placeholder="e.g. Harrier / DX"
                      value={motorParams.vehicleModel}
                      onChange={(e) => setMotorParams({ ...motorParams, vehicleModel: e.target.value })}
                      className="w-full bg-white rounded-none border border-[#D8E2F0] p-2.5 text-xs text-slate-800 focus:border-[#316EC9] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-[#8C887D] uppercase tracking-wider">Manufacturing Year</label>
                    <input
                      type="number"
                      min={2000}
                      max={2026}
                      value={motorParams.mfgYear}
                      onChange={(e) => setMotorParams({ ...motorParams, mfgYear: Number(e.target.value) })}
                      className="w-full bg-white rounded-none border border-[#D8E2F0] p-2.5 text-xs text-slate-800 focus:border-[#316EC9] focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-[#8C887D] uppercase tracking-wider">Cover Type *</label>
                    <select
                      value={motorParams.coverType}
                      onChange={(e) => setMotorParams({ ...motorParams, coverType: e.target.value as any })}
                      className="w-full bg-white rounded-none border border-[#D8E2F0] p-2.5 text-xs text-slate-800 focus:border-[#316EC9] focus:outline-none"
                    >
                      <option value="comprehensive">Comprehensive Third & Own Damage</option>
                      <option value="third_party">Third Party Only (TPO)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-[#8C887D] uppercase tracking-wider">Vehicle Use Class *</label>
                    <select
                      value={motorParams.vehicleUse}
                      onChange={(e) => setMotorParams({ ...motorParams, vehicleUse: e.target.value as any })}
                      className="w-full bg-white rounded-none border border-[#D8E2F0] p-2.5 text-xs text-slate-800 focus:border-[#316EC9] focus:outline-none"
                    >
                      <option value="private">Private Use</option>
                      <option value="commercial_goods">Commercial Goods (Transit)</option>
                      <option value="psv_chaufeur">PSV (Chauffeur Driven)</option>
                      <option value="commercial_general_cartage">Commercial General Cartage</option>
                      <option value="institutional">Institutional / School Bus / Church</option>
                      <option value="motorcycle">Motorcycle / Boda Boda</option>
                      <option value="tricycle">Tricycle / Tuk Tuk</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-[#8C887D] uppercase tracking-wider">Vehicle Body Type *</label>
                    <select
                      value={motorParams.vehicleType || "saloon"}
                      onChange={(e) => setMotorParams({ ...motorParams, vehicleType: e.target.value as any })}
                      className="w-full bg-white rounded-none border border-[#D8E2F0] p-2.5 text-xs text-slate-800 focus:border-[#316EC9] focus:outline-none"
                    >
                      <option value="saloon">Saloon / Hatchback / Wagon</option>
                      <option value="suv">SUV / 4x4 / Luxury</option>
                      <option value="pickup">Commercial Pickups / Vans</option>
                      <option value="sports">High-Performance Sports Cars</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-[#8C887D] uppercase tracking-wider">Current Market Value (KES) *</label>
                  <input
                    type="number"
                    min={200000}
                    step={50000}
                    value={motorParams.vehicleValue}
                    onChange={(e) => setMotorParams({ ...motorParams, vehicleValue: Number(e.target.value) })}
                    className="w-full bg-white rounded-none border border-[#D8E2F0] p-2.5 font-mono text-xs font-bold text-[#316EC9] focus:border-[#316EC9] focus:outline-none"
                  />
                  <p className="text-[9px] text-[#8C887D]">Subject to post-quote physical audit surveyor inspections.</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-[#8C887D] uppercase tracking-wider">Owner's Name (Principal) *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. David Kiprop"
                    value={motorParams.ownerName}
                    onChange={(e) => setMotorParams({ ...motorParams, ownerName: e.target.value })}
                    className="w-full bg-white rounded-none border border-[#D8E2F0] p-2.5 text-xs text-slate-800 focus:border-[#316EC9] focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-[#8C887D] uppercase tracking-wider">Owner Email</label>
                    <input
                      type="email"
                      placeholder="e.g. name@domain.com"
                      value={motorParams.ownerEmail}
                      onChange={(e) => setMotorParams({ ...motorParams, ownerEmail: e.target.value })}
                      className="w-full bg-white rounded-none border border-[#D8E2F0] p-2.5 text-xs text-slate-800 focus:border-[#316EC9] focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-[#8C887D] uppercase tracking-wider">Owner Mobile *</label>
                    <input
                      type="tel"
                      required
                      placeholder="e.g. 0712 345678"
                      value={motorParams.ownerPhone}
                      onChange={(e) => setMotorParams({ ...motorParams, ownerPhone: e.target.value })}
                      className="w-full bg-white rounded-none border border-[#D8E2F0] p-2.5 text-xs text-slate-800 focus:border-[#316EC9] focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* B: MEDICAL SPECIFIC FORMS */}
            {category === "medical" && (
              <div className="space-y-3" id="medical-fields-container">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-[#8C887D] uppercase tracking-wider">Principal Member Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Serah Wanjiku"
                    value={medicalParams.principalName}
                    onChange={(e) => setMedicalParams({ ...medicalParams, principalName: e.target.value })}
                    className="w-full bg-white rounded-none border border-[#D8E2F0] p-2.5 text-xs text-slate-800 focus:border-[#316EC9] focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-[#8C887D] uppercase tracking-wider">Age of Principal *</label>
                    <input
                      type="number"
                      required
                      min={18}
                      max={85}
                      value={medicalParams.principalAge}
                      onChange={(e) => setMedicalParams({ ...medicalParams, principalAge: Number(e.target.value) })}
                      className="w-full bg-white rounded-none border border-[#D8E2F0] p-2.5 text-xs text-slate-800 focus:border-[#316EC9] focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-[#8C887D] uppercase tracking-wider">Residential County</label>
                    <input
                      type="text"
                      placeholder="e.g. Nairobi"
                      value={medicalParams.principalCounty}
                      onChange={(e) => setMedicalParams({ ...medicalParams, principalCounty: e.target.value })}
                      className="w-full bg-white rounded-none border border-[#D8E2F0] p-2.5 text-xs text-slate-800 focus:border-[#316EC9] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-[#8C887D] uppercase tracking-wider">Number of Dependants</label>
                    <select
                      value={medicalParams.dependantsCount}
                      onChange={(e) => setMedicalParams({ ...medicalParams, dependantsCount: Number(e.target.value) })}
                      className="w-full bg-white rounded-none border border-[#D8E2F0] p-2.5 text-xs text-slate-800 focus:border-[#316EC9] focus:outline-none"
                    >
                      <option value="0">M + 0 (Only Myself)</option>
                      <option value="1">M + 1 (Spouse / 1 Child)</option>
                      <option value="2">M + 2 (Spouse & 1 Child)</option>
                      <option value="3">M + 3 (Spouse & 2 Children)</option>
                      <option value="4">M + 4 (Spouse & 3 Children)</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-[#8C887D] uppercase tracking-wider">Inpatient Care Limit *</label>
                    <select
                      value={medicalParams.inpatientLimit}
                      onChange={(e) => setMedicalParams({ ...medicalParams, inpatientLimit: Number(e.target.value) })}
                      className="w-full bg-white rounded-none border border-[#D8E2F0] p-2.5 text-xs font-semibold text-slate-800 focus:border-[#316EC9] focus:outline-none"
                    >
                      <option value="500000">KES 500,000</option>
                      <option value="1000000">KES 1,000,000</option>
                      <option value="2000000">KES 2,000,000</option>
                      <option value="5000000">KES 5,000,000</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-[#8C887D] uppercase tracking-wider">Outpatient Limit *</label>
                    <select
                      value={medicalParams.outpatientLimit}
                      onChange={(e) => setMedicalParams({ ...medicalParams, outpatientLimit: Number(e.target.value) })}
                      className="w-full bg-white rounded-none border border-[#D8E2F0] p-2.5 text-xs font-semibold text-slate-800 focus:border-[#316EC9] focus:outline-none"
                    >
                      <option value="50000">KES 50,000</option>
                      <option value="100000">KES 100,000</option>
                      <option value="150000">KES 150,000</option>
                      <option value="250000">KES 250,000</option>
                    </select>
                  </div>
                </div>

                {/* Optional Health inclusions */}
                <div className="space-y-2 border-t border-[#D8E2F0] pt-3">
                  <label className="text-[#8C887D] uppercase text-[9px] tracking-widest font-extrabold mb-1 block">Option extensions</label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={medicalParams.maternityCover}
                      onChange={(e) => setMedicalParams({ ...medicalParams, maternityCover: e.target.checked })}
                      className="rounded-none border-[#D8E2F0] accent-[#316EC9]"
                    />
                    <span className="text-[11px] text-[#5E5A51] font-medium">Include Maternity Ward Addon (KES 100K)</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={medicalParams.dentalCover}
                      onChange={(e) => setMedicalParams({ ...medicalParams, dentalCover: e.target.checked })}
                      className="rounded-none border-[#D8E2F0] accent-[#316EC9]"
                    />
                    <span className="text-[11px] text-[#5E5A51] font-medium">Include Dental & Optical co-pay addon</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-[#8C887D] uppercase tracking-wider">Contact Email</label>
                    <input
                      type="email"
                      placeholder="e.g. client@mail.co.ke"
                      value={medicalParams.principalEmail}
                      onChange={(e) => setMedicalParams({ ...medicalParams, principalEmail: e.target.value })}
                      className="w-full bg-white rounded-none border border-[#D8E2F0] p-2.5 text-xs text-slate-800 focus:border-[#316EC9] focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-[#8C887D] uppercase tracking-wider">Contact Mobile *</label>
                    <input
                      type="tel"
                      required
                      placeholder="e.g. 0712 345678"
                      value={medicalParams.principalPhone}
                      onChange={(e) => setMedicalParams({ ...medicalParams, principalPhone: e.target.value })}
                      className="w-full bg-white rounded-none border border-[#D8E2F0] p-2.5 text-xs text-slate-800 focus:border-[#316EC9] focus:outline-none"
                    />
                  </div>
                </div>

              </div>
            )}

            <button
              type="submit"
              disabled={isCalculating}
              className="w-full bg-[#142C54] hover:bg-[#316EC9] text-white text-xs font-bold uppercase tracking-widest py-3.5 border border-[#142C54] hover:border-[#316EC9] transition-all rounded-none cursor-pointer disabled:opacity-50"
            >
              {isCalculating ? "Calculating standard metrics..." : "Compute Insurer Quotes Check"}
            </button>

          </form>
        </div>

        {/* RIGHT COLUMN: COMPARATIVE ANALYSIS SHEET OR OFFERS SHOWCASE */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* A: CALCULATING / EMPTY LOADER */}
          {quotes.length === 0 && !isCalculating && (
            <div className="border border-[#D8E2F0] bg-[#FAF9F6] border-dashed p-12 text-center flex flex-col items-center justify-center space-y-4 h-[550px] rounded-none" id="empty-quotes-placeholder">
              <div className="border border-[#D8E2F0] p-3 text-neutral-400 bg-white rounded-none">
                <ShieldCheck className="h-8 w-8 text-neutral-300" />
              </div>
              <h3 className="text-lg font-serif italic text-[#1A1A1A]">Underwriting Quotes Sheets Loading</h3>
              <p className="text-xs text-[#8C887D] max-w-md mx-auto leading-relaxed">
                Complete the demographic and vehicle/health specifications on the left to evaluate annual premiums across 5 Kenyan certified carriers.
              </p>
            </div>
          )}

          {isCalculating && (
            <div className="border border-[#316EC9]/30 bg-[#FAF9F6] p-12 text-center flex flex-col items-center justify-center space-y-4 h-[550px] rounded-none" id="quotes-calculation-pulse">
              <Sparkles className="h-[40px] w-[40px] text-[#316EC9] animate-spin" />
              <p className="text-[10px] font-bold text-[#316EC9] font-mono uppercase tracking-widest">Routing premium matrix indexes...</p>
              <p className="text-xs font-serif italic text-[#1A1A1A] border-l border-[#316EC9] pl-3 max-w-sm leading-relaxed">
                "Fetching licensed rates from MUA, ICEA LION, Heritage, CIC, Kenindia & Jubilee underwriters catalogs..."
              </p>
            </div>
          )}

          {/* B: COMPARATIVE VIEWER */}
          {quotes.length > 0 && !isCalculating && (
            <div className="space-y-6" id="loaded-quotes-list-container">
              
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-[#D8E2F0] pb-3 gap-2">
                <h4 className="text-[10px] font-bold text-[#8C887D] uppercase tracking-widest font-sans">
                  Found {quotes.length} Licensed Insurance Comparisons
                </h4>
                <div className="border border-[#316EC9]/30 bg-[#F0F5FC] px-2.5 py-0.5 font-mono text-[9px] text-[#316EC9] font-bold">
                  Validity Expiry: 14 Days (Standard IRA terms)
                </div>
              </div>

              {/* Indicative Pricing Announcement Banner */}
              <div className="border border-[#FFE8B5] bg-[#FFF8E7] p-3 flex sm:items-center justify-between text-xs text-[#8A6D3B] rounded-none gap-3">
                <div className="flex items-start sm:items-center space-x-2">
                  <AlertCircle className="h-4 w-4 text-[#C19A4D] shrink-0 mt-0.5 sm:mt-0" />
                  <p className="font-sans leading-snug">
                    <strong className="font-bold">Indicative Pricing:</strong> All quotes displayed below are strictly indicative and subject to secondary underwriting. Final confirmation from an Utmost staff member is required to finalize and bind any cover.
                  </p>
                </div>
              </div>

              {/* Side-by-side Carrier Grids */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {quotes.map((offer, idx) => (
                  <div
                    key={offer.insurerId}
                    id={`quote-card-${offer.insurerId}`}
                    onClick={() => !offer.isDeclined && handleSelectOffer(offer)}
                    className={`border p-5 text-left relative space-y-4 rounded-none transition-all ${
                      offer.isDeclined
                        ? "border-red-200 bg-red-50/10 opacity-75 cursor-not-allowed"
                        : selectedOffer?.insurerId === offer.insurerId
                        ? "border-[#316EC9] bg-white ring-1 ring-[#316EC9]/15 cursor-pointer"
                        : "border-[#D8E2F0] bg-[#FAF9F6]/35 hover:border-[#316EC9] cursor-pointer"
                    }`}
                  >
                    {/* Badge Badging */}
                    {offer.priceTag && !offer.isDeclined && (
                      <span className="absolute top-3 right-3 border border-[#316EC9]/30 bg-[#F0F5FC] px-2.5 py-0.5 text-[9px] font-bold text-[#316EC9] uppercase tracking-wider font-mono">
                        {offer.priceTag}
                      </span>
                    )}

                    {/* Carrier Info */}
                    <div className="flex items-center space-x-3 border-b border-[#D8E2F0] pb-2">
                      <div className="w-16 h-8 flex items-center justify-center bg-slate-50 border border-slate-100 rounded p-0.5 shrink-0">
                        <InsurerLogo carrierId={offer.insurerId} height="20" className="max-w-full max-h-full object-contain" />
                      </div>
                      <div>
                        <h5 className="font-serif italic text-base text-[#1A1A1A] leading-tight">{offer.insurerName}</h5>
                        <p className="text-[9px] uppercase tracking-wider text-[#8C887D] pt-0.5">{offer.rating}</p>
                      </div>
                    </div>

                    {offer.isDeclined ? (
                      <div className="bg-[#FFF5F5] text-[#C53030] px-3.5 py-3.5 border border-red-200 text-xs rounded-none space-y-1">
                        <p className="font-bold uppercase text-[9px] tracking-widest font-mono flex items-center space-x-1">
                          <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                          <span>Declined Option</span>
                        </p>
                        <p className="font-sans leading-relaxed text-[11px] font-medium">{offer.declineReason || "Excluded risk category under standard guidelines."}</p>
                      </div>
                    ) : (
                      <>
                        {/* Premium calculations */}
                        <div className="border-t border-b border-[#D8E2F0] py-3 flex justify-between items-center bg-[#FAF9F6] rounded-none px-3">
                          <div>
                            <span className="text-[9px] font-bold text-[#8C887D] uppercase">Broker Total Premium</span>
                            <p className="text-lg font-bold text-[#1A1A1A] font-sans">KES {offer.totalPremium.toLocaleString()}</p>
                          </div>
                          <div className="text-right text-[10px] text-[#8C887D] leading-normal font-mono">
                            <p>Base: KES {offer.basePremium.toLocaleString()}</p>
                            <p className="text-[9px]">Levies: KES {(offer.pcf + offer.trainingLevy + offer.stampDuty).toLocaleString()}</p>
                          </div>
                        </div>

                        {/* Provisional Rate warning alert */}
                        {offer.isProvisionalRate && (
                          <div className="bg-[#FFF9E6] text-[#A67C00] px-3 py-2.5 border border-[#FFE082] text-[10px] leading-snug rounded-none flex items-start space-x-1.5 font-sans">
                            <AlertCircle className="h-3.5 w-3.5 text-[#F5B041] shrink-0 mt-0.5" />
                            <span>
                              <strong>Provisional Rate:</strong> No usage-specific rates exist yet in database. A provisional loading factor of <strong>{offer.provisionalLoadingFactor}x</strong> was applied.
                            </span>
                          </div>
                        )}

                        {/* Major benefits lists */}
                        <div className="space-y-1.5 text-xs text-[#5E5A51]">
                          <p className="font-bold text-[#1A1A1A] text-[9px] uppercase tracking-wider border-b border-[#D8E2F0]/60 pb-1 font-mono">Plan Cover Inclusions:</p>
                          {offer.mainBenefits.slice(0, 3).map((ben, i) => (
                            <p key={i} className="flex items-center text-[11px] leading-relaxed font-sans">
                              <CheckCircle className="mr-1.5 h-3.5 w-3.5 shrink-0 text-[#316EC9]" />
                              <span>{ben}</span>
                            </p>
                          ))}
                        </div>
                      </>
                    )}

                     {/* Policy Conditions & Disclaimers (Only for Active Quotes) */}
                     {!offer.isDeclined ? (
                       <>
                         <div className="rounded-none bg-[#F0F5FC]/30 p-2.5 border border-[#D8E2F0] font-mono text-[9px] text-[#8C887D] leading-relaxed">
                           <p className="font-bold text-[#1A1A1A] font-sans text-[8px] uppercase">Excess Terms:</p>
                           {offer.excessTerms}
                         </div>

                         {/* Broker-written Recommendation Block */}
                         {offer.isRecommended && (
                           <div className="rounded-none bg-[#142C54] text-white p-3 border border-[#142C54] space-y-1 text-xs leading-relaxed">
                             <div className="flex items-center space-x-1 text-[#316EC9] font-bold text-[10px] uppercase tracking-wider font-mono">
                               <Sparkles className="h-3.5 w-3.5" />
                               <span>Utmost Recommended Option</span>
                             </div>
                             <p className="text-slate-350 italic font-serif">
                               "{offer.recommendationReason}"
                             </p>
                           </div>
                         )}

                         {/* Quality Disclaimer Block */}
                         <div className="rounded-none bg-[#FFF8E7] p-2.5 border border-[#FFE8B5] font-mono text-[9px] text-[#8A6D3B] leading-normal flex items-start space-x-2">
                           <AlertCircle className="h-3.5 w-3.5 shrink-0 text-[#C19A4D] mt-0.5" />
                           <div>
                             <p className="font-bold text-[#7A5B2B] font-sans text-[8px] uppercase tracking-wider">Staff Confirmation Required:</p>
                             This quote is indicative and not final. Confirmation from an Utmost staff member is required to finalize this rate.
                           </div>
                         </div>

                         <div className="flex justify-between items-center text-[9px] text-[#8C887D] font-bold uppercase tracking-wider border-t border-[#D8E2F0] pt-2.5 font-mono">
                           <span>Waiting Rule: Direct</span>
                           <span className={`text-[9px] uppercase tracking-widest ${selectedOffer?.insurerId === offer.insurerId ? "text-[#316EC9]" : "text-slate-400"}`}>
                             {selectedOffer?.insurerId === offer.insurerId ? "Selected Offer ✓" : "Select this option"}
                           </span>
                         </div>
                       </>
                     ) : (
                       <div className="flex justify-between items-center text-[9px] text-red-500 font-bold uppercase tracking-wider border-t border-[#D8E2F0] pt-2.5 font-mono">
                         <span>Status: Excluded Risk</span>
                         <span className="text-red-600 uppercase tracking-widest">Declined / Unavailable</span>
                       </div>
                     )}

                  </div>
                ))}
              </div>

              {/* PAYMENT INSTALMENT IPF PLANNING CALCULATOR */}
              {selectedOffer && (
                <div className="border border-[#D8E2F0] bg-[#FAF9F6] p-5 text-left space-y-4 rounded-none" id="ipf-instalment-widget">
                  <div className="flex items-center space-x-2 border-b border-[#D8E2F0] pb-2">
                    <Calculator className="h-[14px] w-[14px] text-[#316EC9]" />
                    <h5 className="font-bold text-[#1A1A1A] text-xs uppercase tracking-wider font-mono">Insurance Premium Financing (IPF) Estimator</h5>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-bold text-[#8C887D] uppercase tracking-wider font-mono">Finance Split Installments</label>
                      <select
                        value={premiumFinanceMonths}
                        onChange={(e) => setPremiumFinanceMonths(Number(e.target.value))}
                        className="w-full text-xs font-bold rounded-none border border-[#D8E2F0] bg-white p-2"
                      >
                        <option value={3}>3 Monthly Installments</option>
                        <option value={6}>6 Monthly Installments</option>
                        <option value={10}>10 Monthly Installments</option>
                      </select>
                    </div>

                    <div className="text-xs">
                      <p className="text-[#8C887D] font-semibold mb-0.5 font-mono">Estimated downpayment (1st Month):</p>
                      <p className="text-sm font-bold text-[#1A1A1A] font-sans">
                        KES {Math.round((selectedOffer.totalPremium * 1.05) / premiumFinanceMonths).toLocaleString()}
                      </p>
                    </div>

                    <div className="text-xs font-bold">
                      <p className="text-[#8C887D] font-semibold mb-0.5 font-mono">Recurring Monthly Premium:</p>
                      <p className="text-base font-bold text-[#316EC9] font-sans">
                        KES {Math.round((selectedOffer.totalPremium * 1.05) / premiumFinanceMonths).toLocaleString()} / month
                      </p>
                      <span className="text-[8px] text-[#8C887D] uppercase tracking-wider italic leading-none font-sans block pt-1">
                        * Flat 5% Financing interest fee is factored in contents.
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* FORM ACTIONS */}
              {selectedOffer && (
                <div className="border border-[#D8E2F0] bg-white p-6 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-none" id="quotes-offer-actions">
                  <div className="text-left space-y-1">
                    <span className="text-[9px] uppercase font-bold text-[#8C887D] tracking-wider block font-mono">Selected Underwriter</span>
                    <h4 className="font-serif italic text-lg text-[#1A1A1A]">{selectedOffer.insurerName}</h4>
                    <p className="text-xs text-[#5E5A51]">
                      Total Due: <strong className="font-bold text-[#1A1A1A]">KES {selectedOffer.totalPremium.toLocaleString()}</strong> (Annual premium fully factored)
                    </p>
                  </div>

                  <div className="flex space-x-3 w-full sm:w-auto">
                    <button
                      onClick={() => handleDownloadQuotationPDF("download")}
                      className="flex-grow sm:flex-none uppercase tracking-wider inline-flex items-center justify-center space-x-1.5 border border-[#D8E2F0] bg-white hover:bg-[#F0F5FC] px-4 py-3 text-[10px] font-bold text-[#1A1A1A] transition-all rounded-none cursor-pointer"
                      id="quote-dl-pdf-btn"
                    >
                      <DownloadCloud className="h-4 w-4 text-[#316EC9]" />
                      <span>Download comparative PDF</span>
                    </button>
                    <button
                      onClick={() => handleDownloadQuotationPDF("buy")}
                      className="flex-grow sm:flex-none uppercase tracking-wider inline-flex items-center justify-center space-x-1.5 bg-[#142C54] hover:bg-[#316EC9] text-white border border-[#142C54] hover:border-[#316EC9] px-5 py-3 text-[10px] font-bold transition-all rounded-none cursor-pointer"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      <span>Buy & Bind Cover note</span>
                    </button>
                  </div>
                </div>
              )}

            </div>
          )}

        </div>

      </div>

      {/* USER REGISTRATION / OTP PORTAL MODAL DIALOG */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-none p-4 transition-all" id="auth-portal-popup">
          <div className="relative w-full max-w-md border border-[#D8E2F0] bg-[#FAF9F6] p-6 shadow-none space-y-5 text-left rounded-none">
            
            <div className="flex justify-between items-start border-b border-[#D8E2F0] pb-3">
              <div className="space-y-1">
                <span className="border border-[#316EC9]/30 bg-[#F0F5FC] px-2.5 py-0.5 font-mono text-[9px] font-bold text-[#316EC9] uppercase tracking-wider">
                  Secure Accounts Portal
                </span>
                <h3 className="text-lg font-serif italic text-[#1A1A1A] pt-1">Required Client Authentication</h3>
                <p className="text-[11px] text-[#5E5A51] leading-relaxed">
                  IRA consumer protection standards require verifying active Kenyan telephone credentials before presenting finalized comparison sheets.
                </p>
              </div>
              <button 
                onClick={() => setShowAuthModal(false)}
                className="text-[#1A1A1A] hover:text-[#316EC9] text-sm font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* SEND OTP FORM */}
            {!otpSent && (
              <div className="space-y-4 text-xs font-semibold">
                <div className="space-y-1.5">
                  <label className="text-[9px] uppercase tracking-wider text-[#8C887D]">Legal Customer Name *</label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="e.g. David Kiprop"
                      value={authForm.name}
                      onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                      className="w-full bg-white rounded-none border border-[#D8E2F0] p-2.5 pl-8 text-xs text-slate-800 focus:border-[#316EC9] focus:outline-none"
                    />
                    <Sparkles className="absolute left-2.5 top-3.5 h-3.5 w-3.5 text-slate-450" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] uppercase tracking-wider text-[#8C887D]">Customer Verified Email *</label>
                  <div className="relative">
                    <input
                      type="email"
                      placeholder="e.g. name@mail.co.ke"
                      value={authForm.email}
                      onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                      className="w-full bg-white rounded-none border border-[#D8E2F0] p-2.5 pl-8 text-xs text-slate-800 focus:border-[#316EC9] focus:outline-none"
                    />
                    <Mail className="absolute left-2.5 top-3.5 h-3.5 w-3.5 text-slate-450" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] uppercase tracking-wider text-[#8C887D]">Active Mobile Number *</label>
                  <div className="relative">
                    <input
                      type="tel"
                      placeholder="e.g. 0712 345678"
                      value={authForm.phone}
                      onChange={(e) => setAuthForm({ ...authForm, phone: e.target.value })}
                      className="w-full bg-white rounded-none border border-[#D8E2F0] p-2.5 pl-8 text-xs text-slate-800 focus:border-[#316EC9] focus:outline-none"
                    />
                    <Phone className="absolute left-2.5 top-3.5 h-3.5 w-3.5 text-slate-450" />
                  </div>
                </div>

                <button
                  onClick={handleSendOtp}
                  className="w-full bg-[#142C54] hover:bg-[#316EC9] text-white border border-[#142C54] hover:border-[#316EC9] font-bold py-3 text-[10px] uppercase tracking-widest transition-colors rounded-none cursor-pointer"
                >
                  Send OTP SMS Code
                </button>
              </div>
            )}

            {/* VERIFY OTP COMPLETED FORM */}
            {otpSent && (
              <form onSubmit={handleVerifyOtpSubmit} className="space-y-4 text-xs font-semibold">
                <div className="border border-emerald-300 bg-emerald-50 p-3 italic text-emerald-950 font-medium rounded-none text-[11px]">
                  ✔️ SMS dispatched. Enter "2456" to instantly verify credentials.
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] uppercase tracking-wider text-[#8C887D]">Enter 4-Digit OTP Code *</label>
                  <div className="relative">
                    <input
                      type="text"
                      maxLength={4}
                      required
                      placeholder="e.g. 2456"
                      value={authForm.otp}
                      onChange={(e) => setAuthForm({ ...authForm, otp: e.target.value })}
                      className="w-full bg-white rounded-none border border-[#D8E2F0] p-2.5 pl-8 text-center text-xs font-mono font-bold tracking-widest text-[#1A1A1A] focus:border-[#316EC9] focus:outline-none"
                    />
                    <Lock className="absolute left-2.5 top-3.5 h-3.5 w-3.5 text-slate-450" />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isRegistering}
                  className="w-full bg-[#142C54] hover:bg-[#316EC9] text-white border border-[#142C54] hover:border-[#316EC9] font-bold py-3 text-[10px] uppercase tracking-widest transition-colors rounded-none cursor-pointer disabled:opacity-50"
                  id="auth-verify-btn"
                >
                  {isRegistering ? "Verifying..." : "Verify and Access final PDF"}
                </button>
              </form>
            )}

            <div className="text-center font-sans text-[9px] text-[#8C887D] uppercase tracking-wider border-t border-[#D8E2F0] pt-3 font-mono">
              🔒 Utmost Intermediate Security standards compliant with ODPC 04487/2.
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
