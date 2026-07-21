import React, { useState, useEffect } from "react";
import { Product, PRODUCT_CATEGORIES } from "../data/allProducts";
import { getStoredProducts } from "../data/productStore";
import { 
  Search, ShieldCheck, CheckCircle, ChevronRight, User, Users, Building, 
  ArrowRight, FileText, Calendar, Plus, ExternalLink, CalendarDays, UploadCloud 
} from "lucide-react";

interface GetAQuoteViewProps {
  setActiveTab: (tab: any) => void;
  initialProductId?: string | null;
  onSelectProduct?: (id: string) => void;
  onRouteToOtherLine?: (category: string, subType: string) => void;
}

// Maps specific catalog products onto the real proposal-form-informed intake built in
// OtherLinesQuoteView, so choosing "Fast Online Forms" for these sends the client straight to
// the matching underwriting questionnaire instead of the generic "adviser will call" flow.
const PRODUCT_TO_OTHER_LINE: Record<string, { category: string; subType: string }> = {
  "public-liability": { category: "liability", subType: "public_liability" },
  "professional-indemnity": { category: "liability", subType: "professional_indemnity" },
  "directors-officers-liability": { category: "liability", subType: "directors_officers" },
  "contractors-all-risks": { category: "engineering", subType: "contractors_all_risk" },
  "machinery-breakdown": { category: "engineering", subType: "machinery_breakdown" },
  "marine-cargo-transit": { category: "marine", subType: "goods_in_transit" },
  "goods-in-transit": { category: "marine", subType: "goods_in_transit" },
  "work-injury-benefits": { category: "wiba", subType: "wiba_standard" },
  "group-personal-accident": { category: "personal_accident", subType: "group_personal_accident" },
  "fidelity-guarantee": { category: "miscellaneous", subType: "fidelity_guarantee" },
  "burglary-housebreaking": { category: "theft", subType: "burglary" }
};

