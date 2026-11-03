import React, { useCallback, useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import type { ActiveTab, InsuranceQuote, RoomAnalysis } from "../types";
import { portalApi, portalToken, setPortalToken, type PortalConfig, type PortalMe } from "../portalApi";
import { ForcedPasswordChange, PortalLogin } from "./portal/PortalLogin";
import { PortalAccount } from "./portal/PortalAccount";
import { SavedWork } from "./portal/SavedWork";

interface PortalDashboardViewProps {
  setActiveTab: (tab: ActiveTab) => void;
  selectedQuote: InsuranceQuote | null;
  savedAnalysis: RoomAnalysis | null;
}

type Phase = "checking" | "signed-out" | "must-change" | "signed-in";

/**
 * The customer's own account. Everything on it comes from the brokerage's system through the
 * client portal API, scoped by the server to the signed-in client — there is no demo data and no
 * way to see another client's records.
 */
export default function PortalDashboardView({ setActiveTab, selectedQuote, savedAnalysis }: PortalDashboardViewProps) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [config, setConfig] = useState<PortalConfig | null>(null);
  const [me, setMe] = useState<PortalMe | null>(null);

  const signOut = useCallback(() => {
    setPortalToken(null);
    setMe(null);
    setPhase("signed-out");
  }, []);

  const enter = useCallback(async () => {
    try {
      const profile = await portalApi.me();
      setMe(profile);
      setPhase(profile.mustChangePassword ? "must-change" : "signed-in");
    } catch {
      signOut(); // an expired or revoked session simply lands on the sign-in form
    }
  }, [signOut]);

  useEffect(() => {
    portalApi.config().then(setConfig).catch(() => setConfig(null));
    if (portalToken()) enter(); else setPhase("signed-out");
  }, [enter]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 font-sans text-left space-y-10" id="portal-dashboard">
      <div className="border-b border-[#D8E2F0] pb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="text-left">
          <p className="text-[10px] uppercase font-bold text-[#316EC9] tracking-[0.25em] mb-1 font-mono">Self-service</p>
          <h1 className="text-3xl font-serif italic tracking-tight text-[#1A1A1A]">{config?.name ?? "Utmost"} customer account</h1>
          <p className="mt-1.5 text-xs text-[#8C887D] max-w-4xl leading-relaxed">
            See what you owe, the payments we have received, your policies and a statement of your account.
          </p>
        </div>
        {(phase === "signed-in" || phase === "must-change") && (
          <button type="button" onClick={signOut} className="self-start md:self-center uppercase tracking-wider bg-white border border-[#D8E2F0] text-[#1A1A1A] font-bold px-4 py-2 hover:bg-[#F0F5FC] text-[10px] rounded-none flex items-center space-x-1.5 cursor-pointer">
            <LogOut className="h-3.5 w-3.5 text-[#316EC9]" aria-hidden="true" />
            <span>Sign out</span>
          </button>
        )}
      </div>

      {phase === "checking" && <p className="text-xs text-[#8C887D] italic" role="status">Checking your session…</p>}
      {phase === "signed-out" && <PortalLogin config={config} onSignedIn={() => enter()} />}
      {phase === "must-change" && me && <ForcedPasswordChange email={me.email} onDone={() => enter()} />}
      {phase === "signed-in" && me && config && (
        <PortalAccount me={me} config={config} onSecurityChanged={() => enter()} savedWork={<SavedWork setActiveTab={setActiveTab} selectedQuote={selectedQuote} savedAnalysis={savedAnalysis} />} />
      )}
      {phase === "signed-in" && me && !config && (
        <p role="alert" className="border border-red-300 bg-red-50 p-2.5 text-xs text-red-800">We could not load the account settings. Please refresh the page.</p>
      )}
    </div>
  );
}
