import React, { useState, useEffect } from "react";
import { Product, PRODUCT_CATEGORIES } from "../data/allProducts";
import { getStoredProducts } from "../data/productStore";
import { Search, ChevronRight, CheckSquare, Sparkles, Filter, ShieldAlert } from "lucide-react";

interface InsuranceProductsViewProps {
  setActiveTab: (tab: any) => void;
  onSelectCategory: (catId: string) => void;
  onSelectProduct: (prodId: string) => void;
  initialSearchQuery?: string;
  initialSegment?: "general" | "health" | "life" | "all";
}

export default function InsuranceProductsView({ 
  setActiveTab, 
  onSelectCategory, 
  onSelectProduct, 
  initialSearchQuery = "",
  initialSegment = "all"
}: InsuranceProductsViewProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [activeSegment, setActiveSegment] = useState<"general" | "health" | "life" | "all">(initialSegment);

  useEffect(() => {
    setProducts(getStoredProducts().filter(p => p.status === "active"));
  }, []);

  useEffect(() => {
    if (initialSegment) {
      setActiveSegment(initialSegment);
    }
  }, [initialSegment]);

  const isCategoryInSegment = (catId: string, segment: "general" | "health" | "life" | "all") => {
    if (segment === "all") return true;
    if (segment === "health") return catId === "medical";
    if (segment === "life") return catId === "life-pension" || catId === "employee-benefits";
    // general
    return catId !== "medical" && catId !== "life-pension" && catId !== "employee-benefits";
  };

  const filteredCategories = PRODUCT_CATEGORIES.filter(cat => isCategoryInSegment(cat.id, activeSegment));

  // Reset filter category if it is no longer within the selected segment
  useEffect(() => {
    if (activeSegment !== "all" && filterCategory !== "all") {
      const isCurrentInSegment = isCategoryInSegment(filterCategory, activeSegment);
      if (!isCurrentInSegment) {
        setFilterCategory("all");
      }
    }
  }, [activeSegment, filterCategory]);

  // Section 11 Search Bindings rules (shop, truck, consultant, construction, tender, employees)
  const mapSynonymsToTerm = (query: string) => {
    const q = query.toLowerCase().trim();
    if (q.includes("shop")) return ["sme-business-combined", "fire-perils", "burglary"];
    if (q.includes("truck")) return ["commercial-motor-own-goods", "commercial-general-cartage", "goods-in-transit"];
    if (q.includes("consultant") || q.includes("advisor") || q.includes("doctor") || q.includes("lawyer")) return ["professional-indemnity", "cyber-insurance"];
    if (q.includes("construction") || q.includes("contractor") || q.includes("engineering")) return ["bid-bond", "performance-bond", "professional-indemnity"];
    if (q.includes("tender") || q.includes("bid")) return ["bid-bond", "performance-bond", "professional-indemnity"];
    if (q.includes("employee") || q.includes("staff") || q.includes("workers")) return ["work-injury-benefits", "group-medical-schemes", "individual-medical"];
    return [q];
  };

  // Perform filtering
  const filteredProducts = products.filter(p => {
    const matchesSegment = isCategoryInSegment(p.category, activeSegment);
    const matchesCategory = filterCategory === "all" || p.category === filterCategory;
    
    if (searchQuery.trim() === "") {
      return matchesSegment && matchesCategory;
    }

    // Synonym resolution
    const synonyms = mapSynonymsToTerm(searchQuery);
    const matchesQuery = synonyms.some(id => p.id.toLowerCase().includes(id)) || 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      p.shortDesc.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.seoTitle && p.seoTitle.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesSegment && matchesCategory && matchesQuery;
  });

  return (
    <div className="bg-[#FAF9F6] py-12 font-sans" id="products-explorer-wrapper">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Header Title */}
        <div className="text-center max-w-3xl mx-auto mb-10">
          <span className="text-[10px] uppercase font-mono tracking-[0.2em] text-[#316EC9] font-bold">
            Brokerage Placement Catalog
          </span>
          <h1 className="text-3xl sm:text-4xl font-serif italic text-[#142C54] mt-1 leading-tight">
            Discover Our Comprehensive Risk Placements
          </h1>
          <p className="text-xs text-[#8C887D] mt-2 max-w-xl mx-auto leading-relaxed">
            Since 1999, we consult on bespoke risks. Select a sector category below to discover indicative protections or search specific solutions.
          </p>
        </div>

        {/* Dynamic Category Segment Toggle Buttons */}
        <div className="flex flex-wrap justify-center gap-2 sm:gap-4 border-b border-[#D8E2F0] mb-8 pb-px">
          {[
            { id: "all", label: "All Coverages", icon: "📋" },
            { id: "general", label: "General Insurance", icon: "🛡️" },
            { id: "health", label: "Health Insurance", icon: "🩺" },
            { id: "life", label: "Life Insurance", icon: "⏳" }
          ].map((seg) => {
            const isActive = activeSegment === seg.id;
            return (
              <button
                key={seg.id}
                onClick={() => {
                  setActiveSegment(seg.id as any);
                  setFilterCategory("all");
                }}
                className={`pb-4 px-3 text-xs font-bold uppercase tracking-wider flex items-center space-x-2 border-b-2 transition-all cursor-pointer ${
                  isActive 
                    ? "border-[#142C54] text-[#142C54] text-[12px]" 
                    : "border-transparent text-gray-400 hover:text-slate-600"
                }`}
              >
                <span className="text-sm shrink-0">{seg.icon}</span>
                <span>{seg.label}</span>
              </button>
            );
          })}
        </div>

        {/* Dynamic Search & Category Filter Section */}
        <div className="bg-white border border-[#D8E2F0] p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            
            {/* Search Input */}
            <div className="md:col-span-6 relative">
              <Search className="absolute left-3 top-3.5 h-4 w-4 text-[#8C887D]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by product name, asset, industry risk (e.g. 'shop', 'truck', 'tender', 'employees')..."
                className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-[#D8E2F0] text-xs text-[#142C54] focus:outline-none focus:border-[#316EC9] focus:bg-white"
                id="products-catalog-search-field"
              />
            </div>

            {/* Category selection */}
            <div className="md:col-span-4">
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full bg-slate-50 border border-[#D8E2F0] py-3 px-3 text-xs text-[#142C54] focus:outline-none focus:border-[#316EC9] focus:bg-white rounded-none"
                id="products-catalog-category-select"
              >
                <option value="all">All Sector Categories</option>
                {filteredCategories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
                ))}
              </select>
            </div>

            {/* Quick reset */}
            <div className="md:col-span-2 text-right">
              <button
                onClick={() => { setSearchQuery(""); setFilterCategory("all"); }}
                className="text-xs text-gray-500 hover:text-black font-bold uppercase tracking-wider underline cursor-pointer"
              >
                Reset Search
              </button>
            </div>

          </div>

          {/* Quick Smart Tags */}
          <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-gray-100 text-[11px]">
            <span className="text-[#8C887D] font-mono font-semibold">Smart Keyword Suggestions:</span>
            {[
              { tag: "shop", label: "Shop Risk (SME)" },
              { tag: "truck", label: "Truck Fleet & Cartage" },
              { tag: "consultant", label: "Consultant Negligence" },
              { tag: "employees", label: "Staff Health Benefits" },
              { tag: "tender", label: "Tender Bonds" }
            ].map(pair => (
              <button
                key={pair.tag}
                onClick={() => setSearchQuery(pair.tag)}
                className="bg-slate-50 hover:bg-[#316EC9]/10 text-slate-700 hover:text-[#316EC9] border border-slate-200 px-2.5 py-1 text-[10px] font-mono transition-all font-semibold"
              >
                🔍 "{pair.tag}"
              </button>
            ))}
          </div>

        </div>

        {/* Categories Grid (Section 9 requirement) */}
        {searchQuery.trim() === "" && filterCategory === "all" && (
          <div className="mb-12">
            <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-[#142C54] border-b border-[#D8E2F0] pb-2 mb-6">
              Browse Categories
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredCategories.map(cat => {
                const innerProducts = products.filter(p => p.category === cat.id).slice(0, 3);
                return (
                  <div key={cat.id} className="bg-white border border-[#D8E2F0] p-5 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center space-x-2 text-2xl mb-3">
                        <span>{cat.icon}</span>
                        <h3 className="text-xs font-mono font-bold uppercase text-[#142C54] tracking-wide">
                          {cat.name}
                        </h3>
                      </div>
                      <p className="text-[11px] text-[#8C887D] leading-relaxed mb-4">
                        {cat.description}
                      </p>
                      
                      {/* Popular items listings */}
                      <div className="space-y-1.5 mb-4">
                        <span className="text-[9px] uppercase tracking-wider text-gray-400 font-bold">Popular Policies:</span>
                        {innerProducts.map(prod => (
                          <button
                            key={prod.id}
                            onClick={() => onSelectProduct(prod.id)}
                            className="w-full text-left font-mono font-bold text-[11px] text-[#142C54] hover:text-[#316EC9] flex items-center justify-between"
                          >
                            <span>• {prod.name}</span>
                            <ChevronRight className="h-3 w-3 inline text-gray-300" />
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                      <button
                        onClick={() => onSelectCategory(cat.id)}
                        className="text-[10px] uppercase font-bold text-[#316EC9] hover:underline"
                      >
                        Explore Category Page
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Results list */}
        <div>
          <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-[#142C54] border-b border-[#D8E2F0] pb-2 mb-6">
            {searchQuery.trim() !== "" || filterCategory !== "all" ? `Search Match Placements (${filteredProducts.length})` : "All Placements catalog"}
          </h2>
          
          {filteredProducts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProducts.map(prod => (
                <div 
                  key={prod.id}
                  onClick={() => onSelectProduct(prod.id)}
                  className="bg-white border border-[#D8E2F0] hover:border-[#142C54] p-5 cursor-pointer flex flex-col justify-between transition-all"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-2xl">{prod.icon}</span>
                      <span className={`text-[8px] font-bold uppercase tracking-wider px-2 py-0.5 ${
                        prod.quotationMethod === "Instant Indicative Quote" 
                          ? "bg-green-100 text-green-800" 
                          : prod.quotationMethod === "Guided Online Quote" 
                          ? "bg-blue-100 text-blue-800" 
                          : "bg-amber-100 text-amber-800"
                      }`}>
                        {prod.quotationMethod}
                      </span>
                    </div>

                    <h3 className="text-xs font-mono font-bold text-[#142C54]">{prod.name}</h3>
                    <p className="text-[11px] text-[#8C887D] leading-relaxed line-clamp-3">
                      {prod.shortDesc}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-[#316EC9] font-bold uppercase tracking-wider">
                    <span>Explore Coverages</span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-white border border-[#D8E2F0]">
              <ShieldAlert className="h-10 w-10 text-[#8C887D] mx-auto mb-2" />
              <p className="text-xs text-[#8C887D]">We couldn't resolve any active items matching current parameters.</p>
              <button
                onClick={() => { setSearchQuery(""); setFilterCategory("all"); }}
                className="mt-4 bg-[#142C54] text-white px-4 py-2 text-xs font-bold uppercase tracking-wider"
              >
                Clear Search filters
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