export default function GetAQuoteView({ setActiveTab, initialProductId, onSelectProduct, onRouteToOtherLine }: GetAQuoteViewProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  
  // Quiz progress
  const [quizStep, setQuizStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [quoteId, setQuoteId] = useState("");

  // Answers requested in section 7
  const [answers, setAnswers] = useState({
    customerType: "individual", // 'individual', 'family', 'business', 'institution'
    policyObjective: "new", // 'new', 'renewal', 'comparison'
    urgency: "immediate", // 'immediate', 'this_month', 'flexible'
    hasCurrentInsurance: "no", // 'yes', 'no'
    completionPreference: "online", // 'online', 'speak_adviser'
    additionalNotes: "",
    uploadedDocumentName: ""
  });

  // Load products
  useEffect(() => {
    const list = getStoredProducts().filter(p => p.status === "active");
    setProducts(list);
    if (initialProductId) {
      const found = list.find(p => p.id === initialProductId);
      if (found) {
        setSelectedProduct(found);
        setQuizStep(2);
      }
    }
  }, [initialProductId]);

  // Derived popular products
  const popularProducts = products.filter(p => p.featured).slice(0, 4);

  // Recommendations based on selected products (section 12)
  const getRecs = () => {
    if (!selectedProduct) return [];
    return products.filter(p => selectedProduct.relatedProducts?.includes(p.id) && p.id !== selectedProduct.id).slice(0, 3);
  };

  const selectProductAction = (prod: Product) => {
    setSelectedProduct(prod);
    setQuizStep(2);
    // Smooth scroll back to step header
    const stepHeader = document.getElementById("quote-wizard-tracker");
    if (stepHeader) {
      stepHeader.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleFinalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (answers.completionPreference === "online") {
      // If client chose Motor or Medical, direct them to Level 1 automated flow
      if (selectedProduct?.requiredForm === "motor-calc") {
        setActiveTab("motor-quotes");
        return;
      } else if (selectedProduct?.requiredForm === "med-calc") {
        setActiveTab("medical-quotes");
        return;
      } else if (selectedProduct && PRODUCT_TO_OTHER_LINE[selectedProduct.id] && onRouteToOtherLine) {
        const target = PRODUCT_TO_OTHER_LINE[selectedProduct.id];
        onRouteToOtherLine(target.category, target.subType);
        return;
      }
    }

    const generatedId = `UTM-Q-${Math.floor(100000 + Math.random() * 900000)}`;
    setQuoteId(generatedId);
    setSubmitted(true);

    // Save to local portfolio for standard customer tracking
    try {
      const existingQuotesRaw = localStorage.getItem("utmost_saved_quotes");
      const existingQuotes = existingQuotesRaw ? JSON.parse(existingQuotesRaw) : [];
      const newQuoteItem = {
        id: generatedId,
        date: new Date().toLocaleDateString("en-KE"),
        productName: selectedProduct?.name || "Bespoke Cover",
        quote: {
          insurerName: "Utmost Aggregated Broker Panel",
          insurerId: "utmost-agg",
          rating: "IRA/06/334/2026 Compliant",
          sumInsured: 0,
          basePremium: 0,
          pcf: 0,
          trainingLevy: 0,
          stampDuty: 0,
          totalPremium: 0,
          excessTerms: "Comprehensive broker claims rescue included.",
          mainBenefits: [
            `Policy: ${selectedProduct?.name}`,
            `Objective: ${answers.policyObjective.toUpperCase()}`,
            `Customer Type: ${answers.customerType.toUpperCase()}`
          ],
          waitingPeriod: "Immediate / Pending Audit",
          isRecommended: true,
          recommendationReason: "Custom broker comparison report assigned to underwriting team.",
          priceTag: "Aggregated Offer"
        }
      };
      localStorage.setItem("utmost_saved_quotes", JSON.stringify([newQuoteItem, ...existingQuotes]));
    } catch (err) {
      console.error(err);
    }
  };

  // Filtered dropdown list
  const filteredProducts = searchQuery.trim() !== ""
    ? products.filter(p => {
        const q = searchQuery.toLowerCase();
        return p.name.toLowerCase().includes(q) || p.shortDesc.toLowerCase().includes(q);
      })
    : [];

  return (
    <div className="bg-[#FAF9F6] py-10 font-sans" id="universal-quote-explorer">
      <div className="mx-auto max-w-3xl px-4">
        
        {/* Title Block */}
        <div className="text-center mb-8">
          <span className="text-[10px] uppercase tracking-[0.2em] font-mono text-[#316EC9] font-bold">
            Universal Placements Desk
          </span>
          <h1 className="text-3xl font-serif italic text-[#142C54] mt-1">Get an Indicative Quote</h1>
          <p className="text-xs text-[#8C887D] max-w-md mx-auto mt-2 leading-relaxed">
            Protect your family, assets or enterprise through IRA licensed brokers. Choose any insurance category to formulate quotes.
          </p>
        </div>

        {/* Wizard Tracker */}
        <div className="mb-6 flex justify-center items-center space-x-2 text-xs" id="quote-wizard-tracker">
          <span className={`px-2 py-0.5 font-mono font-bold ${quizStep === 1 ? "bg-[#142C54] text-[#FAF9F6]" : "bg-gray-200 text-gray-700"}`}>
            1. Select Product
          </span>
          <ArrowRight className="h-3 w-3 text-gray-400" />
          <span className={`px-2 py-0.5 font-mono font-bold ${quizStep === 2 ? "bg-[#142C54] text-[#FAF9F6]" : "bg-gray-100 text-gray-400"}`}>
            2. Questionnaire
          </span>
          {quizStep === 2 && (
            <button 
              onClick={() => { setSelectedProduct(null); setQuizStep(1); }}
              className="text-[#316EC9] hover:underline font-bold text-[10px] pl-2 uppercase"
            >
              Change Product
            </button>
          )}
        </div>

        {submitted ? (
          /* Thank You Screen */
          <div className="bg-white border border-[#D8E2F0] p-8 text-center space-y-4">
            <CheckCircle className="h-12 w-12 text-emerald-600 mx-auto" />
            <h2 className="text-lg font-serif italic text-[#142C54]">Placement Quote Request Logged!</h2>
            <div className="bg-slate-50 p-4 border border-slate-200 text-left space-y-2">
              <p className="text-xs text-gray-800">
                <strong>Tracking ID:</strong> <span className="font-mono bg-yellow-100 px-1 font-bold">{quoteId}</span>
              </p>
              <p className="text-xs text-gray-800">
                <strong>Insurance Product:</strong> {selectedProduct?.name}
              </p>
              <p className="text-xs text-gray-800">
                <strong>Digital Maturity Level:</strong> {selectedProduct?.quotationMethod}
              </p>
              <p className="text-xs text-gray-800">
                <strong>Adviser assignment status:</strong> Personal representative is reviewing coordinates to generate a comparative analysis.
              </p>
            </div>

            <p className="text-[11px] text-gray-550 leading-relaxed">
              We coordinate with leading IRA underwriters (Jubilee, ICEA LION, Heritage, CIC, Kenindia) to negotiate bulk rebate options and send comparative quote lists.
            </p>

            <div className="pt-2 flex justify-center space-x-3">
              <button 
                onClick={() => {
                  setSubmitted(false);
                  setSelectedProduct(null);
                  setQuizStep(1);
                  setAnswers({
                    customerType: "individual",
                    policyObjective: "new",
                    urgency: "immediate",
                    hasCurrentInsurance: "no",
                    completionPreference: "online",
                    additionalNotes: "",
                    uploadedDocumentName: ""
                  });
                }}
                className="bg-[#142C54] text-white px-5 py-2 text-xs font-bold uppercase tracking-wider"
              >
                Request Another Quote
              </button>
              <button 
                onClick={() => setActiveTab("portal")}
                className="border border-[#D8E2F0] text-[#142C54] px-5 py-2 text-xs font-bold uppercase tracking-wider"
              >
                Go to Customer Portal
              </button>
            </div>
          </div>
        ) : quizStep === 1 ? (
          /* STEP 1: Search and Selection */
          <div className="space-y-6">
            
            {/* Search Box with instant results dropdown */}
            <div className="bg-white border border-[#D8E2F0] p-6">
              <h3 className="text-xs uppercase font-bold text-[#142C54] tracking-widest mb-3">
                Which insurance product are you interested in?
              </h3>
              <div className="relative">
                <Search className="absolute left-3 top-3.5 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Type product name, asset, or risk e.g. private car, travel, medical..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-[#D8E2F0] text-xs text-[#142C54] placeholder-gray-400 focus:outline-none focus:border-[#316EC9] focus:bg-white"
                  id="universal-quote-product-search"
                />
              </div>

              {/* Search Dropdown Results */}
              {searchQuery.trim() !== "" && (
                <div className="mt-2 border border-[#D8E2F0] bg-white max-h-56 overflow-y-auto divide-y divide-gray-100 z-10 relative">
                  {filteredProducts.length > 0 ? (
                    filteredProducts.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => selectProductAction(p)}
                        className="w-full text-left px-4 py-2.5 text-xs text-[#142C54] hover:bg-[#316EC9]/10 transition-colors flex items-center justify-between"
                      >
                        <div className="flex items-center space-x-2">
                          <span className="text-md">{p.icon}</span>
                          <span className="font-mono font-bold">{p.name}</span>
                        </div>
                        <span className="text-[10px] text-gray-400 font-mono tracking-wider">{p.quotationMethod}</span>
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-3 text-xs text-gray-400">
                      No direct matches. Try searching "car", "medical", "home", "wiba", "shop", "tractor", "tender".
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Popular Products Fast Link Cards */}
            <div className="bg-white border border-[#D8E2F0] p-6">
              <h4 className="text-xs uppercase font-bold text-gray-500 tracking-wider mb-3">Popular Fast Launches</h4>
              <div className="grid grid-cols-2 gap-3">
                {popularProducts.map(p => (
                  <button
                    key={p.id}
                    onClick={() => selectProductAction(p)}
                    className="p-3 border border-gray-150 hover:border-[#142C54] text-left transition-all flex items-start space-x-2 bg-slate-50 rounded-none cursor-pointer"
                  >
                    <span className="text-xl mt-0.5">{p.icon}</span>
                    <div>
                      <span className="block text-xs font-bold text-[#142C54] font-mono leading-tight">{p.name}</span>
                      <span className="text-[10px] text-[#8C887D] line-clamp-1">{p.shortDesc}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Categories Selection blocks */}
            <div className="bg-white border border-[#D8E2F0] p-6 space-y-4">
              <h4 className="text-xs uppercase font-bold text-gray-500 tracking-wider">Browse Product Categories</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {PRODUCT_CATEGORIES.map(cat => (
                  <div key={cat.id} className="border border-slate-100 p-3">
                    <div className="flex items-center space-x-1.5 font-bold text-xs text-[#142C54] border-b border-gray-100 pb-1 mb-1.5 font-mono">
                      <span>{cat.icon}</span>
                      <span>{cat.name}</span>
                    </div>
                    {/* List products inside category */}
                    <div className="flex flex-wrap gap-1.5">
                      {products.filter(p => p.category === cat.id).slice(0, 3).map(p => (
                        <button
                          key={p.id}
                          onClick={() => selectProductAction(p)}
                          className="bg-[#142C54]/5 text-[#142C54] hover:bg-[#316EC9] hover:text-white text-[9px] px-2 py-1 transition-all rounded-none border border-slate-200"
                        >
                          {p.name}
                        </button>
                      ))}
                      <button
                        onClick={() => {
                          setActiveTab("insurance-products");
                        }}
                        className="text-[9px] text-[#316EC9] font-bold hover:underline py-1"
                      >
                        + more
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* I am not sure Button */}
            <div className="bg-teal-50 border border-teal-200 p-4 text-center">
              <p className="text-xs text-teal-900 font-bold mb-2">Feeling Unsure What Policy Fits Best?</p>
              <button 
                onClick={() => {
                  const defaultCustomProd = products.find(p => p.id === "private-motor-comprehensive") || products[0];
                  if (defaultCustomProd) {
                    setSelectedProduct(defaultCustomProd);
                    setAnswers({ ...answers, additionalNotes: "Client selected 'I am not sure what I need. Requesting global diagnostic advice.'" });
                    setQuizStep(2);
                  }
                }}
                className="bg-[#142C54] hover:bg-[#316EC9] text-white px-5 py-2 text-xs font-bold uppercase tracking-wider"
              >
                Run Diagnostic Adviser Placement
              </button>
            </div>

          </div>
        ) : (
          /* STEP 2: Onboarding Questionnaire (Section 7 and Section 8) */
          <form onSubmit={handleFinalSubmit} className="bg-white border border-[#D8E2F0] p-6 sm:p-8 space-y-6">
            
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-gray-400 font-mono">Selected Policy</span>
                <h3 className="text-md font-mono font-bold text-[#142C54] flex items-center gap-1.5">
                  <span className="text-xl">{selectedProduct?.icon}</span>
                  {selectedProduct?.name}
                </h3>
              </div>
              <span className="text-[9px] font-mono bg-blue-150 text-blue-800 px-2 py-1 border border-blue-200 uppercase font-bold">
                Level {selectedProduct?.quotationMethod === "Instant Indicative Quote" ? "1 Automated" : "2/3 Expert Desk"}
              </span>
            </div>

            {/* Q1: Customer type */}
            <div>
              <label className="block text-xs font-bold text-[#142C54] mb-2 uppercase tracking-wide">
                1. Are you applying as an individual, family, business or institution?
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: "individual", label: "Individual", icon: User },
                  { id: "family", label: "Family / Couples", icon: Users },
                  { id: "business", label: "Business SME / LLC", icon: Building },
                  { id: "institution", label: "Institution / NGO", icon: ShieldCheck }
                ].map(opt => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setAnswers({...answers, customerType: opt.id})}
                      className={`p-3 border text-center transition-all flex flex-col items-center justify-center space-y-1.5 cursor-pointer rounded-none ${
                        answers.customerType === opt.id 
                          ? "bg-[#142C54] text-white border-[#142C54]" 
                          : "bg-slate-50 border-gray-200 text-gray-700 hover:border-gray-400"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="text-[11px] font-bold font-mono uppercase tracking-wider">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Q2: Objective */}
            <div>
              <label className="block text-xs font-bold text-[#142C54] mb-2 uppercase tracking-wide">
                2. Is this a new policy, renewal or comparison?
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "new", label: "New Cover Initiation" },
                  { id: "renewal", label: "Policy Renewal" },
                  { id: "comparison", label: "Rate Comparison Report" }
                ].map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setAnswers({...answers, policyObjective: opt.id})}
                    className={`p-2.5 border text-center transition-all text-xs font-mono font-bold cursor-pointer rounded-none ${
                      answers.policyObjective === opt.id 
                        ? "bg-[#142C54] text-white border-[#142C54]" 
                        : "bg-slate-50 border-gray-200 text-gray-700 hover:border-gray-400"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Q3: Urgency */}
            <div>
              <label className="block text-xs font-bold text-[#142C54] mb-2 uppercase tracking-wide">
                3. When do you need cover?
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "immediate", label: "Immediately (under 24h)" },
                  { id: "this_month", label: "Within 30 Days" },
                  { id: "flexible", label: "Flexible/Exploring" }
                ].map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setAnswers({...answers, urgency: opt.id})}
                    className={`p-2.5 border text-center transition-all text-xs font-mono font-bold cursor-pointer rounded-none ${
                      answers.urgency === opt.id 
                        ? "bg-[#142C54] text-white border-[#142C54]" 
                        : "bg-slate-50 border-gray-200 text-gray-700 hover:border-gray-400"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Q4: Do you currently have insurance? */}
            <div>
              <label className="block text-xs font-bold text-[#142C54] mb-2 uppercase tracking-wide">
                4. Do you currently have insurance for this risk?
              </label>
              <div className="flex space-x-3">
                {[
                  { id: "yes", label: "Yes, active carrier coverage" },
                  { id: "no", label: "No, this is my first policy placement" }
                ].map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setAnswers({...answers, hasCurrentInsurance: opt.id})}
                    className={`px-4 py-2 border flex-1 text-center text-xs font-bold tracking-wider rounded-none ${
                      answers.hasCurrentInsurance === opt.id 
                        ? "bg-[#142C54] text-white border-[#142C54]" 
                        : "bg-slate-50 border-gray-200 text-gray-750 hover:border-gray-400"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Q5: Preference */}
            <div>
              <label className="block text-xs font-bold text-[#142C54] mb-2 uppercase tracking-wide">
                5. Would you like to complete the form online or speak to an adviser?
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setAnswers({...answers, completionPreference: "online"})}
                  className={`p-4 border text-left transition-all rounded-none cursor-pointer ${
                    answers.completionPreference === "online" 
                      ? "bg-[#142C54]/5 border-[#142C54] text-[#142C54]" 
                      : "bg-slate-50 border-gray-200 text-gray-600"
                  }`}
                >
                  <p className="text-xs font-bold uppercase font-mono tracking-wider">Fast Online Forms</p>
                  <p className="text-[10px] text-gray-550 mt-1">
                    {selectedProduct?.requiredForm === "motor-calc" || selectedProduct?.requiredForm === "med-calc" 
                      ? "Load instant indicative quotes engine."
                      : "Fill custom fields and receive comparative report lists on dashboard."}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setAnswers({...answers, completionPreference: "speak_adviser"})}
                  className={`p-4 border text-left transition-all rounded-none cursor-pointer ${
                    answers.completionPreference === "speak_adviser" 
                      ? "bg-[#142C54]/5 border-[#142C54] text-[#142C54]" 
                      : "bg-slate-50 border-gray-200 text-gray-600"
                  }`}
                >
                  <p className="text-xs font-bold uppercase font-mono tracking-wider">Speak to personal Advisor</p>
                  <p className="text-[10px] text-gray-550 mt-1">We schedule a WhatsApp callback or manual corporate briefing to finalize custom audits.</p>
                </button>
              </div>
            </div>

            {/* Document Upload for Level 2 or Level 3 (Section 8 rules) */}
            {selectedProduct && selectedProduct.requiredDocuments.length > 0 && (
              <div className="bg-slate-50 p-4 border border-slate-200 space-y-3">
                <h4 className="text-xs font-bold text-[#142C54] uppercase tracking-wider flex items-center">
                  <UploadCloud className="h-4 w-4 text-[#316EC9] mr-1.5 shrink-0" />
                  Upload Required Documents
                </h4>
                <p className="text-[10px] text-gray-550">
                  Please upload active documents matching carrier prerequisites: <strong className="text-[#142C54]">{selectedProduct.requiredDocuments.join(", ")}</strong>
                </p>
                <div 
                  className="border-2 border-dashed border-gray-300 bg-white p-4 text-center cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => {
                    const mockFileName = `DOC_PREP_${selectedProduct.id.toUpperCase()}_KES.pdf`;
                    setAnswers({ ...answers, uploadedDocumentName: mockFileName });
                  }}
                >
                  {answers.uploadedDocumentName ? (
                    <div className="flex items-center justify-center space-x-1.5 text-xs text-green-700 font-bold">
                      <CheckCircle className="h-4 w-4 shrink-0 text-green-600" />
                      <span>{answers.uploadedDocumentName} Attached Successfully!</span>
                    </div>
                  ) : (
                    <div>
                      <UploadCloud className="h-6 w-6 text-gray-400 mx-auto mb-1" />
                      <span className="text-xs text-[#316EC9] font-bold">Click to auto-simulate required uploads</span>
                      <p className="text-[9px] text-gray-400 mt-0.5">Drag-and-drop or manual click. Max size 20MB.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Comment details box */}
            <div>
              <label className="block text-xs font-mono font-bold text-[#142C54] mb-1.5 uppercase">
                Any specific requests or valuation coordinates? (Optional)
              </label>
              <textarea
                rows={2}
                placeholder="Include logbook data, sum insured expectations or preferred insurers..."
                value={answers.additionalNotes}
                onChange={(e) => setAnswers({...answers, additionalNotes: e.target.value})}
                className="w-full bg-slate-50 border border-[#D8E2F0] p-2.5 text-xs focus:outline-none focus:border-[#316EC9] focus:bg-white text-gray-800"
              ></textarea>
            </div>

            {/* Recommendations segment for related items (Section 12) */}
            {getRecs().length > 0 && (
              <div className="bg-amber-50/50 p-4 border border-amber-200">
                <p className="text-[10px] font-bold text-amber-900 uppercase tracking-wider mb-2">
                  💡 High-value Bundled Recommendations:
                </p>
                <div className="flex flex-wrap gap-2">
                  {getRecs().map(rec => (
                    <button
                      key={rec.id}
                      type="button"
                      onClick={() => {
                        setSelectedProduct(rec);
                        setAnswers({ ...answers, additionalNotes: `Applied for bundled ${rec.name} package alongside original request.` });
                      }}
                      className="bg-white hover:bg-[#142C54] hover:text-white border border-amber-300 text-amber-900 text-[10px] px-2.5 py-1 transition-colors font-mono font-medium"
                    >
                      + Add {rec.name}
                    </button>
                  ))}
                </div>
                <p className="text-[9px] text-amber-800 mt-1">Bundling saves up to 15% on premium quotas due to reduced administration overheads.</p>
              </div>
            )}

            {/* Execute Placements CTAs */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => { setSelectedProduct(null); setQuizStep(1); }}
                className="text-gray-550 hover:text-black font-bold uppercase tracking-wider text-xs"
              >
                Back To Search
              </button>

              <button
                type="submit"
                className="bg-[#142C54] hover:bg-[#316EC9] text-white px-6 py-3 text-xs uppercase tracking-widest font-bold transition-all flex items-center gap-1.5 rounded-none cursor-pointer"
              >
                <span>Compile Placement Quote</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>

          </form>
        )}

      </div>
    </div>
  );
}
