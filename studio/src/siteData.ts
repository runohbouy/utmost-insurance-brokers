import { useCallback, useEffect, useState } from "react";
import { SITE_API } from "./api";

// Insurers, quote-engine settings and rates all come from the backend's database;
// nothing here is bundled with the site, so there is a single copy to maintain.

export interface InsurerProfile {
  id: string;
  name: string;
  tradingName: string;
  logoEmoji: string;
  established: number;
  licenseYear: number;
  licenseStatus: "Active" | "Under Review" | string;
  iraLicenseMotor: string;
  iraLicenseMedical: string;
  odpcRegistered: boolean;
  memberOfAibk: boolean;
  rating: string;
  strengthReason: string;
  availableProducts: string[];
  claimTurnaroundDays: number;
  emergencyPhone: string;
  // IRA class codes this insurer is authorised to transact. Missing = "not yet verified",
  // not "not licensed".
  licensedGeneralClasses?: string[];
  licensedLifeClasses?: string[];
  isCustom?: boolean;
  // false = a carrier we only know by name and licensed classes (no marketing profile).
  // The rates desk lists these; the public insurer pages do not.
  profileComplete?: boolean;
}

export interface OtherLineCategory {
  id: string;
  label: string;
  code: string;
  kind: "general" | "life";
}

export interface AgeBand { min: number; max: number }

export interface SiteConfig {
  otherLineCategories: OtherLineCategory[];
  otherLineLiveCategoryIds: string[];
  medical: { memberAgeBands: AgeBand[]; outpatientAgeBands: AgeBand[] };
}

// One request per page load, shared by every component that asks.
let configPromise: Promise<SiteConfig> | null = null;

export function loadSiteConfig(): Promise<SiteConfig> {
  if (!configPromise) {
    configPromise = fetch(`${SITE_API}/config`)
      .then((r) => {
        if (!r.ok) throw new Error(`config ${r.status}`);
        return r.json() as Promise<SiteConfig>;
      })
      .catch((err) => {
        configPromise = null; // let the next caller retry
        throw err;
      });
  }
  return configPromise;
}

/** null until the settings have loaded (or if the backend can't be reached). */
export function useSiteConfig(): SiteConfig | null {
  const [config, setConfig] = useState<SiteConfig | null>(null);
  useEffect(() => {
    let live = true;
    loadSiteConfig().then((c) => live && setConfig(c)).catch(() => {});
    return () => { live = false; };
  }, []);
  return config;
}

/** Every insurer the backend knows for the website (empty until loaded). `reload` re-fetches after an admin edit. */
export function useInsurers(): { insurers: InsurerProfile[]; loaded: boolean; reload: () => Promise<void> } {
  const [insurers, setInsurers] = useState<InsurerProfile[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`${SITE_API}/insurers`);
      const data = res.ok ? await res.json() : [];
      setInsurers(Array.isArray(data) ? data : []);
    } catch {
      setInsurers([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);
  return { insurers, loaded, reload };
}
