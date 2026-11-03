import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "./api";
import { Money } from "../lib/money";
import type { MoneyDto, PublicConfig } from "./financeTypes";

// ---------------------------------------------------------------------------
// The signed-in tenant's published configuration, available to every screen:
//   * brand       applied as CSS custom properties (see index.css, which maps the
//                 theme colours onto them) and the document title
//   * money       formatted in the tenant's currency and locale; parsed exactly
//   * dates       shown in the tenant's time zone, never the browser's
// Nothing here guesses: until the configuration has loaded, `ready` is false and
// formatting falls back to plain digits rather than a made-up currency.
// ---------------------------------------------------------------------------
export interface TenantValue {
  ready: boolean;
  config: PublicConfig | null;
  currency: string | null;
  /** Format minor units (or an API money object) for display. */
  money: (value: number | MoneyDto) => string;
  /** Parse what a person typed ("1,250.50") into exact minor units, or null if it is not a valid amount. */
  parseMoney: (text: string) => number | null;
  /** An instant (ISO 8601) in the tenant's zone. */
  dateTime: (iso: string | null | undefined) => string;
  /** A calendar day (YYYY-MM-DD) with no time zone shifting. */
  day: (value: string | null | undefined) => string;
  /** Today's date in the tenant's zone, YYYY-MM-DD. */
  today: () => string;
  hasModule: (name: string) => boolean;
  reload: () => void;
}

const FALLBACK: TenantValue = {
  ready: false, config: null, currency: null,
  money: (v) => (typeof v === "number" ? String(v) : v.display),
  parseMoney: () => null, dateTime: (iso) => iso ?? "—", day: (d) => d ?? "—", today: () => new Date().toISOString().slice(0, 10),
  hasModule: () => true, reload: () => undefined,
};

const TenantContext = createContext<TenantValue>(FALLBACK);
export const useTenant = () => useContext(TenantContext);

export function applyBrand(brand: PublicConfig["brand"] | null) {
  const root = document.documentElement;
  const vars: Record<string, string | null> = {
    "--brand-primary": brand?.primaryColor ?? null, "--brand-on-primary": brand?.onPrimaryColor ?? null, "--brand-accent": brand?.accentColor ?? null,
    "--brand-surface": brand?.surfaceColor ?? null, "--brand-text": brand?.textColor ?? null, "--brand-font": brand?.fontFamily ?? null,
  };
  for (const [name, value] of Object.entries(vars)) {
    if (value) root.style.setProperty(name, value); else root.style.removeProperty(name);
  }
  if (brand) document.title = `${brand.displayName} — Operations`;
}

export function TenantProvider({ signedIn, children }: { signedIn: boolean; children: ReactNode }) {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!signedIn) { setConfig(null); applyBrand(null); return; }
    let live = true;
    api.tenantConfig.effective().then((c) => { if (live) { setConfig(c); applyBrand(c.brand); } }).catch(() => { /* the dashboard still works; money shows as plain digits */ });
    return () => { live = false; };
  }, [signedIn, reloadKey]);

  const value = useMemo<TenantValue>(() => {
    if (!config) return FALLBACK;
    const { currency, timeZone } = config.regional;
    const locale = config.localization.locale;
    const dateTimeFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone });
    const dayFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" });
    const todayFmt = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    return {
      ready: true, config, currency,
      money: (v) => (typeof v === "number" ? Money.of(v, currency).format(locale) : v.display),
      parseMoney: (text) => {
        const cleaned = text.replace(/[,\s]/g, "");
        if (!cleaned) return null;
        try { return Money.fromMajor(cleaned, currency).minor; } catch { return null; }
      },
      dateTime: (iso) => (iso ? dateTimeFmt.format(new Date(iso)) : "—"),
      day: (d) => (d ? dayFmt.format(new Date(`${d}T12:00:00Z`)) : "—"),
      today: () => todayFmt.format(new Date()),
      hasModule: (name) => config.modules.includes(name),
      reload: () => setReloadKey((k) => k + 1),
    };
  }, [config]);

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}
