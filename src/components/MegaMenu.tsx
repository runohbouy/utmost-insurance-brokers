import React, { useState, useEffect, useRef } from "react";
import { Product, PRODUCT_CATEGORIES } from "../data/allProducts";
import { getStoredProducts } from "../data/productStore";
import { Search, HelpCircle, UserCheck, CheckCircle2, ChevronRight, MessageSquare, ArrowRight, ShieldCheck, PlayCircle } from "lucide-react";

interface MegaMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProduct: (productId: string) => void;
  onSelectCategory: (categoryId: string) => void;
  setActiveTab: (tab: any) => void;
  mode: "general" | "health" | "life";
}

export default function MegaMenu({ isOpen, onClose, onSelectProduct, onSelectCategory, setActiveTab, mode }: MegaMenuProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("motor");
  const menuRef = useRef<HTMLDivElement>(null);

  // Helper to get categories for a given mode
  const getCategoriesForMode = (m: "general" | "health" | "life") => {
    switch (m) {
      case "health":
        return PRODUCT_CATEGORIES.filter(c => c.id === "medical");
      case "life":
        return PRODUCT_CATEGORIES.filter(c => c.id === "life-pension" || c.id === "employee-benefits");
      case "general":
      default:
        return PRODUCT_CATEGORIES.filter(c => 
          c.id !== "medical" && c.id !== "life-pension" && c.id !== "employee-benefits"
        );
    }
  };

  const currentCategories = getCategoriesForMode(mode);

  useEffect(() => {
    setProducts(getStoredProducts().filter(p => p.status === "active"));
  }, [isOpen]);

  // Sync selected Category when mode changes
  useEffect(() => {
    const cats = getCategoriesForMode(mode);
    if (cats.length > 0) {
      setSelectedCategory(cats[0].id);
    }
  }, [mode]);

  // Handle outside click to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Filter products by category or search query
  const filteredProductsBySearch = searchQuery.trim() !== ""
    ? products.filter(p => {
        const query = searchQuery.toLowerCase();
        return (
          p.name.toLowerCase().includes(query) ||
          p.shortDesc.toLowerCase().includes(query) ||
          p.category.toLowerCase().includes(query) ||
          (p.seoTitle && p.seoTitle.toLowerCase().includes(query)) ||
          p.id.toLowerCase().includes(query)
        );
      })
    : [];

  const getMethodBadgeClass = (method: string) => {
    switch (method) {
      case "Instant Indicative Quote":
        return "bg-green-100 text-green-800 text-[9px] px-1.5 py-0.5 font-bold uppercase rounded-none";
      case "Guided Online Quote":
        return "bg-blue-100 text-blue-800 text-[9px] px-1.5 py-0.5 font-bold uppercase rounded-none";
      case "Request a Quote":
        return "bg-amber-100 text-amber-800 text-[9px] px-1.5 py-0.5 font-bold uppercase rounded-none";
      case "Speak to a Specialist":
        return "bg-purple-100 text-purple-800 text-[9px] px-1.5 py-0.5 font-bold uppercase rounded-none";
      case "Coming Soon":
        return "bg-gray-100 text-gray-500 text-[9px] px-1.5 py-0.5 font-medium rounded-none";
      default:
        return "bg-gray-100 text-gray-800 text-[9px] px-1.5 py-0.5 rounded-none";
    }
  };

  return (
    <div 
      ref={menuRef}
      className="fixed left-0 right-0 top-[80px] z-50 w-full border-b border-[#D8E2F0] bg-[#FAF9F6] shadow-xl animate-fade-in"
      id="desktop-mega-menu"
      style={{ maxHeight: "calc(100vh - 80px)", overflowY: "auto", overflowX: "hidden" }}
    >
      <div className="mx-auto max-w-7xl px-6 py-6">

        {/* Search & Meta Quick Links Grid */}
        <div className="flex flex-col md:flex-row items-center justify-between border-b border-[#D8E2F0] pb-5 mb-5 gap-4">
          <div className="relative w-full md:w-1/3">
            <Search className="absolute left-3 top-3.5 h-4 w-4 text-[#8C887D]" />
            <input
              type="text"
              placeholder="Search products, risks, or industries..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-white border border-[#D8E2F0] text-xs text-[#142C54] placeholder-[#8C887D] focus:outline-none focus:border-[#316EC9]"
              id="mega-menu-search-input"
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 text-xs">
            <button 
              onClick={() => {
                setActiveTab("get-a-quote");
                onClose();
              }}
              className="flex items-center space-x-1.5 text-[#142C54] hover:text-[#316EC9] font-bold uppercase tracking-wider text-[11px] border border-[#142C54]/20 px-3 py-1.5 transition-colors"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              <span>Not Sure What You Need?</span>
            </button>
            <a 
              href="https://wa.me/254707798701"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-1.5 text-[#142C54] hover:text-[#316EC9] font-bold uppercase tracking-wider text-[11px] border border-[#142C54]/20 px-3 py-1.5 transition-colors"
            >
              <MessageSquare className="h-3.5 w-3.5 text-green-600" />
              <span>Speak to an Adviser</span>
            </a>
            <button 
              onClick={() => {
                setActiveTab("insurance-products");
                onClose();
              }}
              className="flex items-center space-x-1.5 bg-[#316EC9] text-white hover:bg-[#142C54] font-bold uppercase tracking-wider text-[11px] px-4 py-2 transition-colors"
            >
              <span>View All Products</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Dynamic Search Results Screen if querying */}
        {searchQuery.trim() !== "" ? (
          <div>
            <h3 className="text-xs uppercase font-bold text-[#8C887D] tracking-widest mb-4">
              Search Results ({filteredProductsBySearch.length} Matches)
            </h3>
            {filteredProductsBySearch.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {filteredProductsBySearch.map((p) => {
                  const catInfo = PRODUCT_CATEGORIES.find(c => c.id === p.category);
                  return (
                    <div 
                      key={p.id}
                      onClick={() => {
                        onSelectProduct(p.id);
                        onClose();
                      }}
                      className="group p-4 border border-[#D8E2F0] bg-white hover:border-[#142C54] transition-all cursor-pointer flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center space-x-1.5 mb-1">
                          <span className="text-lg">{p.icon}</span>
                          <span className="text-[10px] font-bold text-[#316EC9] uppercase tracking-wider">
                            {catInfo?.name || p.category}
                          </span>
                        </div>
                        <h4 className="text-xs font-bold text-[#142C54] font-mono group-hover:text-[#316EC9] transition-colors">
                          {p.name}
                        </h4>
                        <p className="text-[11px] text-[#8C887D] leading-relaxed mt-1 line-clamp-2">
                          {p.shortDesc}
                        </p>
                      </div>
                      <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between">
                        <span className={getMethodBadgeClass(p.quotationMethod)}>
                          {p.quotationMethod}
                        </span>
                        <ChevronRight className="h-3 w-3 text-[#142C54] group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-10">
                <p className="text-xs text-[#8C887D]">We couldn't find any direct matches. Try searching "car", "medical", "shop", "consultant" or "employees".</p>
              </div>
            )}
          </div>
        ) : (
          /* Normal Structured Columns layout: Two-pane interactive categorisation */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column Pane (Categories list option triggers) - spans 4 cols */}
            <div className="lg:col-span-4 border-r border-[#D8E2F0] lg:pr-6 pr-0 space-y-1">
              <div className="pb-2 border-b border-[#D8E2F0]">
                <span className="text-[9px] font-bold uppercase tracking-widest text-[#8C887D]">Product Categories</span>
              </div>
              <div className="pt-2 space-y-1">
                {currentCategories.map((cat) => {
                  const isActive = selectedCategory === cat.id;
                  const catProductsCount = products.filter(p => p.category === cat.id).length;
                  return (
                    <div
                      key={cat.id}
                      onMouseEnter={() => setSelectedCategory(cat.id)}
                      onClick={() => {
                        setSelectedCategory(cat.id);
                        onSelectCategory(cat.id);
                      }}
                      className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-all ${
                        isActive 
                          ? "bg-[#142C54] text-[#FAF9F6] font-bold" 
                          : "text-[#142C54] hover:bg-[#D8E2F0]/40"
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <span className="text-sm shrink-0">{cat.icon}</span>
                        <div className="text-left min-w-0">
                          <span className="block text-[11px] uppercase font-sans tracking-wider leading-tight truncate">
                            {cat.name}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-1 shrink-0 ml-2">
                        <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 ${
                          isActive ? "bg-[#316EC9] text-[#FAF9F6]" : "bg-gray-100 text-[#142C54]"
                        }`}>
                          {catProductsCount}
                        </span>
                        <ChevronRight className={`h-3 w-3 ${isActive ? "text-[#FAF9F6]" : "text-[#8C887D]"}`} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Pane (Sub-menu of Insurance Classes inside selectedCategory) - spans 8 cols */}
            <div className="lg:col-span-8 flex flex-col justify-between pl-2">
              <div>
                {(() => {
                  const activeCat = PRODUCT_CATEGORIES.find(c => c.id === selectedCategory);
                  const activeCatProducts = products
                    .filter(p => p.category === selectedCategory)
                    .sort((a, b) => a.displayOrder - b.displayOrder);

                  if (!activeCat) return null;

                  return (
                    <div className="space-y-4">
                      {/* Sub-menu title & Action to go to category page */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#D8E2F0] pb-2 gap-2">
                        <div className="text-left">
                          <div className="flex items-center space-x-2">
                            <span className="text-lg">{activeCat.icon}</span>
                            <h3 className="text-xs font-bold uppercase tracking-wider text-[#142C54] font-sans">
                              {activeCat.name} Sub-Menu Classes
                            </h3>
                          </div>
                          <p className="text-[10px] text-[#8C887D] mt-0.5 font-sans leading-relaxed">
                            {activeCat.description}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            onSelectCategory(activeCat.id);
                            onClose();
                          }}
                          className="self-start sm:self-center text-[9px] font-bold text-[#316EC9] hover:text-[#142C54] uppercase tracking-wider flex items-center space-x-1 border border-[#316EC9]/30 px-2.5 py-1 hover:border-[#142C54] transition-all bg-white cursor-pointer"
                        >
                          <span>Explore {activeCat.name} Category Page</span>
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      </div>

                      {/* Display products in 2-column sub-grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pr-1">
                        {activeCatProducts.map((prod) => (
                          <div
                            key={prod.id}
                            onClick={() => {
                              onSelectProduct(prod.id);
                              onClose();
                            }}
                            className="group p-2.5 border border-[#D8E2F0] bg-white hover:border-[#142C54] transition-all cursor-pointer flex flex-col justify-between"
                          >
                            <div className="text-left">
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-[11px] font-bold text-[#142C54] font-mono group-hover:text-[#316EC9] transition-colors leading-tight">
                                  {prod.name}
                                </span>
                                {prod.featured && (
                                  <span className="text-[8px] bg-amber-100 text-amber-800 px-1 py-0.5 font-bold uppercase">HOT</span>
                                )}
                              </div>
                              <p className="text-[10px] text-[#8C887D] line-clamp-1 mt-0.5 leading-relaxed group-hover:text-[#142C54] transition-all">
                                {prod.shortDesc}
                              </p>
                            </div>
                            <div className="mt-2 pt-1.5 border-t border-gray-50 flex items-center justify-between gap-2">
                              <span className={getMethodBadgeClass(prod.quotationMethod)}>
                                {prod.quotationMethod}
                              </span>
                              <ChevronRight className="h-3 w-3 text-[#8C887D] group-hover:text-[#316EC9] group-hover:translate-x-0.5 transition-transform" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
