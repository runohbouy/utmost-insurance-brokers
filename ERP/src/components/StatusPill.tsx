const GOOD = new Set(["active", "Active", "Won", "done", "approved", "Delivered", "Closed", "accepted"]);
const CRITICAL = new Set(["overdue", "Lost", "cancelled", "Cancelled", "Expired", "expired", "Discrepancy", "rejected", "Escalated"]);
const WARNING = new Set(["Deferred", "in_progress", "Under Check", "blocked", "restricted", "review_due", "submitted"]);

function toneFor(status: string): "good" | "warning" | "critical" | "neutral" {
  if (GOOD.has(status)) return "good";
  if (CRITICAL.has(status)) return "critical";
  if (WARNING.has(status)) return "warning";
  return "neutral";
}

const TONE_CLASSES: Record<string, string> = {
  good: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  warning: "bg-amber-50 text-amber-700 ring-amber-600/20",
  critical: "bg-rose-50 text-rose-700 ring-rose-600/20",
  neutral: "bg-slate-100 text-slate-600 ring-slate-500/20",
};

export default function StatusPill({ status, tone }: { status: string; tone?: "good" | "warning" | "critical" | "neutral" }) {
  const resolved = tone || toneFor(status);
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap ${TONE_CLASSES[resolved]}`}>
      {status}
    </span>
  );
}
