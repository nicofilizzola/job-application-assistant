import { describe, expect, it } from "vitest";

import { diffProfile } from "@/lib/profile-diff";
import { toHunks } from "@/lib/profile-hunks";

const PROFILE = `## Profile
Full stack engineer, six years, based in Paris.
Looking for backend work.

## Skills
Python, FastAPI, PostgreSQL

## Experience
Senior engineer at Acme Insurance since 2023.
Contract work for two fintech startups before that.

## Certifications
None yet.`;

const text = (hunk: { lines: { pieces: { text: string }[] }[] }) =>
  hunk.lines.map((line) => line.pieces.map((piece) => piece.text).join("")).join("\n");

describe("toHunks", () => {
  it("shows nothing when the draft is untouched", () => {
    const view = toHunks(diffProfile(PROFILE, PROFILE));

    expect(view.hunks).toEqual([]);
  });

  it("collapses the untouched lines around a single change", () => {
    const draft = `${PROFILE}\nAWS Solutions Architect Associate, Aug 2026`;

    const view = toHunks(diffProfile(PROFILE, draft));

    expect(view.hunks).toHaveLength(1);
    // The whole profile is 14 lines; only the change and its context are shown.
    expect(view.hunks[0].hidden).toBe(12);
    expect(text(view.hunks[0])).toContain("AWS Solutions Architect Associate");
    expect(text(view.hunks[0])).not.toContain("Full stack engineer");
  });

  it("labels a change with the heading it sits under", () => {
    const draft = PROFILE.replace("Python, FastAPI, PostgreSQL", "Python, FastAPI, PostgreSQL, Rust");

    const view = toHunks(diffProfile(PROFILE, draft));

    expect(view.hunks).toHaveLength(1);
    expect(view.hunks[0].label).toBe("## Skills");
  });

  it("keeps two distant changes as separate hunks", () => {
    const draft = PROFILE.replace("PostgreSQL", "PostgreSQL, Rust").replace(
      "None yet.",
      "None yet.\nAWS Solutions Architect Associate",
    );

    const view = toHunks(diffProfile(PROFILE, draft));

    expect(view.hunks).toHaveLength(2);
    expect(view.hunks.map((hunk) => hunk.label)).toEqual(["## Skills", "## Certifications"]);
    // Each hunk reports only the gap immediately before it, so the markers add up.
    expect(view.hunks[1].hidden).toBeGreaterThan(0);
  });

  it("merges changes that are close enough to share context", () => {
    const draft = PROFILE.replace(
      "Senior engineer at Acme Insurance since 2023.\nContract work for two fintech startups before that.",
      "Senior engineer at Acme Insurance from 2023 to 2026.\nContract work for three fintech startups before that.",
    );

    const view = toHunks(diffProfile(PROFILE, draft));

    expect(view.hunks).toHaveLength(1);
  });

  it("selects exactly the added text in the draft", () => {
    const draft = PROFILE.replace("Python, FastAPI, PostgreSQL", "Python, FastAPI, PostgreSQL, Rust");

    const view = toHunks(diffProfile(PROFILE, draft));
    const { selectionStart, selectionEnd } = view.hunks[0];

    // This is what the jump-to-edit click hands the textarea, so it has to land on the addition.
    expect(draft.slice(selectionStart, selectionEnd)).toBe(", Rust");
  });

  it("puts the cursor where a deletion was, since there is nothing left to select", () => {
    const draft = PROFILE.replace("Looking for backend work.\n", "");

    const view = toHunks(diffProfile(PROFILE, draft));
    const { selectionStart, selectionEnd } = view.hunks[0];

    expect(selectionStart).toBe(selectionEnd);
    expect(draft.slice(0, selectionStart)).toBe(
      "## Profile\nFull stack engineer, six years, based in Paris.\n",
    );
  });

  it("falls back to a line number when nothing above the change is a heading", () => {
    const plain = "One line.\nAnother line.\nA third line.";

    const view = toHunks(diffProfile(plain, plain.replace("Another", "Other")));

    expect(view.hunks[0].label).toBe("line 2");
  });

  it("reports what is hidden after the last hunk", () => {
    const draft = PROFILE.replace("Full stack engineer", "Full-stack engineer");

    const view = toHunks(diffProfile(PROFILE, draft));

    expect(view.hiddenAfter).toBeGreaterThan(0);
  });
});
