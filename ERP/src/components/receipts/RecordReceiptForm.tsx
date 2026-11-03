import { useRef, useState } from "react";
import { api, newIdempotencyKey } from "../../api";
import { useTenant } from "../../ConfigContext";
import type { ReceiptDetail, ReceiptMethod } from "../../financeTypes";
import { ClientPicker, type PickedClient } from "../Picker";
import { ErrorNotice, Field, inputClass, primaryButton, secondaryButton } from "../ui";

const METHODS: { id: ReceiptMethod; label: string }[] = [
  { id: "mpesa", label: "M-Pesa" }, { id: "bank", label: "Bank transfer" }, { id: "cash", label: "Cash" },
  { id: "card", label: "Card" }, { id: "cheque", label: "Cheque" },
];

export default function RecordReceiptForm({ onRecorded, onCancel, presetClient }: {
  onRecorded: (receipt: ReceiptDetail) => void;
  onCancel: () => void;
  presetClient?: PickedClient | null;
}) {
  const tenant = useTenant();
  const [client, setClient] = useState<PickedClient | null>(presetClient ?? null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<ReceiptMethod>("mpesa");
  const [reference, setReference] = useState("");
  const [chequeNo, setChequeNo] = useState("");
  const [drawerBank, setDrawerBank] = useState("");
  const [receivedOn, setReceivedOn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // One key per form: if the person double-clicks, or the request is retried after a network blip,
  // the server returns the first receipt instead of recording a second.
  const idempotencyKey = useRef(newIdempotencyKey());

  const minor = tenant.parseMoney(amount);
  const isCheque = method === "cheque";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!client) return setError("Choose the client who paid.");
    if (minor === null || minor <= 0) return setError(`Enter the amount${tenant.currency ? ` in ${tenant.currency}` : ""} as a positive number, for example 1,250.50.`);
    setSaving(true);
    try {
      const receipt = await api.receipts.record({
        clientId: client.id, amountMinor: minor, method,
        reference: reference.trim() || undefined,
        instrumentNo: isCheque ? chequeNo.trim() : undefined,
        drawerBank: isCheque ? drawerBank.trim() || undefined : undefined,
        // a date picked for "received on" means that day at midday in the browser; blank means now
        receivedAt: receivedOn ? new Date(`${receivedOn}T12:00:00`).toISOString() : undefined,
      }, idempotencyKey.current);
      idempotencyKey.current = newIdempotencyKey();
      onRecorded(receipt);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4" aria-label="Record a receipt">
      <h3 className="text-sm font-semibold text-slate-900">Record a receipt</h3>
      <ErrorNotice message={error} onDismiss={() => setError(null)} />
      <div className="grid gap-3 sm:grid-cols-2">
        <ClientPicker value={client} onChange={setClient} required />
        <Field label={`Amount${tenant.currency ? ` (${tenant.currency})` : ""}`} hint={minor !== null && minor > 0 ? `Recording ${tenant.money(minor)}` : undefined}>
          <input required inputMode="decimal" className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </Field>
        <Field label="Method">
          <select className={inputClass} value={method} onChange={(e) => setMethod(e.target.value as ReceiptMethod)}>
            {METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </Field>
        <Field label="Reference" hint="M-Pesa code, bank slip or transfer reference">
          <input className={inputClass} value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} />
        </Field>
        {isCheque && (
          <>
            <Field label="Cheque number"><input required className={inputClass} value={chequeNo} maxLength={40} onChange={(e) => setChequeNo(e.target.value)} /></Field>
            <Field label="Drawer's bank"><input className={inputClass} value={drawerBank} maxLength={120} onChange={(e) => setDrawerBank(e.target.value)} /></Field>
          </>
        )}
        <Field label="Received on" hint="Leave blank for now">
          <input type="date" className={inputClass} value={receivedOn} max={tenant.today()} onChange={(e) => setReceivedOn(e.target.value)} />
        </Field>
      </div>
      <p className="text-xs text-slate-500">
        {tenant.config?.receiptApproval === "required"
          ? "Your organisation requires approval: this receipt will wait until a different person approves it, and only then counts as money."
          : isCheque
            ? "A cheque is held as received until it is deposited and clears. Only cleared money is allocated to invoices."
            : "This method is cleared on receipt, so it is allocated to the client's open invoices straight away."}
      </p>
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className={primaryButton}>{saving ? "Recording…" : "Record receipt"}</button>
        <button type="button" onClick={onCancel} className={secondaryButton}>Cancel</button>
      </div>
    </form>
  );
}
