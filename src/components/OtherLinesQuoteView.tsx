import React, { useMemo, useState } from "react";
import { ActiveTab } from "../types";
import { mockInsurers } from "../data/mockInsurers";
import { EXTRA_LICENSED_CLASSES } from "../data/extraLicensedClasses";
import { OTHER_LINE_CATEGORIES, OTHER_LINE_LIVE_CATEGORY_IDS } from "../data/otherLineCategories";
import { OTHER_LINE_FORM_DEFS, OtherLineFieldDef } from "../data/otherLineFormDefs";
import InsurerLogo from "./InsurerLogo";
import { Briefcase, ShieldCheck, AlertCircle, CheckCircle, Phone, Sparkles } from "lucide-react";

interface OtherLinesQuoteViewProps {
  setActiveTab: (tab: ActiveTab) => void;
  initialCategory?: string | null;
  initialSubType?: string | null;
}

const LIVE_CATEGORIES = OTHER_LINE_CATEGORIES.filter((c) => OTHER_LINE_LIVE_CATEGORY_IDS.includes(c.id));

// Display names for the 3 built-in insurers with no full mockInsurers.ts profile (matches the
// names used in server.ts's builtInInsurers motor list).
const EXTRA_INSURER_NAMES: Record<string, string> = {
  stardiscover: "Star Discover Insurance Limited",
  aar: "AAR Insurance (Kenya) Limited",
  oldmutual: "Old Mutual General Insurance Kenya Limited"
};

function getLicensedGeneralClasses(insurerId: string): string[] | undefined {
  const profile = mockInsurers.find((m) => m.id === insurerId);
  if (profile) return profile.licensedGeneralClasses;
  return EXTRA_LICENSED_CLASSES[insurerId]?.general;
}

// Only surface carriers with verified IRA licensing data for the selected class - unlike the
// admin rate editor (which defaults to "show everything" when license data is unverified), the
// customer-facing flow errs strict so nobody is quoted against an insurer that isn't actually
// authorised for that class.
function getLicensedInsurersForCategory(categoryCode: string) {
  return mockInsurers
    .filter((m) => (m.licensedGeneralClasses || []).includes(categoryCode))
    .map((m) => ({ id: m.id, name: m.tradingName || m.name }))
    .concat(
      Object.entries(EXTRA_LICENSED_CLASSES)
        .filter(([, v]) => (v.general || []).includes(categoryCode))
        .map(([id]) => ({ id, name: EXTRA_INSURER_NAMES[id] || id }))
    );
}

type SubmissionResult = {
  referenceNumber: string;
  status: "quoted" | "pending_underwriter_review";
  premium: number | null;
  rateApplied: { itemName: string; rateType: string; rate: number } | null;
};

