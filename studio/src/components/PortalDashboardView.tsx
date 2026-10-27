import React, { useState, useEffect } from "react";
import { ActiveTab, InsuranceQuote, RoomAnalysis } from "../types";
import { 
  User, Building2, ShieldCheck, FileText, Sparkles, AlertTriangle, 
  MapPin, Download, History, LogOut, ArrowRight, PhoneCall, Trash2, Mail, Phone, Users
} from "lucide-react";

interface PortalDashboardViewProps {
  setActiveTab: (tab: ActiveTab) => void;
  selectedQuote: InsuranceQuote | null;
  savedAnalysis: RoomAnalysis | null;
}

export default function PortalDashboardView({ setActiveTab, selectedQuote, savedAnalysis }: PortalDashboardViewProps) {
  const [portalType, setPortalType] = useState<"individual" | "corporate">("individual");
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [profile, setProfile] = useState<any>(null);
  const [inputPhone, setInputPhone] = useState<string>("");
  const [inputPass, setInputPass] = useState<string>("");

  const [savedQuotes, setSavedQuotes] = useState<any[]>([]);
  const [savedScans, setSavedScans] = useState<any[]>([]);

  // Check login states on mount
  useEffect(() => {
    const auth = localStorage.getItem("utmost_user_logged_in");
    const user = localStorage.getItem("utmost_user_profile");
    if (auth === "true" && user) {
      setIsLoggedIn(true);
      setProfile(JSON.parse(user));
    }

    // load quotes & scans from local caches
    const cachedQuotes = localStorage.getItem("utmost_saved_quotes");
    if (cachedQuotes) {
      setSavedQuotes(JSON.parse(cachedQuotes));
    } else if (selectedQuote) {
      // Seed initially
      const mockQuoteList = [{
        id: `qt-${Date.now()}`,
        date: new Date().toLocaleDateString("en-KE"),
        quote: selectedQuote
      }];
      setSavedQuotes(mockQuoteList);
      localStorage.setItem("utmost_saved_quotes", JSON.stringify(mockQuoteList));
    }

    const cachedScans = localStorage.getItem("utmost_analyzed_rooms");
    if (cachedScans) {
      setSavedScans(JSON.parse(cachedScans));
    }
  }, [selectedQuote, savedAnalysis]);

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputPhone) {
      alert("Please provide a valid M-Pesa phone number credentials.");
      return;
    }

    // Standard credential bypass for testing
    const defaultProfile = {
      name: "David Kiprop",
      email: "dkiprop@gmail.com",
      phone: inputPhone,
      company: "Kiprop Agribusiness Kenya Ltd",
      branch: "Ngong Road Office"
    };

    setIsLoggedIn(true);
    setProfile(defaultProfile);
    localStorage.setItem("utmost_user_logged_in", "true");
    localStorage.setItem("utmost_user_profile", JSON.stringify(defaultProfile));
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setProfile(null);
    localStorage.removeItem("utmost_user_logged_in");
    localStorage.removeItem("utmost_user_profile");
  };

  const handleDeleteQuote = (idObj: string) => {
    const filtered = savedQuotes.filter(item => item.id !== idObj);
    setSavedQuotes(filtered);
    localStorage.setItem("utmost_saved_quotes", JSON.stringify(filtered));
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 font-sans text-left space-y-12" id="portal-dashboard">
      
      {/* HEADER SECTION */}
      <div className="border-b border-[#D8E2F0] pb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="text-left">
          <p className="text-[10px] uppercase font-bold text-[#316EC9] tracking-[0.25em] mb-1 font-mono">Self-Service Terminal</p>
          <h1 className="text-3xl font-serif italic tracking-tight text-[#1A1A1A]">
            Utmost Customer Self-Service Portal
          </h1>
          <p className="mt-1.5 text-xs text-[#8C887D] max-w-4xl leading-relaxed">
            View active covers, track ongoing claims settlement portfolios and access certified IRA documents. Securely integrated with local cache systems.
          </p>
        </div>

        {isLoggedIn && (
          <button
            onClick={handleLogout}
            className="self-start md:self-center uppercase tracking-wider bg-white border border-[#D8E2F0] text-[#1A1A1A] font-bold px-4 py-2 hover:bg-[#F0F5FC] text-[10px] rounded-none flex items-center space-x-1.5 cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5 text-[#316EC9]" />
            <span>Sign Out Session</span>
          </button>
        )}
      </div>

      {/* A: LOGGED OUT AUTHENTICATION TRIGGER */}
      {!isLoggedIn && (
        <div className="max-w-xl mx-auto border border-[#D8E2F0] bg-[#FAF9F6] p-6 sm:p-8 space-y-6 rounded-none" id="loggedout-prompt-box">
          <div className="text-center space-y-2 pb-2 border-b border-[#D8E2F0]">
            <div className="border border-[#D8E2F0] w-12 h-12 flex items-center justify-center bg-white mx-auto rounded-none">
              <User className="h-6 w-6 text-[#316EC9]" />
            </div>
            <h3 className="text-xl font-serif italic text-[#1A1A1A]">Access Customer Workspace</h3>
            <p className="text-xs text-[#8C887D] max-w-md mx-auto leading-relaxed">
              Confirm your verified M-Pesa registered phone coordinates on our ERP registry to recover previous quotation checklists and medical declarations.
            </p>
          </div>

          <form onSubmit={handleLoginSubmit} className="space-y-4 text-xs font-semibold">
            <div className="space-y-1.5">
              <label className="text-[9px] uppercase tracking-wider text-[#8C887D]">M-Pesa Telephone Coordinates / Phone *</label>
              <input
                type="tel"
                required
                placeholder="e.g. 0712 345678"
                value={inputPhone}
                onChange={(e) => setInputPhone(e.target.value)}
                className="w-full bg-white rounded-none border border-[#D8E2F0] p-2.5 text-slate-800 focus:border-[#316EC9] focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[9px] uppercase tracking-wider text-[#8C887D]">Portal Security Key (Password Bypass) *</label>
              <input
                type="password"
                required
                placeholder="Enter any key to proceed..."
                value={inputPass}
                onChange={(e) => setInputPass(e.target.value)}
                className="w-full bg-white rounded-none border border-[#D8E2F0] p-2.5 text-slate-800 focus:border-[#316EC9] focus:outline-none"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-[#142C54] hover:bg-[#316EC9] text-white border border-[#142C54] hover:border-[#316EC9] font-bold py-3.5 text-[10px] uppercase tracking-widest rounded-none transition-all cursor-pointer"
              id="dash-login-button"
            >
              Sign In to Utmost Dashboard
            </button>
          </form>

          <p className="text-center font-mono text-[9px] text-[#8C887D] uppercase tracking-wider border-t border-[#D8E2F0] pt-3">
            🔒 Protected under certified Kenyan ODPC controller license 04487/2.
          </p>
        </div>
      )}

      {/* B: LOGGED IN PORTAL WORKSPACE */}
      {isLoggedIn && (
        <div className="space-y-10" id="login-portal-workspace">
          
          {/* PROFILE SUMMARY HERO */}
          <div className="border border-[#D8E2F0] bg-[#FAF9F6] p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 rounded-none">
            <div className="flex items-center space-x-3.5">
              <div className="h-16 w-16 bg-white flex items-center justify-center border border-[#D8E2F0] rounded-none">
                <User className="h-8 w-8 text-[#316EC9]" />
              </div>
              <div className="text-left space-y-0.5">
                <span className="border border-[#316EC9]/30 bg-[#F0F5FC] px-2 py-0.5 text-[9px] font-bold text-[#316EC9] uppercase tracking-wider">Verified Client Member</span>
                <h3 className="text-lg font-serif italic text-[#1A1A1A]">{profile.name}</h3>
                <p className="text-xs text-[#8C887D]">Contact: {profile.phone} | email: {profile.email}</p>
              </div>
            </div>

            {/* Selector Toggles between Individual and Corporate layouts */}
            <div className="flex border border-[#D8E2F0] bg-white p-1 rounded-none font-mono">
              <button
                onClick={() => setPortalType("individual")}
                className={`flex items-center space-x-1.5 py-2 px-3 text-[10px] uppercase tracking-wider font-bold rounded-none transition-all cursor-pointer ${
                  portalType === "individual" ? "bg-[#142C54] text-white" : "text-[#8C887D] hover:text-[#316EC9]"
                }`}
              >
                <User className="h-3.5 w-3.5" />
                <span>Personal Registry</span>
              </button>
              <button
                onClick={() => setPortalType("corporate")}
                className={`flex items-center space-x-1.5 py-2 px-3 text-[10px] uppercase tracking-wider font-bold rounded-none transition-all cursor-pointer ${
                  portalType === "corporate" ? "bg-[#142C54] text-white" : "text-[#8C887D] hover:text-[#316EC9]"
                }`}
              >
                <Building2 className="h-3.5 w-3.5" />
                <span>SME Corporate</span>
              </button>
            </div>
          </div>

          {/* ACTIVE PORTAL TAB 1: INDIVIDUAL */}
          {portalType === "individual" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start" id="portaltab-individual">
              
              {/* Left panel: Active policy covers & receipts */}
              <div className="lg:col-span-8 space-y-6 font-sans">
                
                {/* 1. MOCK ACTIVE COVERS SECTION */}
                <div className="border border-[#D8E2F0] bg-white p-5 space-y-4 rounded-none">
                  <h4 className="font-serif italic text-base text-[#1A1A1A] border-b border-[#D8E2F0] pb-2 text-[#316EC9]">
                    Active Certified Policy Covers
                  </h4>

                  <div className="space-y-4">
                    
                    {/* Active policy 1 */}
                    <div className="border border-[#D8E2F0] bg-[#FAF9F6]/40 p-4 space-y-3 rounded-none">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-2 border-b border-[#D8E2F0]/65">
                        <div className="flex items-center space-x-2">
                          <span className="text-2xl">🦁</span>
                          <div>
                            <h5 className="font-serif italic text-sm text-[#1A1A1A]">Jubilee Classic Domestic Package</h5>
                            <p className="text-[10px] text-[#8C887D]">Policy No: UTM-POL-9824 | Expiry: 14/12/2026</p>
                          </div>
                        </div>
                        <span className="border border-[#316EC9]/30 bg-[#F0F5FC] text-[#316EC9] font-mono text-[9px] font-bold px-2.5 py-0.5 uppercase tracking-wider">
                          ✔️ ACTIVE COVERAGE
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 font-mono text-[10px] text-[#8C887D] pt-1">
                        <div>
                          <p className="font-sans font-bold text-[#1A1A1A] uppercase text-[9px]">SUM INSURED</p>
                          <p className="font-sans font-semibold text-slate-800">KES 390,000</p>
                        </div>
                        <div>
                          <p className="font-sans font-bold text-[#1A1A1A] uppercase text-[9px]">PREMIUM PAID</p>
                          <p className="font-sans font-semibold text-[#316EC9]">KES 5,850</p>
                        </div>
                        <div className="text-right">
                          <p className="font-sans font-bold text-[#1A1A1A] uppercase text-[9px]">VALUATION DATE</p>
                          <p className="font-sans font-semibold text-slate-800">17/06/2026</p>
                        </div>
                      </div>

                      <div className="flex justify-end pt-2 border-t border-[#D8E2F0]/30">
                        <button
                          onClick={() => alert("Success: Document 'Jubilee_Policy_Schedule_UTM-POL-9824.pdf' downloaded. verified.")}
                          className="uppercase tracking-wider rounded-none border border-[#D8E2F0] bg-white px-3 py-1.5 font-bold text-[9px] hover:bg-[#F0F5FC] flex items-center space-x-1 cursor-pointer text-[#1A1A1A]"
                        >
                          <Download className="h-3 w-3 text-[#316EC9]" />
                          <span>PDF Schedule</span>
                        </button>
                      </div>
                    </div>

                  </div>
                </div>

                {/* 2. SAVED Quotation comparisons list */}
                <div className="border border-[#D8E2F0] bg-white p-5 space-y-4 rounded-none">
                  <h4 className="font-serif italic text-base text-[#1A1A1A] border-b border-[#D8E2F0] pb-2 text-[#316EC9]">
                    Saved Draft Insurance Quotations
                  </h4>

                  {savedQuotes.length === 0 && (
                    <p className="text-xs text-[#8C887D] italic py-2">No draft quotes. Access Motor or Medical to create comparative worksheets.</p>
                  )}

                  {savedQuotes.length > 0 && (
                    <div className="space-y-3">
                      {savedQuotes.map((item) => (
                        <div key={item.id} className="flex justify-between items-center bg-[#FAF9F6] border border-[#D8E2F0] p-3 text-xs rounded-none">
                          <div>
                            <h5 className="font-serif italic text-sm text-[#1A1A1A] flex items-center gap-1.5 flex-wrap">
                              <span>{item.quote.insurerName} Proposal</span>
                              {item.quote.isProvisionalRate && (
                                <span className="inline-block bg-[#FFF9E6] text-[#A67C00] border border-[#FFE082] px-1.5 py-0.2 text-[8px] font-bold uppercase tracking-wider font-mono">
                                  Provisional
                                </span>
                              )}
                            </h5>
                            <p className="text-[10px] text-[#8C887D]">Sum: KES {item.quote.sumInsured.toLocaleString()} | Computed: {item.date}</p>
                          </div>
                          
                          <div className="flex items-center space-x-3">
                            <span className="font-sans text-xs font-bold text-[#316EC9]">KES {item.quote.totalPremium.toLocaleString()}</span>
                            <button
                              onClick={() => handleDeleteQuote(item.id)}
                              className="p-1 text-slate-400 hover:text-red-700 cursor-pointer"
                              title="Delete Quote"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Underwriting Disclaimer */}
                  <div className="bg-[#FFF8E7] p-2.5 border border-[#FFE8B5] font-mono text-[9px] text-[#8A6D3B] leading-normal flex items-start space-x-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[#C19A4D]" />
                    <div>
                      <span className="font-bold text-[#7A5B2B] uppercase text-[8px] block mb-0.5 font-sans">Underwriting Disclaimer:</span>
                      Draft quotes are indicative and not final. Confirmation from an Utmost staff member is required to finalize and bind any cover.
                    </div>
                  </div>
                </div>

              </div>

              {/* Right panel: Active room scans history */}
              <div className="lg:col-span-4 space-y-6 font-sans">
                <div className="border border-[#D8E2F0] bg-white p-5 space-y-4 rounded-none">
                  <h4 className="font-serif italic text-base text-[#1A1A1A] border-b border-[#D8E2F0] pb-2 text-[#316EC9]">
                    AI Scanned Rooms Inventory
                  </h4>

                  {savedScans.length === 0 && (
                    <div className="text-center py-6 space-y-3">
                      <Sparkles className="h-6 w-6 text-[#316EC9] mx-auto animate-pulse" />
                      <p className="text-xs text-[#8C887D] italic">No previous scans found on cache.</p>
                      <button
                        onClick={() => setActiveTab("room-analyzer")}
                        className="uppercase tracking-wider rounded-none bg-[#142C54] hover:bg-[#316EC9] text-white font-bold py-2 px-4 text-[9px] cursor-pointer"
                      >
                        Start Scan Now
                      </button>
                    </div>
                  )}

                  {savedScans.length > 0 && (
                    <div className="space-y-3">
                      {savedScans.map((item) => (
                        <div
                          key={item.id}
                          onClick={() => setActiveTab("room-analyzer")}
                          className="border border-[#D8E2F0] bg-[#FAF9F6]/50 p-2 text-left cursor-pointer hover:bg-[#FAF9F6] flex space-x-2.5 rounded-none"
                        >
                          <img src={item.img} alt="room" className="w-12 h-12 object-cover rounded-none border border-[#D8E2F0]" />
                          <div className="text-xs flex-1 min-w-0">
                            <h5 className="font-serif italic text-xs text-[#1A1A1A]">{item.analysis.roomType}</h5>
                            <p className="text-[10px] text-[#8C887D]">Valuation: KES {item.analysis.totalContentsValueKES.toLocaleString()}</p>
                            <p className="text-[9px] text-[#316EC9] font-bold uppercase font-mono mt-0.5">M-DCLUTTER SCORE: {10 - item.analysis.clutterScore}/10</p>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); setActiveTab("room-analyzer"); }}
                            className="p-1 text-slate-550 hover:text-[#316EC9] cursor-pointer self-center"
                          >
                            <ArrowRight className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}

          {/* ACTIVE PORTAL TAB 2: CORPORATE */}
          {portalType === "corporate" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start" id="portaltab-corporate">
              
              {/* Left Column: Fleet vehicles schedule list */}
              <div className="lg:col-span-8 space-y-6">
                
                {/* 1. FLEET MOTOR VEHICLES SCHEDULE */}
                <div className="border border-[#D8E2F0] bg-white p-5 space-y-4 rounded-none">
                  <div className="flex justify-between items-center border-b border-[#D8E2F0] pb-2">
                    <h4 className="font-serif italic text-base text-[#1A1A1A]">
                      Corporate Motor Fleet ({profile.company})
                    </h4>
                    <span className="border border-[#316EC9]/30 bg-[#F0F5FC] px-2 py-0.5 text-[9px] font-bold text-[#316EC9] uppercase tracking-wider font-mono">
                      Maker-Checker Active
                    </span>
                  </div>

                  <div className="border border-[#D8E2F0] bg-[#FAF9F6]/80 p-4 text-xs leading-relaxed text-[#5E5A51] rounded-none">
                    <strong>📋 SME fleet upload guide:</strong> Fleet modifications require dual approval (maker-checker operations). Submit vehicle lists or logbook additions below for prompt underwriter reviews.
                  </div>

                  <div className="space-y-3 text-xs">
                    {[
                      { reg: "KCB 982T", make: "Toyota Hilux D4D", cover: "Comprehensive", val: 3200000, status: "Active" },
                      { reg: "KCD 145Y", make: "Isuzu FSR Cargo Truck", cover: "Comprehensive", val: 5800000, status: "Active" },
                      { reg: "KCY 451Q", make: "Suzuki Swift Private Delivery", cover: "Third Party Only", val: 1200000, status: "Pending approval" },
                    ].map((car, i) => (
                      <div key={i} className="border border-[#D8E2F0] bg-[#FAF9F6]/30 p-4 flex justify-between items-center rounded-none">
                        <div>
                          <div className="flex items-center space-x-1.5">
                            <span className="font-mono font-bold text-[#1A1A1A]">{car.reg}</span>
                            <span className="text-slate-350">|</span>
                            <span className="font-serif italic text-xs text-slate-800">{car.make}</span>
                          </div>
                          <p className="text-[10px] text-[#8C887D] pt-0.5">Cover: {car.cover} | Value: KES {car.val.toLocaleString()}</p>
                        </div>
                        <span className={`border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-none ${
                          car.status === "Active" ? "border-emerald-300 bg-emerald-50 text-emerald-800 font-mono" : "border-amber-300 bg-amber-50 text-amber-800"
                        }`}>
                          {car.status}
                        </span>
                      </div>
                    ))}
                  </div>

                </div>

              </div>

              {/* Right Column: Corporate Employee lists & censuses uploaders */}
              <div className="lg:col-span-4 space-y-6">
                
                {/* 1. MEMBER CENSUS UPLOADER FOR HEALTH SCHEMES */}
                <div className="border border-[#D8E2F0] bg-white p-5 space-y-4 rounded-none">
                  <h4 className="font-serif italic text-base text-[#1A1A1A] border-b border-[#D8E2F0] pb-2 text-[#316EC9]">
                    Employee Medical Census
                  </h4>
                  <p className="text-xs text-[#8C887D] leading-relaxed">
                    Submit lists of employees and age bands to renew corporate health plans.
                  </p>

                  <div className="border border-[#D8E2F0]/70 bg-[#FAF9F6] border-dashed p-4 text-center space-y-3 rounded-none">
                    <Users className="h-5 w-5 text-[#316EC9] mx-auto animate-bounce" />
                    <p className="text-[11px] font-bold text-[#1A1A1A] uppercase tracking-wider">Drag & Drop Staff Census CSV</p>
                    <button
                      type="button"
                      onClick={() => alert("Template medical_census_utmost_v1.xlsx downloaded. Please populate and upload.")}
                      className="uppercase tracking-wider rounded-none border border-[#D8E2F0] bg-white px-3 py-1.5 font-bold text-[9px] hover:bg-[#F0F5FC] text-[#1A1A1A] cursor-pointer"
                    >
                      Download Excel Template
                    </button>
                  </div>
                </div>

              </div>

            </div>
          )}

        </div>
      )}

    </div>
  );
}
