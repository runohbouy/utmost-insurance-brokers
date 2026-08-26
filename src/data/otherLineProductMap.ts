// Maps specific catalog products (allProducts.ts) onto the real proposal-form-informed intake
// built in OtherLinesQuoteView, so a customer clicking "Get Quote" on that product's own detail
// page (ProductDetailsView) or picking it in the "Fast Online Forms" quiz (GetAQuoteView) lands
// on the matching underwriting questionnaire instead of the generic "adviser will call" flow.
// Single source of truth - both entry points import this so they can't drift apart.
//
// Only products with a confirmed, sourced proposal form (see otherLineFormDefs.ts) are listed
// here. Related-but-distinct products (e.g. Homeowners, Tenant's Contents, Landlord Insurance)
// are deliberately left off rather than pointed at the Domestic Package form, since none of
// those have their own sourced proposal form yet.
export const PRODUCT_TO_OTHER_LINE: Record<string, { category: string; subType: string }> = {
  "domestic-package": { category: "domestic_package", subType: "domestic_package_standard" },
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
  "burglary-housebreaking": { category: "theft", subType: "burglary" },
  "fire-perils": { category: "fire", subType: "fire_industrial" },
  "cash-in-transit": { category: "miscellaneous", subType: "money" },
  "international-travel-schengen": { category: "miscellaneous", subType: "travel_insurance" },
  "education-savings-plan": { category: "investment", subType: "education_plan" }
};