export default function OtherLinesQuoteView({ setActiveTab, initialCategory, initialSubType }: OtherLinesQuoteViewProps) {
  const validInitialCategory = initialCategory && OTHER_LINE_LIVE_CATEGORY_IDS.includes(initialCategory) ? initialCategory : LIVE_CATEGORIES[0].id;
  const [categoryId, setCategoryId] = useState<string>(validInitialCategory);
  const category = OTHER_LINE_CATEGORIES.find((c) => c.id === categoryId)!;
  const categoryFormDef = OTHER_LINE_FORM_DEFS[categoryId];

  const validInitialSubType = initialSubType && categoryFormDef.subTypes.some((s) => s.id === initialSubType) ? initialSubType : categoryFormDef.subTypes[0].id;
  const [subTypeId, setSubTypeId] = useState<string>(validInitialSubType);
  const subType = categoryFormDef.subTypes.find((s) => s.id === subTypeId) || categoryFormDef.subTypes[0];

  const licensedInsurers = useMemo(() => getLicensedInsurersForCategory(category.code), [category.code]);
  const [insurerId, setInsurerId] = useState<string>(licensedInsurers[0]?.id || "");

  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<SubmissionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCategoryChange = (id: string) => {
    setCategoryId(id);
    const def = OTHER_LINE_FORM_DEFS[id];
    setSubTypeId(def.subTypes[0].id);
    const insurers = getLicensedInsurersForCategory(OTHER_LINE_CATEGORIES.find((c) => c.id === id)!.code);
    setInsurerId(insurers[0]?.id || "");
    setAnswers({});
    setResult(null);
    setError(null);
  };

  const handleSubTypeChange = (id: string) => {
    setSubTypeId(id);
    setAnswers({});
    setResult(null);
  };

  const handleFieldChange = (fieldId: string, value: any) => {
    setAnswers((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!contactName.trim() || !contactPhone.trim()) {
      setError("Please provide your name and phone number so our team can reach you.");
      return;
    }
    const missing = subType.fields.filter((f) => f.required && !answers[f.id]);
    if (missing.length > 0) {
      setError(`Please complete: ${missing.map((f) => f.label).join(", ")}`);
      return;
    }
    if (!insurerId) {
      setError("No licensed insurer is available for this class yet - please contact our advisory line directly.");
      return;
    }

    setIsSubmitting(true);
    setResult(null);
    try {
      const response = await fetch("/api/other-line-quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: categoryId,
          subType: subTypeId,
          insurerId,
          answers,
          ratingBasisValue: Number(answers[subType.ratingBasisFieldId]) || 0,
          contactName: contactName.trim(),
          contactPhone: contactPhone.trim(),
          contactEmail: contactEmail.trim()
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Submission failed.");
      }
      setResult({
        referenceNumber: data.request.referenceNumber,
        status: data.request.status,
        premium: data.request.premium,
        rateApplied: data.request.rateApplied
      });
    } catch (err: any) {
      setError(err.message || "Failed to submit this request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderField = (field: OtherLineFieldDef) => {
    const value = answers[field.id] ?? (field.type === "boolean" ? false : "");
    const label = (
      <label className="text-[9px] font-bold text-[#8C887D] uppercase tracking-wider">
        {field.label} {field.required && "*"} {field.unit && <span className="text-[#316EC9]">({field.unit})</span>}
      </label>
    );

    if (field.type === "boolean") {
      return (
        <div key={field.id} className="space-y-1.5">
          {label}
          <div className="flex items-center space-x-2 pt-1">
            <input
              type="checkbox"
              checked={!!value}
              onChange={(e) => handleFieldChange(field.id, e.target.checked)}
              className="rounded-none border-[#D8E2F0] accent-[#316EC9]"
            />
            <span className="text-[11px] text-[#5E5A51] font-medium">Yes</span>
          </div>
        </div>
      );
    }

    if (field.type === "select") {
      return (
        <div key={field.id} className="space-y-1.5">
          {label}
          <select
            required={field.required}
            value={value}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            className="w-full bg-white rounded-none border border-[#D8E2F0] p-2.5 text-xs text-slate-800 focus:border-[#316EC9] focus:outline-none"
          >
            <option value="">Select...</option>
            {field.options?.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      );
    }

    if (field.type === "textarea") {
      return (
        <div key={field.id} className="space-y-1.5 sm:col-span-2">
          {label}
          <textarea
            required={field.required}
            value={value}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            rows={2}
            className="w-full bg-white rounded-none border border-[#D8E2F0] p-2.5 text-xs text-slate-800 focus:border-[#316EC9] focus:outline-none"
          />
        </div>
      );
    }

    return (
      <div key={field.id} className="space-y-1.5">
        {label}
        <input
          type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
          required={field.required}
          value={value}
          onChange={(e) => handleFieldChange(field.id, field.type === "number" ? Number(e.target.value) : e.target.value)}
          className="w-full bg-white rounded-none border border-[#D8E2F0] p-2.5 text-xs text-slate-800 focus:border-[#316EC9] focus:outline-none"
        />
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 font-sans text-left space-y-8" id="other-lines-quote-workspace">

      <div className="border-b border-[#D8E2F0] pb-6">
        <p className="text-[10px] uppercase font-bold text-[#316EC9] tracking-[0.25em] mb-1 font-mono">Specialty Product Lines</p>
        <h1 className="text-3xl font-serif italic tracking-tight text-[#1A1A1A]">Liability, Engineering, Marine & Other Covers</h1>
        <p className="mt-1.5 text-xs text-[#8C887D] max-w-4xl leading-relaxed">
          Underwriting questions below mirror the real proposal forms used in the Kenyan market for each class. Carriers shown are filtered to only those verified as IRA-licensed for the selected class.
        </p>
      </div>

      {/* Category Tabs */}
      <div className="flex flex-wrap border-b border-[#D8E2F0] bg-[#FAF9F6] p-1 gap-1 font-mono">
        {LIVE_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => handleCategoryChange(cat.id)}
            className={`flex items-center space-x-1.5 px-3 py-2.5 text-[10px] uppercase tracking-wider font-bold rounded-none transition-all cursor-pointer ${
              categoryId === cat.id ? "bg-[#142C54] text-white" : "text-[#8C887D] hover:text-[#316EC9]"
            }`}
          >
            <Briefcase className="h-3 w-3" />
            <span>{cat.label}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        {/* LEFT: FORM */}
        <div className="lg:col-span-7 border border-[#D8E2F0] bg-[#FAF9F6] p-6 space-y-5 rounded-none">

          {categoryFormDef.subTypes.length > 1 && (
            <div className="space-y-1.5">
              <label className="text-[9px] font-bold text-[#8C887D] uppercase tracking-wider">Cover Type *</label>
              <select
                value={subTypeId}
                onChange={(e) => handleSubTypeChange(e.target.value)}
                className="w-full bg-white rounded-none border border-[#D8E2F0] p-2.5 text-xs font-semibold text-slate-800 focus:border-[#316EC9] focus:outline-none"
              >
                {categoryFormDef.subTypes.map((st) => (
                  <option key={st.id} value={st.id}>{st.label}</option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[9px] font-bold text-[#8C887D] uppercase tracking-wider">Underwriter *</label>
            {licensedInsurers.length === 0 ? (
              <div className="border border-[#FFE8B5] bg-[#FFF8E7] p-3 text-[11px] text-[#8A6D3B]">
                No insurer in our current licensing register is verified for this class yet. Please call our advisory line below.
              </div>
            ) : (
              <select
                value={insurerId}
                onChange={(e) => setInsurerId(e.target.value)}
                className="w-full bg-white rounded-none border border-[#D8E2F0] p-2.5 text-xs font-semibold text-slate-800 focus:border-[#316EC9] focus:outline-none"
              >
                {licensedInsurers.map((ins) => (
                  <option key={ins.id} value={ins.id}>{ins.name}</option>
                ))}
              </select>
            )}
          </div>

          <p className="text-[9px] text-[#8C887D] font-mono uppercase tracking-wider border-t border-[#D8E2F0] pt-3">
            Source: {subType.sourceForm} (generic Kenyan-market reference)
          </p>

          <form onSubmit={handleSubmit} className="space-y-4 text-xs font-semibold">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-b border-[#D8E2F0] pb-4">
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold text-[#8C887D] uppercase tracking-wider">Your Full Name *</label>
                <input
                  type="text"
                  required
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="w-full bg-white rounded-none border border-[#D8E2F0] p-2.5 text-xs text-slate-800 focus:border-[#316EC9] focus:outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold text-[#8C887D] uppercase tracking-wider">Phone Number *</label>
                <input
                  type="tel"
                  required
                  placeholder="e.g. 0712 345678"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className="w-full bg-white rounded-none border border-[#D8E2F0] p-2.5 text-xs text-slate-800 focus:border-[#316EC9] focus:outline-none"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-[9px] font-bold text-[#8C887D] uppercase tracking-wider">Email (optional)</label>
                <input
                  type="email"
                  placeholder="e.g. name@domain.com"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className="w-full bg-white rounded-none border border-[#D8E2F0] p-2.5 text-xs text-slate-800 focus:border-[#316EC9] focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {subType.fields.map(renderField)}
            </div>

            {error && (
              <div className="border border-red-200 bg-red-50 p-3 text-[11px] text-red-700 rounded-none">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || licensedInsurers.length === 0}
              className="w-full bg-[#142C54] hover:bg-[#316EC9] text-white text-xs font-bold uppercase tracking-widest py-3.5 border border-[#142C54] hover:border-[#316EC9] transition-all rounded-none cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? "Submitting..." : "Submit for Underwriting"}
            </button>
          </form>
        </div>

        {/* RIGHT: RESULT / INFO */}
        <div className="lg:col-span-5 space-y-6">
          {!result && (
            <div className="border border-[#D8E2F0] bg-[#FAF9F6] border-dashed p-8 text-center flex flex-col items-center justify-center space-y-4 rounded-none">
              <div className="border border-[#D8E2F0] p-3 text-neutral-400 bg-white rounded-none">
                <ShieldCheck className="h-8 w-8 text-neutral-300" />
              </div>
              <h3 className="text-lg font-serif italic text-[#1A1A1A]">Specialist Cover Requires Underwriting</h3>
              <p className="text-xs text-[#8C887D] max-w-sm mx-auto leading-relaxed">
                Most classes here (Liability, Engineering, Marine, Theft, WIBA, Personal Accident, Fidelity/Money) don't yet have a published binder rate on file for every carrier - your request routes straight to our underwriting desk for a same-day indicative quote, unless the selected insurer already has a negotiated rate loaded, in which case you'll see an instant premium.
              </p>
            </div>
          )}

          {result && result.status === "quoted" && (
            <div className="border border-[#316EC9]/30 bg-white p-6 space-y-4 rounded-none">
              <div className="flex items-center space-x-2 text-[#316EC9]">
                <CheckCircle className="h-5 w-5" />
                <span className="text-[10px] font-bold uppercase tracking-widest font-mono">Instant Indicative Premium</span>
              </div>
              <p className="text-2xl font-bold text-[#1A1A1A]">KES {result.premium?.toLocaleString()}</p>
              {result.rateApplied && (
                <p className="text-[10px] text-[#8C887D] font-mono">
                  Applied: {result.rateApplied.itemName} @ {result.rateApplied.rate}{result.rateApplied.rateType === "permille" ? "‰" : "%"}
                </p>
              )}
              <div className="border border-[#FFE8B5] bg-[#FFF8E7] p-2.5 text-[10px] text-[#8A6D3B]">
                Reference: <strong>{result.referenceNumber}</strong>. Indicative only - final terms confirmed by an Utmost staff member.
              </div>
            </div>
          )}

          {result && result.status === "pending_underwriter_review" && (
            <div className="border border-[#D8E2F0] bg-white p-6 space-y-4 rounded-none">
              <div className="flex items-center space-x-2 text-[#142C54]">
                <Sparkles className="h-5 w-5" />
                <span className="text-[10px] font-bold uppercase tracking-widest font-mono">Submitted for Underwriter Review</span>
              </div>
              <p className="text-xs text-[#5E5A51] leading-relaxed">
                No published binder rate is on file yet for this insurer/class combination, so we won't invent a figure. Your risk information has been logged and routed to our underwriting desk - expect a call back with an indicative quote.
              </p>
              <div className="border border-[#D8E2F0] bg-[#FAF9F6] p-2.5 text-[10px] text-[#8C887D] font-mono">
                Reference: <strong className="text-[#1A1A1A]">{result.referenceNumber}</strong>
              </div>
              <a href="tel:+254707798701" className="flex items-center justify-center space-x-1.5 bg-[#142C54] hover:bg-[#316EC9] text-white text-[10px] font-bold uppercase tracking-widest py-3 transition-all">
                <Phone className="h-3.5 w-3.5" />
                <span>Call Advisory Line +254 707 798701</span>
              </a>
            </div>
          )}

          {insurerId && licensedInsurers.length > 0 && (
            <div className="border border-[#D8E2F0] bg-white p-4 flex items-center space-x-3">
              <div className="w-14 h-7 flex items-center justify-center bg-slate-50 border border-slate-100 rounded p-0.5 shrink-0">
                <InsurerLogo carrierId={insurerId} height="18" className="max-w-full max-h-full object-contain" />
              </div>
              <p className="text-[10px] text-[#8C887D] font-mono uppercase tracking-wider">
                Verified for IRA class {category.code} ({category.label})
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
