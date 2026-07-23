import React, { useState, useEffect } from "react";
import { Product, PRODUCT_CATEGORIES } from "../data/allProducts";
import { getStoredProducts } from "../data/productStore";
import { 
  Building, UserCheck, ShieldCheck, AlertCircle, FileText, Sparkles, 
  HelpCircle, ChevronRight, PhoneCall, ArrowLeft, Send, CheckSquare, 
  Users, CheckCircle, CreditCard, ExternalLink, RefreshCw,
  Heart, Home, Briefcase, Wrench, Truck, Car, Plane, Globe, Leaf, Scale
} from "lucide-react";

interface ProductDetailsViewProps {
  productId: string;
  setActiveTab: (tab: any) => void;
  setSelectedProductId?: (id: string | null) => void;
  onSelectProduct?: (productId: string) => void;
}

export default function ProductDetailsView({ productId, setActiveTab, setSelectedProductId, onSelectProduct }: ProductDetailsViewProps) {
  const [product, setProduct] = useState<Product | null>(null);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [quoteRequestSubmitted, setQuoteRequestSubmitted] = useState(false);
  
  // Custom interactive mock form on detail page
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    notes: "",
    newsletter: true
  });

  useEffect(() => {
    const list = getStoredProducts();
    setAllProducts(list);
    const found = list.find(p => p.id === productId);
    if (found) {
      setProduct(found);
    }
  }, [productId]);

  if (!product) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-20 text-center">
        <h3 className="text-xl font-bold text-red-950 font-serif">Product Not Found</h3>
        <p className="text-xs text-red-900 mt-2">The requested insurance policy cannot be resolved.</p>
        <button 
          onClick={() => setActiveTab("insurance-products")}
          className="mt-6 bg-[#142C54] text-white px-6 py-2.5 font-bold uppercase tracking-wider text-xs"
        >
          Browse All Products
        </button>
      </div>
    );
  }

  const categoryInfo = PRODUCT_CATEGORIES.find(c => c.id === product.category);

  // Filter valid related products
  const relatedList = allProducts.filter(p => product.relatedProducts?.includes(p.id) && p.id !== product.id);

  // helper to get aligned target customer groups based on risk class / category
  const getAlignedCustomerTypes = () => {
    const category = (product.category || "").toLowerCase();
    const list: { icon: React.ReactNode; label: string }[] = [];

    // Add standard customer types with correct capitalization
    product.availableCustomerTypes.forEach((type) => {
      let typeLabel = "";
      let icon = <UserCheck className="h-4 w-4 shrink-0 text-[#316EC9]" />;
      if (type === "individual") {
        typeLabel = "Individual Policyholders";
        icon = <UserCheck className="h-4 w-4 shrink-0 text-[#316EC9]" />;
      } else if (type === "family") {
        typeLabel = "Families & Couples Cover";
        icon = <Users className="h-4 w-4 shrink-0 text-[#316EC9]" />;
      } else if (type === "business") {
        typeLabel = "Registered SMEs & Corporates";
        icon = <Building className="h-4 w-4 shrink-0 text-[#316EC9]" />;
      } else if (type === "institution") {
        typeLabel = "Public & Private Institutions";
        icon = <Building className="h-4 w-4 shrink-0 text-[#316EC9]" />;
      } else {
        typeLabel = `${type.charAt(0).toUpperCase() + type.slice(1)} Policies`;
      }
      list.push({ icon, label: typeLabel });
    });

    // Add risk-aligned customized indicators based on category/id (eliminating the generic hardcode!)
    if (category === "medical") {
      if (product.id.includes("senior") || product.name.toLowerCase().includes("senior")) {
        list.push({ icon: <Heart className="h-4 w-4 shrink-0 text-[#316EC9]" />, label: "Senior Citizens & Retirees (Age 60+)" });
        list.push({ icon: <ShieldCheck className="h-4 w-4 shrink-0 text-[#316EC9]" />, label: "Pre-existing Health Management" });
      } else if (product.availableCustomerTypes.includes("family")) {
        list.push({ icon: <Home className="h-4 w-4 shrink-0 text-[#316EC9]" />, label: "Nuclear & Extended Family Hubs" });
        list.push({ icon: <Heart className="h-4 w-4 shrink-0 text-[#316EC9]" />, label: "Maternity & Pediatric Care Planners" });
      } else {
        list.push({ icon: <ShieldCheck className="h-4 w-4 shrink-0 text-[#316EC9]" />, label: "Self-Employed Professionals & Individuals" });
        list.push({ icon: <Heart className="h-4 w-4 shrink-0 text-[#316EC9]" />, label: "Wellness & Annual Checkup Seekers" });
      }
    } else if (category === "motor") {
      if (product.id.includes("commercial") || product.name.toLowerCase().includes("commercial") || product.name.toLowerCase().includes("fleet")) {
        list.push({ icon: <Truck className="h-4 w-4 shrink-0 text-[#316EC9]" />, label: "Logistics, Haulage & Ride-Hailing Fleets" });
        list.push({ icon: <Building className="h-4 w-4 shrink-0 text-[#316EC9]" />, label: "Corporate Supply Chain Managers" });
      } else if (product.id.includes("motorcycle") || product.name.toLowerCase().includes("motorcycle")) {
        list.push({ icon: <Users className="h-4 w-4 shrink-0 text-[#316EC9]" />, label: "Boda-Boda Operators & Delivery Riders" });
      } else {
        list.push({ icon: <Car className="h-4 w-4 shrink-0 text-[#316EC9]" />, label: "Private Auto Owners & Commuters" });
        list.push({ icon: <ShieldCheck className="h-4 w-4 shrink-0 text-[#316EC9]" />, label: "Zero-Deductible Excess Waiver Seekers" });
      }
    } else if (category === "property" || product.id.includes("home") || product.id.includes("domestic")) {
      list.push({ icon: <Home className="h-4 w-4 shrink-0 text-[#316EC9]" />, label: "Homeowners, Landlords & Tenants" });
      list.push({ icon: <ShieldCheck className="h-4 w-4 shrink-0 text-[#316EC9]" />, label: "Valuable Domestic Asset Owners" });
    } else if (category === "travel") {
      list.push({ icon: <Plane className="h-4 w-4 shrink-0 text-[#316EC9]" />, label: "Schengen & Worldwide Visa Seekers" });
      list.push({ icon: <Globe className="h-4 w-4 shrink-0 text-[#316EC9]" />, label: "Frequent Business Travelers & Students" });
    } else if (category === "life-pension" || category === "life") {
      list.push({ icon: <Users className="h-4 w-4 shrink-0 text-[#316EC9]" />, label: "Retirement & Long-term Scheme Planners" });
      list.push({ icon: <ShieldCheck className="h-4 w-4 shrink-0 text-[#316EC9]" />, label: "Family Financial Dependents Shield" });
    } else if (category === "agriculture") {
      list.push({ icon: <Leaf className="h-4 w-4 shrink-0 text-[#316EC9]" />, label: "Agribusinesses, Tea, & Coffee Co-ops" });
      list.push({ icon: <ShieldCheck className="h-4 w-4 shrink-0 text-[#316EC9]" />, label: "Weather Index & Livestock Breeders" });
    } else if (category === "liability") {
      list.push({ icon: <Briefcase className="h-4 w-4 shrink-0 text-[#316EC9]" />, label: "Certified Professional Practitioners" });
      list.push({ icon: <Scale className="h-4 w-4 shrink-0 text-[#316EC9]" />, label: "Corporate Board Directors & Managers" });
    } else if (category === "construction-engineering") {
      list.push({ icon: <Wrench className="h-4 w-4 shrink-0 text-[#316EC9]" />, label: "Contractors, Civil Engineers & Builders" });
      list.push({ icon: <Building className="h-4 w-4 shrink-0 text-[#316EC9]" />, label: "Infrastructure Project Developers" });
    } else if (category === "marine-cargo" || category === "marine") {
      list.push({ icon: <Truck className="h-4 w-4 shrink-0 text-[#316EC9]" />, label: "Active Sea & Air Freight Cargo Shippers" });
      list.push({ icon: <Building className="h-4 w-4 shrink-0 text-[#316EC9]" />, label: "Clearing & Forwarding Agencies" });
    } else if (category === "bonds-guarantees" || category === "bonds") {
      list.push({ icon: <Briefcase className="h-4 w-4 shrink-0 text-[#316EC9]" />, label: "Government Tender Bidders & Contractors" });
      list.push({ icon: <Building className="h-4 w-4 shrink-0 text-[#316EC9]" />, label: "Kenyan Sacco & Corporate Borrowers" });
    } else if (category === "employee-benefits") {
      list.push({ icon: <Users className="h-4 w-4 shrink-0 text-[#316EC9]" />, label: "Human Resources & Welfare Directors" });
      list.push({ icon: <Building className="h-4 w-4 shrink-0 text-[#316EC9]" />, label: "WIBA-compliant Commercial Employers" });
    } else if (category === "business") {
      list.push({ icon: <Building className="h-4 w-4 shrink-0 text-[#316EC9]" />, label: "SME Owners & Retail Shopfronts" });
      list.push({ icon: <Briefcase className="h-4 w-4 shrink-0 text-[#316EC9]" />, label: "Registered Sole Proprietors & Corporates" });
    } else if (category === "specialist") {
      list.push({ icon: <Sparkles className="h-4 w-4 shrink-0 text-[#316EC9]" />, label: "E-Commerce Providers & Tech Firms" });
      list.push({ icon: <ShieldCheck className="h-4 w-4 shrink-0 text-[#316EC9]" />, label: "Special Risk & High-Value Asset Holders" });
    } else {
      // Fallback for business segments
      if (product.availableCustomerTypes.includes("business")) {
        list.push({ icon: <Building className="h-4 w-4 shrink-0 text-[#316EC9]" />, label: "SME Owners, Partnerships & Corporates" });
      } else {
        list.push({ icon: <ShieldCheck className="h-4 w-4 shrink-0 text-[#316EC9]" />, label: "Insurable Interest Policyholders" });
      }
    }

    return list;
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.phone) {
      alert("Please fill in your name, email and phone number to request a quote.");
      return;
    }
    setQuoteRequestSubmitted(true);
    
    // Save to user saved quotes/requests in localStorage to support client portfolio tracking
    try {
      const existingReqsRaw = localStorage.getItem("utmost_user_quotes_requests");
      const existingReqs = existingReqsRaw ? JSON.parse(existingReqsRaw) : [];
      const newRequest = {
        id: `REQ-${Math.floor(100000 + Math.random() * 900000)}`,
        productName: product.name,
        productId: product.id,
        date: new Date().toLocaleDateString("en-KE") + " " + new Date().toLocaleTimeString("en-KE", { hour: '2-digit', minute: '2-digit' }),
        status: "Pending Specialist Assignment",
        clientDetail: formData,
        quotationMethod: product.quotationMethod
      };
      localStorage.setItem("utmost_user_quotes_requests", JSON.stringify([newRequest, ...existingReqs]));
    } catch (e) {
      console.error(e);
    }
  };

  const handleQuoteActionClick = () => {
    // If fully digital products, route directly to specific calculators
    if (product.requiredForm === "motor-calc") {
      setActiveTab("motor-quotes");
    } else if (product.requiredForm === "med-calc") {
      setActiveTab("medical-quotes");
    } else {
      // Otherwise scroll smoothly to the quick placement audit request form at the bottom
      const formEl = document.getElementById("product-specific-form-anchor");
      if (formEl) {
        formEl.scrollIntoView({ behavior: "smooth" });
      }
    }
  };

  return (
    <div className="bg-[#FAF9F6] font-sans" id={`product-details-${product.id}`}>
      
      {/* Mini Breadcrumb Banner */}
      <div className="bg-[#142C54]/5 border-b border-[#D8E2F0] py-4">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex items-center justify-between text-xs text-[#8C887D]">
          <div className="flex items-center space-x-2">
            <button 
              onClick={() => {
                if (setSelectedProductId) {
                  setSelectedProductId(null);
                } else {
                  setActiveTab("insurance-products");
                }
              }}
              className="hover:text-[#142C54] flex items-center font-bold"
            >
              <ArrowLeft className="h-3 w-3 mr-1" />
              <span>Back</span>
            </button>
            <span>/</span>
            <button onClick={() => setActiveTab("insurance-products")} className="hover:text-[#142C54]">
              Insurance Products
            </button>
            <span>/</span>
            <span className="text-[#142C54] font-mono">{product.name}</span>
          </div>

          <span className="hidden md:inline font-bold tracking-widest text-emerald-800 uppercase bg-emerald-50 px-2 py-0.5">
            Licence IRA/06/334/2026
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        
        {/* Main Grid: Hero Description + Sidebar CTAs */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* LEFT: Broad Product Information (suitability, covers, exclusions, steps) */}
          <div className="lg:col-span-8 space-y-8">
            
            {/* Header info card */}
            <div className="bg-white border border-[#D8E2F0] p-6 sm:p-8">
              <div className="flex items-center space-x-2 text-xs font-bold text-[#316EC9] uppercase tracking-wider mb-2">
                <span>{categoryInfo?.name || product.category}</span>
                <span>•</span>
                <span>{product.quotationMethod}</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-serif italic text-[#142C54] tracking-tight mb-4 flex items-center gap-2">
                <span className="text-3xl sm:text-4xl">{product.icon}</span>
                {product.name}
              </h1>

              <p className="text-sm font-medium text-[#142C54] leading-relaxed mb-4">
                {product.shortDesc}
              </p>
              
              <div className="prose text-xs text-gray-700 leading-relaxed max-w-none text-justify border-t border-gray-100 pt-4">
                {product.fullDesc}
              </div>

              {/* Dynamic CTA at top depending on method */}
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  onClick={handleQuoteActionClick}
                  className="bg-[#142C54] text-white hover:bg-[#316EC9] px-6 py-3 text-xs uppercase tracking-widest font-bold transition-all text-center rounded-none cursor-pointer"
                >
                  {product.requiredForm === "motor-calc" ? "Get Motor Quote" :
                   product.requiredForm === "med-calc" ? "Compare Medical Plans" :
                   "Request " + product.name + " Quote"}
                </button>

                <a 
                  href={`https://wa.me/254707798701?text=Hi%20Utmost,%20I%20am%20interested%20in%20${encodeURIComponent(product.name)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border border-[#D8E2F0] text-[#142C54] hover:bg-white hover:border-[#142C54] px-5 py-3 text-xs uppercase tracking-widest font-bold transition-all flex items-center gap-1.5 rounded-none"
                >
                  <PhoneCall className="h-3.5 w-3.5 text-green-600" />
                  <span>WhatsApp Specialist</span>
                </a>
              </div>
            </div>

            {/* Suitability & Target Customers */}
            <div className="bg-white border border-[#D8E2F0] p-6">
              <h3 className="text-sm font-bold uppercase text-[#142C54] tracking-widest mb-3 border-l-2 border-[#142C54] pl-2">
                Who Is This Suitable For?
              </h3>
              <p className="text-xs text-gray-700 leading-relaxed mb-4">
                This insurance coverage is specially modeled and underwriters-calibrated for the following customer brackets:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {getAlignedCustomerTypes().map((item, idx) => (
                  <div key={idx} className="flex items-center space-x-2.5 bg-slate-50 p-2.5">
                    {item.icon}
                    <span className="text-xs font-bold text-[#142C54]">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Main Covers & Benefits */}
            <div className="bg-white border border-[#D8E2F0] p-6">
              <h3 className="text-sm font-bold uppercase text-[#142C54] tracking-widest mb-3 border-l-2 border-emerald-600 pl-2">
                Main Policy Covers & Optional Benefits
              </h3>
              <p className="text-xs text-gray-700 leading-relaxed mb-4">
                Underwritten by A+ IRA approved carriers, this policy encompasses highly structured default safeguards:
              </p>
              <ul className="space-y-2 text-xs text-gray-700">
                <li className="flex items-start">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0 mr-2 mt-0.5" />
                  <span><strong>Accidental Loss or Harm:</strong> Protection against sudden environmental physical crashes, water damage, or collapse.</span>
                </li>
                <li className="flex items-start">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0 mr-2 mt-0.5" />
                  <span><strong>Third Party Civil Shield:</strong> Covering legal claims arising out of third party property damages up to statutory standards KES 3,000,000.</span>
                </li>
                <li className="flex items-start">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0 mr-2 mt-0.5" />
                  <span><strong>Custom Add-on Extensions:</strong> Options for excessive claims waivers, natural perils extensions, and active regional COMESA cards.</span>
                </li>
              </ul>
            </div>

            {/* Common Exclusions */}
            <div className="bg-white border border-[#D8E2F0] p-6">
              <h3 className="text-sm font-bold uppercase text-[#142C54] tracking-widest mb-3 border-l-2 border-red-600 pl-2">
                Common Exclusions
              </h3>
              <p className="text-xs text-gray-700 leading-relaxed mb-2">
                Please note that standard policies do not cover damages resulting from:
              </p>
              <ul className="space-y-1.5 text-xs text-gray-750 list-disc list-inside">
                <li>Pre-existing physical damage prior to initial payment receipting</li>
                <li>Willful, fraudulent, or gross negligence operation of assets</li>
                <li>Active nuclear, chemical, political war or unapproved civil uprising risk structures</li>
                <li>Commercial wear-and-tear or gradual depreciation processes under standard terms</li>
              </ul>
            </div>

            {/* Typical quotation & Claims processes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white border border-[#D8E2F0] p-6">
              <div>
                <h4 className="text-xs uppercase font-bold text-[#142C54] tracking-wider mb-2 flex items-center">
                  <Sparkles className="h-4 w-4 text-[#316EC9] mr-1.5" />
                  Quotation Journey
                </h4>
                <ol className="text-xs text-gray-700 space-y-1.5 list-decimal list-inside leading-relaxed">
                  <li>Complete the placement questionnaire details.</li>
                  <li>Insurers generate indicative comparative options.</li>
                  <li>Specialist confirms custom risk rebates.</li>
                  <li>Policy placement and active certificate issued.</li>
                </ol>
              </div>

              <div>
                <h4 className="text-xs uppercase font-bold text-[#142C54] tracking-wider mb-2 flex items-center">
                  <AlertCircle className="h-4 w-4 text-red-600 mr-1.5" />
                  Typical Claims Process
                </h4>
                <ol className="text-xs text-gray-700 space-y-1.5 list-decimal list-inside leading-relaxed">
                  <li>Keep assets undisturbed and secure immediate pictures.</li>
                  <li>Register the claim on our 24H Claims Centre.</li>
                  <li>Utmost Claims specialists negotiate repairs approval in under 3 days.</li>
                </ol>
              </div>
            </div>

            {/* Frequently Asked Questions */}
            <div className="bg-white border border-[#D8E2F0] p-6">
              <h3 className="text-sm font-bold uppercase text-[#142C54] tracking-widest mb-3 flex items-center">
                <HelpCircle className="h-4.5 w-4.5 text-[#316EC9] mr-1.5" />
                Frequently Asked Questions
              </h3>
              <div className="space-y-3">
                <div>
                  <h4 className="text-xs font-bold text-[#142C54]">Q: Is the premium quoted final?</h4>
                  <p className="text-[11px] text-gray-700 mt-1">A: Premium quotes generated are indicative based on standard underwriting. Final prices are locked immediately after underwriters evaluate active logbooks or risk profiles.</p>
                </div>
                <div className="pt-2 border-t border-gray-100">
                  <h4 className="text-xs font-bold text-[#142C54]">Q: How fast does the cover bind?</h4>
                  <p className="text-[11px] text-gray-700 mt-1">A: Insurance coverage binds immediately upon formal MPESA/Bank transfer receipting and confirmation under our central broker ERP desk.</p>
                </div>
              </div>
            </div>

          </div>

          {/* RIGHT SIDEBAR: Requirements checklist, available insurers & custom request box */}
          <div className="lg:col-span-4 space-y-6">

            {/* Digital Maturity Indicator */}
            <div className={`p-4 border ${
              product.quotationMethod === "Instant Indicative Quote" 
                ? "bg-green-50 border-green-200" 
                : product.quotationMethod === "Guided Online Quote"
                ? "bg-blue-50 border-blue-200"
                : "bg-amber-50 border-amber-200"
            }`}>
              <span className="text-[9px] uppercase font-bold tracking-wider block text-gray-600">
                Digital Maturity Level
              </span>
              <h4 className="text-xs font-mono font-bold text-gray-900 mt-0.5">
                {product.quotationMethod}
              </h4>
              <p className="text-[10px] text-gray-750 mt-1">
                {product.quotationMethod === "Instant Indicative Quote" ? "Premium calculations and comparisons are processed immediately in under 30 seconds." :
                 product.quotationMethod === "Guided Online Quote" ? "Complete a quick form to trigger pre-negotiated comparing lists from top insurers." :
                 "Highly customized corporate risk profile requiring expert specialist audit to lock optimal rates."}
              </p>
            </div>
            
            {/* Approved Insurers Panel */}
            <div className="bg-white border border-[#D8E2F0] p-5">
              <h4 className="text-xs uppercase font-bold text-[#142C54] tracking-wider mb-3">
                A+ Partner Underwriters
              </h4>
              <div className="flex flex-wrap gap-2">
                {product.availableInsurers?.map((ins, idx) => (
                  <span key={idx} className="bg-[#142C54]/5 text-[#142C54] text-[10px] font-mono px-2 py-1 border border-[#D8E2F0]">
                    🛡️ {ins}
                  </span>
                )) || <p className="text-[10px] text-gray-550">Jubilee, ICEA LION, Heritage, CIC</p>}
              </div>
              <p className="text-[9px] text-[#8C887D] mt-3">
                Utmost maintains direct API linkages with verified, IRA-registered, capital-adequacy-compliant underwriters.
              </p>
            </div>

            {/* Documents Required Checklist */}
            <div className="bg-white border border-[#D8E2F0] p-5">
              <h4 className="text-xs uppercase font-bold text-[#142C54] tracking-wider mb-2 flex items-center">
                <FileText className="h-4 w-4 text-[#316EC9] mr-1.5" />
                Required Declarations
              </h4>
              <ul className="space-y-1.5 text-xs text-gray-700">
                {product.requiredDocuments?.map((doc, idx) => (
                  <li key={idx} className="flex items-center space-x-1.5 bg-slate-50 p-1.5 border border-dashed border-gray-200">
                    <CheckSquare className="h-3.5 w-3.5 text-[#316EC9] shrink-0" />
                    <span>{doc}</span>
                  </li>
                )) || (
                  <li className="flex items-center space-x-1.5 bg-slate-50 p-1.5">
                    <CheckSquare className="h-3.5 w-3.5 text-[#316EC9] shrink-0" />
                    <span>Executive Company Schedule</span>
                  </li>
                )}
              </ul>
            </div>

            {/* Specalist Underwriter Contact Card */}
            <div className="bg-white border border-[#D8E2F0] p-5">
              <span className="text-[9px] uppercase font-bold text-slate-450 block">Assigned Risk Manager</span>
              <h4 className="text-xs font-mono font-bold text-[#142C54] mt-0.5">{product.adviserSpecialisation}</h4>
              <p className="text-[10px] text-slate-500 mt-1">Registered desk advisor handling public/corporate risk placements.</p>
              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                <span className="text-[11px] font-mono font-bold text-gray-800">Support Desk 24H:</span>
                <span className="text-[11px] font-mono font-bold text-[#316EC9]">+254 707 798701</span>
              </div>
            </div>

            {/* Product-Specific Structured Request Box */}
            <div className="bg-stone-900 text-white p-5 rounded-none" id="product-specific-form-anchor">
              <h4 className="text-xs uppercase font-bold tracking-widest text-[#FAF9F6]">
                Secure Quick Quote Request
              </h4>
              <p className="text-[10px] text-slate-300 mt-1 mb-4 leading-relaxed">
                Receive indicative options compiled from up to 5 Kenyan carriers.
              </p>

              {quoteRequestSubmitted ? (
                <div className="bg-[#FAF9F6]/10 p-4 text-center border border-[#316EC9]">
                  <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  <p className="text-xs font-bold text-[#FAF9F6]">Proposal Submitted!</p>
                  <p className="text-[10px] text-slate-350 mt-1">An adviser has been assigned to coordinate with underwriters. Your Quote Request ID is logged.</p>
                  <button 
                    onClick={() => {
                      setQuoteRequestSubmitted(false);
                      setFormData({ name: "", email: "", phone: "", company: "", notes: "", newsletter: true });
                    }}
                    className="mt-3 text-white border border-white hover:bg-white hover:text-black py-1 px-3 text-[10px]"
                  >
                    Send Another Callout
                  </button>
                </div>
              ) : (
                <form onSubmit={handleFormSubmit} className="space-y-3">
                  <div>
                    <label className="block text-[9px] uppercase tracking-wider text-slate-300 mb-1">Your Full Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Raymond Mwangi"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full bg-stone-800 border border-stone-700 p-2 text-xs text-white placeholder-stone-500 focus:outline-none focus:border-[#316EC9]"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[9px] uppercase tracking-wider text-slate-300 mb-1">Email Coordinates *</label>
                      <input
                        type="email"
                        required
                        placeholder="client@mail.com"
                        value={formData.email}
                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                        className="w-full bg-stone-800 border border-stone-700 p-2 text-xs text-white placeholder-stone-500 focus:outline-none focus:border-[#316EC9]"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] uppercase tracking-wider text-slate-300 mb-1">Phone Number *</label>
                      <input
                        type="tel"
                        required
                        placeholder="07XX XXX XXX"
                        value={formData.phone}
                        onChange={(e) => setFormData({...formData, phone: e.target.value})}
                        className="w-full bg-stone-800 border border-stone-700 p-2 text-xs text-white placeholder-stone-500 focus:outline-none focus:border-[#316EC9]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[9px] uppercase tracking-wider text-slate-300 mb-1">Corporate/Business (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Utmost Logistics Ltd"
                      value={formData.company}
                      onChange={(e) => setFormData({...formData, company: e.target.value})}
                      className="w-full bg-stone-800 border border-stone-700 p-2 text-xs text-white placeholder-stone-500 focus:outline-none focus:border-[#316EC9]"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] uppercase tracking-wider text-slate-300 mb-1">Coverage Parameters / Logbook No. (Optional)</label>
                    <textarea
                      placeholder="Specify asset details, values, or historical claims..."
                      rows={2}
                      value={formData.notes}
                      onChange={(e) => setFormData({...formData, notes: e.target.value})}
                      className="w-full bg-stone-800 border border-stone-700 p-2 text-xs text-white placeholder-stone-500 focus:outline-none focus:border-[#316EC9]"
                    ></textarea>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-[#142C54] hover:bg-[#316EC9] text-[#FAF9F6] py-2 text-xs uppercase tracking-widest font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer border border-[#316EC9]"
                  >
                    <Send className="h-3 w-3" />
                    <span>Submit Broker Request</span>
                  </button>
                </form>
              )}
            </div>

          </div>

        </div>

        {/* RELATED / CROSS-SELLING PRODUCTS RECOMMENDATIONS PANEL */}
        {relatedList.length > 0 && (
          <div className="mt-12 pt-8 border-t border-[#D8E2F0]">
            <h3 className="text-sm font-bold uppercase tracking-widest text-[#142C54] mb-6">
              Recommended Complementary Policies
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {relatedList.slice(0, 3).map(prod => (
                <div 
                  key={prod.id}
                  onClick={() => {
                    if (onSelectProduct) {
                      onSelectProduct(prod.id);
                    } else {
                      setActiveTab("product-details");
                    }
                  }}
                  className="bg-white border border-[#D8E2F0] hover:border-[#142C54] p-4 cursor-pointer transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center space-x-2 text-[10px] text-gray-500 uppercase tracking-widest mb-1.5 font-mono">
                      <span>{prod.category}</span>
                      <span>•</span>
                      <span>Rebate Eligible</span>
                    </div>
                    <h4 className="text-xs font-bold text-[#142C54] font-mono mb-1">{prod.name}</h4>
                    <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">{prod.shortDesc}</p>
                  </div>
                  <div className="mt-4 pt-2 border-t border-gray-100 flex items-center justify-between text-[10px] text-[#316EC9] font-bold">
                    <span>Explore Complementary</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
