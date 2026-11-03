import { useState } from "react";
import { ApiError } from "../api";
import { useTenant } from "../ConfigContext";

export default function LoginView({ onLogin }: { onLogin: (email: string, password: string, code?: string) => Promise<void> }) {
  const tenant = useTenant();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  // set once the server has seen a right password for an account that has two-step verification on
  const [needsCode, setNeedsCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onLogin(email, password, needsCode ? code : undefined);
    } catch (err: any) {
      if (err instanceof ApiError && err.mfaRequired) {
        // asking for the code is not an error the first time; a wrong code is
        setError(needsCode ? err.message : null);
        setNeedsCode(true);
        setCode("");
      } else setError(err.message || "Sign in failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm" aria-label="Sign in">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">{tenant.config?.brand.displayName ?? "Utmost"}</p>
          <h1 className="text-lg font-semibold text-slate-900">Broker Operations sign in</h1>
        </div>

        {error && <p role="alert" className="rounded-md bg-rose-50 p-2.5 text-sm text-rose-700">{error}</p>}

        {!needsCode ? (
          <>
            <div className="space-y-1">
              <label htmlFor="login-email" className="text-xs font-medium text-slate-600">Email</label>
              <input id="login-email" required type="email" autoFocus autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
            </div>
            <div className="space-y-1">
              <label htmlFor="login-password" className="text-xs font-medium text-slate-600">Password</label>
              <input id="login-password" required type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
            </div>
          </>
        ) : (
          <div className="space-y-1">
            <p className="text-sm text-slate-600">Two-step verification is on for <span className="font-medium">{email}</span>. Enter the 6-digit code from your authenticator app.</p>
            <label htmlFor="login-code" className="text-xs font-medium text-slate-600">6-digit code</label>
            <input id="login-code" required autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono text-lg tracking-widest" />
          </div>
        )}

        <button disabled={submitting} type="submit" className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
          {submitting ? "Signing in…" : needsCode ? "Verify and sign in" : "Sign in"}
        </button>
        {needsCode && <button type="button" onClick={() => { setNeedsCode(false); setCode(""); setError(null); }} className="w-full text-xs text-slate-500 hover:text-slate-800">Use a different account</button>}

        <p className="text-xs text-slate-400">Dev seed logins (see database/migrate-006-auth-seed.ts): amina@utmostbrokers.co.ke, peter@utmostbrokers.co.ke or grace@utmostbrokers.co.ke — password ChangeMe123!</p>
      </form>
    </div>
  );
}
