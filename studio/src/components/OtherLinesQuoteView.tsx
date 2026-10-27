import React, { useState } from "react";
import { ActiveTab } from "../types";
import { OTHER_LINE_FORM_DEFS, OtherLineFieldDef } from "../data/otherLineFormDefs";
import { Briefcase, ShieldCheck, CheckCircle, Phone, Sparkles, FileText } from "lucide-react";
import { SITE_API } from "../api";
import { useSiteConfig, type SiteConfig } from "../siteData";

interface OtherLinesQuoteViewProps {
  setActiveTab: (tab: ActiveTab) => void;
  initialCategory?: string | null;
  initialSubType?: string | null;
}

type SubmissionResult = {
  referenceNumber: string;
};

// The category list and which categories are live come from the backend's quote-engine
// settings, so the form can't drift from what the server accepts.
export default function OtherLinesQuoteView(props: OtherLinesQuoteViewProps) {
  const config = useSiteConfig();
  if (!config) {
    return <div className="py-24 text-center text-xs font-mono uppercase tracking-widest text-[#8C887D]">Loading product lines…</div>;
  }
  return <OtherLinesQuoteForm {...props} config={config} />;
}

function OtherLinesQuoteForm({ setActiveTab, initialCategory, initialSubType, config }: OtherLinesQuoteViewProps & { config: SiteConfig }) {
  const OTHER_LINE_CATEGORIES = config.otherLineCategories;
  const OTHER_LINE_LIVE_CATEGORY_IDS = config.otherLineLiveCategoryIds;
  const LIVE_CATEGORIES = OTHER_LINE_CATEGORIES.filter((c) => OTHER_LINE_LIVE_CATEGORY_IDS.includes(c.id));
  const validInitialCategory = initialCategory && OTHER_LINE_LIVE_CATEGORY_IDS.includes(initialCategory) ? initialCategory : LIVE_CATEGORIES[0].id;
  const [categoryId, setCategoryId] = useState<string>(validInitialCategory);
  const category = OTHER_LINE_CATEGORIES.find((c) => c.id === categoryId)!;
  const categoryFormDef = OTHER_LINE_FORM_DEFS[categoryId];

  const validInitialSubType = initialSubType && categoryFormDef.subTypes.some((s) => s.id === initialSubType) ? initialSubType : categoryFormDef.subTypes[0].id;
  const [subTypeId, setSubTypeId] = useState<string>(validInitialSubType);
  const subType = categoryFormDef.subTypes.find((s) => s.id === subTypeId) || categoryFormDef.subTypes[0];

  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<SubmissionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Clicking "Generate Quote" opens the real proposal form as a popup instead of it sitting
  // inline on the page - matches the pattern used for Motor's checkout modal. The same modal
  // swaps to showing the confirmation once a submission succeeds, so re-opening it (e.g. via
  // the summary bar after closing) shows the outcome rather than a blank form again.
  const [showProposalModal, setShowProposalModal] = useState(false);

  const handleCategoryChange = (id: string) => {
    setCategoryId(id);
    const def = OTHER_LINE_FORM_DEFS[id];
    setSubTypeId(def.subTypes[0].id);
    setAnswers({});
    setResult(null);
    setError(null);
    setShowProposalModal(false);
  };

  const handleSubTypeChange = (id: string) => {
    setSubTypeId(id);
    setAnswers({});
    setResult(null);
    setShowProposalModal(false);
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

    setIsSubmitting(true);
    setResult(null);
    try {
      const response = await fetch(`${SITE_API}/other-line-quotes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: categoryId,
          subType: subTypeId,
          answers,
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
        referenceNumber: data.request.referenceNumber
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
      <div className="space-y-1">
        <label className="text-[9px] font-bold text-[#8C887D] uppercase tracking-wider block">
          {field.label} {field.required && "*"} {field.unit && <span className="text-[#316EC9]">({field.unit})</span>}
        </label>
        {field.helpText && <p className="text-[9px] text-[#8C887D]/80 font-normal leading-relaxed">{field.helpText}</p>}
      </div>
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
          Choose a class below, then Generate Quote opens the real proposal form for it - the same underwriting questions real insurers ask on their own paperwork. Once submitted, our staff share your completed proposal with the licensed underwriters best placed to quote it and come back with competing terms.
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

      {/* SELECTION PANEL - class picked here; no underwriter selector, since the completed
          proposal form is shopped to several licensed underwriters by staff, not tied to one.
          The actual underwriting questions only appear once Generate Quote opens the popup. */}
      <div className="max-w-2xl mx-auto w-full border border-[#D8E2F0] bg-[#FAF9F6] p-8 space-y-6 rounded-none text-center">
        <div className="border border-[#D8E2F0] p-3 text-neutral-400 bg-white rounded-none inline-flex mx-auto">
          <ShieldCheck className="h-8 w-8 text-neutral-300" />
        </div>
        <h3 className="text-lg font-serif italic text-[#1A1A1A]">{category.label}</h3>

        {categoryFormDef.subTypes.length > 1 && (
          <div className="space-y-1.5 text-left max-w-sm mx-auto">
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

        <p className="text-xs text-[#8C887D] max-w-sm mx-auto leading-relaxed">
          Complete the proposal form and our staff will place it with the licensed underwriters best suited to this class, then come back to you with competing quotations.
        </p>

        <button
          type="button"
          onClick={() => setShowProposalModal(true)}
          className="w-full bg-[#142C54] hover:bg-[#316EC9] text-white text-xs font-bold uppercase tracking-widest py-3.5 border border-[#142C54] hover:border-[#316EC9] transition-all rounded-none cursor-pointer disabled:opacity-50"
          id="other-lines-generate-quote-btn"
        >
          Generate Quote
        </button>
      </div>

      {/* SELECTED/SUBMITTED SUMMARY BAR - reopens the popup without losing a submitted result,
          once the customer has closed it. Mirrors the pattern used on the Motor quote journey. */}
      {result && !showProposalModal && (
        <div className="max-w-2xl mx-auto w-full border border-[#316EC9] bg-[#F0F5FC] p-4 flex flex-col sm:flex-row items-center justify-between gap-3 rounded-none">
          <div className="flex items-center gap-3 text-left">
            <CheckCircle className="h-5 w-5 text-[#316EC9] shrink-0" />
            <div>
              <span className="text-[9px] uppercase font-bold text-[#316EC9] tracking-wider block font-mono">
                Submitted For Underwriter Placement
              </span>
              <p className="text-sm text-[#1A1A1A]">
                Reference: <strong className="font-mono">{result.referenceNumber}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowProposalModal(true)}
            className="uppercase tracking-wider inline-flex items-center justify-center space-x-1.5 bg-[#142C54] hover:bg-[#316EC9] text-white border border-[#142C54] hover:border-[#316EC9] px-4 py-2.5 text-[10px] font-bold transition-all rounded-none cursor-pointer"
          >
            <span>View details</span>
          </button>
        </div>
      )}

      {/* PROPOSAL FORM POPUP - the real proposal-form questions, opened on demand instead of
          sitting inline on the page. Swaps to the outcome once submitted. */}
      {showProposalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-none p-4 transition-all" id="proposal-form-modal">
          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-[#D8E2F0] bg-[#FAF9F6] p-6 shadow-none space-y-5 text-left rounded-none">

            <div className="flex justify-between items-start border-b border-[#D8E2F0] pb-3">
              <div>
                {/* No underwriter logo, selector, or source-document citation here by design -
                    this same risk information gets shopped to several licensed underwriters by
                    staff, not just one, so branding or naming the form after a single insurer's
                    own paperwork would be misleading. */}
                <span className="border border-[#316EC9]/30 bg-[#F0F5FC] px-2.5 py-0.5 font-mono text-[9px] font-bold text-[#316EC9] uppercase tracking-wider inline-flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  Proposal Form
                </span>
                <h3 className="text-lg font-serif italic text-[#1A1A1A] pt-1 leading-tight">{subType.label}</h3>
              </div>
              <button
                onClick={() => setShowProposalModal(false)}
                className="text-[#1A1A1A] hover:text-[#316EC9] text-sm font-bold p-1 cursor-pointer shrink-0"
                id="close-proposal-modal-btn"
              >
                ✕
              </button>
            </div>

            {result ? (
              <div className="space-y-4">
                <div className="border border-[#D8E2F0] bg-white p-5 space-y-3 rounded-none">
                  <div className="flex items-center space-x-2 text-[#142C54]">
                    <Sparkles className="h-5 w-5" />
                    <span className="text-[10px] font-bold uppercase tracking-widest font-mono">Submitted for Underwriter Placement</span>
                  </div>
                  <p className="text-xs text-[#5E5A51] leading-relaxed">
                    Your completed proposal has been logged and will be shared with the licensed underwriters best placed to quote this class - expect a call back with competing terms.
                  </p>
                  <div className="border border-[#D8E2F0] bg-[#FAF9F6] p-2.5 text-[10px] text-[#8C887D] font-mono">
                    Reference: <strong className="text-[#1A1A1A]">{result.referenceNumber}</strong>
                  </div>
                  <a href="tel:+254707798701" className="flex items-center justify-center space-x-1.5 bg-[#142C54] hover:bg-[#316EC9] text-white text-[10px] font-bold uppercase tracking-widest py-3 transition-all">
                    <Phone className="h-3.5 w-3.5" />
                    <span>Call Advisory Line +254 707 798701</span>
                  </a>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5 text-xs font-semibold">
                <div className="space-y-2">
                  <p className="text-[9px] font-bold text-[#8C887D] uppercase tracking-widest font-mono border-b border-[#D8E2F0] pb-1.5">Proposer Details</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                </div>

                <div className="space-y-2">
                  <p className="text-[9px] font-bold text-[#8C887D] uppercase tracking-widest font-mono border-b border-[#D8E2F0] pb-1.5">Risk Details</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {subType.fields.map(renderField)}
                  </div>
                </div>

                {error && (
                  <div className="border border-red-200 bg-red-50 p-3 text-[11px] text-red-700 rounded-none">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-[#142C54] hover:bg-[#316EC9] text-white text-xs font-bold uppercase tracking-widest py-3.5 border border-[#142C54] hover:border-[#316EC9] transition-all rounded-none cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? "Submitting..." : "Submit for Underwriting"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
