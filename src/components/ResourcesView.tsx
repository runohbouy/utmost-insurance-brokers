import React from "react";
import { Sparkles, FileText, ShieldAlert, ArrowRight, HelpCircle, Download } from "lucide-react";

interface ResourcesViewProps {
  setActiveTab: (tab: any) => void;
}

export default function ResourcesView({ setActiveTab }: ResourcesViewProps) {
  const customFaqs = [
    { q: "Is Utmost an underwriter?", a: "No, we are a registered independent insurance broker. Under the Kenyan Insurance Act, an intermediate broker represents the buyer, negotiating custom corporate rebates and managing claim disputes, whereas standard agents represent the insurance carrier." },
    { q: "How much do brokerage services cost?", a: "Our advisory, quotation comparisons, and Claims Rescue services are completely free of charge to customers. We are compensated through standard regulated commission structures paid solely by underwriters." },
    { q: "What is the AI Risk Evaluator?", a: "Our proprietary AI Risk Evaluator analyzes a photo of any asset or property - a vehicle, shop, equipment, home or its contents - to flag risk factors and recommend insurance policies. For rooms/homes, it also lists contents valuation (KES) to auto-formulate Domestic Package quotes." },
    { q: "How are personal data files handled?", a: "Utmost is fully registered with the Office of the Data Protection Commissioner (ODPC) Ref: 04487/2. All files, car logbooks, and clinical censuses are encrypted using standard secure protocols." }
  ];

  return (
    <div className="bg-[#FAF9F6] py-12 font-sans" id="resources-explorer">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        
        {/* Title */}
        <div className="text-center max-w-2xl mx-auto mb-10">
          <span className="text-[10px] uppercase font-mono tracking-[0.2em] text-[#316EC9] font-bold">
            Advisories and Regulatory Guidelines
          </span>
          <h1 className="text-3xl font-serif italic text-[#142C54] mt-1">Resource Center</h1>
          <p className="text-xs text-[#8C887D] mt-2 leading-relaxed">
            Expand your knowledge base with official IRA compliance documents, brokerage registrations, historical FAQs, or play our AI Risk Check tool immediately.
          </p>
        </div>

        <div className="space-y-8">
          
          {/* AI Scanner Spotlight CTA */}
          <div className="bg-[#142C54] text-white p-6 sm:p-8 flex flex-col sm:flex-row justify-between items-center gap-6 border-b-4 border-[#316EC9]">
            <div className="space-y-2 text-center sm:text-left">
              <span className="text-[9px] bg-red-600/90 text-white font-mono px-2 py-0.5 font-bold uppercase tracking-wider">PROP Proprietary Asset</span>
              <h3 className="text-lg font-serif italic text-white flex items-center justify-center sm:justify-start gap-1.5">
                <Sparkles className="h-5 w-5 text-[#316EC9]" />
                Interactive AI Risk Evaluator
              </h3>
              <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
                Analyze a photo of any asset or property. It flags risks, estimates values, recommends insurance policies to take up, and for homes/rooms also auto-generates comparative domestic package rates.
              </p>
            </div>
            
            <button
              onClick={() => setActiveTab("room-analyzer")}
              className="bg-[#316EC9] hover:bg-white hover:text-black text-[#FAF9F6] font-mono py-2.5 px-5 text-xs uppercase tracking-widest font-bold transition-all shrink-0 rounded-none cursor-pointer"
            >
              Play AI Risk Scan
            </button>
          </div>

          {/* Downloads Block */}
          <div className="bg-white border border-[#D8E2F0] p-6 space-y-4">
            <h3 className="text-xs uppercase font-bold text-[#142C54] tracking-widest border-b border-gray-100 pb-2 flex items-center">
              <FileText className="h-4.5 w-4.5 text-[#316EC9] mr-1.5 shrink-0" />
              Statutory Documents for Download
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              {[
                { title: "IRA Broker License certificate 2026", size: "1.2 MB" },
                { title: "AIBK membership compliance certificate", size: "850 KB" },
                { title: "ODPC data controller compliance receipt", size: "440 KB" },
                { title: "Standard motor claim notification form", size: "1.8 MB" }
              ].map((doc, idx) => (
                <div key={idx} className="flex justify-between items-center p-3 bg-slate-50 border border-slate-150 hover:bg-slate-100 transition-colors">
                  <div>
                    <p className="font-bold text-[#142C54] leading-tight">{doc.title}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">PDF Document • {doc.size}</p>
                  </div>
                  <button 
                    onClick={() => alert(`Simulated downloading: ${doc.title}`)}
                    className="text-[#316EC9] hover:text-[#142C54]"
                  >
                    <Download className="h-4.5 w-4.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* FAQ list */}
          <div className="bg-white border border-[#D8E2F0] p-6 space-y-6">
            <h3 className="text-xs uppercase font-bold text-[#142C54] tracking-widest border-b border-gray-100 pb-2 flex items-center">
              <HelpCircle className="h-4.5 w-4.5 text-[#316EC9] mr-1.5 shrink-0" />
              Answers to Key Inquiries
            </h3>

            <div className="divide-y divide-gray-100 space-y-4 text-xs leading-relaxed">
              {customFaqs.map((item, idx) => (
                <div key={idx} className={idx > 0 ? "pt-4" : ""}>
                  <h4 className="font-bold text-[#142C54] font-mono flex items-start">
                    <span className="text-[#316EC9] mr-1.5 font-bold">Q:</span>
                    {item.q}
                  </h4>
                  <p className="text-gray-750 text-justify mt-1 pl-4">
                    {item.a}
                  </p>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
