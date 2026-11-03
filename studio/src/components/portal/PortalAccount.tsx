import React, { useCallback, useEffect, useState } from "react";
import {
  portalApi, PortalError, type PortalConfig, type PortalInvoice, type PortalMe, type PortalPolicy, type PortalPosition, type PortalReceipt, type PortalStatement,
} from "../../portalApi";
import { formatDay, formatInstant, INVOICE_STATUS, PAYMENT_STATUS, TONE_CLASS } from "./format";
import { PortalSecurity } from "./PortalSecurity";

const card = "border border-[#D8E2F0] bg-white p-5 space-y-4 rounded-none";
const h4 = "font-serif italic text-base text-[#316EC9] border-b border-[#D8E2F0] pb-2";
const th = "px-3 py-2 text-left text-[9px] uppercase tracking-wider text-[#8C887D] font-bold";
const td = "px-3 py-2.5";
const PAGE = 10;

function Pill({ tone, children }: { tone: keyof typeof TONE_CLASS; children: React.ReactNode }) {
  return <span className={`inline-block border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider whitespace-nowrap ${TONE_CLASS[tone]}`}>{children}</span>;
}

function Stat({ label, value, tone, hint }: { label: string; value: string; tone?: "bad" | "ok"; hint?: string }) {
  return (
    <div className="border border-[#D8E2F0] bg-[#FAF9F6] p-4 rounded-none">
      <p className="text-[9px] uppercase tracking-wider text-[#8C887D] font-bold">{label}</p>
      <p className={`mt-1 text-xl font-serif italic tabular-nums ${tone === "bad" ? "text-red-800" : tone === "ok" ? "text-emerald-800" : "text-[#1A1A1A]"}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[10px] text-[#8C887D]">{hint}</p>}
    </div>
  );
}

function Pager({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / PAGE));
  if (total <= PAGE) return null;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between pt-2 text-[10px] text-[#8C887D]">
      <span aria-live="polite">{page * PAGE + 1}–{Math.min(total, (page + 1) * PAGE)} of {total}</span>
      <span className="space-x-2">
        <button type="button" disabled={page === 0} onClick={() => onChange(page - 1)} className="border border-[#D8E2F0] bg-white px-2.5 py-1 font-bold uppercase disabled:opacity-40 cursor-pointer">Previous</button>
        <button type="button" disabled={page >= pages - 1} onClick={() => onChange(page + 1)} className="border border-[#D8E2F0] bg-white px-2.5 py-1 font-bold uppercase disabled:opacity-40 cursor-pointer">Next</button>
      </span>
    </nav>
  );
}

/** Load something that depends on a page number, ignoring a slow response that arrives after a newer request. */
function useRemote<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setData(null); setError(null);
    load().then((d) => { if (live) setData(d); }).catch((e: PortalError) => { if (live) setError(e.message); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error };
}

const Loading = () => <p className="text-xs text-[#8C887D] italic py-2" role="status">Loading…</p>;
const Failed = ({ message }: { message: string }) => <p role="alert" className="border border-red-300 bg-red-50 p-2.5 text-xs text-red-800">{message}</p>;

// ---------- overview ----------
function Overview({ position, config, policies }: { position: PortalPosition; config: PortalConfig; policies: number | null }) {
  const day = (d: string) => formatDay(d, config.locale);
  return (
    <div className="space-y-6">
      <div className={card}>
        <h4 className={h4}>What is due</h4>
        {position.openInvoices.length === 0 ? <p className="text-xs text-[#8C887D] italic">Nothing is due. Thank you.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-xs">
            <caption className="sr-only">Invoices with a balance</caption>
            <thead><tr className="border-b border-[#D8E2F0]"><th scope="col" className={th}>Invoice</th><th scope="col" className={th}>Due</th><th scope="col" className={`${th} text-right`}>Balance</th></tr></thead>
            <tbody>{position.openInvoices.map((i) => (
              <tr key={i.id} className="border-b border-[#D8E2F0]/60 last:border-0">
                <td className={`${td} font-mono font-bold`}>{i.invoiceNo}</td>
                <td className={td}>{day(i.dueDate)} {i.overdue && <Pill tone="bad">Overdue</Pill>}</td>
                <td className={`${td} text-right tabular-nums font-bold`}>{i.outstanding.display}</td>
              </tr>))}</tbody>
          </table></div>
        )}
      </div>
      {position.chequesInClearing.length > 0 && (
        <div className={card}>
          <h4 className={h4}>Cheques being processed</h4>
          <ul className="space-y-2 text-xs">{position.chequesInClearing.map((c) => (
            <li key={c.id} className="flex justify-between items-center border border-[#D8E2F0] bg-[#FAF9F6]/60 p-3">
              <span><span className="font-mono font-bold">{c.receiptNo}</span> <span className="text-[#8C887D]">cheque {c.instrumentNo}</span></span>
              <span className="flex items-center gap-3"><span className="tabular-nums font-bold">{c.amount.display}</span><Pill tone="warn">{PAYMENT_STATUS[c.status]?.label ?? c.status}</Pill></span>
            </li>))}</ul>
          <p className="text-[10px] text-[#8C887D]">A cheque reduces what you owe only once the bank has cleared it.</p>
        </div>
      )}
      {policies !== null && <p className="text-xs text-[#8C887D]">You have {policies} polic{policies === 1 ? "y" : "ies"} with us. See the Policies tab for the details.</p>}
    </div>
  );
}

// ---------- invoices ----------
function Invoices({ config }: { config: PortalConfig }) {
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useRemote(() => portalApi.invoices(PAGE, page * PAGE), [page]);
  const detail = useRemote(() => (openId ? portalApi.invoice(openId) : Promise.resolve(null as PortalInvoice | null)), [openId]);
  if (list.error) return <Failed message={list.error} />;
  if (!list.data) return <Loading />;
  return (
    <div className={card}>
      <h4 className={h4}>Invoices</h4>
      {list.data.rows.length === 0 ? <p className="text-xs text-[#8C887D] italic">No invoices yet.</p> : (
        <div className="overflow-x-auto"><table className="w-full text-xs">
          <caption className="sr-only">Your invoices</caption>
          <thead><tr className="border-b border-[#D8E2F0]"><th scope="col" className={th}>Invoice</th><th scope="col" className={th}>Issued</th><th scope="col" className={th}>Due</th><th scope="col" className={`${th} text-right`}>Total</th><th scope="col" className={`${th} text-right`}>Balance</th><th scope="col" className={th}>Status</th></tr></thead>
          <tbody>{list.data.rows.map((i) => {
            const s = INVOICE_STATUS[i.status] ?? INVOICE_STATUS.open;
            const open = openId === i.id;
            return (
              <React.Fragment key={i.id}>
                <tr className="border-b border-[#D8E2F0]/60">
                  <td className={td}><button type="button" aria-expanded={open} onClick={() => setOpenId(open ? null : i.id)} className="font-mono font-bold text-[#316EC9] hover:underline cursor-pointer">{i.invoiceNo}</button></td>
                  <td className={td}>{formatDay(i.issueDate, config.locale)}</td><td className={td}>{formatDay(i.dueDate, config.locale)}</td>
                  <td className={`${td} text-right tabular-nums`}>{i.total.display}</td><td className={`${td} text-right tabular-nums font-bold`}>{i.outstanding.display}</td>
                  <td className={td}><Pill tone={s.tone}>{s.label}</Pill></td>
                </tr>
                {open && (
                  <tr><td colSpan={6} className="bg-[#FAF9F6] px-4 py-3">
                    {detail.error ? <Failed message={detail.error} /> : !detail.data ? <Loading /> : (
                      <table className="w-full text-[11px]"><caption className="sr-only">Lines of {i.invoiceNo}</caption>
                        <thead><tr><th scope="col" className={th}>Item</th><th scope="col" className={`${th} text-right`}>Amount</th><th scope="col" className={`${th} text-right`}>Paid</th></tr></thead>
                        <tbody>{detail.data.lines?.map((l) => <tr key={l.id}><td className="px-3 py-1.5">{l.description}</td><td className="px-3 py-1.5 text-right tabular-nums">{l.amount.display}</td><td className="px-3 py-1.5 text-right tabular-nums">{l.paid.display}</td></tr>)}</tbody>
                      </table>
                    )}
                  </td></tr>
                )}
              </React.Fragment>
            );
          })}</tbody>
        </table></div>
      )}
      <Pager page={page} total={list.data.total} onChange={(p) => { setOpenId(null); setPage(p); }} />
    </div>
  );
}

// ---------- payments ----------
function Payments({ config }: { config: PortalConfig }) {
  const [page, setPage] = useState(0);
  const list = useRemote(() => portalApi.receipts(PAGE, page * PAGE), [page]);
  if (list.error) return <Failed message={list.error} />;
  if (!list.data) return <Loading />;
  return (
    <div className={card}>
      <h4 className={h4}>Payments you have made</h4>
      {list.data.rows.length === 0 ? <p className="text-xs text-[#8C887D] italic">No payments recorded yet.</p> : (
        <div className="overflow-x-auto"><table className="w-full text-xs">
          <caption className="sr-only">Your payments</caption>
          <thead><tr className="border-b border-[#D8E2F0]"><th scope="col" className={th}>Receipt</th><th scope="col" className={th}>Received</th><th scope="col" className={th}>How</th><th scope="col" className={`${th} text-right`}>Amount</th><th scope="col" className={`${th} text-right`}>Not yet applied</th><th scope="col" className={th}>Status</th></tr></thead>
          <tbody>{list.data.rows.map((r) => {
            const s = PAYMENT_STATUS[r.status] ?? PAYMENT_STATUS.cleared;
            return (
              <tr key={r.id} className="border-b border-[#D8E2F0]/60 last:border-0">
                <td className={`${td} font-mono font-bold`}>{r.receiptNo}</td><td className={td}>{formatInstant(r.receivedAt, config.locale, config.timeZone)}</td>
                <td className={td}>{r.method}{r.instrumentNo ? ` ${r.instrumentNo}` : ""}</td>
                <td className={`${td} text-right tabular-nums`}>{r.amount.display}</td>
                <td className={`${td} text-right tabular-nums`}>{r.status === "cleared" && r.notYetApplied.amountMinor > 0 ? r.notYetApplied.display : "—"}</td>
                <td className={td}><Pill tone={s.tone}>{s.label}</Pill></td>
              </tr>);
          })}</tbody>
        </table></div>
      )}
      <Pager page={page} total={list.data.total} onChange={setPage} />
    </div>
  );
}

// ---------- policies ----------
function Policies({ config }: { config: PortalConfig }) {
  const [page, setPage] = useState(0);
  const list = useRemote(() => portalApi.policies(PAGE, page * PAGE), [page]);
  if (list.error) return <Failed message={list.error} />;
  if (!list.data) return <Loading />;
  return (
    <div className={card}>
      <h4 className={h4}>Your policies</h4>
      {list.data.rows.length === 0 ? <p className="text-xs text-[#8C887D] italic">No policies yet.</p> : (
        <ul className="space-y-3">{list.data.rows.map((p: PortalPolicy) => (
          <li key={p.id} className="border border-[#D8E2F0] bg-[#FAF9F6]/50 p-4 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <p className="font-serif italic text-sm text-[#1A1A1A]">{p.category}{p.insurer ? ` · ${p.insurer}` : ""}</p>
              <p className="text-[10px] text-[#8C887D] font-mono">Policy {p.id} · {formatDay(p.startDate, config.locale)} to {formatDay(p.endDate, config.locale)}</p>
            </div>
            <div className="flex items-center gap-3"><span className="tabular-nums font-bold">{p.premium.display}</span><Pill tone={p.status === "Active" ? "ok" : p.status === "Cancelled" || p.status === "Lapsed" || p.status === "Expired" ? "bad" : "idle"}>{p.status}</Pill></div>
          </li>))}</ul>
      )}
      <Pager page={page} total={list.data.total} onChange={setPage} />
    </div>
  );
}

// ---------- statement ----------
function Statement({ config }: { config: PortalConfig }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [applied, setApplied] = useState<{ from?: string; to?: string }>({});
  const s = useRemote<PortalStatement>(() => portalApi.statement(applied.from, applied.to), [applied]);
  return (
    <div className={card}>
      <h4 className={h4}>Account statement</h4>
      <form className="flex flex-wrap items-end gap-3 text-xs" onSubmit={(e) => { e.preventDefault(); setApplied({ from: from || undefined, to: to || undefined }); }} aria-label="Statement period">
        <label className="space-y-1"><span className="block text-[9px] uppercase tracking-wider text-[#8C887D]">From</span><input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="border border-[#D8E2F0] p-2 bg-white" /></label>
        <label className="space-y-1"><span className="block text-[9px] uppercase tracking-wider text-[#8C887D]">To</span><input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="border border-[#D8E2F0] p-2 bg-white" /></label>
        <button type="submit" className="bg-[#142C54] hover:bg-[#316EC9] text-white font-bold px-4 py-2.5 text-[10px] uppercase tracking-widest cursor-pointer">Show</button>
      </form>
      {s.error ? <Failed message={s.error} /> : !s.data ? <Loading /> : (
        <div className="overflow-x-auto"><table className="w-full text-xs">
          <caption className="sr-only">Statement, dates in {s.data.timeZone}</caption>
          <thead><tr className="border-b border-[#D8E2F0]"><th scope="col" className={th}>Date</th><th scope="col" className={th}>Details</th><th scope="col" className={`${th} text-right`}>Amount</th><th scope="col" className={`${th} text-right`}>Balance</th></tr></thead>
          <tbody>
            {s.data.openingBalance.amountMinor !== 0 && <tr className="border-b border-[#D8E2F0]/60 text-[#8C887D]"><td className={td} colSpan={3}>Balance brought forward</td><td className={`${td} text-right tabular-nums`}>{s.data.openingBalance.display}</td></tr>}
            {s.data.entries.length === 0 && <tr><td colSpan={4} className="px-3 py-4 text-[#8C887D] italic">Nothing in this period.</td></tr>}
            {s.data.entries.map((e, i) => (
              <tr key={i} className="border-b border-[#D8E2F0]/60 last:border-0">
                <td className={td}>{formatDay(e.date, config.locale)}</td>
                <td className={td}><span className="font-mono font-bold">{e.reference}</span> <span className="text-[#8C887D]">{e.description}</span></td>
                <td className={`${td} text-right tabular-nums ${e.amount.amountMinor < 0 ? "text-emerald-800" : ""}`}>{e.amount.display}</td>
                <td className={`${td} text-right tabular-nums font-bold`}>{e.balance.display}</td>
              </tr>))}
            <tr className="border-t-2 border-[#D8E2F0] font-bold"><td className={td} colSpan={3}>Balance owing</td><td className={`${td} text-right tabular-nums`}>{s.data.closingBalance.display}</td></tr>
          </tbody>
        </table></div>
      )}
    </div>
  );
}

// ---------- the account ----------
export type AccountTab = "overview" | "invoices" | "payments" | "policies" | "statement" | "saved" | "security";
const TABS: { id: AccountTab; label: string }[] = [
  { id: "overview", label: "Overview" }, { id: "invoices", label: "Invoices" }, { id: "payments", label: "Payments" },
  { id: "policies", label: "Policies" }, { id: "statement", label: "Statement" }, { id: "saved", label: "Saved quotes & scans" },
  { id: "security", label: "Security" },
];

export function PortalAccount({ me, config, savedWork, onSecurityChanged }: { me: PortalMe; config: PortalConfig; savedWork: React.ReactNode; onSecurityChanged: () => void }) {
  const [tab, setTab] = useState<AccountTab>("overview");
  const [position, setPosition] = useState<PortalPosition | null>(null);
  const [policyCount, setPolicyCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    portalApi.position().then(setPosition).catch((e: PortalError) => setError(e.message));
    portalApi.policies(1, 0).then((r) => setPolicyCount(r.total)).catch(() => setPolicyCount(null));
  }, []);
  useEffect(load, [load]);

  return (
    <div className="space-y-8" id="login-portal-workspace">
      <div className="border border-[#D8E2F0] bg-[#FAF9F6] p-6 rounded-none">
        <span className="border border-[#316EC9]/30 bg-[#F0F5FC] px-2 py-0.5 text-[9px] font-bold text-[#316EC9] uppercase tracking-wider">Client account</span>
        <h2 className="mt-1 text-lg font-serif italic text-[#1A1A1A]">{me.name ?? me.email}</h2>
        <p className="text-xs text-[#8C887D]">{me.email}{me.phone ? ` · ${me.phone}` : ""}</p>
      </div>

      {error && <Failed message={error} />}
      {position && (
        <div className="grid gap-3 sm:grid-cols-3" role="group" aria-label="Your balances">
          <Stat label="You owe" value={position.outstanding.display} tone={position.outstanding.amountMinor > 0 ? "bad" : "ok"} hint={position.openInvoices.length ? `${position.openInvoices.length} open invoice${position.openInvoices.length === 1 ? "" : "s"}` : undefined} />
          <Stat label="Payments not yet applied" value={position.unappliedPayments.display} hint="Held for you and applied to invoices by your broker" />
          <Stat label="Cheques being processed" value={String(position.chequesInClearing.length)} />
        </div>
      )}

      <div role="tablist" aria-label="Account sections" className="flex flex-wrap gap-1 border-b border-[#D8E2F0]">
        {TABS.map((t) => (
          <button key={t.id} role="tab" type="button" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-[10px] uppercase tracking-wider font-bold cursor-pointer ${tab === t.id ? "border-[#316EC9] text-[#316EC9]" : "border-transparent text-[#8C887D] hover:text-[#1A1A1A]"}`}>{t.label}</button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "overview" && (position ? <Overview position={position} config={config} policies={policyCount} /> : error ? null : <Loading />)}
        {tab === "invoices" && <Invoices config={config} />}
        {tab === "payments" && <Payments config={config} />}
        {tab === "policies" && <Policies config={config} />}
        {tab === "statement" && <Statement config={config} />}
        {tab === "saved" && savedWork}
        {tab === "security" && <PortalSecurity enabled={Boolean(me.mfaEnabled)} onChanged={onSecurityChanged} />}
      </div>
    </div>
  );
}
