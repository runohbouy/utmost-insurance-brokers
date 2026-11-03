import React, { useState } from "react";
import { User } from "lucide-react";
import { portalApi, setPortalToken, PortalError, type PortalConfig } from "../../portalApi";

const inputClass = "w-full bg-white rounded-none border border-[#D8E2F0] p-2.5 text-slate-800 focus:border-[#316EC9] focus:outline-none";
const labelClass = "text-[9px] uppercase tracking-wider text-[#8C887D]";

/** Sign in with the email and password the brokerage set up. There is no way in without a real account. */
export function PortalLogin({ config, onSignedIn }: { config: PortalConfig | null; onSignedIn: (mustChangePassword: boolean) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const disabled = config !== null && !config.portalEnabled;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const session = await portalApi.login(email.trim(), password, needsCode ? code : undefined);
      setPortalToken(session.token);
      onSignedIn(session.mustChangePassword);
    } catch (err) {
      const e2 = err as PortalError;
      if (e2.mfaRequired) {
        setError(needsCode ? e2.message : null); // asking for the code the first time is not an error
        setNeedsCode(true);
        setCode("");
        return;
      }
      setError(e2.status === 401 ? "That email and password do not match. If you have forgotten your password, ask your broker to reset it." : e2.status === 429 ? "Too many attempts. Please wait a few minutes and try again." : e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto border border-[#D8E2F0] bg-[#FAF9F6] p-6 sm:p-8 space-y-6 rounded-none" id="loggedout-prompt-box">
      <div className="text-center space-y-2 pb-2 border-b border-[#D8E2F0]">
        <div className="border border-[#D8E2F0] w-12 h-12 flex items-center justify-center bg-white mx-auto rounded-none"><User className="h-6 w-6 text-[#316EC9]" aria-hidden="true" /></div>
        <h2 className="text-xl font-serif italic text-[#1A1A1A]">Sign in to your account</h2>
        <p className="text-xs text-[#8C887D] max-w-md mx-auto leading-relaxed">
          Use the email address your broker registered for you. You will see your own policies, invoices and payments, and nothing else.
        </p>
      </div>

      {disabled ? (
        <p role="status" className="text-sm text-[#5E5A51] text-center">Online accounts are not available yet. Please contact us and we will help you directly.</p>
      ) : (
        <form onSubmit={submit} className="space-y-4 text-xs font-semibold" aria-label="Sign in">
          {error && <p role="alert" className="border border-red-300 bg-red-50 p-2.5 text-red-800 font-normal">{error}</p>}
          {needsCode ? (
            <div className="space-y-1.5">
              <p className="font-normal text-[#5E5A51] text-xs">Two-step verification is on for {email}. Enter the 6-digit code from your authenticator app.</p>
              <label htmlFor="portal-code" className={labelClass}>6-digit code *</label>
              <input id="portal-code" required autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} className={`${inputClass} font-mono text-base tracking-widest`} />
            </div>
          ) : (<>
          <div className="space-y-1.5">
            <label htmlFor="portal-email" className={labelClass}>Email *</label>
            <input id="portal-email" type="email" required autoComplete="username" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="portal-password" className={labelClass}>Password *</label>
            <input id="portal-password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
          </div>
          </>)}
          <button type="submit" disabled={busy} className="w-full bg-[#142C54] hover:bg-[#316EC9] text-white border border-[#142C54] hover:border-[#316EC9] font-bold py-3.5 text-[10px] uppercase tracking-widest rounded-none transition-all cursor-pointer disabled:opacity-60" id="dash-login-button">
            {busy ? "Signing in…" : needsCode ? "Verify and sign in" : "Sign in"}
          </button>
        </form>
      )}

      <p className="text-center font-mono text-[9px] text-[#8C887D] uppercase tracking-wider border-t border-[#D8E2F0] pt-3">
        Protected under certified Kenyan ODPC controller license 04487/2.
      </p>
    </div>
  );
}

/** First sign-in (or after a reset) uses a one-time password; it has to be replaced before anything else is shown. */
export function ForcedPasswordChange({ email, onDone }: { email: string; onDone: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) return setError("The two new passwords do not match.");
    setBusy(true);
    try {
      await portalApi.changePassword(current, next);
      onDone();
    } catch (err) {
      const e2 = err as PortalError;
      setError(e2.problemType === "wrong-current-password" ? "The one-time password you typed is not right." : e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto border border-[#D8E2F0] bg-[#FAF9F6] p-6 sm:p-8 space-y-5 rounded-none">
      <div className="space-y-1.5 pb-2 border-b border-[#D8E2F0]">
        <h2 className="text-xl font-serif italic text-[#1A1A1A]">Choose your own password</h2>
        <p className="text-xs text-[#8C887D] leading-relaxed">Signed in as {email}. For your security, replace the one-time password you were given. Use at least 12 characters with letters and numbers.</p>
      </div>
      <form onSubmit={submit} className="space-y-4 text-xs font-semibold" aria-label="Change password">
        {error && <p role="alert" className="border border-red-300 bg-red-50 p-2.5 text-red-800 font-normal">{error}</p>}
        <div className="space-y-1.5"><label htmlFor="pw-current" className={labelClass}>One-time password *</label><input id="pw-current" type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={inputClass} /></div>
        <div className="space-y-1.5"><label htmlFor="pw-new" className={labelClass}>New password *</label><input id="pw-new" type="password" required minLength={12} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={inputClass} /></div>
        <div className="space-y-1.5"><label htmlFor="pw-confirm" className={labelClass}>Repeat new password *</label><input id="pw-confirm" type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} /></div>
        <button type="submit" disabled={busy} className="w-full bg-[#142C54] hover:bg-[#316EC9] text-white font-bold py-3.5 text-[10px] uppercase tracking-widest rounded-none cursor-pointer disabled:opacity-60">{busy ? "Saving…" : "Save password and continue"}</button>
      </form>
    </div>
  );
}
