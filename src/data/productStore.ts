import { Product, DEFAULT_PRODUCTS } from "./allProducts";

export function getStoredProducts(): Product[] {
  try {
    const data = localStorage.getItem("utmost_insurance_products");
    if (data) {
      const parsed = JSON.parse(data) as Product[];
      // Dynamic synchronization: ensure new classes (such as fidelity-guarantee) are auto-populated
      const parsedIds = new Set(parsed.map(p => p.id));
      const missing = DEFAULT_PRODUCTS.filter(p => !parsedIds.has(p.id));
      if (missing.length > 0) {
        const updated = [...parsed, ...missing];
        saveProducts(updated);
        return updated;
      }
      return parsed;
    }
  } catch (error) {
    console.error("Error reading products from localStorage", error);
  }
  // If not seeded, seed and return
  saveProducts(DEFAULT_PRODUCTS);
  return DEFAULT_PRODUCTS;
}

export function saveProducts(products: Product[]): void {
  try {
    localStorage.setItem("utmost_insurance_products", JSON.stringify(products));
  } catch (error) {
    console.error("Error saving products to localStorage", error);
  }
}
