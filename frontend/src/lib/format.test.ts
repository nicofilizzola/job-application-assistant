import { afterEach, describe, expect, it, vi } from "vitest";

import { formatDate, formatRating, todayIso } from "@/lib/format";

describe("formatDate", () => {
  it.each([
    ["2026-08-06", "6 Aug 2026"],
    ["2026-07-07", "7 Jul 2026"],
    ["2026-12-31", "31 Dec 2026"],
  ])("%s -> %s", (iso, expected) => {
    expect(formatDate(iso)).toBe(expected);
  });

  // The whole suite runs in America/Los_Angeles, set in vitest.config.mts, so this is a real
  // assertion rather than one that happens to hold in the timezone the machine is in.
  it("does not slip to the previous day west of UTC", () => {
    expect(formatDate("2026-08-01")).toBe("1 Aug 2026");
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

describe("todayIso", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // Both instants are built in local time, so the expected day holds in any timezone the suite
  // runs in - and both would come out a day wrong if todayIso reached for toISOString directly.
  it.each([
    [new Date(2026, 7, 17, 23, 30), "2026-08-17"],
    [new Date(2026, 7, 18, 0, 30), "2026-08-18"],
  ])("%s -> %s", (now, expected) => {
    vi.useFakeTimers();
    vi.setSystemTime(now);

    expect(todayIso()).toBe(expected);
  });
});
