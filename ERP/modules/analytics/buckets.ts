// Pure date bucketing for KPI series (no database import, so it is safe to unit-test directly).

export type Granularity = "day" | "week" | "month";

function bucketOf(date: string, granularity: Granularity, weekStartsOn: number): string {
  if (granularity === "day") return date;
  if (granularity === "month") return date.slice(0, 7);
  const d = new Date(date + "T00:00:00Z");
  const back = (d.getUTCDay() - weekStartsOn + 7) % 7;
  return new Date(d.getTime() - back * 86400000).toISOString().slice(0, 10);
}

/** Roll a series of per-local-day values up into weeks (starting on `weekStartsOn`, 0 = Sunday) or months. */
export function rebucket(series: { date: string; value: number }[], granularity: Granularity, weekStartsOn: number) {
  const out = new Map<string, number>();
  for (const p of series) {
    const k = bucketOf(p.date, granularity, weekStartsOn);
    out.set(k, (out.get(k) ?? 0) + p.value);
  }
  return [...out].sort(([a], [b]) => a.localeCompare(b)).map(([bucket, value]) => ({ bucket, value }));
}
