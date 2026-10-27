import React, { useState } from "react";
import { CheckCircle2, Search, ArrowRight, PhoneCall, RefreshCw, AlertTriangle, ShieldCheck } from "lucide-react";

interface RenewalsViewProps {
  setActiveTab: (tab: any) => void;
}

export default function RenewalsView({ setActiveTab }: RenewalsViewProps) {
  const [policyNo, setPolicyNo] = useState("");
  const [searched, setSearched] = useState(false);
  const [foundPolicy, setFoundPolicy] = useState<any | null>(null);
  const [renewalCompleted, setRenewalCompleted] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!policyNo.trim()) return;
    
    setSearched(true);
    // Simulate finding a policy
    const matches = policyNo.toUpperCase().includes("UTM") || policyNo.length > 5;
    if (matches) {
      setFoundPolicy({
        policyNumber: policyNo.toUpperCase(),
        clientName: "Raymond Mwangi",
        productName: "Private Motor Comprehensive (ICEA Lion)",
        expiryDate: "2026-06-30",
        originalPremiumKES: 55000,
        renewalRebatePremiumKES: 49500, // 10% no claims discount rebate
        vehicleReg: "KDJ 120A",
        status: "Nearing Expiry (13 Days remaining)"
      });
    } else {
      setFoundPolicy(null);
    }
  };

  const executeRenewal = () => {
    setRenewalCompleted(true);
  };

  return (
    <div className="bg-[#FAF9F6] py-12 font-sans" id="renewals-view-wrapper">
      <div className="mx-auto max-w-3xl px-4">
        
        <div className="text-center mb-8">
          <span className="text-[10px] uppercase font-mono tracking-[0.2em] text-[#316EC9] font-bold">
            Brokerage Renewals Desk
          </span>
          <h1 className="text-3xl font-serif italic text-[#142C54] mt-1">Settle Policy Renewals Instantly</h1>
          <p className="text-xs text-[#8C887D] max-w-md mx-auto mt-2 leading-relaxed">
            Audit your active portfolios. Input your policy coordinates to claim up to 15% No-Claims-Discount (NCD) premium write-offs automatically.
          </p>
        </div>

        {renewalCompleted ? (
          <div className="bg-white border border-[#D8E2F0] p-8 text-center space-y-4">
            <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto" />
            <h2 className="text-lg font-serif italic text-[#142C54]">Policy Renewal Initialized!</h2>
            <div className="bg-emerald-50/55 p-4 text-xs text-left text-emerald-950 space-y-2 border border-emerald-200 font-mono">
              <p>• <strong>Policy Reference:</strong> {foundPolicy?.policyNumber}</p>
              <p>• <strong>Client:</strong> {foundPolicy?.clientName}</p>
              <p>• <strong>Applicable Rebate Premium:</strong> KES {foundPolicy?.renewalRebatePremiumKES?.toLocaleString()}</p>
              <p>• <strong>Temporary Cover Note:</strong> Active for 30 consecutive days pending physical certificate print.</p>
            </div>
            
            <p className="text-[11px] text-[#8C887D] leading-relaxed">
              Our placement desk has generated the digital cover note. Final tax stamps are being routed in accordance with IRA guidelines.
            </p>

            <button
              onClick={() => {
                setSearched(false);
                setRenewalCompleted(false);
                setPolicyNo("");
              }}
              className="mt-4 bg-[#142C54] text-white px-6 py-2.5 text-xs font-bold uppercase tracking-widest"
            >
              Track Another Policy
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            
            {/* Lookup Form */}
            <form onSubmit={handleSearch} className="bg-white border border-[#D8E2F0] p-6 space-y-4">
              <h3 className="text-xs uppercase font-bold text-[#142C54] tracking-wider">
                Search Your Active Policy Number
              </h3>
              
              <div className="flex gap-2">
                <div className="relative flex-grow">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="e.g. UTM-M-991204 or KDJ 120A"
                    value={policyNo}
                    onChange={(e) => setPolicyNo(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-[#D8E2F0] text-xs text-[#142C54] focus:outline-none focus:border-[#316EC9] uppercase font-mono"
                    id="renewal-policy-lookup-field"
                  />
                </div>
                <button
                  type="submit"
                  className="bg-[#142C54] hover:bg-[#316EC9] text-white px-5 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors shrink-0"
                >
                  Lookup portfolio
                </button>
              </div>
              <p className="text-[10px] text-gray-400">
                Tip: Enter any policy reference or car vehicle registration number (e.g. 'UTM-M-003' or 'KDJ') to initiate custom testing.
              </p>
            </form>

            {searched && (
              <div className="bg-white border border-[#D8E2F0] p-6">
                {foundPolicy ? (
                  <div className="space-y-4 animate-fade-in">
                    <div className="border-b border-gray-100 pb-3 flex justify-between items-center">
                      <div>
                        <span className="text-[10px] text-gray-400 uppercase font-bold">Policy Found</span>
                        <h4 className="text-sm font-mono font-bold text-[#142C54]">{foundPolicy.policyNumber}</h4>
                      </div>
                      <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5">
                        {foundPolicy.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs leading-relaxed">
                      <div>
                        <p className="text-gray-400">Client Holder Name:</p>
                        <p className="font-bold text-[#142C54]">{foundPolicy.clientName}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Insured Asset/Vehicle:</p>
                        <p className="font-bold text-[#142C54]">{foundPolicy.vehicleReg} ({foundPolicy.productName})</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Standard Premium KES:</p>
                        <p className="font-semibold text-gray-700 font-mono strike line-through">KES {foundPolicy.originalPremiumKES.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-[#316EC9] font-bold">Eligible No-Claims Rebate:</p>
                        <p className="font-bold text-emerald-700 font-mono text-sm bg-emerald-50 px-2 py-0.5 inline-block">
                          KES {foundPolicy.renewalRebatePremiumKES.toLocaleString()} (-10% rebate)
                        </p>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-3 text-[10px] text-gray-550 border border-slate-200">
                      ⚠️ <strong>Payment placement note:</strong> Upgrades and additional third-party legal COMESA cards can be compiled alongside this renewal cycle.
                    </div>

                    <div className="pt-3 border-t border-gray-150 flex justify-between">
                      <a 
                        href="https://wa.me/254707798701?text=Hi%20Utmost,%20I%20want%20to%20discuss%20renewal%20rebates%25"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="border border-[#D8E2F0] text-gray-600 hover:border-black px-4 py-2 text-xs font-bold uppercase transition-colors"
                      >
                        Request Premium Audit
                      </a>
                      
                      <button
                        onClick={executeRenewal}
                        className="bg-[#142C54] hover:bg-emerald-600 text-white px-5 py-2 text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-1"
                      >
                        <span>Authorize Renewal Placement</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 text-gray-500 text-xs">
                    <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
                    <span>No active policy records resolved. Try searching "UTM" or call the hotline immediately.</span>
                  </div>
                )}
              </div>
            )}

            {/* General Guidance */}
            <div className="bg-white border border-[#D8E2F0] p-6 flex items-start space-x-3">
              <ShieldCheck className="h-5 w-5 text-[#316EC9] shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs uppercase font-bold text-[#142C54]">30-Day Gracing Parameters</h4>
                <p className="text-[11px] text-gray-650 leading-relaxed mt-1">
                  In accordance with the Insurance Regulatory Authority (IRA) rules, renewal processes allow a 30-day gracing period on standard private motor policies. No claims audits are processed on expired portfolios unless explicit binders were logged.
                </p>
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
