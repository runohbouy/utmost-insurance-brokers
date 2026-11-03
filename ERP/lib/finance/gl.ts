// ---------------------------------------------------------------------------
// General-ledger posting for the receipts / allocation module.
//
// Unlike the legacy auto-poster in server.ts (which logs and carries on when a
// posting fails), these functions THROW. They run inside the same database
// transaction as the receipt or allocation they describe, so a ledger that
// cannot be posted (closed period, unbalanced entry) rolls the whole business
// event back instead of leaving receipts and ledger out of step.
//
// Entries are written in bulk (one statement for all entries, one for all
// lines): allocating a receipt across 50 invoices posts 50 entries in two round
// trips, not a hundred and fifty.
// ---------------------------------------------------------------------------
import { Money } from "../money";
import { conflict } from "../http/problem";
import { newId, rows, sql, type SQL, type Tx } from "../sql";

export interface GlLine {
  account: string;
  side: "debit" | "credit";
  amount: Money;
  description?: string;
  policyId?: string | null;
  partyId?: string | null;
}

export interface PostInput {
  /** Calendar date in the tenant's zone, YYYY-MM-DD. */
  entryDate: string;
  description: string;
  sourceType: "receipt" | "allocation" | "reversal";
  sourceId: string;
  lines: GlLine[];
  postedBy: string | null;
  reversalOfEntryId?: string;
}

const tuples = (rowsOfValues: SQL[][]) => sql.join(rowsOfValues.map((r) => sql`(${sql.join(r, sql`, `)})`), sql`, `);

/** Make sure each accounting period exists and is open. One lookup for all the dates in a batch. */
async function ensurePeriods(tx: Tx, dates: string[]): Promise<void> {
  const periods = [...new Set(dates.map((d) => d.slice(0, 7)))];
  const found = await rows<{ id: string; status: string }>(tx, sql`SELECT id, status FROM finance.accounting_periods WHERE id IN (${sql.join(periods.map((p) => sql`${p}`), sql`, `)})`);
  const byId = new Map(found.map((f) => [f.id, f.status]));
  for (const id of periods) {
    const status = byId.get(id);
    if (status && status !== "open") throw conflict("accounting-period-closed", "Accounting period is closed", `Period ${id} is closed; reopen it or post in an open period`);
    if (!status) {
      const [y, m] = id.split("-").map(Number);
      const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
      await tx.execute(sql`INSERT INTO finance.accounting_periods (id, start_date, end_date) VALUES (${id}, ${id + "-01"}, ${last}) ON CONFLICT (id) DO NOTHING`);
    }
  }
}

function checkBalanced(input: PostInput): GlLine[] {
  const lines = input.lines.filter((l) => !l.amount.isZero());
  if (lines.length < 2) throw new Error("a journal entry needs at least two non-zero lines");
  const cur = lines[0].amount.currency;
  let debit = 0n;
  let credit = 0n;
  for (const l of lines) {
    if (l.amount.currency !== cur) throw new Error("journal entry mixes currencies");
    if (l.amount.isNegative()) throw new Error("journal lines must be positive; use the other side instead");
    if (l.side === "debit") debit += BigInt(l.amount.minor); else credit += BigInt(l.amount.minor);
  }
  if (debit !== credit) throw new Error(`journal entry is unbalanced (debit ${debit}, credit ${credit}) for ${input.sourceType}/${input.sourceId}`);
  return lines;
}

/** Post many entries at once. Returns their ids in input order. */
export async function postEntries(tx: Tx, inputs: PostInput[]): Promise<string[]> {
  if (inputs.length === 0) return [];
  const checked = inputs.map((i) => ({ input: i, lines: checkBalanced(i), id: newId("je") }));
  await ensurePeriods(tx, checked.map((c) => c.input.entryDate));

  await tx.execute(sql`INSERT INTO finance.journal_entries (id, period_id, entry_date, description, source_type, source_id, reversal_of_entry_id, posted_by)
    VALUES ${tuples(checked.map(({ input, id }) => [
      sql`${id}`, sql`${input.entryDate.slice(0, 7)}`, sql`${input.entryDate}::date`, sql`${input.description}`, sql`${input.sourceType}`,
      sql`${input.sourceId}`, sql`${input.reversalOfEntryId ?? null}`, sql`${input.postedBy}`,
    ]))}`);

  const lineRows: SQL[][] = [];
  for (const { id, lines } of checked) {
    for (const l of lines) {
      const major = l.amount.toMajorString();
      lineRows.push([sql`${id}`, sql`${l.account}`, sql`${l.side === "debit" ? major : "0"}::numeric`, sql`${l.side === "credit" ? major : "0"}::numeric`,
        sql`${l.description ?? null}`, sql`${l.policyId ?? null}`, sql`${l.partyId ?? null}`]);
    }
  }
  await tx.execute(sql`INSERT INTO finance.journal_lines (entry_id, account_code, debit_kes, credit_kes, description, policy_id, party_id) VALUES ${tuples(lineRows)}`);
  return checked.map((c) => c.id);
}

