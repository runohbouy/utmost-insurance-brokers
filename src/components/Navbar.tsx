import React, { useState, useEffect } from "react";
import { ActiveTab } from "../types";
import { 
  Shield, Sparkles, Car, Heart, FileText, User, Settings, PhoneCall, 
  Menu, X, ChevronDown, ChevronRight, Search, Phone 
} from "lucide-react";
import Logo from "./Logo";
import MegaMenu from "./MegaMenu";
import { getStoredProducts } from "../data/productStore";
import { Product, PRODUCT_CATEGORIES } from "../data/allProducts";

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  setSelectedProductId?: (id: string | null) => void;
  setSelectedCategoryId?: (id: string | null) => void;
  setProductsSegment?: (segment: "general" | "health" | "life" | "all") => void;
  currentSegment?: "general" | "health" | "life" | "all";
}

export default function Navbar({ 
  activeTab, 
  setActiveTab, 
  setSelectedProductId, 
  setSelectedCategoryId,
  setProductsSegment,
  currentSegment = "all"
}: NavbarProps) {
  const [activeMegaMenu, setActiveMegaMenu] = useState<"general" | "health" | "life" | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Mobile accordion state for the 3 new categories
  const [expandedMobileSegment, setExpandedMobileSegment] = useState<"general" | "health" | "life" | null>(null);
  const [expandedMobileCategory, setExpandedMobileCategory] = useState<string | null>(null);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [mobileSearchQuery, setMobileSearchQuery] = useState("");
  const [filteredMobileProducts, setFilteredMobileProducts] = useState<Product[]>([]);

  useEffect(() => {
    setAllProducts(getStoredProducts().filter(p => p.status === "active"));
  }, []);

  const routeTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    setIsMobileMenuOpen(false);
    setActiveMegaMenu(null);
  };

  const selectProductAction = (id: string) => {
    if (setSelectedProductId) {
      setSelectedProductId(id);
    }
    routeTab("product-details");
  };

  const selectCategoryAction = (id: string) => {
    if (setSelectedCategoryId) {
      setSelectedCategoryId(id);
    }
    routeTab("category-details");
  };

  const handleSegmentClick = (segment: "general" | "health" | "life") => {
    if (setProductsSegment) {
      setProductsSegment(segment);
    }
    routeTab("insurance-products");
  };

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

  const handleMobileSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setMobileSearchQuery(val);
    if (val.trim() === "") {
      setFilteredMobileProducts([]);
      return;
    }
    const synonyms = mapSynonymsToTerm(val);
    const filtered = allProducts.filter(p => {
      return (
        synonyms.some(id => p.id.toLowerCase().includes(id)) ||
        p.name.toLowerCase().includes(val.toLowerCase()) ||
        p.shortDesc.toLowerCase().includes(val.toLowerCase()) ||
        (p.seoTitle && p.seoTitle.toLowerCase().includes(val.toLowerCase()))
      );
    });
    setFilteredMobileProducts(filtered);
  };

  return (
    <>
    <header className="sticky top-0 z-50 w-full px-4 sm:px-6 lg:px-4 xl:px-8 py-3 bg-[#FAF9F6]/20 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-3 lg:px-4 xl:px-6 bg-white/95 border border-slate-200/50 rounded-2xl shadow-lg">

        {/* Left Side: Logo */}
        <div
          onClick={() => routeTab("home")}
          className="flex cursor-pointer items-center transition-all duration-300 hover:opacity-90 shrink-0"
          id="navbar-logo-container"
        >
          <Logo variant="full" height="42" className="transition-transform duration-300 hover:scale-[1.02]" />
        </div>

        {/* Center: Desktop Navigation Bar with dividers. Padding/gaps are tighter between lg and
            xl (1024-1279px) - that's the range where the full bar, Get a Quote, and the
            hamburger fallback (for Support Line/Workspace Admin, hidden until xl) all have to
            coexist without the whole header overflowing horizontally. */}
        <nav className="hidden lg:flex items-center space-x-0.5 xl:space-x-1" id="desktop-menubar">
          
          {/* 1. Home - Icon only */}
          <button
            id="navitem-desktop-home"
            onClick={() => routeTab("home")}
            className={`flex items-center justify-center p-3 text-xs transition-all duration-300 cursor-pointer ${
              activeTab === "home" ? "text-[#142C54]" : "text-[#8C887D] hover:text-[#142C54]"
            }`}
            title="Home"
          >
            <Shield className={`h-4.5 w-4.5 ${activeTab === "home" ? "text-[#316EC9] stroke-[2.5]" : "text-[#8C887D]"}`} />
          </button>

          {/* Divider */}
          <div className="h-4 w-[1px] bg-[#D8E2F0]"></div>

          {/* 2.1 General Insurance */}
          <div 
            className="h-16 flex items-center"
            onMouseEnter={() => setActiveMegaMenu("general")}
            onMouseLeave={() => setActiveMegaMenu(null)}
          >
            <button
              type="button"
              id="navitem-desktop-general"
              onClick={() => handleSegmentClick("general")}
              className={`flex items-center space-x-1 px-2 xl:px-3 py-2 text-[11px] uppercase tracking-[0.14em] font-bold transition-all duration-300 cursor-pointer ${
                activeMegaMenu === "general" || (activeTab === "insurance-products" && currentSegment === "general")
                  ? "text-[#142C54] border-b-2 border-[#142C54] pb-1"
                  : "text-[#8C887D] hover:text-[#142C54]"
              }`}
            >
              <span>General Insurance</span>
              <ChevronDown className="h-3 w-3 text-[#316EC9]" />
            </button>

            {/* Mega Menu Overlay */}
            <MegaMenu 
              isOpen={activeMegaMenu === "general"} 
              onClose={() => setActiveMegaMenu(null)} 
              onSelectProduct={selectProductAction}
              onSelectCategory={selectCategoryAction}
              setActiveTab={setActiveTab}
              mode="general"
            />
          </div>

          {/* Divider */}
          <div className="h-4 w-[1px] bg-[#D8E2F0]"></div>

          {/* 2.2 Health Insurance */}
          <div 
            className="h-16 flex items-center"
            onMouseEnter={() => setActiveMegaMenu("health")}
            onMouseLeave={() => setActiveMegaMenu(null)}
          >
            <button
              type="button"
              id="navitem-desktop-health"
              onClick={() => handleSegmentClick("health")}
              className={`flex items-center space-x-1 px-2 xl:px-3 py-2 text-[11px] uppercase tracking-[0.14em] font-bold transition-all duration-300 cursor-pointer ${
                activeMegaMenu === "health" || (activeTab === "insurance-products" && currentSegment === "health")
                  ? "text-[#142C54] border-b-2 border-[#142C54] pb-1"
                  : "text-[#8C887D] hover:text-[#142C54]"
              }`}
            >
              <span>Health Insurance</span>
              <ChevronDown className="h-3 w-3 text-[#316EC9]" />
            </button>

            {/* Mega Menu Overlay */}
            <MegaMenu 
              isOpen={activeMegaMenu === "health"} 
              onClose={() => setActiveMegaMenu(null)} 
              onSelectProduct={selectProductAction}
              onSelectCategory={selectCategoryAction}
              setActiveTab={setActiveTab}
              mode="health"
            />
          </div>

          {/* Divider */}
          <div className="h-4 w-[1px] bg-[#D8E2F0]"></div>

          {/* 2.3 Life Insurance */}
          <div 
            className="h-16 flex items-center"
            onMouseEnter={() => setActiveMegaMenu("life")}
            onMouseLeave={() => setActiveMegaMenu(null)}
          >
            <button
              type="button"
              id="navitem-desktop-life"
              onClick={() => handleSegmentClick("life")}
              className={`flex items-center space-x-1 px-2 xl:px-3 py-2 text-[11px] uppercase tracking-[0.14em] font-bold transition-all duration-300 cursor-pointer ${
                activeMegaMenu === "life" || (activeTab === "insurance-products" && currentSegment === "life")
                  ? "text-[#142C54] border-b-2 border-[#142C54] pb-1"
                  : "text-[#8C887D] hover:text-[#142C54]"
              }`}
            >
              <span>Life Insurance</span>
              <ChevronDown className="h-3 w-3 text-[#316EC9]" />
            </button>

            {/* Mega Menu Overlay */}
            <MegaMenu 
              isOpen={activeMegaMenu === "life"} 
              onClose={() => setActiveMegaMenu(null)} 
              onSelectProduct={selectProductAction}
              onSelectCategory={selectCategoryAction}
              setActiveTab={setActiveTab}
              mode="life"
            />
          </div>

          {/* Divider */}
          <div className="h-4 w-[1px] bg-[#D8E2F0]"></div>

          {/* 3. Claims Centre */}
          <button
            id="navitem-desktop-claims"
            onClick={() => routeTab("claims")}
            className={`flex items-center px-2.5 xl:px-4 py-2 text-[11px] uppercase tracking-[0.18em] font-bold transition-all duration-300 cursor-pointer ${
              activeTab === "claims"
                ? "text-[#142C54] border-b-2 border-[#142C54] pb-1"
                : "text-[#8C887D] hover:text-[#142C54]"
            }`}
          >
            <span>Claims Centre</span>
          </button>

          {/* Divider */}
          <div className="h-4 w-[1px] bg-[#D8E2F0]"></div>

          {/* 4. Customer Portal */}
          <button
            id="navitem-desktop-portal"
            onClick={() => routeTab("portal")}
            className={`flex items-center px-2.5 xl:px-4 py-2 text-[11px] uppercase tracking-[0.18em] font-bold transition-all duration-300 cursor-pointer ${
              activeTab === "portal"
                ? "text-[#142C54] border-b-2 border-[#142C54] pb-1"
                : "text-[#8C887D] hover:text-[#142C54]"
            }`}
          >
            <span>Customer Portal</span>
          </button>

          {/* Divider */}
          <div className="h-4 w-[1px] bg-[#D8E2F0]"></div>

          {/* 5. AI Home Organizer */}
          <button
            id="navitem-desktop-analyzer"
            onClick={() => routeTab("room-analyzer")}
            className={`flex items-center px-2.5 xl:px-4 py-2 text-[11px] uppercase tracking-[0.18em] font-bold transition-all duration-300 cursor-pointer ${
              activeTab === "room-analyzer"
                ? "text-[#142C54] border-b-2 border-[#142C54] pb-1"
                : "text-[#8C887D] hover:text-[#142C54]"
            }`}
          >
            <span>AI Home Organizer</span>
          </button>

        </nav>

        {/* Right Side Actions Panel (Desktop and Mobile Hams) */}
        <div className="flex items-center space-x-2 sm:space-x-2.5 xl:space-x-3 shrink-0">

          {/* Support Line - icon-only chip between xl and 2xl (the full "+254 707 798701" pill
              plus Workspace Admin plus Get a Quote don't actually fit inside the max-w-7xl header
              at any width from 1280 up to ~1500px - verified via real overflow measurement, not
              just eyeballing a screenshot). Full label only once there's genuine room at 2xl. */}
          <a
            href="tel:+254707798701"
            title="24-Hour Advisory Line: +254 707 798701"
            className="hidden xl:flex items-center space-x-1.5 text-[11px] font-bold text-[#142C54] border border-[#D8E2F0] rounded-full px-3 py-1.5 hover:border-[#316EC9] hover:text-[#316EC9] transition-colors"
          >
            <Phone className="h-3.5 w-3.5 text-[#316EC9]" />
            <span className="hidden 2xl:inline font-mono tracking-wide whitespace-nowrap">+254 707 798701</span>
          </a>

          {/* Workplace Admin Setting Link - same icon-only-until-2xl treatment as above */}
          <button
            onClick={() => routeTab("admin")}
            title="Workplace Administration Portal"
            className={`hidden xl:flex items-center space-x-1 text-[10px] uppercase tracking-wider font-bold transition-all cursor-pointer ${
              activeTab === "admin" ? "text-[#316EC9]" : "text-[#8C887D] hover:text-[#142C54]"
            }`}
          >
            <Settings className="h-3.5 w-3.5 text-[#8C887D]" />
            <span className="hidden 2xl:inline">Workspace Admin</span>
          </button>

          {/* Get a Quote button - visible earlier than the rest of the CTA cluster, it's the primary action */}
          <button
            onClick={() => routeTab("get-a-quote")}
            id="header-desktop-quote-button"
            className="hidden md:flex items-center space-x-1 bg-[#316EC9] hover:bg-[#2059ab] text-[#FAF9F6] border border-transparent px-3 xl:px-4 py-2 text-[10px] uppercase tracking-[0.18em] font-bold transition-all rounded-xl active:scale-95 cursor-pointer shadow-sm hover:shadow"
          >
            <span>Get a Quote</span>
          </button>

          {/* Hamburger Menu Toggle Button: kept visible through xl (not just lg) because the
              Support Line / Workspace Admin links only render at xl:flex - between lg and xl
              they'd otherwise be completely unreachable (no inline link, no hamburger fallback).
              The drawer already includes a Workspace Admin entry, so this closes that gap. */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            id="mobile-hamburger-toggle"
            className="xl:hidden flex items-center justify-center p-2 rounded-xl border border-slate-200 hover:border-slate-300 text-[#142C54] bg-white cursor-pointer shadow-sm hover:shadow-md transition-all"
          >
            {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

        </div>

      </div>
    </header>

    {/* MOBILE FULL DRAWER NAVIGATION OVERLAY - rendered as a header sibling, not a descendant:
        the header's backdrop-blur creates a new containing block for position:fixed children,
        which collapsed this overlay to a sliver instead of covering the viewport. */}
    {isMobileMenuOpen && (
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsMobileMenuOpen(false);
            }
          }}
          className="xl:hidden fixed inset-0 top-20 bg-black/50 z-40 overflow-y-auto"
        >
          <div className="bg-[#FAF9F6] w-full max-h-[85vh] overflow-y-auto border-b border-[#D8E2F0] shadow-2xl px-4 py-5 space-y-6">
            
            {/* 1. Mobile Search Bar */}
            <div className="space-y-1.5">
              <label className="block text-[9px] uppercase tracking-[0.18em] text-[#8C887D] font-bold">
                Smart Product Search (Synonym Enabled)
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-[#8C887D]" />
                <input
                  type="text"
                  value={mobileSearchQuery}
                  onChange={handleMobileSearchChange}
                  placeholder="Search 'shop', 'truck', 'employees', 'tender'..."
                  className="w-full bg-white border border-[#D8E2F0] pl-9 pr-4 py-2.5 text-xs text-[#142C54] placeholder-[#8C887D] focus:outline-none focus:border-[#316EC9] rounded-xl"
                  id="mobile-navbar-search"
                />
              </div>

              {/* Mobile Search Results */}
              {mobileSearchQuery.trim() !== "" && (
                <div className="border border-[#D8E2F0] bg-white divide-y divide-slate-100 max-h-48 overflow-y-auto rounded-xl shadow-md">
                  {filteredMobileProducts.length > 0 ? (
                    filteredMobileProducts.map(p => (
                      <button
                        key={p.id}
                        onClick={() => {
                          selectProductAction(p.id);
                          setMobileSearchQuery("");
                        }}
                        className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 transition-colors flex items-center justify-between text-xs"
                      >
                        <span className="font-mono font-bold text-[#142C54]">{p.name}</span>
                        <ChevronRight className="h-3 w-3 text-[#316EC9]" />
                      </button>
                    ))
                  ) : (
                    <p className="p-3 text-[11px] text-gray-400 font-sans">No matching coverage found.</p>
                  )}
                </div>
              )}
            </div>

            {/* 2. Interactive Category Accordion (Hide when searching) */}
            {mobileSearchQuery.trim() === "" && (
              <div className="space-y-4">
                <label className="block text-[9px] uppercase tracking-[0.18em] text-[#8C887D] font-bold border-b border-[#D8E2F0] pb-1.5 mb-2">
                  Browse Insurance Categories
                </label>
                
                <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-1">
                  {/* --- SEGMENT 1: General Insurance --- */}
                  <div className="border border-[#D8E2F0] bg-white">
                    <button
                      onClick={() => setExpandedMobileSegment(expandedMobileSegment === "general" ? null : "general")}
                      className="w-full flex items-center justify-between px-3.5 py-3 text-xs font-bold text-[#142C54] bg-slate-50 border-b border-slate-100"
                    >
                      <span className="flex items-center space-x-2">
                        <span>🛡️</span>
                        <span>General Insurance</span>
                      </span>
                      <ChevronDown className={`h-4 w-4 text-[#316EC9] transition-transform ${expandedMobileSegment === "general" ? "rotate-180" : ""}`} />
                    </button>
                    {expandedMobileSegment === "general" && (
                      <div className="p-2 space-y-1.5 bg-white">
                        {PRODUCT_CATEGORIES.filter(c => c.id !== "medical" && c.id !== "life-pension" && c.id !== "employee-benefits").map(cat => {
                          const isExpanded = expandedMobileCategory === cat.id;
                          const catProducts = allProducts.filter(p => p.category === cat.id);
                          return (
                            <div key={cat.id} className="border border-slate-200 rounded-none overflow-hidden">
                              <button
                                onClick={() => setExpandedMobileCategory(isExpanded ? null : cat.id)}
                                className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-[#142C54] hover:bg-slate-50"
                              >
                                <span className="flex items-center space-x-2">
                                  <span>{cat.icon}</span>
                                  <span>{cat.name}</span>
                                </span>
                                <ChevronDown className={`h-3 w-3 text-[#316EC9] transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                              </button>
                              {isExpanded && (
                                <div className="bg-slate-50 px-3 py-2 border-t border-slate-100 space-y-1">
                                  <button
                                    onClick={() => selectCategoryAction(cat.id)}
                                    className="w-full text-left text-[10px] font-bold text-[#316EC9] uppercase tracking-wider py-1 hover:underline"
                                  >
                                    Explore all {cat.name} →
                                  </button>
                                  <div className="grid grid-cols-1 gap-1 pt-1 border-t border-slate-200">
                                    {catProducts.map(p => (
                                      <button
                                        key={p.id}
                                        onClick={() => selectProductAction(p.id)}
                                        className="w-full text-left text-xs font-mono text-[#142C54] hover:text-[#316EC9] py-1 pl-2 border-l border-slate-300"
                                      >
                                        {p.name}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* --- SEGMENT 2: Health Insurance --- */}
                  <div className="border border-[#D8E2F0] bg-white">
                    <button
                      onClick={() => setExpandedMobileSegment(expandedMobileSegment === "health" ? null : "health")}
                      className="w-full flex items-center justify-between px-3.5 py-3 text-xs font-bold text-[#142C54] bg-slate-50 border-b border-slate-100"
                    >
                      <span className="flex items-center space-x-2">
                        <span>🩺</span>
                        <span>Health Insurance</span>
                      </span>
                      <ChevronDown className={`h-4 w-4 text-[#316EC9] transition-transform ${expandedMobileSegment === "health" ? "rotate-180" : ""}`} />
                    </button>
                    {expandedMobileSegment === "health" && (
                      <div className="p-2 space-y-1.5 bg-white">
                        {PRODUCT_CATEGORIES.filter(c => c.id === "medical").map(cat => {
                          const isExpanded = expandedMobileCategory === cat.id;
                          const catProducts = allProducts.filter(p => p.category === cat.id);
                          return (
                            <div key={cat.id} className="border border-slate-200 rounded-none overflow-hidden">
                              <button
                                onClick={() => setExpandedMobileCategory(isExpanded ? null : cat.id)}
                                className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-[#142C54] hover:bg-slate-50"
                              >
                                <span className="flex items-center space-x-2">
                                  <span>{cat.icon}</span>
                                  <span>{cat.name}</span>
                                </span>
                                <ChevronDown className={`h-3 w-3 text-[#316EC9] transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                              </button>
                              {isExpanded && (
                                <div className="bg-slate-50 px-3 py-2 border-t border-slate-100 space-y-1">
                                  <button
                                    onClick={() => selectCategoryAction(cat.id)}
                                    className="w-full text-left text-[10px] font-bold text-[#316EC9] uppercase tracking-wider py-1 hover:underline"
                                  >
                                    Explore Health Coverage →
                                  </button>
                                  <div className="grid grid-cols-1 gap-1 pt-1 border-t border-slate-200">
                                    {catProducts.map(p => (
                                      <button
                                        key={p.id}
                                        onClick={() => selectProductAction(p.id)}
                                        className="w-full text-left text-xs font-mono text-[#142C54] hover:text-[#316EC9] py-1 pl-2 border-l border-slate-300"
                                      >
                                        {p.name}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* --- SEGMENT 3: Life Insurance --- */}
                  <div className="border border-[#D8E2F0] bg-white">
                    <button
                      onClick={() => setExpandedMobileSegment(expandedMobileSegment === "life" ? null : "life")}
                      className="w-full flex items-center justify-between px-3.5 py-3 text-xs font-bold text-[#142C54] bg-slate-50 border-b border-slate-100"
                    >
                      <span className="flex items-center space-x-2">
                        <span>⏳</span>
                        <span>Life & Pension Insurance</span>
                      </span>
                      <ChevronDown className={`h-4 w-4 text-[#316EC9] transition-transform ${expandedMobileSegment === "life" ? "rotate-180" : ""}`} />
                    </button>
                    {expandedMobileSegment === "life" && (
                      <div className="p-2 space-y-1.5 bg-white">
                        {PRODUCT_CATEGORIES.filter(c => c.id === "life-pension" || c.id === "employee-benefits").map(cat => {
                          const isExpanded = expandedMobileCategory === cat.id;
                          const catProducts = allProducts.filter(p => p.category === cat.id);
                          return (
                            <div key={cat.id} className="border border-slate-200 rounded-none overflow-hidden">
                              <button
                                onClick={() => setExpandedMobileCategory(isExpanded ? null : cat.id)}
                                className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-[#142C54] hover:bg-slate-50"
                              >
                                <span className="flex items-center space-x-2">
                                  <span>{cat.icon}</span>
                                  <span>{cat.name}</span>
                                </span>
                                <ChevronDown className={`h-3 w-3 text-[#316EC9] transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                              </button>
                              {isExpanded && (
                                <div className="bg-slate-50 px-3 py-2 border-t border-slate-100 space-y-1">
                                  <button
                                    onClick={() => selectCategoryAction(cat.id)}
                                    className="w-full text-left text-[10px] font-bold text-[#316EC9] uppercase tracking-wider py-1 hover:underline"
                                  >
                                    Explore all {cat.name} →
                                  </button>
                                  <div className="grid grid-cols-1 gap-1 pt-1 border-t border-slate-200">
                                    {catProducts.map(p => (
                                      <button
                                        key={p.id}
                                        onClick={() => selectProductAction(p.id)}
                                        className="w-full text-left text-xs font-mono text-[#142C54] hover:text-[#316EC9] py-1 pl-2 border-l border-slate-300"
                                      >
                                        {p.name}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                </div>
              </div>
            )}

            {/* 3. General Links */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#D8E2F0]">
              <button
                onClick={() => routeTab("home")}
                className={`py-3 px-3 text-center text-xs uppercase tracking-widest font-bold border ${
                  activeTab === "home" ? "bg-[#142C54] text-white border-[#142C54]" : "bg-white border-[#D8E2F0] text-gray-700"
                }`}
              >
                Home
              </button>
              
              <button
                onClick={() => routeTab("claims")}
                className={`py-3 px-3 text-center text-xs uppercase tracking-widest font-bold border ${
                  activeTab === "claims" ? "bg-[#142C54] text-white border-[#142C54]" : "bg-white border-[#D8E2F0] text-gray-700"
                }`}
              >
                Claims Centre
              </button>

              <button
                onClick={() => routeTab("portal")}
                className={`py-3 px-3 text-center text-xs uppercase tracking-widest font-bold border ${
                  activeTab === "portal" ? "bg-[#142C54] text-white border-[#142C54]" : "bg-white border-[#D8E2F0] text-gray-700"
                }`}
              >
                Customer Portal
              </button>

              <button
                onClick={() => routeTab("room-analyzer")}
                className={`py-3 px-3 text-center text-xs uppercase tracking-widest font-bold border ${
                  activeTab === "room-analyzer" ? "bg-[#142C54] text-white border-[#142C54]" : "bg-white border-[#D8E2F0] text-gray-700"
                }`}
              >
                AI Home Organizer
              </button>
            </div>

            {/* 4. Action buttons */}
            <div className="space-y-2 pt-1">
              {/* Universal Get a Quote Button */}
              <button
                onClick={() => routeTab("get-a-quote")}
                className="w-full py-3.5 bg-[#142C54] text-white uppercase font-mono tracking-widest text-xs font-bold text-center border border-[#142C54]"
              >
                Get a Quote
              </button>

              {/* Admin Panel button */}
              <button
                onClick={() => routeTab("admin")}
                className="w-full py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 uppercase tracking-wider text-[10px] font-bold text-center"
              >
                ⚙️ Workspace Admin Portal
              </button>

              {/* Hotlines */}
              <div className="text-center bg-[#FAF9F6] border border-[#D8E2F0] p-3 text-xs leading-relaxed text-[#142C54]">
                <span className="block text-[9px] uppercase tracking-wider text-[#8C887D] font-bold font-mono">Emergency hotlines dispatch</span>
                <span>☎️ 0732 228908 | 📞 +254 707 798701</span>
              </div>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
