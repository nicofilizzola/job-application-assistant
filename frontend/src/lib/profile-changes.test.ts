import { describe, expect, it } from "vitest";

import { diffProfile } from "@/lib/profile-diff";
import { restore, revert, toChanges, toSegments } from "@/lib/profile-changes";

const PROFILE = `## Profile
Full stack engineer, six years, based in Paris.
Looking for backend work.

## Skills
Python, FastAPI, PostgreSQL

## Experience
Senior engineer at Acme Insurance since 2023.

## Certifications
None yet.`;

describe("toChanges", () => {
  it("finds nothing in an untouched draft", () => {
    expect(toChanges(diffProfile(PROFILE, PROFILE))).toEqual([]);
  });

  it("labels a change with the heading above it", () => {
    const draft = PROFILE.replace("None yet.", "None yet.\nAWS Solutions Architect Associate");

    const changes = toChanges(diffProfile(PROFILE, draft));

    expect(changes).toHaveLength(1);
    expect(changes[0].label).toBe("## Certifications");
    expect(changes[0].excerpt).toContain("AWS Solutions Architect Associate");
  });

  it("falls back to a line number when nothing above it is a heading", () => {
    const plain = "One line.\nAnother line.";

    const changes = toChanges(diffProfile(plain, plain.replace("Another", "Other")));

    expect(changes[0].label).toBe("line 2");
  });

  it("keeps distant edits apart and merges neighbouring ones", () => {
    const draft = PROFILE.replace("PostgreSQL", "PostgreSQL, Rust").replace(
      "None yet.",
      "None yet.\nAWS Solutions Architect Associate",
    );

    const changes = toChanges(diffProfile(PROFILE, draft));

    expect(changes.map((change) => change.label)).toEqual(["## Skills", "## Certifications"]);
  });

  it("selects exactly the added text", () => {
    const draft = PROFILE.replace("PostgreSQL", "PostgreSQL, Rust");

    const [change] = toChanges(diffProfile(PROFILE, draft));

    expect(draft.slice(change.selectionStart, change.selectionEnd)).toBe(", Rust");
  });

  it("records a dropped line with the offset it goes back at", () => {
    const draft = PROFILE.replace("Looking for backend work.\n", "");

    const [change] = toChanges(diffProfile(PROFILE, draft));

    expect(change.removals).toHaveLength(1);
    expect(change.removals[0].text).toContain("Looking for backend work.");
    expect(change.excerpt).toContain("Looking for backend work.");
  });

  it("keeps two additions in one change as separate spans", () => {
    // One line rewritten with untouched words in the middle: a single span covering both additions
    // would swallow "engineer at Acme Insurance", which revert would then delete.
    const draft = PROFILE.replace(
      "Senior engineer at Acme Insurance since 2023.",
      "Lead engineer at Acme Insurance since 2024.",
    );

    const [change] = toChanges(diffProfile(PROFILE, draft));

    expect(change.added.length).toBeGreaterThan(1);
    for (const range of change.added) {
      expect(draft.slice(range.start, range.end)).not.toContain("engineer at Acme");
    }
  });
});

describe("toSegments", () => {
  it("returns the whole value as one plain segment when nothing is highlighted", () => {
    expect(toSegments("abc", [])).toEqual([{ text: "abc", highlighted: false }]);
  });

  it("splits around a highlighted range", () => {
    expect(toSegments("abcdef", [{ start: 2, end: 4 }])).toEqual([
      { text: "ab", highlighted: false },
      { text: "cd", highlighted: true },
      { text: "ef", highlighted: false },
    ]);
  });

  it("joins back into the value exactly", () => {
    // The mirror renders these segments, so anything the split loses is a glyph the highlight
    // drifts by.
    const value = "## Skills\nPython, FastAPI\n\n## Experience\nSix years";
    const ranges = [
      { start: 0, end: 2 },
      { start: 17, end: 24 },
      { start: 40, end: 45 },
    ];

    const joined = toSegments(value, ranges)
      .map((segment) => segment.text)
      .join("");

    expect(joined).toBe(value);
  });

  it("ignores an empty range and clamps one that runs past the end", () => {
    expect(toSegments("abc", [{ start: 1, end: 1 }])).toEqual([{ text: "abc", highlighted: false }]);
    expect(toSegments("abc", [{ start: 1, end: 99 }])).toEqual([
      { text: "a", highlighted: false },
      { text: "bc", highlighted: true },
    ]);
  });
});

describe("revert", () => {
  it("removes the added text and leaves the rest alone", () => {
    const draft = PROFILE.replace("PostgreSQL", "PostgreSQL, Rust");
    const [change] = toChanges(diffProfile(PROFILE, draft));

    expect(revert(draft, change)).toBe(PROFILE);
  });

  it("removes every span of a change with more than one", () => {
    const draft = PROFILE.replace(
      "Senior engineer at Acme Insurance since 2023.",
      "Lead engineer at Acme Insurance since 2024.",
    );
    const [change] = toChanges(diffProfile(PROFILE, draft));

    // Reverting the additions alone cannot bring back words the rewrite deleted, so what is left is
    // the draft minus its additions - which `restore` is for.
    const reverted = revert(draft, change);
    expect(reverted).not.toContain("Lead");
    expect(reverted).not.toContain("2024");
    expect(reverted).toContain("engineer at Acme Insurance");
  });
});

describe("restore", () => {
  it("puts a dropped line back where it was", () => {
    const draft = PROFILE.replace("Looking for backend work.\n", "");
    const [change] = toChanges(diffProfile(PROFILE, draft));

    expect(restore(draft, change)).toBe(PROFILE);
  });

  it("puts back every removal of a change with more than one", () => {
    const draft = PROFILE.replace("Python, FastAPI, PostgreSQL", "Python");
    const [change] = toChanges(diffProfile(PROFILE, draft));

    expect(restore(draft, change)).toContain("FastAPI");
    expect(restore(draft, change)).toContain("PostgreSQL");
  });
});
