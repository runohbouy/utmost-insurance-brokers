import { ChevronLeft, ChevronRight } from "lucide-react";

export const PAGE_SIZE = 25;

export function usePagedSlice<T>(items: T[], page: number, pageSize: number = PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const clampedPage = Math.min(page, totalPages - 1);
  const start = clampedPage * pageSize;
  return { pageItems: items.slice(start, start + pageSize), totalPages, clampedPage };
}

export default function Pagination({
  page,
  totalPages,
  totalItems,
  pageSize = PAGE_SIZE,
  onChange,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize?: number;
  onChange: (page: number) => void;
}) {
  if (totalItems <= pageSize) return null;
  const start = page * pageSize + 1;
  const end = Math.min(totalItems, (page + 1) * pageSize);
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
      <span aria-live="polite">{start}–{end} of {totalItems}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page === 0}
          onClick={() => onChange(page - 1)}
          title="Previous page"
          aria-label="Previous page"
          className="rounded-md border border-slate-300 p-1 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="px-1 tabular-nums" aria-current="page">{page + 1} / {totalPages}</span>
        <button
          type="button"
          disabled={page >= totalPages - 1}
          onClick={() => onChange(page + 1)}
          title="Next page"
          aria-label="Next page"
          className="rounded-md border border-slate-300 p-1 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </nav>
  );
}
