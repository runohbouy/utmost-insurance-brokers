import {
  LayoutDashboard, Users, TrendingUp, Scale, FileText, Building2, LifeBuoy,
  MessageSquareWarning, Banknote, FolderOpen, ListChecks, ShieldCheck, RotateCcw, Send, LogOut, Contact, Handshake,
} from "lucide-react";
import type { View } from "../App";
import type { StaffSession } from "../types";

export const NAV_GROUPS: { label: string; items: { id: View; label: string; icon: typeof LayoutDashboard }[] }[] = [
  {
    label: "Overview",
    items: [{ id: "dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "CRM",
    items: [
      { id: "parties", label: "Parties", icon: Users },
      { id: "opportunities", label: "Opportunities", icon: TrendingUp },
      { id: "producers", label: "Producers", icon: Handshake },
      { id: "correspondence", label: "Correspondence", icon: Send },
    ],
  },
  {
    label: "Underwriting",
    items: [
      { id: "placement", label: "Placement", icon: Scale },
      { id: "policies", label: "Policies", icon: FileText },
      { id: "renewals", label: "Renewals", icon: RotateCcw },
      { id: "insurers", label: "Insurer panel", icon: Building2 },
    ],
  },
  {
    label: "Servicing",
    items: [
      { id: "claims", label: "Claims", icon: LifeBuoy },
      { id: "complaints", label: "Complaints", icon: MessageSquareWarning },
    ],
  },
  {
    label: "Finance & records",
    items: [
      { id: "finance", label: "Finance", icon: Banknote },
      { id: "documents", label: "Documents", icon: FolderOpen },
    ],
  },
  {
    label: "Operations",
    items: [
      { id: "tasks", label: "Tasks", icon: ListChecks },
      { id: "obligations", label: "Compliance", icon: ShieldCheck },
      { id: "hr", label: "HR", icon: Contact },
    ],
  },
];

// Nav items hidden unless the signed-in staff member holds the permission.
// Cosmetic only — the server enforces the same permission on every route.
const NAV_PERMISSIONS: Partial<Record<View, string>> = { finance: "finance.view" };

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  underwriter: "Underwriter",
  claims_officer: "Claims Officer",
  accountant: "Accountant",
  supervisor: "Supervisor",
  sales_agent: "Sales Agent",
  system: "System",
};

export default function Sidebar({ active, onSelect, staff, onLogout }: { active: View; onSelect: (v: View) => void; staff: StaffSession; onLogout: () => void }) {
  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Utmost</p>
        <p className="text-sm font-semibold text-slate-900">Broker Operations</p>
      </div>
      <nav className="flex-1 space-y-4 p-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.filter((item) => !NAV_PERMISSIONS[item.id] || staff.permissions.includes(NAV_PERMISSIONS[item.id]!)).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => onSelect(id)}
                  className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    active === id
                      ? "bg-indigo-50 text-indigo-700"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <Icon size={16} strokeWidth={2} />
                  {label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-slate-200 px-5 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">{staff.fullName}</p>
            <p className="text-xs text-slate-400">{staff.roleId ? ROLE_LABELS[staff.roleId] || staff.roleId : "No role"}</p>
          </div>
          <button onClick={onLogout} title="Sign out" className="flex shrink-0 items-center gap-1 rounded-md p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-700">
            <LogOut size={15} />
          </button>
        </div>
      </div>
      <div className="border-t border-slate-200 px-5 py-3 text-xs text-slate-400">
        System of record — see ../studio for the public quote generator
      </div>
    </aside>
  );
}
