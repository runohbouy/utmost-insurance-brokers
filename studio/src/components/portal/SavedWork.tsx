import React, { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, Sparkles, Trash2 } from "lucide-react";
import type { ActiveTab, InsuranceQuote, RoomAnalysis } from "../../types";

// Draft quotes and room scans live in this browser (not on the server), so they are shown separately
// from the account records, which come from the brokerage's own system.

export function SavedWork({ setActiveTab, selectedQuote, savedAnalysis }: {
  setActiveTab: (tab: ActiveTab) => void; selectedQuote: InsuranceQuote | null; savedAnalysis: RoomAnalysis | null;
}) {
  const [savedQuotes, setSavedQuotes] = useState<any[]>([]);
  const [savedScans, setSavedScans] = useState<any[]>([]);

  useEffect(() => {
    try {
      const cachedQuotes = localStorage.getItem("utmost_saved_quotes");
      if (cachedQuotes) setSavedQuotes(JSON.parse(cachedQuotes));
      else if (selectedQuote) {
        const list = [{ id: `qt-${Date.now()}`, date: new Date().toLocaleDateString("en-KE"), quote: selectedQuote }];
        setSavedQuotes(list);
        localStorage.setItem("utmost_saved_quotes", JSON.stringify(list));
      }
      const cachedScans = localStorage.getItem("utmost_analyzed_rooms");
      if (cachedScans) setSavedScans(JSON.parse(cachedScans));
    } catch { /* storage unavailable: nothing saved to show */ }
  }, [selectedQuote, savedAnalysis]);

  function removeQuote(id: string) {
    const next = savedQuotes.filter((q) => q.id !== id);
    setSavedQuotes(next);
    try { localStorage.setItem("utmost_saved_quotes", JSON.stringify(next)); } catch { /* ignore */ }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start" id="portaltab-individual">
      <div className="lg:col-span-8 border border-[#D8E2F0] bg-white p-5 space-y-4 rounded-none">
        <h4 className="font-serif italic text-base text-[#316EC9] border-b border-[#D8E2F0] pb-2">Saved draft quotations</h4>
        {savedQuotes.length === 0 ? <p className="text-xs text-[#8C887D] italic py-2">No draft quotes. Use the Motor or Medical quote tools to compare prices.</p> : (
          <div className="space-y-3">{savedQuotes.map((item) => (
            <div key={item.id} className="flex justify-between items-center bg-[#FAF9F6] border border-[#D8E2F0] p-3 text-xs">
              <div>
                <h5 className="font-serif italic text-sm text-[#1A1A1A]">{item.quote.insurerName} proposal</h5>
                <p className="text-[10px] text-[#8C887D]">Sum insured: KES {item.quote.sumInsured?.toLocaleString?.() ?? "—"} · computed {item.date}</p>
              </div>
              <div className="flex items-center space-x-3">
                <span className="text-xs font-bold text-[#316EC9]">KES {item.quote.totalPremium?.toLocaleString?.()}</span>
                <button type="button" onClick={() => removeQuote(item.id)} className="p-1 text-slate-400 hover:text-red-700 cursor-pointer" aria-label={`Delete the ${item.quote.insurerName} quote`}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>
              </div>
            </div>))}</div>
        )}
        <div className="bg-[#FFF8E7] p-2.5 border border-[#FFE8B5] text-[9px] text-[#8A6D3B] leading-normal flex items-start space-x-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[#C19A4D]" aria-hidden="true" />
          <div><span className="font-bold text-[#7A5B2B] uppercase text-[8px] block mb-0.5">Underwriting disclaimer</span>Draft quotes are indicative and not final. Confirmation from an Utmost staff member is required to finalize and bind any cover.</div>
        </div>
      </div>

      <div className="lg:col-span-4 border border-[#D8E2F0] bg-white p-5 space-y-4 rounded-none">
        <h4 className="font-serif italic text-base text-[#316EC9] border-b border-[#D8E2F0] pb-2">Scanned rooms</h4>
        {savedScans.length === 0 ? (
          <div className="text-center py-6 space-y-3">
            <Sparkles className="h-6 w-6 text-[#316EC9] mx-auto" aria-hidden="true" />
            <p className="text-xs text-[#8C887D] italic">No scans saved on this device.</p>
            <button type="button" onClick={() => setActiveTab("room-analyzer")} className="uppercase tracking-wider bg-[#142C54] hover:bg-[#316EC9] text-white font-bold py-2 px-4 text-[9px] cursor-pointer">Start a scan</button>
          </div>
        ) : (
          <div className="space-y-3">{savedScans.map((item) => (
            <button type="button" key={item.id} onClick={() => setActiveTab("room-analyzer")} className="w-full border border-[#D8E2F0] bg-[#FAF9F6]/50 p-2 text-left cursor-pointer hover:bg-[#FAF9F6] flex space-x-2.5">
              <img src={item.img} alt="" className="w-12 h-12 object-cover border border-[#D8E2F0]" />
              <span className="text-xs flex-1 min-w-0"><span className="block font-serif italic text-xs text-[#1A1A1A]">{item.analysis.roomType}</span><span className="block text-[10px] text-[#8C887D]">Valuation: KES {item.analysis.totalContentsValueKES.toLocaleString()}</span></span>
              <ArrowRight className="h-4 w-4 self-center text-[#8C887D]" aria-hidden="true" />
            </button>))}</div>
        )}
      </div>
    </div>
  );
}
