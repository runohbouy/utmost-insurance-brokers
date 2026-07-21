import React from "react";
import { ShieldCheck, Award, Users, BookOpen } from "lucide-react";

interface AboutViewProps {
  setActiveTab: (tab: any) => void;
}

export default function AboutView({ setActiveTab }: AboutViewProps) {
  return (
    <div className="bg-[#FAF9F6] py-12 font-sans" id="about-us-view">
      
      {/* Banner */}
      <div className="mx-auto max-w-4xl px-4 text-center mb-10">
        <span className="text-[10px] uppercase font-mono tracking-[0.2em] text-[#316EC9] font-bold">
          Corporate Credentials
        </span>
        <h1 className="text-3xl sm:text-4xl font-serif italic text-[#142C54] mt-1">Our History & Mandate</h1>
        <p className="text-xs text-[#8C887D] max-w-lg mx-auto mt-2 leading-relaxed">
          Established in 1999. Serving Kenyan individuals, households, and corporate firms for over 27 consecutive years under IRA Broker License.
        </p>
      </div>

      <div className="mx-auto max-w-4xl px-4 space-y-8">
        
        {/* Core History Block */}
        <div className="bg-white border border-[#D8E2F0] p-6 sm:p-8 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#142C54] border-b border-gray-100 pb-2">
            The Utmost Placement Legacy
          </h2>
          <p className="text-xs text-gray-750 leading-relaxed text-justify">
            Founded in Nairobi, Kenya, Utmost Insurance Brokers Limited commenced operations with a core vision: to offer complete, independent, and high-integrity advice that keeps customers first. In an industry where most agents push biased products, our charter dictates looking at all underwriters in the country to design cost-effective options with maximum claims coverage.
          </p>
          <p className="text-xs text-gray-750 leading-relaxed text-justify">
            Under the guidance of our leadership panel, Utmost expanded to cover complex industrial risks, parastatals wellness schemes, contractors multi-million liabilities, and custom digital placements. Our recent launch of the online comparative wizard ensures that any Kenyan resident can compare quotes instantly.
          </p>
        </div>

        {/* Credentials Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          <div className="bg-white border border-[#D8E2F0] p-6 space-y-2">
            <Award className="h-6 w-6 text-[#316EC9]" />
            <h3 className="text-xs font-mono font-bold uppercase tracking-wide text-[#142C54]">
              IRA Licensing Ref
            </h3>
            <p className="text-[11px] text-gray-650 leading-relaxed">
              Utmost operates strictly as a licensed intermediate broker under General License: <strong className="text-black">IRA/06/334/2026</strong> and Corporate Medical License: <strong className="text-black">IRA/12/084/2026</strong>.
            </p>
          </div>

          <div className="bg-white border border-[#D8E2F0] p-6 space-y-2">
            <ShieldCheck className="h-6 w-6 text-emerald-600" />
            <h3 className="text-xs font-mono font-bold uppercase tracking-wide text-[#142C54]">
              Regulatory Memberships
            </h3>
            <p className="text-[11px] text-gray-650 leading-relaxed">
              Utmost is a proud member of the Association of Insurance Brokers of Kenya (AIBK) and registered under the office of the Data Protection Commissioner (ODPC) Ref: <strong className="text-black">04487/2</strong>.
            </p>
          </div>

        </div>

      </div>

    </div>
  );
}
