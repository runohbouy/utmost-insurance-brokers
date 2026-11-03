import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { api } from "../api";

// Search-as-you-type pickers for a client (party) or a policy. They query the server (the lists are paged
// there), so choosing one never means downloading every client. Accessible as a combobox: arrow keys move,
// Enter picks, Escape closes; the list is announced to screen readers via aria-activedescendant.

interface Option { id: string; label: string; hint?: string }

function SearchPicker({ label, value, onChange, search, placeholder, required }: {
  label: string;
  value: Option | null;
  onChange: (value: Option | null) => void;
  search: (q: string) => Promise<Option[]>;
  placeholder: string;
  required?: boolean;
}) {
  const [text, setText] = useState("");
  const [options, setOptions] = useState<Option[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const listId = useId();
  const latest = useRef(0);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      const id = ++latest.current;
      setBusy(true);
      search(text.trim())
        .then((found) => { if (id === latest.current) { setOptions(found); setActive(0); } })
        .catch(() => { if (id === latest.current) setOptions([]); })
        .finally(() => { if (id === latest.current) setBusy(false); });
    }, 200);
    return () => clearTimeout(timer);
    // `search` is intentionally not a dependency: callers pass a fresh closure each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, open]);

  function pick(o: Option) {
    onChange(o);
    setText("");
    setOpen(false);
  }

  if (value) {
    return (
      <div>
        <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
        <div className="flex items-center justify-between gap-2 rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm">
          <span className="truncate"><span className="font-medium text-slate-900">{value.label}</span>{value.hint && <span className="ml-2 text-xs text-slate-500">{value.hint}</span>}</span>
          <button type="button" onClick={() => onChange(null)} aria-label={`Clear ${label}`} className="shrink-0 text-slate-400 hover:text-slate-700"><X size={14} /></button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={`${listId}-input`}>{label}</label>
      <input
        id={`${listId}-input`}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && options[active] ? `${listId}-${options[active].id}` : undefined}
        required={required}
        autoComplete="off"
        value={text}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { setText(e.target.value); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, options.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && open && options[active]) { e.preventDefault(); pick(options[active]); }
          else if (e.key === "Escape") setOpen(false);
        }}
        className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
      />
      {open && (
        <ul id={listId} role="listbox" aria-label={`${label} suggestions`} className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg">
          {busy && options.length === 0 && <li className="px-3 py-2 text-slate-400">Searching…</li>}
          {!busy && options.length === 0 && <li className="px-3 py-2 text-slate-400">{text ? "No matches" : "Type to search"}</li>}
          {options.map((o, i) => (
            <li
              key={o.id}
              id={`${listId}-${o.id}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); pick(o); }}
              className={`cursor-pointer px-3 py-1.5 ${i === active ? "bg-indigo-50 text-indigo-800" : "text-slate-700 hover:bg-slate-50"}`}
            >
              <span className="font-medium">{o.label}</span>{o.hint && <span className="ml-2 text-xs text-slate-500">{o.hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export interface PickedClient { id: string; label: string; hint?: string }

export function ClientPicker(props: { value: PickedClient | null; onChange: (v: PickedClient | null) => void; label?: string; required?: boolean }) {
  return (
    <SearchPicker
      label={props.label ?? "Client"} value={props.value} onChange={props.onChange} required={props.required}
      placeholder="Search clients by name, phone, email, ID…"
      search={async (q) => (await api.parties.page({ limit: 8, offset: 0, q })).rows.map((p) => ({ id: p.id, label: p.fullName, hint: p.phoneNumber || p.email || p.id }))}
    />
  );
}

export function PolicyPicker(props: { value: PickedClient | null; onChange: (v: PickedClient | null) => void; required?: boolean }) {
  return (
    <SearchPicker
      label="Policy" value={props.value} onChange={props.onChange} required={props.required}
      placeholder="Search policies by number, client, insurer…"
      search={async (q) => (await api.policies.page({ limit: 8, offset: 0, q })).rows.map((p) => ({ id: p.id, label: p.id, hint: [p.clientName, p.category].filter(Boolean).join(" · ") }))}
    />
  );
}
