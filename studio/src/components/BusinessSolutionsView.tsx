import React from "react";
import { CheckSquare, ArrowRight, ShieldCheck, Mail, FileCheck2, Users2, ShieldAlert } from "lucide-react";

interface BusinessSolutionsViewProps {
  setActiveTab: (tab: any) => void;
}

export default function BusinessSolutionsView({ setActiveTab }: BusinessSolutionsViewProps) {
  const corporateSchedules = [
    { title: "SME Commercial Combined", desc: "For startups, retail shops, and warehouses. Consolidates Fire, Burglary, Money, GIT, and Public Liability into a single package with 15% discount." },
    { title: "Contractors All Risks (CAR)", desc: "Essential for civil contractors and project builders. Encompasses site asset collapse, machinery breakdown, and third party construction liabilities." },
    { title: "Marine & Logistics Open Covers", desc: "Automated declaration templates covering imported inventory by air or sea cargo. Perfect for Clearing agents and large freight distributors." },
    { title: "Group Health & WIBA Schemes", desc: "Statutory labor compliance. Covers occupational harm medical bills and group life protections aligned with parastatals guidelines." }
  ];

  return (
    <div className="bg-[#FAF9F6] py-12 font-sans" id="business-solutions-view">
      
      {/* Hero */}
      <div className="bg-[#142C54] text-white py-14 mb-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center sm:text-left">
          <span className="text-[10px] uppercase font-mono tracking-widest text-[#316EC9] font-bold">
            Corporate Placements Desk
          </span>
          <h1 className="text-3xl sm:text-5xl font-serif italic text-white mt-1">
            Bespoke Enterprise Risk Advisories
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 mt-2 max-w-2xl leading-relaxed">
            Since 1999, we underwrite multi-million Kenyan corporate risk profiles. We audit public tender parameters, parastatal standards, and contractors obligations.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Solutions Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          <div className="lg:col-span-8 space-y-6">
            <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-[#142C54] border-b border-[#D8E2F0] pb-2">
              Our Professional Enterprise Modules
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {corporateSchedules.map((item, idx) => (
                <div key={idx} className="bg-white border border-[#D8E2F0] p-5 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="h-2 w-10 bg-[#316EC9]"></div>
                    <h3 className="text-xs font-mono font-bold text-[#142C54] uppercase tracking-wide">
                      {item.title}
                    </h3>
                    <p className="text-[11px] text-[#8C887D] leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                  
                  <div className="mt-4 pt-3 border-t border-gray-100">
                    <button
                      onClick={() => setActiveTab("get-a-quote")}
                      className="text-[#316EC9] hover:text-[#142C54] text-[10px] font-bold uppercase flex items-center gap-1"
                    >
                      <span>Initiate Custom RFP</span>
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Public Tenders Warning Notice */}
            <div className="bg-white border border-[#D8E2F0] p-6">
              <h3 className="text-xs font-bold uppercase tracking-wider text-red-950 flex items-center">
                <ShieldAlert className="h-4.5 w-4.5 text-red-700 mr-2 shrink-0" />
                Public Procurement Compliance (PPADA 2015)
              </h3>
              <p className="text-[11px] text-red-900/80 leading-relaxed mt-2">
                All tender or performance bonds executed through Utmost are issued by IRA-authorized, parastatal-accepted underwriting banks. No manual edits or self-authentications are done, ensuring absolute compliance with county procurement audits.
              </p>
            </div>

          </div>

          {/* Sidebar */}
          <div className="lg:col-span-4 space-y-6">
            
            <div className="bg-white border border-[#D8E2F0] p-5">
              <h4 className="text-xs uppercase font-bold text-[#142C54] tracking-widest mb-3 pr-2 flex items-center">
                <FileCheck2 className="h-4.5 w-4.5 text-[#316EC9] mr-1.5" />
                Risk Audits Scheduled
              </h4>
              <p className="text-[11px] text-gray-700 leading-relaxed">
                We perform comprehensive on-site commercial warehouse fire and liability auditing. We isolate redundant insurance premium charges in accordance with historical fleet usage logs.
              </p>
            </div>

            <div className="bg-stone-900 text-white p-5">
              <h4 className="text-xs uppercase font-mono tracking-widest font-bold">Request a RFP Callback</h4>
              <p className="text-[10px] text-slate-300 mt-1 mb-4">
                Upload your employee census spreadsheet or vehicle logs directly. Our Lead underwriting partner will coordinate quotes comparison.
              </p>
              
              <button
                onClick={() => setActiveTab("contact-us")}
                className="w-full text-center bg-[#316EC9] text-white py-2 text-xs tracking-widest font-bold font-mono uppercase transition-colors hover:bg-stone-800"
              >
                Reach Corporate Desk
              </button>
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
