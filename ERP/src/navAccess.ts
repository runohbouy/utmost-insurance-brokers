// Which menu items a person sees. One place, used by the sidebar and by scripts/test-users.ts, so what a
// test report says a role can see is exactly what the dashboard shows.
//
// A screen shows when the role has its view.<screen> permission (migrate-029) AND, for screens that expose
// sensitive data, the person holds ANY of the permissions listed here, AND the tenant's plan includes the
// module. This is only the menu: the server enforces permissions on every API route regardless.

export const ALL_VIEWS = [
  "dashboard", "analytics", "parties", "opportunities", "producers", "correspondence", "placement", "policies", "renewals", "insurers",
  "claims", "complaints", "finance", "receipts", "documents", "tasks", "obligations", "hr", "settings",
] as const;
export type ViewId = (typeof ALL_VIEWS)[number];

export const NAV_PERMISSIONS: Partial<Record<ViewId, string[]>> = {
  finance: ["finance.view"],
  receipts: ["finance.view"],
  analytics: ["analytics.view", "analytics.finance"],
  settings: ["tenant_config.manage", "portal.manage"],
};
export const NAV_MODULES: Partial<Record<ViewId, string>> = { receipts: "finance", analytics: "analytics" };

export function canSeeView(id: ViewId, permissions: readonly string[], hasModule: (name: string) => boolean = () => true): boolean {
  if (!permissions.includes(`view.${id}`)) return false;
  const needs = NAV_PERMISSIONS[id];
  if (needs && !needs.some((p) => permissions.includes(p))) return false;
  const module = NAV_MODULES[id];
  return !module || hasModule(module);
}

export const visibleViews = (permissions: readonly string[], hasModule?: (name: string) => boolean): ViewId[] =>
  ALL_VIEWS.filter((id) => canSeeView(id, permissions, hasModule));
