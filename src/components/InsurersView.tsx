import React, { useState, useEffect } from "react";
import { Shield, Sparkles, Building, CheckCircle, Award } from "lucide-react";
import { mockInsurers } from "../data/mockInsurers";
import InsurerLogo from "./InsurerLogo";

interface InsurersViewProps {
  setActiveTab: (tab: any) => void;
}

export default function InsurersView({ setActiveTab }: InsurersViewProps) {
  // Built-in carriers ship with the platform; admin-registered ones are fetched
  // from the Insurer Registry so newly-onboarded underwriters show up here too.
  const [customInsurers, setCustomInsurers] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/insurers")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setCustomInsurers(Array.isArray(data) ? data : []))
      .catch(() => setCustomInsurers([]));
  }, []);

  const allInsurers = [...mockInsurers, ...customInsurers];

  return (
    <div className="bg-[#FAF9F6] py-12 font-sans" id="insurers-view-wrapper">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Header Title */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <span className="text-[10px] uppercase font-mono tracking-[0.2em] text-[#316EC9] font-bold">
            Authorised Carrier Panels
          </span>
          <h1 className="text-3xl font-serif italic text-[#142C54] mt-1 leading-tight">
            Kenya's Premium A+ Rated Underwriters
          </h1>
          <p className="text-xs text-[#8C887D] mt-2 max-w-xl mx-auto leading-relaxed">
            Utmost coordinates directly with verified underwriters registered under the Kenyan Insurance Act Caps (IRA). We analyze claims ratios and capital reserves on your behalf before onboarding carriers.
          </p>
        </div>

        {/* Insurers list */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8" id="carrier-cards-grid">
          {allInsurers.map(ins => (
            <div key={ins.id} className="bg-white border border-[#D8E2F0] p-6 flex flex-col justify-between hover:shadow-md transition-shadow duration-300">
              <div>
                <div className="flex items-center space-x-3 mb-4">
                  {/* Premium Brand Logo - Resized perfectly for available placeholder */}
                  <div className="flex items-center justify-center p-1.5 bg-slate-50 border border-slate-100 rounded-lg shrink-0 w-28 h-12">
                    <InsurerLogo carrierId={ins.id} height="36" className="max-w-full max-h-full object-contain" />
                  </div>
                  <div>
                    <h3 className="text-[11px] font-mono font-bold text-[#142C54] uppercase tracking-wide leading-tight">
                      {ins.tradingName}
                    </h3>
                    <span className="text-[9px] text-[#316EC9] font-semibold">{ins.rating.split(" ")[0]} Rated</span>
                  </div>
                </div>

                <div className="space-y-2 py-3 border-y border-gray-100 text-xs">
                  <div>
                    <span className="text-gray-400 block text-[9px] uppercase tracking-wider font-mono">Claims Standard Turnaround:</span>
                    <strong className="text-emerald-700 font-mono text-[11px]">{ins.claimTurnaroundDays} Working Days</strong>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[9px] uppercase tracking-wider font-mono">Core Underwriting Strength:</span>
                    <span className="text-gray-700 font-medium font-serif italic text-[11.5px] leading-relaxed block mt-0.5">
                      {ins.strengthReason}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[9px] uppercase tracking-wider font-mono">Products Available on Panel:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {ins.availableProducts.slice(0, 3).map((prod, pIdx) => (
                        <span key={pIdx} className="bg-[#FAF9F6] text-slate-600 border border-slate-200/60 text-[8px] font-mono px-1.5 py-0.5 uppercase">
                          {prod}
                        </span>
                      ))}
                      {ins.availableProducts.length > 3 && (
                        <span className="text-slate-400 text-[8px] font-mono self-center px-1">
                          +{ins.availableProducts.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-2 text-right">
                <button
                  onClick={() => setActiveTab("get-a-quote")}
                  className="bg-[#142C54] text-white hover:bg-[#316EC9] text-[10px] font-bold uppercase px-3 py-1.5 transition-all font-mono cursor-pointer"
                >
                  Request quote
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Statutory Regulatory note */}
        <div className="bg-slate-50 border border-slate-200 p-6 flex items-start space-x-3 max-w-3xl mx-auto">
          <Award className="h-6 w-6 text-[#316EC9] shrink-0 mt-0.5" />
          <div className="text-xs">
            <h4 className="font-bold text-[#142C54] uppercase tracking-wide font-mono">IRA Annual Audit Status 2026</h4>
            <p className="text-gray-600 leading-relaxed mt-1 font-serif italic">
              All member companies listed above have been audited for statutory liquidity and capital adequacy ratios under the Kenyan Insurance Act parameters. In the event of standard carrier liquidations, Utmost participates inside the Policyholders Compensation Fund (PCF) schemes to recover client premiums quickly.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
