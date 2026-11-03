import React, { useState } from "react";
import { portalApi, type PortalError } from "../../portalApi";

const inputClass = "w-full bg-white rounded-none border border-[#D8E2F0] p-2.5 text-xs text-slate-800 focus:border-[#316EC9] focus:outline-none";
const labelClass = "text-[9px] uppercase tracking-wider text-[#8C887D] font-bold";
const button = "uppercase tracking-widest text-[10px] font-bold px-4 py-2.5 cursor-pointer disabled:opacity-60";

/** Add or remove two-step verification: a 6-digit code from an authenticator app on the client's phone. */
export function PortalSecurity({ enabled, onChanged }: { enabled: boolean; onChanged: () => void }) {
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string; qrSvg: string } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(null);
    try { await fn(); } catch (err) { setError((err as PortalError).message); } finally { setBusy(false); }
  }

  return (
    <div className="border border-[#D8E2F0] bg-white p-5 space-y-4 rounded-none max-w-2xl">
      <h4 className="font-serif italic text-base text-[#316EC9] border-b border-[#D8E2F0] pb-2">Two-step verification</h4>
      {error && <p role="alert" className="border border-red-300 bg-red-50 p-2.5 text-xs text-red-800">{error}</p>}
      {message && <p role="status" className="border border-emerald-300 bg-emerald-50 p-2.5 text-xs text-emerald-800">{message}</p>}

      {!enabled && !setup && (
        <div className="space-y-3 text-xs text-[#5E5A51]">
          <p>Protect your account with a second step: a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…) on your phone. Someone who learns your password still cannot sign in without it.</p>
          <button type="button" disabled={busy} onClick={() => run(async () => { setSetup(await portalApi.mfaSetup()); setMessage(null); })} className={`${button} bg-[#142C54] hover:bg-[#316EC9] text-white`}>{busy ? "Preparing…" : "Set up two-step verification"}</button>
        </div>
      )}

      {!enabled && setup && (
        <form className="space-y-3 text-xs" aria-label="Confirm two-step verification" onSubmit={(e) => { e.preventDefault(); run(async () => { await portalApi.mfaEnable(code); setSetup(null); setCode(""); setMessage("Two-step verification is on. You will be asked for a code each time you sign in."); onChanged(); }); }}>
          <ol className="list-decimal pl-5 space-y-1 text-[#5E5A51]"><li>Open your authenticator app and add an account by scanning this code.</li><li>Type the 6-digit code it shows to finish.</li></ol>
          <div className="flex flex-wrap items-center gap-4">
            <img alt="QR code to scan with your authenticator app" className="h-44 w-44 border border-[#D8E2F0] bg-white p-1" src={`data:image/svg+xml;utf8,${encodeURIComponent(setup.qrSvg)}`} />
            <div className="space-y-1"><p className="text-[10px] text-[#8C887D]">Cannot scan? Enter this key instead:</p><p className="font-mono text-sm tracking-wider text-[#1A1A1A]" aria-label="Setup key">{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</p></div>
          </div>
          <div className="space-y-1.5 max-w-40"><label htmlFor="mfa-code" className={labelClass}>6-digit code</label><input id="mfa-code" required inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} className={`${inputClass} font-mono text-base tracking-widest`} /></div>
          <div className="flex gap-2"><button type="submit" disabled={busy} className={`${button} bg-[#142C54] hover:bg-[#316EC9] text-white`}>{busy ? "Checking…" : "Turn on"}</button><button type="button" onClick={() => { setSetup(null); setCode(""); }} className={`${button} border border-[#D8E2F0] bg-white text-[#1A1A1A]`}>Cancel</button></div>
        </form>
      )}

      {enabled && (
        <form className="space-y-3 text-xs" aria-label="Turn off two-step verification" onSubmit={(e) => { e.preventDefault(); run(async () => { await portalApi.mfaDisable(password, code); setPassword(""); setCode(""); setMessage("Two-step verification is off."); onChanged(); }); }}>
          <p className="text-[#5E5A51]">Two-step verification is <strong className="text-emerald-800">on</strong>. To turn it off, confirm with your password and a current code.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><label htmlFor="mfa-off-password" className={labelClass}>Password</label><input id="mfa-off-password" required type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} /></div>
            <div className="space-y-1.5"><label htmlFor="mfa-off-code" className={labelClass}>Current 6-digit code</label><input id="mfa-off-code" required inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} className={`${inputClass} font-mono tracking-widest`} /></div>
          </div>
          <button type="submit" disabled={busy} className={`${button} bg-red-700 hover:bg-red-800 text-white`}>{busy ? "Working…" : "Turn off"}</button>
        </form>
      )}
    </div>
  );
}
