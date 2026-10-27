import { Search, X } from "lucide-react";

// Shared search box for list views — a plain client-side substring
// filter over data already fetched (every list already loads its
// full result set), so this needs no API change. See the wireframe
// audit: none of the app's list screens had any search control.
export default function SearchInput({ value, onChange, placeholder = "Search…" }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative w-full sm:max-w-xs">
      <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-slate-300 py-1.5 pr-7 pl-8 text-sm placeholder:text-slate-400 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 focus:outline-none"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          title="Clear search" aria-label="Clear search"
          className="absolute top-1/2 right-2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

// Small helper shared by every list view: case-insensitive substring
// match across a set of a row's own fields, skipping null/undefined.
export function matchesQuery(query: string, ...fields: (string | number | null | undefined)[]): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  return fields.some((f) => f != null && String(f).toLowerCase().includes(q));
}
