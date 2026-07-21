import React, { useState, useEffect } from "react";
import { ActiveTab } from "../types";
import { mockInsurers } from "../data/mockInsurers";
import InsurerLogo from "./InsurerLogo";
import {
  ShieldCheck, Sparkles, Car, Heart, ArrowRight, CheckCircle,
  HelpCircle, UserCheck, PhoneCall, Award, Users, BookOpen, AlertCircle, Phone
} from "lucide-react";

interface HomeViewProps {
  setActiveTab: (tab: ActiveTab) => void;
}

export default function HomeView({ setActiveTab }: HomeViewProps) {
  const [selectedProtection, setSelectedProtection] = useState<string>("");
  const [selectedInsurerId, setSelectedInsurerId] = useState<string>("jubilee");

  // Built-in carriers ship with the platform; admin-registered ones are fetched
  // from the Insurer Registry so newly-onboarded underwriters appear here too.
  const [customInsurers, setCustomInsurers] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/insurers")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setCustomInsurers(Array.isArray(data) ? data : []))
      .catch(() => setCustomInsurers([]));
  }, []);
  const allInsurers = [...mockInsurers, ...customInsurers];

  const protectionOptions = [
    { id: "vehicle", label: "My Vehicle (Motor Private & Commercial)", tab: "motor-quotes" as ActiveTab, icon: Car, color: "text-[#021f42]" },
    { id: "health", label: "My Health & Family (Medical Schemes)", tab: "medical-quotes" as ActiveTab, icon: Heart, color: "text-rose-500" },
    { id: "home", label: "My Home Contents (AI Decluttering & Property Risk)", tab: "room-analyzer" as ActiveTab, icon: Sparkles, color: "text-amber-500 animate-pulse" },
    { id: "business", label: "My Business, SME & Liability Risks", tab: "other-lines-quotes" as ActiveTab, icon: ShieldCheck, color: "text-blue-600" }
  ];

  const handleSelectorRoute = () => {
    const selected = protectionOptions.find(opt => opt.id === selectedProtection);
    if (selected) {
      setActiveTab(selected.tab);
    } else {
      // Default to room-analyzer / home picker
      setActiveTab("room-analyzer");
    }
  };

  const selectedInsurer = allInsurers.find(ins => ins.id === selectedInsurerId) || allInsurers[0];

  return (
    <div className="space-y-20 pb-24 font-sans px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto" id="home-view-container">
      
      {/* 1. HERO SECTION */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#142C54] via-[#102445] to-[#1c3a6b] py-20 lg:py-24 text-[#FAF9F6] rounded-3xl shadow-2xl" id="hero-banner-section">
        {/* Background Accent Lines & Ambient Glowing Orbs */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(49,110,201,0.2),transparent_60%)]"></div>
        <div className="absolute -bottom-24 -left-20 h-96 w-96 rounded-full bg-[#316EC9]/15 blur-3xl animate-pulse" style={{ animationDuration: '8s' }}></div>
        <div className="absolute top-10 right-1/4 h-64 w-64 rounded-full bg-[#00e1ff]/5 blur-3xl"></div>
        
        <div className="relative px-6 sm:px-12 lg:px-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
            
            {/* Hero Left Content */}
            <div className="lg:col-span-7 space-y-8 text-left">
              <div className="inline-flex items-center space-x-2.5 border border-blue-400/20 bg-blue-500/10 backdrop-blur-md px-4 py-2 rounded-full text-[11px] font-bold text-blue-200 tracking-wider">
                <Award className="h-4 w-4 text-[#316EC9] shrink-0" />
                <span>Established 1999 • 27 Years of Trusted Advisories</span>
              </div>
              
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-serif italic tracking-tight text-white leading-[1.1]">
                Compare Options, <br />
                Understand Cover. <br />
                <span className="text-blue-400 font-sans not-italic font-extrabold tracking-wide drop-shadow-md">“Always on your side!”</span>
              </h1>
              
              <p className="text-sm sm:text-base font-sans text-slate-300 max-w-xl leading-relaxed">
                Utmost helps individuals, families and corporations across Kenya compare licensed insurers side-by-side, obtain accurate quotes and manage claim disputes effortlessly.
              </p>

              {/* Need-based Interactive Selector in Hero */}
              <div className="rounded-2xl bg-white p-6 shadow-xl border border-slate-200/50 max-w-lg text-[#1A1A1A] transition-all hover:shadow-2xl">
                <p className="text-[10px] uppercase font-bold text-slate-500 tracking-[0.2em] mb-3 flex items-center space-x-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-ping"></span>
                  <span>What would you like to protect?</span>
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <select 
                    id="hero-needs-picker"
                    value={selectedProtection}
                    onChange={(e) => setSelectedProtection(e.target.value)}
                    className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#316EC9] focus:bg-white transition-all cursor-pointer"
                  >
                    <option value="">-- Choose Protection --</option>
                    {protectionOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>{opt.label}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleSelectorRoute}
                    id="hero-selector-gobutton"
                    className="rounded-xl bg-[#316EC9] hover:bg-[#2557a2] px-6 py-3 text-xs font-bold text-white transition-all flex items-center justify-center space-x-2 shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] tracking-wider uppercase cursor-pointer"
                  >
                    <span>Proceed</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Direct Metrics block */}
              <div className="grid grid-cols-3 gap-6 pt-6 border-t border-white/10">
                <div className="space-y-1">
                  <h3 className="text-2xl sm:text-3xl font-serif italic text-blue-300 font-bold">KES 4.2B+</h3>
                  <p className="text-[10px] uppercase tracking-wider text-slate-350 font-semibold">Total Premium Placed</p>
                </div>
                <div className="space-y-1">
                  <h3 className="text-2xl sm:text-3xl font-serif italic text-white font-bold">100%</h3>
                  <p className="text-[10px] uppercase tracking-wider text-slate-350 font-semibold">Licensed IRA & ODPC</p>
                </div>
                <div className="space-y-1">
                  <h3 className="text-2xl sm:text-3xl font-serif italic text-blue-300 font-bold">14,300+</h3>
                  <p className="text-[10px] uppercase tracking-wider text-slate-350 font-semibold">Claims Settled Reps</p>
                </div>
              </div>

            </div>

            {/* Hero Right: Featured AI Tool Card */}
            <div className="lg:col-span-5 relative" id="hero-right-ai-card">
              <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-3xl opacity-20 blur-xl"></div>
              <div className="relative border border-slate-200/50 bg-white p-6 sm:p-8 text-left space-y-5 rounded-3xl text-[#1A1A1A] shadow-xl hover:shadow-2xl transition-all duration-300">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="p-2.5 rounded-xl border border-blue-100 bg-blue-50/50 text-[#316EC9]">
                      <Sparkles className="h-4.5 w-4.5 animate-pulse text-[#316EC9]" />
                    </div>
                    <span className="font-sans text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                      Featured AI Tool
                    </span>
                  </div>
                  <span className="font-mono text-[9px] uppercase tracking-wider text-[#316EC9] border border-blue-100 px-3 py-1 bg-blue-50/50 rounded-full font-bold">
                    Gemini 3.5 Powered
                  </span>
                </div>

                <div className="space-y-2">
                  <h3 className="text-2xl font-serif italic text-[#142C54] font-semibold leading-snug">AI Home Risk Evaluator</h3>
                  <p className="text-xs text-slate-650 leading-relaxed">
                    Reduce safety hazards and find domestic package contents quotes.
                  </p>
                </div>

                <div className="rounded-2xl bg-[#F0F5FC]/80 p-4 border border-blue-50/50 font-mono text-[11px] text-[#142C54] space-y-2.5">
                  <p className="text-slate-500 uppercase font-bold text-[9px] tracking-wider flex items-center">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400 mr-2"></span>
                    <span>• USER_ACTION: Upload Room Photo</span>
                  </p>
                  <p className="text-[#1A1A1A] flex items-center">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500 mr-2 animate-ping"></span>
                    <span>• STATUS: Analyzing space layout...</span>
                  </p>
                  <p className="text-[#316EC9] font-bold flex items-center">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-600 mr-2"></span>
                    <span>• RESULT: 5 Clutter Issues, 3 Hazards, KES 390K Valued</span>
                  </p>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => setActiveTab("room-analyzer")}
                    id="hero-right-scanner-cta"
                    className="w-full rounded-xl bg-[#142C54] hover:bg-[#316EC9] px-4 py-3.5 text-xs uppercase tracking-wider font-bold text-white transition-all flex items-center justify-center space-x-2 shadow-sm hover:shadow-md cursor-pointer"
                  >
                    <span>Launch AI Room Scan</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 2. NEED-BASED PRODUCT QUICK LAUNCH SHORTCUTS */}
      <section className="space-y-10" id="instant-launch-shortcuts">
        <div className="text-center space-y-3 max-w-3xl mx-auto">
          <p className="text-xs font-extrabold text-[#316EC9] uppercase tracking-[0.2em] bg-blue-50/60 inline-block px-3 py-1 rounded-full">
            Insurance Access Pathways
          </p>
          <h2 className="text-3xl sm:text-4xl font-serif italic text-slate-900 tracking-tight leading-tight">
            Comprehensive Digital Sizing & Instant Quotes
          </h2>
          <p className="text-slate-500 text-sm max-w-2xl mx-auto leading-relaxed">
            Begin an independent comparisons sheet instantly. Absolutely no initial signups are required to start reviewing premiums.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {protectionOptions.map((opt) => {
            const Icon = opt.icon;
            return (
              <div 
                key={opt.id}
                onClick={() => setActiveTab(opt.tab)}
                id={`shortcut-card-${opt.id}`}
                className="group relative cursor-pointer overflow-hidden border border-slate-200/75 bg-white p-6 transition-all duration-300 hover:-translate-y-1.5 text-left rounded-2xl shadow-sm hover:shadow-md hover:border-[#142C54] flex flex-col justify-between min-h-[260px]"
              >
                <div className="space-y-4">
                  <div className="inline-flex border border-slate-100 bg-[#FAF9F6] p-3 group-hover:bg-[#142C54] transition-colors rounded-xl shadow-xs">
                    <Icon className="h-5 w-5 text-[#316EC9] group-hover:text-white transition-colors" />
                  </div>
                  <h3 className="font-serif italic text-xl text-slate-850 font-semibold group-hover:text-[#142C54] transition-colors">
                    {opt.id === "home" ? "Domestic Package" : opt.id === "vehicle" ? "Motor Vehicle" : opt.id === "health" ? "Medical Schemes" : "Business Liability"}
                  </h3>
                  <p className="text-xs text-slate-550 leading-relaxed">
                    {opt.id === "home" 
                      ? "Upload real room photos to organize and declare belongings while reducing fire safety hazards."
                      : opt.id === "vehicle" 
                      ? "Immediate comparisons on premiums and excess protectors across Kenya's top 5 underwriters."
                      : opt.id === "health"
                      ? "Inpatient & Outpatient comprehensive packages for you, your children and dependents."
                      : "SME corporate tenders, Bid Bonds, WIBA, Public Liability and Cargo Marine transportation."
                    }
                  </p>
                </div>
                <div className="mt-6 flex items-center text-[10px] uppercase tracking-widest font-extrabold text-[#1a1a1a] group-hover:text-[#316EC9] transition-colors">
                  <span>Start Journey</span>
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. HOW THE QUOTE COMPARISON PROCESS WORKS */}
      <section className="bg-gradient-to-b from-[#F0F5FC]/40 to-[#F0F5FC]/90 py-16 px-6 sm:px-12 rounded-3xl border border-blue-50" id="quote-howitworks">
        <div className="space-y-10">
          <div className="text-center space-y-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-[0.25em]">Platform Flowchart</p>
            <h2 className="text-3xl font-serif italic text-[#142C54] font-semibold tracking-tight">Four Clean Steps to Secure Cover</h2>
            <p className="text-sm text-slate-500 max-w-xl mx-auto leading-relaxed">
              Our automated quote routing keeps the intermediate workflow clear, fair and secure from comparison to settlement.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 relative">
            
            {/* Step 1 */}
            <div className="space-y-4 text-center md:text-left relative bg-white/80 backdrop-blur-xs p-6 rounded-2xl border border-slate-100 shadow-xs hover:shadow-md transition-all duration-300" id="step-info-1">
              <div className="inline-flex h-9 w-9 items-center justify-center bg-[#142C54] text-[#FAF9F6] font-bold font-mono text-sm rounded-xl">
                01
              </div>
              <h4 className="text-sm uppercase tracking-wider font-bold text-[#142C54]">Input Specs</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Provide vehicle logbook details, health limits, or upload room photos to evaluate your insurance profile.
              </p>
            </div>

            {/* Step 2 */}
            <div className="space-y-4 text-center md:text-left relative bg-white/80 backdrop-blur-xs p-6 rounded-2xl border border-slate-100 shadow-xs hover:shadow-md transition-all duration-300" id="step-info-2">
              <div className="inline-flex h-9 w-9 items-center justify-center border border-[#142C54] bg-transparent text-[#142C54] font-bold font-mono text-sm rounded-xl">
                02
              </div>
              <h4 className="text-sm uppercase tracking-wider font-bold text-[#142C54]">Compare Options</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Review premiums, sub-limits, excess terms and waiting periods across 5 leading licensed carriers simultaneously.
              </p>
            </div>

            {/* Step 3 */}
            <div className="space-y-4 text-center md:text-left relative bg-white/80 backdrop-blur-xs p-6 rounded-2xl border border-slate-100 shadow-xs hover:shadow-md transition-all duration-300" id="step-info-3">
              <div className="inline-flex h-9 w-9 items-center justify-center bg-[#316EC9] text-white font-bold font-mono text-sm rounded-xl">
                03
              </div>
              <h4 className="text-sm uppercase tracking-wider font-bold text-[#316EC9]">Secure M-Pesa</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Confirm your policy selection and make payments via M-Pesa STK push or direct Kenya bank transfer.
              </p>
            </div>

            {/* Step 4 */}
            <div className="space-y-4 text-center md:text-left relative bg-white/80 backdrop-blur-xs p-6 rounded-2xl border border-slate-100 shadow-xs hover:shadow-md transition-all duration-300" id="step-info-4">
              <div className="inline-flex h-9 w-9 items-center justify-center border border-slate-200 bg-slate-100 text-slate-500 font-bold font-mono text-sm rounded-xl">
                04
              </div>
              <h4 className="text-sm uppercase tracking-wider font-bold text-slate-700">Broker Audit</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Utmost certified staff audits the policy, releases digital cover notes, and acts as your direct advocate during claims.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* 4. INTERACTIVE INSURER DIRECTORY */}
      <section className="space-y-8" id="insurer-directory-section">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left panel: Directory Intro & Selection */}
          <div className="lg:col-span-4 space-y-6 text-left">
            <div className="space-y-2.5">
              <p className="text-xs uppercase font-extrabold text-[#316EC9] tracking-[0.2em] bg-blue-50 inline-block px-3 py-1 rounded-full">
                Licensed Underwriters
              </p>
              <h2 className="text-3xl font-serif italic text-slate-900 tracking-tight font-semibold">Carriers Directory</h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                Utmost only provides quotes from financial institutions fully audited by the Insurance Regulatory Authority (IRA) of Kenya.
              </p>
            </div>

            <div className="space-y-2" id="insurer-links-selector-list">
              {allInsurers.map((ins) => (
                <button
                  key={ins.id}
                  id={`insurer-sidebar-btn-${ins.id}`}
                  onClick={() => setSelectedInsurerId(ins.id)}
                  className={`w-full flex items-center justify-between p-3 px-4 text-xs font-bold tracking-wider uppercase transition-all duration-300 rounded-xl border cursor-pointer ${
                    selectedInsurerId === ins.id
                      ? "bg-[#142C54] text-[#FAF9F6] border-[#142C54] shadow-md scale-[1.01]"
                      : "bg-white text-slate-700 hover:bg-[#F0F5FC] border-slate-200/60"
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-14 h-7 flex items-center justify-center bg-slate-50 border border-slate-100 rounded p-0.5 shrink-0">
                      <InsurerLogo carrierId={ins.id} height="16" className="max-w-full max-h-full object-contain" />
                    </div>
                    <span className="text-left leading-normal">{ins.tradingName}</span>
                  </div>
                  <CheckCircle className={`h-4.5 w-4.5 shrink-0 ${selectedInsurerId === ins.id ? "text-blue-400" : "text-transparent"}`} />
                </button>
              ))}
            </div>
          </div>

          {/* Right panel: Bento Grid Insurer Profile Display */}
          <div className="lg:col-span-8 border border-slate-200/60 bg-white p-6 sm:p-8 text-left space-y-6 rounded-2xl shadow-md transition-all duration-300 hover:shadow-lg" id="insurer-bento-profile">
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-100 pb-5 gap-4">
              <div className="flex items-center space-x-4">
                <div className="w-24 h-12 flex items-center justify-center bg-slate-50/50 p-1 border border-slate-100 rounded-xl shrink-0">
                  <InsurerLogo carrierId={selectedInsurer.id} height="28" className="max-w-full max-h-full object-contain" />
                </div>
                <div>
                  <h3 className="text-2xl font-serif italic text-slate-900 font-semibold">{selectedInsurer.name}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Established {selectedInsurer.established} • Verified IRA Partner</p>
                </div>
              </div>
              <span className="border border-blue-200 bg-blue-50/50 text-[#316EC9] px-3.5 py-1.5 text-[10px] uppercase font-mono tracking-widest font-bold rounded-lg shadow-2xs shrink-0">
                {selectedInsurer.rating}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
              <div className="space-y-4">
                <div className="bg-slate-50/80 p-5 border border-slate-100 rounded-xl">
                  <p className="font-bold text-[#142C54] uppercase tracking-wider text-[9px] mb-1.5 flex items-center space-x-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500"></span>
                    <span>Underwriter Strength Focus</span>
                  </p>
                  <p className="text-slate-700 leading-relaxed font-serif italic text-sm">{selectedInsurer.strengthReason}</p>
                </div>
                <div className="space-y-1 p-1">
                  <p className="font-bold text-slate-400 uppercase tracking-widest text-[9px]">Average Turnaround Settlement Time</p>
                  <p className="text-sm font-bold text-slate-850 leading-relaxed">{selectedInsurer.claimTurnaroundDays} Working Days after Discharge Voucher (DV) signoff</p>
                </div>
              </div>

              <div className="space-y-5">
                <div>
                  <p className="font-bold text-slate-400 uppercase tracking-widest text-[9px] mb-2.5">Available Products on Platform</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedInsurer.availableProducts.map((p, i) => (
                      <span key={i} className="bg-slate-50 text-slate-700 border border-slate-200/50 rounded-lg px-2.5 py-1.5 text-[10px] uppercase tracking-wider font-semibold">
                        {p}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="bg-[#F0F5FC]/60 rounded-xl p-4 border border-blue-50 space-y-1.5 font-mono text-[10px] text-slate-500">
                  <p className="font-sans font-extrabold text-[#142C54] mb-2">IRA Certificate Registrations:</p>
                  <p className="flex justify-between border-b border-blue-100/30 pb-1"><span>• IRA Gen License:</span> <span className="font-bold text-slate-800">{selectedInsurer.iraLicenseMotor}</span></p>
                  <p className="flex justify-between border-b border-blue-100/30 pb-1"><span>• IRA Medical License:</span> <span className="font-bold text-slate-800">{selectedInsurer.iraLicenseMedical || "IRA/12S/029/2026"}</span></p>
                  <p className="flex justify-between border-b border-blue-100/30 pb-1"><span>• Member of AIBK:</span> <span className="text-[#316EC9] font-bold">Yes</span></p>
                  <p className="flex justify-between"><span>• Data Officer (ODPC):</span> <span className="text-teal-600 font-bold">Registered</span></p>
                </div>
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* 5. DEDICATED HIGH VALUE VALUE-PROP (CORPORATE & TENDERS) */}
      <section className="bg-gradient-to-br from-[#142C54] to-[#1c3e75] py-16 px-6 sm:px-12 text-[#FAF9F6] text-left rounded-3xl shadow-xl relative overflow-hidden" id="corporate-advisories-cta">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,rgba(49,110,201,0.15),transparent_50%)]"></div>
        <div className="relative">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            
            <div className="lg:col-span-8 space-y-5">
              <span className="border border-blue-300/30 bg-blue-500/10 px-3.5 py-1.5 rounded-full text-[10px] uppercase tracking-widest font-bold text-blue-200">
                SME & Public Institutions Solutions
              </span>
              <h2 className="text-3xl font-serif italic text-white sm:text-4xl font-semibold">
                Bid Bonds, Tenders & Machinery All Risks
              </h2>
              <p className="text-slate-300 text-sm max-w-3xl leading-relaxed">
                Need specialized underwriting for parastatals, security bid bonds, contractors all risks (CAR), or group medical schemes? Our dedicated corporate account executives process bespoke risk audits in accordance with public procurement guidelines.
              </p>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-[11px] font-semibold text-slate-350 uppercase tracking-wider pt-1">
                <span className="flex items-center text-blue-300">
                  <CheckCircle className="mr-1.5 h-4 w-4 text-blue-400 shrink-0" /> Authorized Tender Underwriter Broker
                </span>
                <span className="flex items-center text-blue-300">
                  <CheckCircle className="mr-1.5 h-4 w-4 text-blue-400 shrink-0" /> Group Medical Censuses Setup
                </span>
                <span className="flex items-center text-blue-300">
                  <CheckCircle className="mr-1.5 h-4 w-4 text-blue-400 shrink-0" /> Marine SEA/AIR Open Certificate Covers
                </span>
              </div>
            </div>

            <div className="lg:col-span-4 text-center lg:text-right">
              <button
                onClick={() => setActiveTab("portal")}
                id="corporate-advisers-button"
                className="inline-flex items-center space-x-2 bg-[#FAF9F6] hover:bg-[#316EC9] text-[#1A1A1A] hover:text-white px-6 py-4 text-xs font-bold uppercase tracking-widest rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-md"
              >
                <span>Request Corporate Tender Advisory</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>

          </div>
        </div>
      </section>

      {/* 6. EDUCATIONAL BLOGS & GLOSSARY */}
      <section className="text-left space-y-8" id="educational-blogs-section">
        <div className="space-y-3">
          <p className="text-xs font-extrabold text-[#316EC9] uppercase tracking-[0.2em] bg-blue-50 inline-block px-3 py-1 rounded-full">
            Insurance Education Center
          </p>
          <h2 className="text-3xl font-serif italic text-slate-900 font-semibold tracking-tight">Plain Language Advisories</h2>
          <p className="text-xs text-slate-550 max-w-xl">
            We operate as an advisory-led broker. Read key guidelines verified by our compliance directors Stanley Gikandi and Peter Kihara.
          </p>
         </div>

         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          
          {/* Article 1 */}
          <div className="border border-slate-200/70 bg-white p-5 hover:border-[#316EC9] transition-all flex flex-col justify-between rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-1 duration-300" id="article-card-1">
            <div className="space-y-4">
              <div className="inline-flex border border-blue-50 bg-blue-50/20 px-2.5 py-1 text-[9px] uppercase tracking-widest font-bold text-[#316EC9] rounded-lg">MOTOR PROPERTY</div>
              <h3 className="text-base font-serif italic text-slate-850 font-semibold leading-snug">Why Vehicle Valuations Matter to Avoid Underinsurance Offsets</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                If your car is valued at KES 1M but insured for KES 800K, any claim is subject to the average clause. The insurer only pays 80% of damage repairs, offsetting your personal loss.
              </p>
            </div>
            <div className="pt-4 border-t border-slate-100 mt-5 flex items-center justify-between text-[9px] font-mono tracking-wider uppercase text-slate-450">
              <span className="font-sans font-bold">By: Peter Kihara</span>
              <BookOpen className="h-4 w-4 text-[#316EC9]" />
            </div>
          </div>

          {/* Article 2 */}
          <div className="border border-slate-200/70 bg-white p-5 hover:border-[#316EC9] transition-all flex flex-col justify-between rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-1 duration-300" id="article-card-2">
            <div className="space-y-4">
              <div className="inline-flex border border-blue-50 bg-blue-50/20 px-2.5 py-1 text-[9px] uppercase tracking-widest font-bold text-[#316EC9] rounded-lg">HEALTH SYSTEMS</div>
              <h3 className="text-base font-serif italic text-slate-850 font-semibold leading-snug">Common Grounds for Claim Delays on Medical Schemes</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Failure to list pre-existing chronic conditions during onboarding delays hospital payments. Standard 30-day waiting rules apply to non-accidental inpatient surgeries.
              </p>
            </div>
            <div className="pt-4 border-t border-slate-100 mt-5 flex items-center justify-between text-[9px] font-mono tracking-wider uppercase text-slate-450">
              <span className="font-sans font-bold">By: Stanley Gikandi</span>
              <BookOpen className="h-4 w-4 text-[#316EC9]" />
            </div>
          </div>

          {/* Article 3 */}
          <div className="border border-slate-200/70 bg-white p-5 hover:border-[#316EC9] transition-all flex flex-col justify-between rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-1 duration-300" id="article-card-3">
            <div className="space-y-4">
              <div className="inline-flex border border-blue-50 bg-blue-50/20 px-2.5 py-1 text-[9px] uppercase tracking-widest font-bold text-[#316EC9] rounded-lg">DOMESTIC RISKS</div>
              <h3 className="text-base font-serif italic text-slate-850 font-semibold leading-snug">Understanding the Average Clause on House Content Assets</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Home contents policies are not automatically updated. Upgrading televisions or kitchen fridges without updating your asset register creates high liability gaps when burglaries strike.
              </p>
            </div>
            <div className="pt-4 border-t border-slate-100 mt-5 flex items-center justify-between text-[9px] font-mono tracking-wider uppercase text-slate-450">
              <span className="font-sans font-bold">By: Stanley Gikandi</span>
              <BookOpen className="h-4 w-4 text-[#316EC9]" />
            </div>
          </div>

          {/* Article 4 */}
          <div className="border border-slate-200/70 bg-white p-5 hover:border-[#316EC9] transition-all flex flex-col justify-between rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-1 duration-300" id="article-card-4">
            <div className="space-y-4">
              <div className="inline-flex border border-blue-50 bg-blue-50/20 px-2.5 py-1 text-[9px] uppercase tracking-widest font-bold text-[#316EC9] rounded-lg">REGULATORY ODPC</div>
              <h3 className="text-base font-serif italic text-slate-850 font-semibold leading-snug">Data Protection: How Utmost Protects Medical Declarations</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Under ODPC registrations 04487/2 and 48359, we protect your health records. We never share diagnostic profiles to third parties without explicit affirmative consent.
              </p>
            </div>
            <div className="pt-4 border-t border-slate-100 mt-5 flex items-center justify-between text-[9px] font-mono tracking-wider uppercase text-slate-450">
              <span className="font-sans font-bold">By: Compliance Team</span>
              <BookOpen className="h-4 w-4 text-[#316EC9]" />
            </div>
          </div>

        </div>
      </section>

      {/* 7. QUICK DISPATCH HELPLINES SECTION */}
      <section className="border border-red-200 rounded-2xl bg-gradient-to-br from-red-50/80 to-rose-50/30 p-6 md:p-8 text-left grid grid-cols-1 md:grid-cols-12 gap-6 items-center shadow-sm relative overflow-hidden" id="emergency-claims-bar">
        <div className="absolute top-0 right-0 w-32 h-32 bg-red-100/20 rounded-full blur-2xl"></div>
        <div className="md:col-span-8 space-y-2.5 relative">
          <div className="flex items-center space-x-2 text-red-800">
            <AlertCircle className="h-4.5 w-4.5 animate-bounce text-red-600 shrink-0" />
            <span className="font-sans text-[10px] font-bold uppercase tracking-[0.18em]">Emergency 24H Claims Rescue Hotline</span>
          </div>
          <h3 className="text-2xl font-serif italic text-red-950 font-semibold">Involved in a Motor Collision or Medical Emergency?</h3>
          <p className="text-xs text-red-900/80 leading-relaxed font-sans">
            Call our emergency representative at Top Plaza immediately. If there is a vehicle collision: do not admit liability. Take immediate photos of damages if it is safe and note the other driver's registration numbers.
          </p>
        </div>
        <div className="md:col-span-4 flex flex-col sm:flex-row gap-3 md:justify-end relative">
          <a
            href="tel:+254732228908"
            className="rounded-xl bg-red-600 hover:bg-red-700 hover:scale-[1.02] active:scale-[0.98] px-5 py-3.5 text-center text-xs uppercase tracking-wider font-extrabold text-white transition-all shadow-sm flex items-center justify-center space-x-2"
            id="emergency-phone-dial"
          >
            <Phone className="h-3.5 w-3.5" />
            <span>Call: 0732 228908</span>
          </a>
          <button
            onClick={() => setActiveTab("claims")}
            className="rounded-xl border border-red-200 bg-white hover:bg-red-50 hover:scale-[1.01] active:scale-[0.99] px-5 py-3.5 text-xs uppercase tracking-wider font-bold text-red-700 transition-all shadow-xs cursor-pointer"
          >
            Report Claim Online
          </button>
        </div>
      </section>

    </div>
  );
}
