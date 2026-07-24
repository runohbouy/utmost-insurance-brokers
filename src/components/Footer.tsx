import React from "react";
import { ActiveTab } from "../types";
import { Shield, Mail, Phone, MapPin, ExternalLink, MessageSquare } from "lucide-react";
import Logo from "./Logo";

interface FooterProps {
  setActiveTab: (tab: ActiveTab) => void;
}

export default function Footer({ setActiveTab }: FooterProps) {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-[#101F37] text-white border-t-4 border-[#316EC9] font-sans" id="app-footer">
      
      {/* Upper Footer Links Section */}
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          
          {/* Section 1: Brand & Regulatory Body Info */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Logo variant="icon" height="28" className="bg-white p-1 rounded-sm shadow-xs" />
              <span className="text-md font-serif italic tracking-wider text-white">UTMOST INSURANCE</span>
            </div>
            <p className="text-xs leading-relaxed text-slate-200">
              Established in 1999 as a leading, dependable, and experienced Kenyan corporate insurance broker. Providing end-to-end advisories, quotes comparisons, policy tracking and claims rescue administration.
            </p>
            <div className="pt-2 border-t border-white/10 text-slate-200 text-[10px] space-y-1">
              <p className="text-[#FAF9F6] font-semibold uppercase tracking-wider text-[11px]">Professional Memberships:</p>
              <p>• Member of the Association of Insurance Brokers of Kenya (AIBK)</p>
              <p>• Registered with the office of the Data Protection Commissioner (ODPC)</p>
            </div>
          </div>

          {/* Section 2: Platform Shortcuts */}
          <div>
            <h4 className="text-xs uppercase font-bold text-white tracking-[0.2em] mb-4 border-l-2 border-[#316EC9] pl-2">
              Quick Shortcuts
            </h4>
            <ul className="space-y-2 text-xs">
              {[
                { label: "Comparative Overview", tab: "home" as ActiveTab },
                { label: "AI Risk Evaluator (Any Asset or Property)", tab: "room-analyzer" as ActiveTab },
                { label: "Motor Private & Commercial Quote Tool", tab: "motor-quotes" as ActiveTab },
                { label: "Medical Family Plan Estimates", tab: "medical-quotes" as ActiveTab },
                { label: "Liability, Engineering & Specialty Covers", tab: "other-lines-quotes" as ActiveTab },
                { label: "24/7 Fast Incident Claims Notifications", tab: "claims" as ActiveTab },
                { label: "Brokerage Client Login Portal", tab: "portal" as ActiveTab },
                { label: "Broker Staff Risk Workspace", tab: "admin" as ActiveTab },
              ].map((link, idx) => (
                <li key={idx}>
                  <button
                    onClick={() => setActiveTab(link.tab)}
                    className="text-white hover:text-[#316EC9] font-medium transition-colors text-left cursor-pointer"
                  >
                    › {link.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Section 3: Contact & Address details */}
          <div>
            <h4 className="text-xs uppercase font-bold text-white tracking-[0.2em] mb-4 border-l-2 border-[#316EC9] pl-2">
              Corporate Offices
            </h4>
            <ul className="space-y-3 text-xs">
              <li className="flex items-start space-x-2">
                <MapPin className="h-4 w-4 shrink-0 text-[#316EC9]" />
                <a
                  href="https://www.google.com/maps/search/?api=1&query=Top+Plaza+Building%2C+Kindaruma+Road%2C+Nairobi%2C+Kenya"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="leading-relaxed text-white hover:text-[#316EC9] transition-colors underline decoration-dotted underline-offset-2"
                >
                  Top Plaza Building, 2nd Floor,<br />
                  Kindaruma Road off Ngong Road,<br />
                  Nairobi, Kenya
                </a>
              </li>
              <li className="flex items-center space-x-2">
                <Phone className="h-4 w-4 shrink-0 text-[#316EC9]" />
                <span className="space-y-0.5 text-white">
                  <a href="tel:+254707798701" className="text-white hover:text-[#316EC9] transition-colors font-medium">0707 798 701</a> / <a href="tel:+254732228908" className="text-white hover:text-[#316EC9] transition-colors font-medium">0732 228 908</a>
                </span>
              </li>
              <li className="flex items-center space-x-2">
                <Mail className="h-4 w-4 shrink-0 text-[#316EC9]" />
                <a href="mailto:info@utmostkenya.com" className="text-white hover:text-[#316EC9] transition-colors font-medium">
                  info@utmostkenya.com
                </a>
              </li>
              <li className="flex items-center space-x-2">
                <MessageSquare className="h-4 w-4 shrink-0 text-[#316EC9]" />
                <a href="https://wa.me/254707798701" target="_blank" rel="noopener noreferrer" className="text-white hover:text-[#316EC9] font-semibold transition-colors">
                  WhatsApp Support line
                </a>
              </li>
            </ul>
          </div>

          {/* Section 4: Operational Broker Mandate */}
          <div className="space-y-4">
            <h4 className="text-xs uppercase font-bold text-white tracking-[0.2em] mb-4 border-l-2 border-[#316EC9] pl-2">
              Operating Mandate
            </h4>
            <div className="rounded-none bg-[#FAF9F6]/5 p-3 text-[11px] leading-relaxed text-slate-200 border border-white/10">
              <p className="font-semibold text-[#316EC9] mb-1">⚠️ Broker Disclaimer Note:</p>
              Utmost operates strictly as an independent intermediate broker. Quotes generated are indicative and subject to final carrier insurance underwriting audits. No immediate standard binding begins until formal payment receipting and placement confirmation occurs on our ERP.
            </div>
            <div className="text-[10px] text-slate-300 mt-2">
              Emergency Claims Support 24H Callout: <span className="text-white font-semibold">+254 732 228908</span>
            </div>
          </div>

        </div>

        {/* Regulatory License Bar (Critical requirement) */}
        <div className="mt-8 pt-8 border-t border-white/10 text-center text-[11px] space-y-2">
          <p className="text-[#FAF9F6] font-semibold tracking-wider uppercase text-[10px]">
            REGULATORY COMPLIANCE CREDS & REGISTRATIONS — KENYA 2026
          </p>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-slate-200">
            <span>🛡️ IRA Broker License Ref: <strong className="text-white">IRA/06/334/2026</strong></span>
            <span>🛡️ IRA Corporate Medical Broker License: <strong className="text-white">IRA/12/084/2026</strong></span>
            <span>📂 ODPC Data Controller: <strong className="text-white">04487/2</strong></span>
            <span>📂 ODPC Data Processor: <strong className="text-white">48359</strong></span>
          </div>
          <p className="text-slate-350 italic text-[10px]">
            Certified License year: 2026. Approved & Audited under the Kenyan Insurance Act Caps (IRA) & Data Protection Acts.
          </p>
        </div>

        {/* Bottom Legal bar */}
        <div className="mt-6 pt-6 border-t border-white/10 flex flex-col md:flex-row items-center justify-between text-xs text-slate-200">
          <p>© {currentYear} Utmost Insurance Brokers Limited. All rights reserved. <strong className="text-[#316EC9]">“We are always on your side!”</strong></p>
          <div className="flex space-x-4 mt-2 md:mt-0 text-[11px]">
            <span className="hover:text-white cursor-pointer">Privacy Principles</span>
            <span>•</span>
            <span className="hover:text-white cursor-pointer">Terms of Underwriting</span>
            <span>•</span>
            <span className="hover:text-white cursor-pointer">AIBK Code of Conduct</span>
          </div>
        </div>

      </div>
    </footer>
  );
}
