import { describe, expect, it } from "vitest";

import { formatDate, formatRating } from "@/lib/format";

describe("formatDate", () => {
  it.each([
    ["2026-08-06", "6 Aug 2026"],
    ["2026-07-07", "7 Jul 2026"],
    ["2026-12-31", "31 Dec 2026"],
  ])("%s -> %s", (iso, expected) => {
    expect(formatDate(iso)).toBe(expected);
  });

  it("does not slip to the previous day west of UTC", () => {
    const original = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      expect(formatDate("2026-08-01")).toBe("1 Aug 2026");
    } finally {
      process.env.TZ = original;
    }
  });
});

describe("formatRating", () => {
  it.each([
    [4.5, "4.5"],
    [5, "5"],
    [1, "1"],
    [null, "-"],
    [undefined, "-"],
  ])("%s -> %s", (rating, expected) => {
    expect(formatRating(rating)).toBe(expected);
  });
});
