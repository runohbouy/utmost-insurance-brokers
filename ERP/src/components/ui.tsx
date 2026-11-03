import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { X } from "lucide-react";

// Small presentational pieces shared by the receipts, analytics and settings screens.

export const inputClass = "w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-400";
export const primaryButton = "rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50";
export const secondaryButton = "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";
export const dangerButton = "rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50";

/**
 * A number field backed by what the person is typing. The model value (minor units, basis points…) is only
 * updated when the text parses; the text itself is never rewritten while they type, so "1500." and "0." survive.
 * It re-formats only when the value changes from outside (for example a different region pack is chosen).
 */
export function DecimalInput({ value, parse, format, onValue, ...rest }: {
  value: number; parse: (text: string) => number | null; format: (value: number) => string; onValue: (value: number) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [text, setText] = useState(() => format(value));
  const mine = useRef(value);
  useEffect(() => { if (value !== mine.current) { mine.current = value; setText(format(value)); } }, [value, format]);
  const invalid = text.trim() !== "" && parse(text) === null;
  return (
    <input
      {...rest} value={text} inputMode="decimal" aria-invalid={invalid || undefined}
      onChange={(e) => {
        setText(e.target.value);
        const v = parse(e.target.value);
        if (v !== null) { mine.current = v; onValue(v); }
      }}
      onBlur={() => { if (!invalid) setText(format(mine.current)); }}
    />
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export function ErrorNotice({ message, onDismiss }: { message: string | null; onDismiss?: () => void }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex items-start justify-between gap-3 rounded-md bg-rose-50 p-3 text-sm text-rose-700">
      <span>{message}</span>
      {onDismiss && <button type="button" onClick={onDismiss} aria-label="Dismiss" className="shrink-0 text-rose-400 hover:text-rose-700"><X size={14} /></button>}
    </div>
  );
}

export function SuccessNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return <div role="status" className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>;
}

/** A modal dialog that traps focus, closes on Escape and returns focus to where it came from. */
export function Dialog({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const focusable = () => Array.from(node?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? []).filter((el) => !el.hasAttribute("disabled"));
    (focusable().find((el) => el.tagName === "TEXTAREA" || el.tagName === "INPUT") ?? focusable()[0])?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
      if (e.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); previous?.focus?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
        </div>
        <div className="space-y-3 text-sm">{children}</div>
        {footer && <div className="mt-4 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

/** Ask for a note (e.g. why a cheque bounced) before doing something that cannot be quietly undone. */
export function ReasonDialog({ title, intro, confirmLabel, requireReason, danger, onConfirm, onClose }: {
  title: string; intro?: ReactNode; confirmLabel: string; requireReason?: boolean; danger?: boolean;
  onConfirm: (reason: string) => Promise<void> | void; onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try { await onConfirm(reason.trim()); } finally { setBusy(false); }
  }
  return (
    <Dialog title={title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {intro && <div className="text-slate-600">{intro}</div>}
        <Field label={requireReason ? "Reason (required)" : "Note (optional)"}>
          <textarea className={inputClass} rows={3} value={reason} maxLength={500} required={requireReason} minLength={requireReason ? 3 : undefined} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryButton} onClick={onClose}>Cancel</button>
          <button type="submit" disabled={busy} className={danger ? dangerButton : primaryButton}>{busy ? "Working…" : confirmLabel}</button>
        </div>
      </form>
    </Dialog>
  );
}

export function Stat({ label, value, tone = "neutral", hint }: { label: string; value: string; tone?: "neutral" | "good" | "warning" | "critical"; hint?: string }) {
  const tones = { neutral: "text-slate-900", good: "text-emerald-700", warning: "text-amber-700", critical: "text-rose-700" };
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${tones[tone]}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 border-b border-slate-200">
      {tabs.map((t) => (
        <button
          key={t.id} role="tab" type="button" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${value === t.id ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
