// ---------------------------------------------------------------------------
// Time: instants are stored in UTC; the zone an organisation operates in is an
// IANA id. A "day" for business purposes is a day in the TENANT's zone, never
// the server's. These helpers convert between the two and nothing else reads
// the host clock's zone.
// ---------------------------------------------------------------------------

/** A real calendar date in YYYY-MM-DD form (rejects 2026-02-30, which Date would silently roll into March). */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return typeof zone === "string" && zone.length > 0;
  } catch {
    return false;
  }
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>();
function formatter(zone: string): Intl.DateTimeFormat {
  let f = partsFormatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    partsFormatters.set(zone, f);
  }
  return f;
}

function partsOf(instant: Date, zone: string) {
  const p: Record<string, string> = {};
  for (const { type, value } of formatter(zone).formatToParts(instant)) p[type] = value;
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}

/** The calendar date (YYYY-MM-DD) that `instant` falls on in `zone`. */
export function localDate(instant: Date, zone: string): string {
  const { y, mo, d } = partsOf(instant, zone);
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Offset of `zone` from UTC at `instant`, in minutes (Nairobi → 180). */
export function zoneOffsetMinutes(instant: Date, zone: string): number {
  const { y, mo, d, h, mi, s } = partsOf(instant, zone);
  const asIfUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  return Math.round((asIfUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
}

/** The UTC instant at which local calendar day `date` (YYYY-MM-DD) begins in `zone`. */
export function startOfLocalDay(date: string, zone: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m || !isCalendarDate(date)) throw new RangeError(`Not a YYYY-MM-DD date: ${date}`);
  const wallClockUtc = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  // First guess uses the offset at that wall-clock moment; a second pass fixes days that
  // straddle a DST change.
  let guess = new Date(wallClockUtc - zoneOffsetMinutes(new Date(wallClockUtc), zone) * 60000);
  guess = new Date(wallClockUtc - zoneOffsetMinutes(guess, zone) * 60000);
  return guess;
}

/** Half-open UTC range [from, to) covering local days `fromDate` through `toDate` inclusive. */
export function localDayRange(fromDate: string, toDate: string, zone: string): { from: Date; to: Date } {
  const next = new Date(Date.parse(toDate + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);
  return { from: startOfLocalDay(fromDate, zone), to: startOfLocalDay(next, zone) };
}

/** Whole local days from `a` to `b` (both YYYY-MM-DD); negative if b is earlier. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}
