import React, { useState, useEffect } from "react";
import { Product, PRODUCT_CATEGORIES } from "../data/allProducts";
import { getStoredProducts } from "../data/productStore";
import { ArrowLeft, ChevronRight, CheckCircle2, ShieldCheck, PhoneCall, HelpCircle, AlertTriangle } from "lucide-react";

interface CategoryDetailsViewProps {
  categoryId: string;
  setActiveTab: (tab: any) => void;
  onSelectProduct: (productId: string) => void;
}

export default function CategoryDetailsView({ categoryId, setActiveTab, onSelectProduct }: CategoryDetailsViewProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const category = PRODUCT_CATEGORIES.find(c => c.id === categoryId);

  useEffect(() => {
    setProducts(getStoredProducts().filter(p => p.category === categoryId && p.status === "active"));
  }, [categoryId]);

  if (!category) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-20 text-center">
        <h3 className="text-xl font-bold text-red-950 font-serif">Category Not Found</h3>
        <p className="text-xs text-red-900 mt-2">The requested category cannot be resolved.</p>
        <button 
          onClick={() => setActiveTab("insurance-products")}
          className="mt-6 bg-[#142C54] text-white px-6 py-2.5 font-bold uppercase tracking-wider text-xs"
        >
          Browse All Products
        </button>
      </div>
    );
  }

  // Common risks by category
  const getCategoryRisks = (catId: string) => {
    switch (catId) {
      case "motor":
        return [
          "Traffic collisions along high-density national transport routes",
          "Windscreen shattering due to active construction road debris",
          "Theft or malicious vandalism of company utility vehicles"
        ];
      case "medical":
        return [
          "Escalating private hospital inpatient charges and ICU expenses",
          "Sudden emergency medical diagnostic bills or chronic treatments",
          "Workplace illnesses causing loss of team productivity"
        ];
      case "property":
        return [
          "Accidental building fires and electrical short-circuits",
          "Severe storms, flash flooding, and burst water pipeline damages",
          "Forcible burglaries or theft of key physical premises fixtures"
        ];
      case "business":
        return [
          "Employee fraud, embezzlement or signature forgery losses",
          "Direct burglary of retail warehouses, safes, or shop inventories",
          "Financial loss from money or cheques stolen during transit to bank"
        ];
      case "liability":
        return [
          "Accident claims or slips sustained by guests visiting your premises",
          "Professional negligence, omissions, or erroneous advisory lawsuits",
          "Regulatory penalties and shareholder claims against directors"
        ];
      case "construction-engineering":
        return [
          "Ongoing civil engineering structure collapses or piling failures",
          "Sudden mechanical breakdowns of boilers and factory assembly plants",
          "Heavy rainfall, drainage blocks, or floods destroying raw materials"
        ];
      case "marine-cargo":
        return [
          "Cargo damage or wet-damage from sea-water during global transits",
          "Truck crashes, overturns, and hijacking events on local highways",
          "Customs clearance delays or packing list transit damage claims"
        ];
      case "employee-benefits":
        return [
          "Statutory liability under the Work Injury Benefits Act (WIBA)",
          "On-job accidents causing partial/permanent team disability",
          "Unexpected death-in-service burden on deceased staff families"
        ];
      case "life-pension":
        return [
          "Inability of staff to sustain livelihood post active retirement",
          "Children failing to enroll in university due to loss of breadwinner",
          "Premature liquidation of life assets in times of family emergency"
        ];
      case "travel":
        return [
          "Emergency medical evacuations or hospitalization bills overseas",
          "Flight delays and missed connection cancellations",
          "Embassy visa rejections due to non-compliant travel coverage"
        ];
      case "agriculture":
        return [
          "Severe droughts or frost destroying harvest crop yields",
          "Livestock fatalities from highly infectious animal pandemics",
          "Capital loss of heavy farm tractor machinery and implements"
        ];
      case "bonds-guarantees":
        return [
          "Bidding disqualifications from parastatal procurement desks",
          "Forfeiture of tender security deposits due to project delays",
          "Misallocation of advanced mobilization capital to contractors"
        ];
      case "specialist":
        return [
          "Cyber extortion, ransomware freezes, or client data breaches",
          "Property damage from strikes, riots, or political instabililty",
          "Bad debt write-offs on invoices sold to credit customers"
        ];
      default:
        return [
          "Accidental high-value utility asset damage",
          "Unexpected and severe business operational disruptions",
          "Legal and defense litigation expenditures"
        ];
    }
  };

  return (
    <div className="bg-[#FAF9F6] font-sans" id={`category-landing-${category.id}`}>
      
      {/* Banner */}
      <div className="bg-[#142C54] text-white py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <button 
            onClick={() => setActiveTab("insurance-products")}
            className="text-xs uppercase tracking-widest text-[#FAF9F6]/85 hover:text-white mb-4 flex items-center font-bold"
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            <span>All Insurance Products</span>
          </button>
          
          <div className="flex items-center space-x-3">
            <span className="text-3xl sm:text-4xl bg-white/10 p-2 sm:p-3">{category.icon}</span>
            <div>
              <h1 className="text-2xl sm:text-4xl font-serif italic tracking-wide text-white">
                {category.name}
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl">
                {category.description}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Main List: Products Grid */}
          <div className="lg:col-span-8 space-y-6">
            <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-[#142C54] border-b border-[#D8E2F0] pb-2">
              Available {category.name} Solutions ({products.length})
            </h2>

            <div className="grid grid-cols-1 gap-4">
              {products.map((p) => (
                <div 
                  key={p.id}
                  onClick={() => onSelectProduct(p.id)}
                  className="group bg-white border border-[#D8E2F0] hover:border-[#142C54] p-5 transition-all cursor-pointer flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-lg">{p.icon}</span>
                      <h3 className="text-sm font-bold text-[#142C54] group-hover:text-[#316EC9] transition-colors font-mono">
                        {p.name}
                      </h3>
                      {p.featured && (
                        <span className="bg-amber-100 text-amber-800 text-[8px] px-1.5 py-0.5 font-bold uppercase">Featured</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-700 leading-relaxed max-w-xl">
                      {p.shortDesc}
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1.5">
                      <span className="text-[9px] font-mono bg-slate-50 text-slate-600 px-2 py-0.5 border border-slate-200">
                        Method: {p.quotationMethod}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1 text-[#316EC9] text-xs font-bold uppercase tracking-wider shrink-0">
                    <span>View Cover</span>
                    <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              ))}
            </div>

            {/* Common Risks Managed Under Category */}
            <div className="bg-white border border-[#D8E2F0] p-6">
              <h3 className="text-xs uppercase font-bold text-[#142C54] tracking-widest mb-3 flex items-center">
                <AlertTriangle className="h-4 w-4 text-amber-600 mr-1.5" />
                Critical Risks Managed
              </h3>
              <ul className="space-y-2 text-xs text-gray-700">
                {getCategoryRisks(category.id).map((risk, index) => (
                  <li key={index} className="flex items-start">
                    <span className="text-[#316EC9] font-bold mr-2">•</span>
                    <span>{risk}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* RIGHT SIDEBAR: Category FAQs & General Advisory CTAs */}
          <div className="lg:col-span-4 space-y-6">
            
            <div className="bg-white border border-[#D8E2F0] p-5">
              <h4 className="text-xs uppercase font-bold text-[#142C54] tracking-widest mb-3 pr-2 flex items-center">
                <ShieldCheck className="h-4.5 w-4.5 text-[#316EC9] mr-1.5" />
                Utmost Advantage
              </h4>
              <p className="text-[11px] text-gray-700 leading-relaxed">
                As your licensed broker, we stand with you rather than the insurance company. We perform yearly auditing matrices to secure custom discounts up to 25% on combined assets, while guaranteeing priority Claims Rescue operations.
              </p>
            </div>

            <div className="bg-white border border-[#D8E2F0] p-5">
              <h4 className="text-xs uppercase font-bold text-[#142C54] tracking-widest mb-3 flex items-center">
                <HelpCircle className="h-4.5 w-4.5 text-[#316EC9] mr-1.5" />
                Category FAQ
              </h4>
              <div className="space-y-3 text-xs leading-relaxed">
                <div>
                  <h5 className="font-bold text-[#142C54]">How do I submit claims?</h5>
                  <p className="text-[10px] text-gray-650 mt-0.5">Simply log onto our Claims Centre portal anytime. We manage carrier payouts with a 3-day turnaround SLAs.</p>
                </div>
                <div className="pt-2 border-t border-gray-100">
                  <h5 className="font-bold text-[#142C54]">Can I bundle covers?</h5>
                  <p className="text-[10px] text-gray-650 mt-0.5">Yes, combining property, WIBA and liability policies secures a standard 15% bundled pricing rebate.</p>
                </div>
              </div>
            </div>

            <div className="bg-[#142C54] text-[#FAF9F6] p-5 text-center">
              <h4 className="text-xs uppercase font-mono tracking-widest font-bold">Advisory Hotline</h4>
              <p className="text-[10px] text-slate-300 mt-1 mb-4">Discuss your distinct industry risk exposure with our corporate underwriting principal.</p>
              <a 
                href="https://wa.me/254707798701"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full justify-center bg-white text-[#142C54] py-2 px-4 text-xs tracking-widest font-bold transition-all uppercase flex items-center gap-1.5"
              >
                <PhoneCall className="h-3.5 w-3.5 text-green-600" />
                <span>Call Dispatch Desk</span>
              </a>
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
