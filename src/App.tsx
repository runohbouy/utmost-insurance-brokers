import React, { useState, useEffect } from "react";
import { ActiveTab, InsuranceQuote, RoomAnalysis, ClaimSubmissionResponse } from "./types";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import HomeView from "./components/HomeView";
import RoomAnalyzerView from "./components/RoomAnalyzerView";
import QuoteJourneyView from "./components/QuoteJourneyView";
import OtherLinesQuoteView from "./components/OtherLinesQuoteView";
import ClaimsCentreView from "./components/ClaimsCentreView";
import PortalDashboardView from "./components/PortalDashboardView";
import AdminPortalView from "./components/AdminPortalView";
import StaffLoginGate from "./components/StaffLoginGate";
import WhatsAppWidget from "./components/WhatsAppWidget";

// Lazy-like or static import for all secondary pages
import InsuranceProductsView from "./components/InsuranceProductsView";
import GetAQuoteView from "./components/GetAQuoteView";
import ProductDetailsView from "./components/ProductDetailsView";
import CategoryDetailsView from "./components/CategoryDetailsView";
import AboutView from "./components/AboutView";
import BusinessSolutionsView from "./components/BusinessSolutionsView";
import ContactView from "./components/ContactView";
import InsurersView from "./components/InsurersView";
import RenewalsView from "./components/RenewalsView";
import ResourcesView from "./components/ResourcesView";

import { AnimatePresence, motion } from "motion/react";

