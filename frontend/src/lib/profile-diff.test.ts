import { describe, expect, it } from "vitest";

import { diffProfile, type Piece, type ProfileDiff } from "@/lib/profile-diff";

const PROFILE = "## Skills\nPython, FastAPI, Postgres\n\n## Experience\nSix years full stack";
const WITH_SECTION = `${PROFILE}\n\n## Certifications\nAWS Solutions Architect Associate`;
const EXTENDED_LINE = PROFILE.replace("FastAPI, Postgres", "FastAPI, Postgres, AWS");

/** The text of every piece of one kind, joined. Asserting on this rather than on the array is
 *  deliberate: how many pieces a run of added words is split into is jsdiff's business. */
function joined(diff: ProfileDiff, kind: Piece["kind"]): string {
  return diff.pieces
    .filter((piece) => piece.kind === kind)
    .map((piece) => piece.text)
    .join("");
}

describe("diffProfile", () => {
  it("reports nothing when the draft is untouched", () => {
    const diff = diffProfile(PROFILE, PROFILE);

    expect(diff.addedWords).toBe(0);
    expect(diff.removedWords).toBe(0);
    expect(joined(diff, "same")).toBe(PROFILE);
  });

  it("marks a whole new section as added", () => {
    const diff = diffProfile(PROFILE, WITH_SECTION);

    expect(diff.addedWords).toBe(5);
    expect(diff.removedWords).toBe(0);
    expect(joined(diff, "added")).toContain("## Certifications");
    expect(joined(diff, "added")).toContain("AWS Solutions Architect Associate");
  });

  it("marks only the appended words when an existing line is extended", () => {
    // One line out and one line in at line granularity, yet nothing was lost. Reporting a removal
    // here would put a warning on the commonest edit there is.
    const diff = diffProfile(PROFILE, EXTENDED_LINE);

    expect(diff.addedWords).toBe(1);
    expect(diff.removedWords).toBe(0);
    expect(joined(diff, "added")).toContain("AWS");
    expect(joined(diff, "added")).not.toContain("Postgres");
  });

  it("counts and marks what a rewrite dropped", () => {
    const withoutSkills = PROFILE.replace("Python, FastAPI, Postgres\n", "");

    const diff = diffProfile(PROFILE, withoutSkills);

    expect(diff.removedWords).toBe(3);
    expect(joined(diff, "removed")).toContain("Python, FastAPI, Postgres");
  });

  it("counts both sides when a line is reworded", () => {
    const diff = diffProfile(PROFILE, PROFILE.replace("Six years", "Seven years"));

    expect(diff.addedWords).toBe(1);
    expect(diff.removedWords).toBe(1);
    expect(joined(diff, "added")).toContain("Seven");
    expect(joined(diff, "removed")).toContain("Six");
  });

  it("treats a first version as all additions", () => {
    const diff = diffProfile("", "AWS Solutions Architect Associate");

    expect(diff.addedWords).toBe(4);
    expect(diff.removedWords).toBe(0);
    expect(joined(diff, "same")).toBe("");
    expect(joined(diff, "added")).toBe("AWS Solutions Architect Associate");
  });

  // The panel renders these pieces as the whole document, so anything the split loses is text the
  // user would never see. Dropping the removed pieces has to give the draft back exactly, and
  // dropping the added ones has to give the saved profile back exactly.
  it.each([
    ["a new section", PROFILE, WITH_SECTION],
    ["an extended line", PROFILE, EXTENDED_LINE],
    ["everything deleted", PROFILE, ""],
  ])("reassembles both sides after %s", (_case, before, after) => {
    const diff = diffProfile(before, after);

    expect(
      diff.pieces
        .filter((piece) => piece.kind !== "removed")
        .map((piece) => piece.text)
        .join(""),
    ).toBe(after);
    expect(
      diff.pieces
        .filter((piece) => piece.kind !== "added")
        .map((piece) => piece.text)
        .join(""),
    ).toBe(before);
  });
});
