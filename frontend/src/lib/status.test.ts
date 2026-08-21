import { describe, expect, it } from "vitest";

import { STATUSES, isClosed, statusClasses, type Status } from "@/lib/status";

describe("isClosed", () => {
  it.each<[Status, boolean]>([
    ["Contacted", false],
    ["Applied", false],
    ["Interview", false],
    ["Tech test", false],
    ["Offer", false],
    ["Rejected", true],
    ["Withdrawn", true],
  ])("%s -> %s", (status, closed) => {
    expect(isClosed(status)).toBe(closed);
  });
});

describe("statusClasses", () => {
  it("covers every status", () => {
    for (const status of STATUSES) {
      expect(statusClasses(status)).toBeTruthy();
    }
  });

  it("gives each status its own colour", () => {
    const classes = STATUSES.map(statusClasses);
    expect(new Set(classes).size).toBe(STATUSES.length);
  });

  it("uses the colours the spec asks for", () => {
    expect(statusClasses("Contacted")).toContain("sky");
    expect(statusClasses("Applied")).toContain("zinc");
    expect(statusClasses("Interview")).toContain("amber");
    expect(statusClasses("Tech test")).toContain("violet");
    expect(statusClasses("Offer")).toContain("emerald");
    expect(statusClasses("Rejected")).toContain("rose");
    expect(statusClasses("Withdrawn")).toContain("muted-foreground");
  });

  it("carries a dark variant everywhere a colour is used", () => {
    for (const status of STATUSES) {
      expect(statusClasses(status)).toContain("dark:");
    }
  });

  it("lists the statuses as a funnel", () => {
    expect(STATUSES).toEqual([
      "Contacted",
      "Applied",
      "Interview",
      "Tech test",
      "Offer",
      "Rejected",
      "Withdrawn",
    ]);
  });
});