export default function App() {
  const [activeTab, setActiveTabState] = useState<ActiveTab>("home");
  const [selectedProductId, setSelectedProductId] = useState<string | null>("private-motor-comprehensive");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>("motor");
  const [lastSelectedQuote, setLastSelectedQuote] = useState<InsuranceQuote | null>(null);
  const [lastSavedAnalysis, setLastSavedAnalysis] = useState<RoomAnalysis | null>(null);
  const [lastRegisteredClaim, setLastRegisteredClaim] = useState<ClaimSubmissionResponse | null>(null);
  const [productsSegment, setProductsSegment] = useState<"general" | "health" | "life" | "all">("all");
  const [otherLineTarget, setOtherLineTarget] = useState<{ category: string; subType: string } | null>(null);

  // Unified page router state changer that scrolls window back to top 
  const setActiveTab = (tab: ActiveTab) => {
    setActiveTabState(tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Synchronize initial login setup for mock profile testing
  useEffect(() => {
    const isFirstRun = localStorage.getItem("utmost_app_seeded");
    if (!isFirstRun) {
      // Seed an initial mock data set for cleaner first inspection experience
      localStorage.setItem("utmost_app_seeded", "true");
      
      const seedScan = {
        id: "scan-initial",
        date: new Date().toLocaleDateString("en-KE") + " 08:30",
        img: "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&q=80&w=640",
        analysis: {
          roomType: "Living Room",
          clutterScore: 4,
          status: "Lightly Cluttered",
          organizationSuggestions: [
            "Bundle and route trailing electrical wires behind the sideboard using Velcro ties.",
            "De-bulk the main storage coffee table: keep only active literature and controllers.",
            "Incorporate a dedicated container for peripheral accessories near entry corridors."
          ],
          safetyHazards: [
            {
              hazardName: "Exposed multi-outlet power adapter",
              description: "High density power extension block laid directly beneath floor curtains. Poses dust combustion risk.",
              fixAction: "Relocate block 30cm off the ground using adhesive brackets and loop-tie power lines."
            }
          ],
          estimatedItems: [
            { itemName: "Varnished Mahogany Coffee Table", estimatedValueKES: 45000, insuranceTip: "Retain local carpenter receipts for custom carving." },
            { itemName: "Mid-century Fabric Sofa Suite", estimatedValueKES: 120000, insuranceTip: "Subject to standard 2-year wear depreciation profiles." },
            { itemName: "65-Inch Smart Television Display", estimatedValueKES: 85000, insuranceTip: "Incorporate surge-protector devices to secure premium electronic claims." }
          ],
          totalContentsValueKES: 250000,
          domesticPackageIndicativePremiumKES: 5850
        }
      };
      
      localStorage.setItem("utmost_analyzed_rooms", JSON.stringify([seedScan]));
    }
  }, []);

  const handleAnalysisSuccess = (analysis: RoomAnalysis, imageSrc: string) => {
    setLastSavedAnalysis(analysis);
    // Auto-save quotes calculated inside RoomAnalyzer list as saved quote
    const mockCreatedQuote: InsuranceQuote = {
      insurerId: "icea-domestic",
      insurerName: "ICEA LION Contents Plan",
      basePremium: Math.round(analysis.totalContentsValueKES * 0.012),
      pcf: Math.round(analysis.totalContentsValueKES * 0.012 * 0.0025),
      trainingLevy: Math.round(analysis.totalContentsValueKES * 0.012 * 0.002),
      stampDuty: 40,
      totalPremium: Math.round(analysis.totalContentsValueKES * 0.012 * 1.0045) + 40,
      excessTerms: "Accidental damage excess: KES 5,000 minimal per occurrence.",
      mainBenefits: [
        "Covers fire, burglaries, storm damages",
        "Includes KES 25,000 personal liability for guests",
        "No waiting periods for structural water damages"
      ],
      isRecommended: true,
      recommendationReason: "Optimally designed based on real-time detected inventory valuation of KES " + analysis.totalContentsValueKES.toLocaleString(),
      rating: "A+ CAR rated under IRA Kenya",
      sumInsured: analysis.totalContentsValueKES,
      waitingPeriod: "Immediate / Nil",
      priceTag: "Best Value"
    };
    setLastSelectedQuote(mockCreatedQuote);

    // Save mock quote inside client's portfolio
    try {
      const existingQuotesRaw = localStorage.getItem("utmost_saved_quotes");
      const existingQuotes = existingQuotesRaw ? JSON.parse(existingQuotesRaw) : [];
      const newQuoteItem = {
        id: `qt-${Date.now()}`,
        date: new Date().toLocaleDateString("en-KE"),
        quote: mockCreatedQuote
      };
      localStorage.setItem("utmost_saved_quotes", JSON.stringify([newQuoteItem, ...existingQuotes]));
    } catch (e) {
      console.error(e);
    }
  };

  const handleSavedOffer = async (quote: InsuranceQuote, category: "motor" | "medical") => {
    setLastSelectedQuote(quote);
    try {
      const existingQuotesRaw = localStorage.getItem("utmost_saved_quotes");
      const existingQuotes = existingQuotesRaw ? JSON.parse(existingQuotesRaw) : [];
      const newQuoteItem = {
        id: `qt-${Date.now()}`,
        date: new Date().toLocaleDateString("en-KE"),
        quote: quote
      };
      localStorage.setItem("utmost_saved_quotes", JSON.stringify([newQuoteItem, ...existingQuotes]));

      // POST to `/api/quotes` to persist quote to server-side `quoteDb.json`
      await fetch("/api/quotes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          clientId: "client-verification",
          status: "draft",
          sumInsuredKES: quote.sumInsured || 0,
          basePremiumKES: quote.basePremium || 0,
          pcfLevyKES: quote.pcf || 0,
          itlLevyKES: quote.trainingLevy || 0,
          stampDutyKES: quote.stampDuty || 0,
          totalPremiumKES: quote.totalPremium || 0,
          category: category,
          insurerId: quote.insurerId,
          insurerName: quote.insurerName,
          rateVersionRef: quote.rateVersionId || "rate-ver-1",
          vehicleUse: quote.vehicleUse || "private",
          vehicleType: quote.vehicleType || "saloon",
          isProvisionalRate: quote.isProvisionalRate || false,
          provisionalLoadingFactor: quote.provisionalLoadingFactor || 1.0,
          riderBreakdown: quote.riderBreakdown || {}
        })
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleClaimSuccess = (claim: ClaimSubmissionResponse) => {
    setLastRegisteredClaim(claim);
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] flex flex-col justify-between" id="applet-master">
      
      {/* NAVBAR STICKY CONTAINER */}
      <Navbar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        setSelectedProductId={setSelectedProductId}
        setSelectedCategoryId={setSelectedCategoryId}
        setProductsSegment={setProductsSegment}
        currentSegment={productsSegment}
      />

      {/* PRIMARY TRANSITION CONTENT CONTAINER */}
      <main className="flex-grow">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.28, ease: "easeInOut" }}
            id="tab-view-transition-wrapper"
          >
            {activeTab === "home" && (
              <HomeView setActiveTab={setActiveTab} />
            )}

            {activeTab === "room-analyzer" && (
              <RoomAnalyzerView 
                setActiveTab={setActiveTab} 
                onAnalysisSuccess={handleAnalysisSuccess} 
              />
            )}

            {activeTab === "motor-quotes" && (
              <QuoteJourneyView 
                initialCategory="motor" 
                setActiveTab={setActiveTab} 
                onSavedOffer={handleSavedOffer} 
              />
            )}

            {activeTab === "medical-quotes" && (
              <QuoteJourneyView 
                initialCategory="medical" 
                setActiveTab={setActiveTab} 
                onSavedOffer={handleSavedOffer} 
              />
            )}

            {activeTab === "other-lines-quotes" && (
              <OtherLinesQuoteView
                setActiveTab={setActiveTab}
                initialCategory={otherLineTarget?.category}
                initialSubType={otherLineTarget?.subType}
              />
            )}

            {activeTab === "claims" && (
              <ClaimsCentreView 
                setActiveTab={setActiveTab} 
                onClaimSuccess={handleClaimSuccess} 
              />
            )}

            {activeTab === "portal" && (
              <PortalDashboardView 
                setActiveTab={setActiveTab} 
                selectedQuote={lastSelectedQuote} 
                savedAnalysis={lastSavedAnalysis} 
              />
            )}

            {activeTab === "admin" && (
              <StaffLoginGate setActiveTab={setActiveTab}>
                {(staff, onLogout) => (
                  <AdminPortalView setActiveTab={setActiveTab} authenticatedStaff={staff} onLogout={onLogout} />
                )}
              </StaffLoginGate>
            )}

            {activeTab === "insurance-products" && (
              <InsuranceProductsView 
                setActiveTab={setActiveTab}
                initialSegment={productsSegment}
                onSelectCategory={(catId) => {
                  setSelectedCategoryId(catId);
                  setActiveTab("category-details");
                }}
                onSelectProduct={(prodId) => {
                  setSelectedProductId(prodId);
                  setActiveTab("product-details");
                }}
              />
            )}

            {activeTab === "category-details" && (
              <CategoryDetailsView 
                categoryId={selectedCategoryId || "motor"}
                setActiveTab={setActiveTab}
                onSelectProduct={(prodId) => {
                  setSelectedProductId(prodId);
                  setActiveTab("product-details");
                }}
              />
            )}

            {activeTab === "product-details" && (
              <ProductDetailsView 
                productId={selectedProductId || "private-motor-comprehensive"}
                setActiveTab={setActiveTab}
                setSelectedProductId={setSelectedProductId}
                onSelectProduct={(prodId) => {
                  setSelectedProductId(prodId);
                }}
              />
            )}

            {activeTab === "get-a-quote" && (
              <GetAQuoteView
                setActiveTab={setActiveTab}
                initialProductId={selectedProductId}
                onSelectProduct={(prodId) => {
                  setSelectedProductId(prodId);
                  setActiveTab("product-details");
                }}
                onRouteToOtherLine={(category, subType) => {
                  setOtherLineTarget({ category, subType });
                  setActiveTab("other-lines-quotes");
                }}
              />
            )}

            {activeTab === "about-us" && (
              <AboutView setActiveTab={setActiveTab} />
            )}

            {activeTab === "business-solutions" && (
              <BusinessSolutionsView setActiveTab={setActiveTab} />
            )}

            {activeTab === "contact-us" && (
              <ContactView setActiveTab={setActiveTab} />
            )}

            {activeTab === "insurers" && (
              <InsurersView setActiveTab={setActiveTab} />
            )}

            {activeTab === "renewals" && (
              <RenewalsView setActiveTab={setActiveTab} />
            )}

            {activeTab === "resources" && (
              <ResourcesView setActiveTab={setActiveTab} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* COMPLIANT REGULATORY FOOTER */}
      <Footer setActiveTab={setActiveTab} />

      {/* Persistent WhatsApp click-to-chat - hidden on the internal admin workspace */}
      {activeTab !== "admin" && <WhatsAppWidget />}

    </div>
  );
}
