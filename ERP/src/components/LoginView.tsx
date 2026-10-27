import { useState } from "react";

export default function LoginView({ onLogin }: { onLogin: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onLogin(email, password);
    } catch (err: any) {
      setError(err.message || "Sign in failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Utmost</p>
          <h1 className="text-lg font-semibold text-slate-900">Broker Operations sign in</h1>
        </div>

        {error && <p className="rounded-md bg-rose-50 p-2.5 text-sm text-rose-700">{error}</p>}

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Email</label>
          <input required type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Password</label>
          <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
        </div>

        <button disabled={submitting} type="submit" className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
          {submitting ? "Signing in…" : "Sign in"}
        </button>

        <p className="text-xs text-slate-400">Dev seed logins (see database/migrate-006-auth-seed.ts): amina@utmostbrokers.co.ke, peter@utmostbrokers.co.ke or grace@utmostbrokers.co.ke — password ChangeMe123!</p>
      </form>
    </div>
  );
}