export async function postEntry(tx: Tx, input: PostInput): Promise<string> {
  return (await postEntries(tx, [input]))[0];
}

/**
 * Posts the mirror image of each entry and marks the originals reversed. Entries that
 * already have a reversal are skipped, so calling this twice changes nothing.
 * Returns the number of reversals actually written.
 */
export async function reverseEntries(tx: Tx, entryIds: string[], entryDate: string, reason: string, postedBy: string | null, currency: string): Promise<number> {
  if (entryIds.length === 0) return 0;
  const idList = sql.join(entryIds.map((i) => sql`${i}`), sql`, `);
  const originals = await rows<{ id: string }>(tx, sql`
    SELECT e.id FROM finance.journal_entries e
    WHERE e.id IN (${idList}) AND NOT EXISTS (SELECT 1 FROM finance.journal_entries r WHERE r.reversal_of_entry_id = e.id)
    ORDER BY e.id FOR UPDATE OF e`);
  if (originals.length === 0) return 0;

  const todo = sql.join(originals.map((o) => sql`${o.id}`), sql`, `);
  const lines = await rows<{ entry_id: string; account_code: string; debit_kes: string; credit_kes: string; description: string | null; policy_id: string | null; party_id: string | null }>(
    tx, sql`SELECT entry_id, account_code, debit_kes::text, credit_kes::text, description, policy_id, party_id FROM finance.journal_lines WHERE entry_id IN (${todo}) ORDER BY id`);
  const byEntry = new Map<string, typeof lines>();
  for (const l of lines) (byEntry.get(l.entry_id) ?? byEntry.set(l.entry_id, []).get(l.entry_id)!).push(l);

  await postEntries(tx, originals.map((o) => ({
    entryDate, description: `Reversal of ${o.id}: ${reason}`, sourceType: "reversal" as const, sourceId: o.id, reversalOfEntryId: o.id, postedBy,
    lines: (byEntry.get(o.id) ?? []).map((l): GlLine => {
      const debit = Number(l.debit_kes) > 0;
      return {
        account: l.account_code, side: debit ? "credit" : "debit", // swapped
        amount: Money.fromMajor(debit ? l.debit_kes : l.credit_kes, currency),
        description: l.description ?? undefined, policyId: l.policy_id, partyId: l.party_id,
      };
    }),
  })));
  await tx.execute(sql`UPDATE finance.journal_entries SET status = 'reversed' WHERE id IN (${todo})`);
  return originals.length;
}

/** Journal entry ids created for business records of one kind (e.g. allocations), keyed by the record id. */
export async function entriesFor(tx: Tx, sourceType: "receipt" | "allocation", sourceIds: string[]): Promise<Map<string, string>> {
  if (sourceIds.length === 0) return new Map();
  const found = await rows<{ id: string; source_id: string }>(tx, sql`
    SELECT id, source_id FROM finance.journal_entries
    WHERE source_type = ${sourceType} AND source_id IN (${sql.join(sourceIds.map((i) => sql`${i}`), sql`, `)}) AND reversal_of_entry_id IS NULL`);
  return new Map(found.map((f) => [f.source_id, f.id]));
}

export async function entryFor(tx: Tx, sourceType: "receipt" | "allocation", sourceId: string): Promise<string | null> {
  return (await entriesFor(tx, sourceType, [sourceId])).get(sourceId) ?? null;
}

export async function reverseEntry(tx: Tx, entryId: string, entryDate: string, reason: string, postedBy: string | null, currency: string): Promise<void> {
  await reverseEntries(tx, [entryId], entryDate, reason, postedBy, currency);
}

