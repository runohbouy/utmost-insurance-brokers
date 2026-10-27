import { useCallback, useEffect, useRef, useState } from "react";
import { PAGE_SIZE } from "./components/Pagination";

export interface PageRequest { limit: number; offset: number; q: string }
export interface PageResult<T> { rows: T[]; total: number }

// Drives a list screen whose search and paging happen on the server: only the
// rows on screen are downloaded. The search text is debounced so typing
// doesn't fire a request per keystroke, a new search returns to page 1, and a
// response that arrives after a newer request was sent is ignored — so fast
// typing can never leave stale rows on screen.
//
//   const list = usePagedList((p) => api.policies.page(p));
//   <SearchInput value={list.query} onChange={list.setQuery} />
//   list.rows.map(...)   <Pagination page={list.page} totalPages={list.totalPages} totalItems={list.total} onChange={list.setPage} />
//   after a create/update: list.reload()
export function usePagedList<T>(fetchPage: (request: PageRequest) => Promise<PageResult<T>>) {
  const [rows, setRows] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  const latestRequest = useRef(0);
  // Always call the newest fetcher without making it an effect dependency.
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const id = ++latestRequest.current;
    setLoading(true);
    fetchRef.current({ limit: PAGE_SIZE, offset: page * PAGE_SIZE, q: debouncedQuery })
      .then((result) => {
        if (id !== latestRequest.current) return;
        setRows(result.rows);
        setTotal(result.total);
        setError(null);
      })
      .catch((err: Error) => { if (id === latestRequest.current) setError(err.message); })
      .finally(() => { if (id === latestRequest.current) setLoading(false); });
  }, [page, debouncedQuery, reloadKey]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return {
    rows, setRows, total, loading, error, setError,
    query, setQuery, debouncedQuery,
    page: Math.min(page, totalPages - 1), setPage, totalPages,
    reload,
  };
}
