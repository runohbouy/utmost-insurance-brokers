import React, { useEffect, useState } from "react";
import { Lock, ShieldCheck, AlertCircle, LogOut } from "lucide-react";
import { ActiveTab } from "../types";

export interface AuthenticatedStaff {
  token: string;
  staffId: string;
  fullName: string;
  role: string;
}

interface StaffLoginGateProps {
  setActiveTab: (tab: ActiveTab) => void;
  children: (staff: AuthenticatedStaff, onLogout: () => void) => React.ReactNode;
}

const SESSION_KEY = "utmost_staff_session";

export default function StaffLoginGate({ setActiveTab, children }: StaffLoginGateProps) {
  const [staff, setStaff] = useState<AuthenticatedStaff | null>(null);
  const [checkedStorage, setCheckedStorage] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      try {
        setStaff(JSON.parse(raw));
      } catch {
        sessionStorage.removeItem(SESSION_KEY);
      }
    }
    setCheckedStorage(true);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/staff/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Login failed.");
      }
      const session: AuthenticatedStaff = { token: data.token, staffId: data.staffId, fullName: data.fullName, role: data.role };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      setStaff(session);
    } catch (err: any) {
      setError(err.message || "Unable to reach the authentication server.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = () => {
    if (staff) {
      fetch("/api/staff/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${staff.token}` }
      }).catch(() => {});
    }
    sessionStorage.removeItem(SESSION_KEY);
    setStaff(null);
    setUsername("");
    setPassword("");
  };

  if (!checkedStorage) {
    return null;
  }

  if (staff) {
    return <>{children(staff, handleLogout)}</>;
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6 font-sans text-left" id="staff-login-gate">
      <div className="border border-[#D8E2F0] bg-[#FAF9F6] p-8 space-y-6">
        <div className="flex items-center space-x-2 border-b border-[#D8E2F0] pb-4">
          <div className="border border-[#316EC9]/30 bg-[#F0F5FC] p-2">
            <Lock className="h-5 w-5 text-[#316EC9]" />
          </div>
          <div>
            <span className="text-[9px] uppercase font-bold text-[#316EC9] tracking-[0.2em] font-mono block">Internal Staff Access</span>
            <h1 className="text-xl font-serif italic text-[#1A1A1A]">Workspace Admin Sign-In</h1>
          </div>
        </div>

        <p className="text-xs text-[#8C887D] leading-relaxed">
          This area is restricted to Utmost brokerage staff. Rate tables, insurer registry changes, and compliance logs require an authenticated session.
        </p>

        <form onSubmit={handleLogin} className="space-y-4 text-xs font-semibold">
          <div className="space-y-1.5">
            <label className="text-[9px] font-bold text-[#8C887D] uppercase tracking-wider">Staff Username *</label>
            <input
              type="text"
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-white rounded-none border border-[#D8E2F0] p-2.5 text-xs text-slate-800 focus:border-[#316EC9] focus:outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[9px] font-bold text-[#8C887D] uppercase tracking-wider">Password *</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white rounded-none border border-[#D8E2F0] p-2.5 text-xs text-slate-800 focus:border-[#316EC9] focus:outline-none"
            />
          </div>

          {error && (
            <div className="border border-red-200 bg-red-50 p-3 text-[11px] text-red-700 rounded-none flex items-start space-x-1.5">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-[#142C54] hover:bg-[#316EC9] text-white text-xs font-bold uppercase tracking-widest py-3.5 border border-[#142C54] hover:border-[#316EC9] transition-all rounded-none cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? "Verifying..." : "Sign In"}
          </button>
        </form>

        <button
          onClick={() => setActiveTab("home")}
          className="w-full text-center text-[10px] uppercase tracking-wider font-bold text-[#8C887D] hover:text-[#316EC9] pt-1"
        >
          ← Back to main site
        </button>
      </div>
    </div>
  );
}

export function StaffSessionBadge({ staff, onLogout }: { staff: AuthenticatedStaff; onLogout: () => void }) {
  return (
    <div className="flex items-center space-x-3 border border-[#D8E2F0] bg-white px-3 py-2">
      <ShieldCheck className="h-4 w-4 text-[#316EC9] shrink-0" />
      <div className="text-left leading-tight">
        <p className="text-[9px] uppercase tracking-wider text-[#8C887D] font-bold font-mono">Logged in as</p>
        <p className="text-xs font-bold text-[#1A1A1A]">{staff.fullName} <span className="text-[#8C887D] font-normal">— {staff.role}</span></p>
      </div>
      <button
        onClick={onLogout}
        className="ml-auto flex items-center space-x-1 text-[10px] uppercase tracking-wider font-bold text-[#8C887D] hover:text-red-600 transition-colors"
      >
        <LogOut className="h-3.5 w-3.5" />
        <span>Log Out</span>
      </button>
    </div>
  );
}
