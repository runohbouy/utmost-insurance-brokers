import { describe, expect, it } from "vitest";
import { usePagedSlice, PAGE_SIZE } from "../../src/components/Pagination";
import { matchesQuery } from "../../src/components/SearchInput";

// usePagedSlice is a plain function despite the "use" prefix (no React
// hooks inside), so it can be tested without rendering anything.
describe("usePagedSlice", () => {
  const items = Array.from({ length: 60 }, (_, i) => i);

  it("returns the first page of PAGE_SIZE rows", () => {
    const { pageItems, totalPages, clampedPage } = usePagedSlice(items, 0);
    expect(pageItems).toHaveLength(PAGE_SIZE);
    expect(pageItems[0]).toBe(0);
    expect(totalPages).toBe(3);
    expect(clampedPage).toBe(0);
  });

  it("returns the short last page", () => {
    const { pageItems } = usePagedSlice(items, 2);
    expect(pageItems).toEqual(items.slice(50));
  });

  it("clamps a page past the end (e.g. after a search narrows the list)", () => {
    const { pageItems, clampedPage } = usePagedSlice(items.slice(0, 10), 7);
    expect(clampedPage).toBe(0);
    expect(pageItems).toHaveLength(10);
  });

  it("handles an empty list as a single empty page", () => {
    const { pageItems, totalPages, clampedPage } = usePagedSlice([], 3);
    expect(pageItems).toEqual([]);
    expect(totalPages).toBe(1);
    expect(clampedPage).toBe(0);
  });

  it("respects a custom page size", () => {
    expect(usePagedSlice(items, 1, 10).pageItems[0]).toBe(10);
  });
});

describe("matchesQuery", () => {
  it("matches everything for an empty or whitespace query", () => {
    expect(matchesQuery("", "anything")).toBe(true);
    expect(matchesQuery("   ", "anything")).toBe(true);
  });

  it("is case-insensitive and matches substrings", () => {
    expect(matchesQuery("nak", "Nakuru")).toBe(true);
    expect(matchesQuery("NAKURU", "nakuru")).toBe(true);
  });

  it("matches on any field", () => {
    expect(matchesQuery("0718", "Daniel", "0718814216", null)).toBe(true);
  });

  it("ignores null, undefined and non-matching fields", () => {
    expect(matchesQuery("zzz", "Daniel", null, undefined, 42)).toBe(false);
  });

  it("matches numbers by their text", () => {
    expect(matchesQuery("493", 4930)).toBe(true);
  });

  it("trims the query", () => {
    expect(matchesQuery("  kisumu ", "Kisumu")).toBe(true);
  });
});
