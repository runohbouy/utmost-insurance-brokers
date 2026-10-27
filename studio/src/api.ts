// The website has no server of its own: every call goes to the ERP backend's
// public website API (/api/site/*). In development Vite proxies /api to the ERP
// (see vite.config.ts), so VITE_API_URL stays empty. In production set
// VITE_API_URL to the ERP's public origin, e.g. https://erp.utmostkenya.com
// (the ERP must list this site's origin in its ALLOWED_ORIGIN).
const API_ORIGIN = ((import.meta as any).env?.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export const SITE_API = `${API_ORIGIN}/api/site`;

// Files the backend serves (e.g. uploaded insurer logos) come back as
// root-relative "/api/site/files/..." paths; point them at the backend origin.
export function backendAssetUrl(src: string): string {
  return src.startsWith("/api/") ? `${API_ORIGIN}${src}` : src;
}
