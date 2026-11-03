import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { daysBetween, isValidTimeZone, localDate, localDayRange, startOfLocalDay, zoneOffsetMinutes } from "../../lib/time";

describe("tenant time", () => {
  it("validates IANA zone ids", () => {
    expect(isValidTimeZone("Africa/Nairobi")).toBe(true);
    expect(isValidTimeZone("Europe/Berlin")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });

  it("reports zone offsets, including daylight saving", () => {
    expect(zoneOffsetMinutes(new Date("2026-01-15T12:00:00Z"), "Africa/Nairobi")).toBe(180);
    expect(zoneOffsetMinutes(new Date("2026-01-15T12:00:00Z"), "Europe/Berlin")).toBe(60);
    expect(zoneOffsetMinutes(new Date("2026-07-15T12:00:00Z"), "Europe/Berlin")).toBe(120);
    expect(zoneOffsetMinutes(new Date("2026-07-15T12:00:00Z"), "America/New_York")).toBe(-240);
    expect(zoneOffsetMinutes(new Date("2026-07-15T12:00:00Z"), "UTC")).toBe(0);
  });

  it("puts an instant on the right local day", () => {
    // 22:30 UTC is already tomorrow in Nairobi, still today in New York
    const i = new Date("2026-03-10T22:30:00Z");
    expect(localDate(i, "UTC")).toBe("2026-03-10");
    expect(localDate(i, "Africa/Nairobi")).toBe("2026-03-11");
    expect(localDate(i, "America/New_York")).toBe("2026-03-10");
  });

  it("finds the UTC instant a local day begins", () => {
    expect(startOfLocalDay("2026-03-11", "Africa/Nairobi").toISOString()).toBe("2026-03-10T21:00:00.000Z");
    expect(startOfLocalDay("2026-03-11", "UTC").toISOString()).toBe("2026-03-11T00:00:00.000Z");
    expect(startOfLocalDay("2026-01-10", "America/New_York").toISOString()).toBe("2026-01-10T05:00:00.000Z");
  });

  it("handles the day clocks change", () => {
    // Berlin springs forward on 2026-03-29: that local day is only 23 hours long
    const { from, to } = localDayRange("2026-03-29", "2026-03-29", "Europe/Berlin");
    expect((to.getTime() - from.getTime()) / 3600000).toBe(23);
    const fall = localDayRange("2026-10-25", "2026-10-25", "Europe/Berlin");
    expect((fall.to.getTime() - fall.from.getTime()) / 3600000).toBe(25);
  });

  it("builds half-open ranges that tile with no gap or overlap", () => {
    const a = localDayRange("2026-02-01", "2026-02-28", "Africa/Nairobi");
    const b = localDayRange("2026-03-01", "2026-03-31", "Africa/Nairobi");
    expect(a.to.getTime()).toBe(b.from.getTime());
  });

  it("counts days between dates", () => {
    expect(daysBetween("2026-01-01", "2026-01-31")).toBe(30);
    expect(daysBetween("2026-03-01", "2026-02-01")).toBe(-28);
  });

  it("rejects malformed dates", () => {
    expect(() => startOfLocalDay("11/03/2026", "UTC")).toThrow(RangeError);
  });

  it("property: an instant lies within the range of its own local day", () => {
    const zones = ["Africa/Nairobi", "Europe/Berlin", "America/New_York", "UTC", "Asia/Kolkata", "Pacific/Auckland"];
    fc.assert(
      fc.property(
        fc.date({ min: new Date("2020-01-01T00:00:00Z"), max: new Date("2032-12-31T00:00:00Z"), noInvalidDate: true }),
        fc.constantFrom(...zones),
        (instant, zone) => {
          const day = localDate(instant, zone);
          const { from, to } = localDayRange(day, day, zone);
          expect(instant.getTime()).toBeGreaterThanOrEqual(from.getTime());
          expect(instant.getTime()).toBeLessThan(to.getTime());
        },
      ),
    );
  });
});
