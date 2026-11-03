import { useState } from "react";
import { api } from "../api";
import { ErrorNotice, Field, SuccessNotice, inputClass, primaryButton, secondaryButton, dangerButton } from "./ui";

type Setup = { secret: string; otpauthUrl: string; qrSvg: string };
const group = (secret: string) => secret.replace(/(.{4})/g, "$1 ").trim();

/**
 * Turn two-step verification (an authenticator app such as Google Authenticator, Microsoft Authenticator or
 * 1Password) on or off for the signed-in person. Used by the Security dialog and by the full-screen gate shown
 * when the organisation requires it.
 */
export default function MfaPanel({ enabled, onChanged, intro }: { enabled: boolean; onChanged: () => void | Promise<void>; intro?: string }) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(null);
    try { await fn(); } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  }

  const start = () => run(async () => { setSetup(await api.auth.mfaSetup()); setMessage(null); });
  const confirm = (e: React.FormEvent) => { e.preventDefault(); return run(async () => {
    await api.auth.mfaEnable(code);
    setSetup(null); setCode("");
    setMessage("Two-step verification is on. You will be asked for a code each time you sign in.");
    await onChanged();
  }); };
  const turnOff = (e: React.FormEvent) => { e.preventDefault(); return run(async () => {
    await api.auth.mfaDisable(password, code);
    setPassword(""); setCode("");
    setMessage("Two-step verification is off.");
    await onChanged();
  }); };

  return (
    <div className="space-y-4 text-sm">
      {intro && <p className="text-slate-600">{intro}</p>}
      <ErrorNotice message={error} onDismiss={() => setError(null)} />
      <SuccessNotice message={message} />

      {!enabled && !setup && (
        <div className="space-y-2">
          <p className="text-slate-600">Add a second step to signing in: a 6-digit code from an authenticator app on your phone. A stolen password alone then cannot get in.</p>
          <button type="button" disabled={busy} onClick={start} className={primaryButton}>{busy ? "Preparing…" : "Set up two-step verification"}</button>
        </div>
      )}

      {!enabled && setup && (
        <form onSubmit={confirm} className="space-y-3" aria-label="Confirm two-step verification">
          <ol className="list-decimal space-y-1 pl-5 text-slate-600">
            <li>Open your authenticator app and add an account by scanning this code.</li>
            <li>Type the 6-digit code it shows to finish.</li>
          </ol>
          <div className="flex flex-wrap items-center gap-4">
            <img alt="QR code to scan with your authenticator app" className="h-44 w-44 rounded border border-slate-200 bg-white p-1" src={`data:image/svg+xml;utf8,${encodeURIComponent(setup.qrSvg)}`} />
            <div className="space-y-1">
              <p className="text-xs text-slate-500">Can't scan? Enter this key instead:</p>
              <p className="font-mono text-sm tracking-wider text-slate-900" aria-label="Setup key">{group(setup.secret)}</p>
              <a className="text-xs text-indigo-700 hover:underline" href={setup.otpauthUrl}>Open in an authenticator app on this device</a>
            </div>
          </div>
          <Field label="6-digit code"><input required inputMode="numeric" autoComplete="one-time-code" pattern="\d{3} ?\d{3}" maxLength={7} className={`${inputClass} max-w-40 font-mono tracking-widest`} value={code} onChange={(e) => setCode(e.target.value)} /></Field>
          <div className="flex gap-2"><button type="submit" disabled={busy} className={primaryButton}>{busy ? "Checking…" : "Turn on"}</button><button type="button" onClick={() => { setSetup(null); setCode(""); }} className={secondaryButton}>Cancel</button></div>
        </form>
      )}

      {enabled && (
        <form onSubmit={turnOff} className="space-y-3 border-t border-slate-100 pt-3" aria-label="Turn off two-step verification">
          <p className="text-slate-600">Two-step verification is <span className="font-medium text-emerald-700">on</span>. To turn it off, confirm with your password and a current code.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Password"><input required type="password" autoComplete="current-password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            <Field label="Current 6-digit code"><input required inputMode="numeric" autoComplete="one-time-code" maxLength={7} className={`${inputClass} font-mono tracking-widest`} value={code} onChange={(e) => setCode(e.target.value)} /></Field>
          </div>
          <button type="submit" disabled={busy} className={dangerButton}>{busy ? "Working…" : "Turn off"}</button>
        </form>
      )}
    </div>
  );
}
