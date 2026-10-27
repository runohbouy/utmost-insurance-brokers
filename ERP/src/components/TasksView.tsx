import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { api } from "../api";
import type { WorkflowTask } from "../types";
import StatusPill from "./StatusPill";
import SearchInput, { matchesQuery } from "./SearchInput";
import Pagination, { usePagedSlice } from "./Pagination";

export default function TasksView() {
  const [tasks, setTasks] = useState<WorkflowTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [outcomeDraft, setOutcomeDraft] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  function load() {
    setLoading(true);
    api.tasks.list().then(setTasks).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function confirmDone(id: string) {
    if (!outcomeDraft.trim()) return;
    try {
      await api.tasks.update(id, { status: "done", outcome: outcomeDraft.trim() });
      setClosingId(null);
      setOutcomeDraft("");
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  const now = Date.now();
  const sorted = [...tasks].sort((a, b) => {
    const openA = a.status !== "done" && a.status !== "cancelled";
    const openB = b.status !== "done" && b.status !== "cancelled";
    if (openA !== openB) return openA ? -1 : 1;
    return (a.dueAt ? new Date(a.dueAt).getTime() : Infinity) - (b.dueAt ? new Date(b.dueAt).getTime() : Infinity);
  });
  const filtered = sorted.filter((t) => matchesQuery(query, t.taskType, t.queue, t.priority, t.status));
  const { pageItems, totalPages, clampedPage } = usePagedSlice(filtered, page);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">Tasks</h2>
      {error && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      <SearchInput value={query} onChange={setQuery} placeholder="Search by task, queue, priority, status…" />

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th scope="col" className="px-4 py-2.5 font-medium">Task</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Queue</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Priority</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Due</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
              <th scope="col" className="px-4 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">{sorted.length === 0 ? "No tasks yet." : `No tasks match "${query}".`}</td></tr>
            ) : (
              pageItems.map((t) => {
                const isOpen = t.status !== "done" && t.status !== "cancelled";
                const isOverdue = isOpen && t.dueAt && new Date(t.dueAt).getTime() < now;
                return (
                  <tr key={t.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-slate-900">{t.taskType}</td>
                    <td className="px-4 py-2.5 text-slate-600">{t.queue || "—"}</td>
                    <td className="px-4 py-2.5 capitalize text-slate-600">{t.priority}</td>
                    <td className={`px-4 py-2.5 tabular-nums ${isOverdue ? "font-medium text-rose-600" : "text-slate-600"}`}>
                      {t.dueAt ? new Date(t.dueAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-2.5"><StatusPill status={isOverdue ? "overdue" : t.status} /></td>
                    <td className="px-4 py-2.5 text-right">
                      {isOpen && closingId !== t.id && (
                        <button onClick={() => { setClosingId(t.id); setOutcomeDraft(""); }} className="flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
                          <Check size={13} /> Done
                        </button>
                      )}
                      {closingId === t.id && (
                        <div className="flex items-center justify-end gap-1.5">
                          <input
                            autoFocus
                            placeholder="Outcome (required)"
                            value={outcomeDraft}
                            onChange={(e) => setOutcomeDraft(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && confirmDone(t.id)}
                            className="w-44 rounded-md border border-slate-300 px-2 py-1 text-xs"
                          />
                          <button onClick={() => confirmDone(t.id)} disabled={!outcomeDraft.trim()} className="rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-40">
                            <Check size={13} />
                          </button>
                          <button onClick={() => setClosingId(null)} className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600">
                            <X size={13} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        <Pagination page={clampedPage} totalPages={totalPages} totalItems={filtered.length} onChange={setPage} />
      </div>
    </div>
  );
}
