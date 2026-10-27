import { NAV_GROUPS } from "./Sidebar";
import type { View } from "../App";

// Breadcrumb + date strip above every page's own content — reuses
// Sidebar's own NAV_GROUPS as the single source of truth for section/
// page labels, so the two can't drift out of sync. Inspired by the
// minimal top-bar pattern at https://ui.watermelon.sh/blocks/navigation
// (logo/title left, compact context right, in a slim rounded shell).
function locate(active: View) {
  for (const group of NAV_GROUPS) {
    const item = group.items.find((i) => i.id === active);
    if (item) return { groupLabel: group.label, itemLabel: item.label, Icon: item.icon };
  }
  return null;
}

export default function TopBar({ active }: { active: View }) {
  const located = locate(active);
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="mb-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
      <div className="flex items-center gap-2 text-sm">
        {located && (
          <>
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
              <located.Icon size={14} />
            </span>
            <span className="text-slate-400">{located.groupLabel}</span>
            <span className="text-slate-300">/</span>
            <span className="font-medium text-slate-900">{located.itemLabel}</span>
          </>
        )}
      </div>
      <p className="hidden text-xs text-slate-400 sm:block">{today}</p>
    </div>
  );
}
