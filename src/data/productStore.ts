import { Product, DEFAULT_PRODUCTS } from "./allProducts";

const STORAGE_KEY = "utmost_insurance_products";
const VERSION_KEY = "utmost_insurance_products_version";

// Cheap deterministic hash of DEFAULT_PRODUCTS content. Used to auto-invalidate
// the localStorage cache whenever the catalog's source content changes (e.g. a
// corrected required-document list or updated cover/exclusion text) - without
// this, a browser that already cached the old catalog would keep showing stale
// content indefinitely, since the old merge logic only ever appended brand-new
// product ids and never refreshed the fields on existing ones.
function computeCatalogVersion(): string {
  const str = JSON.stringify(DEFAULT_PRODUCTS);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return String(hash);
}

export function getStoredProducts(): Product[] {
  try {
    const currentVersion = computeCatalogVersion();
    const storedVersion = localStorage.getItem(VERSION_KEY);
    const data = localStorage.getItem(STORAGE_KEY);

    if (data && storedVersion === currentVersion) {
      // Cache matches the current source content - safe to use as-is, including
      // any admin-side edits made via the Product Catalog Manager.
      const parsed = JSON.parse(data) as Product[];
      const parsedIds = new Set(parsed.map(p => p.id));
      const missing = DEFAULT_PRODUCTS.filter(p => !parsedIds.has(p.id));
      if (missing.length > 0) {
        const updated = [...parsed, ...missing];
        saveProducts(updated);
        return updated;
      }
      return parsed;
    }

    // No cache, or the source content has changed since it was cached - reseed
    // from DEFAULT_PRODUCTS so corrected content always reaches the browser.
    saveProducts(DEFAULT_PRODUCTS);
    return DEFAULT_PRODUCTS;
  } catch (error) {
    console.error("Error reading products from localStorage", error);
    return DEFAULT_PRODUCTS;
  }
}

export function saveProducts(products: Product[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
    localStorage.setItem(VERSION_KEY, computeCatalogVersion());
  } catch (error) {
    console.error("Error saving products to localStorage", error);
  }
}
