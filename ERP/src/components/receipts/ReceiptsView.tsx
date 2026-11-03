import { useState } from "react";
import { Tabs } from "../ui";
import InvoiceList from "./InvoiceList";
import ReceiptDetailView from "./ReceiptDetailView";
import ReceiptList from "./ReceiptList";

type Tab = "receipts" | "invoices";

/** Money in: record receipts, follow cheques through the bank, allocate cleared money to invoices. */
export default function ReceiptsView({ permissions, staffId }: { permissions: string[]; staffId: string }) {
  const [tab, setTab] = useState<Tab>("receipts");
  const [selected, setSelected] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const can = (p: string) => permissions.includes(p);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">Receipts &amp; allocation</h2>
      {selected ? (
        <ReceiptDetailView
          receiptId={selected} onBack={() => setSelected(null)} canRecord={can("receipt.record")} canAllocate={can("allocation.manage")} canApprove={can("receipt.approve")} staffId={staffId}
          onChanged={() => setRefreshKey((k) => k + 1)}
        />
      ) : (
        <>
          <Tabs<Tab> label="Receipts and invoices" value={tab} onChange={setTab} tabs={[{ id: "receipts", label: "Receipts" }, { id: "invoices", label: "Invoices" }]} />
          {tab === "receipts"
            ? <ReceiptList onSelect={setSelected} canRecord={can("receipt.record")} refreshKey={refreshKey} />
            : <InvoiceList canManage={can("invoice.manage")} />}
        </>
      )}
    </div>
  );
}
