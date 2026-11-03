import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "../../api";
import { useTenant } from "../../ConfigContext";
import type { ReceiptDetail, ReceiptRow } from "../../financeTypes";
import { usePagedList } from "../../usePagedList";
import Pagination from "../Pagination";
import SearchInput from "../SearchInput";
import StatusPill from "../StatusPill";
import { ErrorNotice, SuccessNotice, inputClass, primaryButton } from "../ui";
import RecordReceiptForm from "./RecordReceiptForm";
import { HOLDING_LABEL, RECEIPT_LABEL, RECEIPT_TONE } from "./statusTone";

const FILTERS = [
  { id: "", label: "All receipts", params: {} },
  { id: "approval", label: "Awaiting approval", params: { approval: "pending" } },
  { id: "cheques", label: "Cheques in progress", params: { status: "deposited" } },
  { id: "cleared", label: "Cleared", params: { status: "cleared" } },
  { id: "held", label: "Unallocated (suspense & credit)", params: { holding: "any" } },
  { id: "bounced", label: "Bounced", params: { status: "bounced" } },
] as const;

export default function ReceiptList({ onSelect, canRecord, refreshKey }: { onSelect: (id: string) => void; canRecord: boolean; refreshKey: number }) {
  const tenant = useTenant();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("");
  const params = FILTERS.find((f) => f.id === filter)!.params;
  const list = usePagedList<ReceiptRow>((request) => api.receipts.page({ ...request, ...params }));
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // A different filter, or a change made on the detail screen, means a fresh page 1.
  useEffect(() => { list.setPage(0); list.reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filter, refreshKey]);

  function recorded(r: ReceiptDetail) {
    setShowForm(false);
    const allocated = r.allocated.amountMinor;
    setNotice(
      r.approvalStatus === "pending"
        ? `${r.receiptNo} recorded and waiting for approval. It does not count as money until someone else approves it.`
        : r.status === "received"
        ? `${r.receiptNo} recorded. The cheque is held until it is deposited and clears.`
        : `${r.receiptNo} recorded and cleared${allocated > 0 ? `; ${tenant.money(r.allocated)} was allocated to invoices` : ""}${r.unallocated.amountMinor > 0 ? `, ${tenant.money(r.unallocated)} is held as ${r.holdingKind === "client_credit" ? "client credit" : "suspense"}` : ""}.`,
    );
    list.reload();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput value={list.query} onChange={list.setQuery} placeholder="Search receipt no, client, reference, cheque…" />
          <select aria-label="Filter receipts" className={`${inputClass} w-auto`} value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            {FILTERS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </div>
        {canRecord && <button onClick={() => setShowForm((v) => !v)} className={`${primaryButton} flex items-center gap-1.5`}><Plus size={15} /> Record receipt</button>}
      </div>

      <ErrorNotice message={list.error} onDismiss={() => list.setError(null)} />
      <SuccessNotice message={notice} />
      {showForm && <RecordReceiptForm onRecorded={recorded} onCancel={() => setShowForm(false)} />}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <th scope="col" className="px-4 py-2.5 font-medium">Receipt</th><th scope="col" className="px-4 py-2.5 font-medium">Client</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Method</th><th scope="col" className="px-4 py-2.5 text-right font-medium">Amount</th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">Unallocated</th><th scope="col" className="px-4 py-2.5 font-medium">Status</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Received</th>
          </tr></thead>
          <tbody>
            {list.loading ? <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">Loading…</td></tr>
              : list.rows.length === 0 ? <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">{list.debouncedQuery ? `No receipts match "${list.debouncedQuery}".` : "No receipts yet."}</td></tr>
              : list.rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2.5"><button type="button" onClick={() => onSelect(r.id)} className="font-medium text-indigo-700 hover:underline">{r.receiptNo}</button></td>
                  <td className="px-4 py-2.5 text-slate-700">{r.clientName ?? r.clientId}</td>
                  <td className="px-4 py-2.5 text-slate-600">{r.method}{r.instrumentNo ? ` · ${r.instrumentNo}` : ""}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{tenant.money(r.amount)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {r.unallocated.amountMinor > 0 ? <>{tenant.money(r.unallocated)} {r.holdingKind && <span className="ml-1 text-xs text-amber-700">{HOLDING_LABEL[r.holdingKind]}</span>}</> : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5">{r.approvalStatus === "pending" ? <StatusPill status="Awaiting approval" tone="warning" /> : <StatusPill status={RECEIPT_LABEL[r.status]} tone={RECEIPT_TONE[r.status]} />}</td>
                  <td className="px-4 py-2.5 text-slate-600">{tenant.dateTime(r.receivedAt)}</td>
                </tr>
              ))}
          </tbody>
        </table>
        <Pagination page={list.page} totalPages={list.totalPages} totalItems={list.total} onChange={list.setPage} />
      </div>
    </div>
  );
}
