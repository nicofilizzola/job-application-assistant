# One Box: Editing the Profile Inside Its Own Diff - Implementation Plan

> **For agentic workers:** use the `executing-plans` skill to work through this plan task by task.
> Steps use checkbox (`- [ ]`) syntax for tracking. Tick them as you go.

**Goal:** Collapse the profile screen's two surfaces - a read-only diff panel and a separate editable
textarea - into one box that shows the rewrite's additions highlighted in place and is typed into
directly, so correcting an addition never means finding it twice.

**Architecture:** The box is a real `<textarea>` with a mirror of its own text painted behind it, in
identical box metrics, with a `<mark>` per added range. The textarea keeps every native editing
behaviour - caret, selection, undo, IME, form submission - and only the paint is borrowed. Because a
mirror can only paint text the box actually contains, deleted text moves out of the document flow
into a short list underneath, each entry restorable. Above the box sits a compact index: one row per
change, labelled with the heading it landed under, which scrolls and selects that text on click and
carries a control to undo that change alone. Everything is derived from the existing `diffProfile`
output; nothing new is stored and no endpoint changes.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, `diff` v9 (jsdiff),
Vitest, Playwright. No backend change, no migration, no new dependency.

**Spec:** `AGENTS.md`. Read it before starting. Screen 5 and two of the deferred decisions describe
the two-surface design this plan replaces; Task 4 rewrites them. Until then the spec and this plan
disagree on purpose, and the plan wins.

## Decisions closed before planning

| Question                                            | Answer                                                                     |
| --------------------------------------------------- | -------------------------------------------------------------------------- |
| Where deleted text goes, now that the box only holds the draft | A short list under the box, struck through, labelled with the heading it came from, each entry with a `Put it back` control |
| How the "only the changes" benefit survives, since a textarea cannot fold | A compact index above the box: one row per change, heading plus excerpt, click to scroll and select |
| Whether manual mode uses the same box               | Yes. One box everywhere, highlighting unsaved edits against the saved profile even with no AI involved |
| Whether a change can be undone on its own           | Yes. Each index row carries a control that reverts that change and leaves the others alone |

## Decisions taken while planning

Technical, reversible, and flagged so they can be revisited rather than rediscovered.

| Decision                                                   | Reason                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------- |
| A mirror behind a real textarea, not `contentEditable`      | `contentEditable` would have to re-render the diff under a live caret, and it brings browser-inserted markup, paste sanitising and IME problems. A textarea keeps the caret, native undo, `name="content"` form submission and screen-reader behaviour, and the mirror is inert |
| This one field stops using the shadcn `Textarea`            | Both layers must agree on font, size, line height, padding, border width and wrapping to the pixel, and shadcn's `Textarea` sets `field-sizing-content`, which resizes the box as you type and would leave the mirror behind. A raw `<textarea>` sharing one class string with the mirror is the honest way to hold them together. The look is preserved by copying the classes that matter |
| The mirror's text is transparent                            | The marks paint background only; the real glyphs come from the textarea on top. Rendering visible text in both would double every letter with a half-pixel of drift |
| `toChanges` reconstructs the draft from the diff            | Joining every piece that is not removed *is* the draft - the invariant `profile-diff.test.ts` already asserts. So the function needs no second parameter, and there is no way for a caller to hand it a draft that disagrees with the diff |
| Added spans are kept individually, never merged into one range | Reverting deletes the spans, so a range that spanned two additions would delete the untouched words between them |
| Removals are recorded unsplit, with their draft offset       | A removed run carries its own newlines. Splitting it per line to mark lines changed would lose the terminator, and putting it back would join two lines into one |
| Changes are grouped by draft line, gap of one                | Same grouping the collapsed panel used, so two neighbouring edits stay one row in the index rather than two |
| `revert` and `restore` are pure functions on the draft string | They are the only two operations with an off-by-one that silently corrupts a document, so they belong in the tested module rather than in a click handler |
| A revert is not on the browser's undo stack                  | It replaces the value through React state, so `ctrl+Z` will not step back over it. A revert is itself an undo, and the alternative - driving edits through `document.execCommand` to keep native history - is deprecated and unreliable |
| The index region keeps `aria-label="Changes"`                 | It is still what it says, and the end-to-end suite already addresses the review surface by that name |

## Global Constraints

Copied from `AGENTS.md`. Every task's requirements implicitly include these.

- **No emojis anywhere in the repo.** Not in code, comments, commits, or docs.
- UI, labels, statuses and code are in **English**. Existing free-text data is never translated.
- Keep it simple. No over-engineering, no unnecessary defensive programming, no extra features.
- The browser never calls FastAPI. Every read and write goes browser -> Next -> FastAPI.
- `revalidatePath` after every mutation. An enrich is not a mutation and must not revalidate.
- `frontend/src/lib/api-types.ts` is generated and never hand-edited.
- Spelling follows the repo's existing register: `analyse`, `colour`, `summarise`, `normalise`.
- Vitest covers real frontend logic only. Render-only components do not get tests written to reach a
  coverage number; Playwright covers the flow.
- Commit messages: imperative sentence-case title, body paragraphs saying why, and the trailer
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`. No `feat:` prefixes.

## Before you start

- [ ] Branch off `main`: `git switch -c single-box-profile-editor`
- [ ] `git status` already shows `M .gitignore`, `M skills-lock.json` and untracked
      `.agents/skills/caveman/`, `.agents/skills/writing-plans/`, `.claude/skills/caveman/`,
      `.claude/skills/writing-plans/`. None belong to this work. Every commit step uses an explicit
      `git add`; never `git add -A`.
- [ ] Record the baselines. Measured on this branch's parent: **Vitest 42**, **Playwright 26**,
      pytest 100. A `Tech test` status feature landed on main after this plan was drafted, which is
      where the two extra Vitest cases come from; it touches no file this plan touches. Confirm your
      own numbers before changing anything:

      ```bash
      cd frontend && npm test
      cd frontend && npx tsc --noEmit && npm run lint
      ```

      Playwright is slow and this plan touches no backend code, so run it once at the end rather
      than now.
- [ ] Two environment traps, both already diagnosed, both costly to rediscover:
      - **Never run `next build` while a `next dev` server is running on this repo.** The suite
        builds into `frontend/.next`, and mixing a production build with dev artefacts produces
        `TurbopackInternalError: Failed to write app endpoint`. Stop the dev server first, and if
        dev has already broken, `rm -rf frontend/.next` and restart it.
      - **Playwright starts its own backend correctly on Windows now.** `playwright.config.ts` sets
        `PYTHONIOENCODING: "utf-8"` on the webServer, which fixes the `UnicodeEncodeError` the
        `fastapi run` banner used to hit on a cp1252 pipe. Either tool runs the suite; from
        PowerShell pass an absolute path, since its working directory is not always the repo root:
        `Push-Location "<repo>\frontend"; npx playwright test; Pop-Location`.
      - If a run fails on writes that never land, check DNS to Neon before reading the code:
        `getaddrinfo failed` for the pooler host has caused three separate false alarms.

## File Structure

| File                                                | Responsibility                                                        |
| --------------------------------------------------- | --------------------------------------------------------------------- |
| `frontend/src/lib/profile-changes.ts`               | Create: `toChanges`, `toSegments`, `revert`, `restore` and their types |
| `frontend/src/lib/profile-changes.test.ts`          | Create: the Vitest cases for all four                                 |
| `frontend/src/lib/profile-hunks.ts`                 | Delete: the collapsed-panel model, replaced by the above              |
| `frontend/src/lib/profile-hunks.test.ts`            | Delete: with it                                                       |
| `frontend/src/components/highlighted-textarea.tsx`  | Create: the textarea plus its painted mirror                          |
| `frontend/src/components/profile-changes-panel.tsx` | Create: the index above the box and the dropped-text list below it    |
| `frontend/src/components/profile-diff-view.tsx`     | Delete: the read-only document this plan replaces                     |
| `frontend/src/app/profile/profile-form.tsx`         | Modify: one box, manual-mode highlighting, revert and restore wiring  |
| `frontend/e2e/profile-ai.spec.ts`                   | Modify: rewrite two cases, add three                                  |
| `AGENTS.md`                                         | Modify: screen 5, two deferred decisions, the Vitest focus list       |

`frontend/src/lib/profile-diff.ts` is **not** touched. `diffProfile` and `normaliseNewlines` keep
their signatures and their tests, and everything in this plan is derived from their output.

---

## Task 1: The changes model

**Files:**

- Create: `frontend/src/lib/profile-changes.ts`
- Create: `frontend/src/lib/profile-changes.test.ts`
- Delete: `frontend/src/lib/profile-hunks.ts`, `frontend/src/lib/profile-hunks.test.ts`

**Interfaces:**

- Consumes: `diffProfile`, and the `Piece` and `ProfileDiff` types, from `@/lib/profile-diff`.
- Produces:

  ```ts
  export type Range = { start: number; end: number };
  export type Removal = { text: string; at: number };
  export type Segment = { text: string; highlighted: boolean };

  export type Change = {
    label: string;          // the heading above it, or `line N`
    excerpt: string;        // one short line for the index row
    added: Range[];         // exactly the added spans, never merged
    removals: Removal[];    // what was dropped here, and where it goes back
    selectionStart: number; // what a click hands the textarea
    selectionEnd: number;
  };

  export function toChanges(diff: ProfileDiff): Change[];
  export function toSegments(value: string, ranges: Range[]): Segment[];
  export function revert(draft: string, change: Change): string;
  export function restore(draft: string, change: Change): string;
  ```

  Task 2's `HighlightedTextarea` consumes `toSegments` and `Range`. Task 2's
  `ProfileChangesPanel` consumes `Change`. Task 3's form consumes `toChanges`, `revert`, `restore`.

- [x] **Step 1: Delete the module this one replaces**

The collapsed panel's model existed to render a document with folded gaps. The new surface renders
no document, so `lines`, `hidden` and `hiddenAfter` have no consumer.

```bash
cd frontend
rm src/lib/profile-hunks.ts src/lib/profile-hunks.test.ts
```

- [x] **Step 2: Write the failing tests**

Create `frontend/src/lib/profile-changes.test.ts`:

```ts
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
```

- [x] **Step 3: Run the tests to verify they fail**

```bash
cd frontend && npm test -- profile-changes
```

Expected: the file fails to resolve `@/lib/profile-changes`.

- [x] **Step 4: Write the module**

Create `frontend/src/lib/profile-changes.ts`:

```ts
import type { ProfileDiff } from "@/lib/profile-diff";

export type Range = { start: number; end: number };
export type Removal = { text: string; at: number };
export type Segment = { text: string; highlighted: boolean };

export type Change = {
  /** The heading above it, or `line N` in a profile with no headings. */
  label: string;
  /** One short line for the index row. */
  excerpt: string;
  /** Exactly the added spans. Never merged: `revert` deletes them, and a span covering two
   *  additions would take the untouched words between them with it. */
  added: Range[];
  /** What the rewrite dropped here, and the offset it goes back at. */
  removals: Removal[];
  selectionStart: number;
  selectionEnd: number;
};

const EXCERPT = 48;

/** Every piece that is not removed, joined, is the draft - the invariant `profile-diff.test.ts`
 *  asserts. Rebuilding it here means a caller cannot hand this module a draft that disagrees with
 *  the diff it came from. */
function draftOf(diff: ProfileDiff): string {
  return diff.pieces
    .filter((piece) => piece.kind !== "removed")
    .map((piece) => piece.text)
    .join("");
}

function lineStarts(text: string): number[] {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") starts.push(index + 1);
  }
  return starts;
}

function shorten(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > EXCERPT ? `${flat.slice(0, EXCERPT - 3)}...` : flat;
}

type Atom = { line: number; range?: Range; removal?: Removal };

/**
 * The diff as a list of changes to show and act on. Grouped by line with a gap of one, so two
 * neighbouring edits read as one change rather than two, and labelled with the heading above them,
 * because the question a reviewer has is where the update landed.
 */
export function toChanges(diff: ProfileDiff): Change[] {
  const draft = draftOf(diff);
  const starts = lineStarts(draft);
  const lines = draft.split("\n");
  const lineOf = (offset: number) => {
    const next = starts.findIndex((start) => start > offset);
    return next === -1 ? starts.length - 1 : next - 1;
  };

  const atoms: Atom[] = [];
  let offset = 0;
  for (const piece of diff.pieces) {
    if (piece.kind === "removed") {
      // Recorded whole, newlines included: split per line it would lose its terminator, and
      // putting it back would join two lines into one.
      atoms.push({ line: lineOf(offset), removal: { text: piece.text, at: offset } });
      continue;
    }
    if (piece.kind === "added") {
      atoms.push({ line: lineOf(offset), range: { start: offset, end: offset + piece.text.length } });
    }
    offset += piece.text.length;
  }
  if (atoms.length === 0) return [];

  atoms.sort((left, right) => left.line - right.line);
  const groups: Atom[][] = [[atoms[0]]];
  for (const atom of atoms.slice(1)) {
    const group = groups.at(-1) as Atom[];
    if (atom.line - (group.at(-1) as Atom).line <= 1) group.push(atom);
    else groups.push([atom]);
  }

  return groups.map((group) => {
    const added = group.flatMap((atom) => (atom.range ? [atom.range] : []));
    const removals = group.flatMap((atom) => (atom.removal ? [atom.removal] : []));
    const addedText = added.map((range) => draft.slice(range.start, range.end)).join(" ");
    const anchor = added.length ? added[0].start : removals[0].at;
    return {
      label: labelFor(lines, group[0].line),
      excerpt: shorten(addedText || removals.map((removal) => removal.text).join(" ")),
      added,
      removals,
      selectionStart: added.length ? Math.min(...added.map((range) => range.start)) : anchor,
      selectionEnd: added.length ? Math.max(...added.map((range) => range.end)) : anchor,
    };
  });
}

function labelFor(lines: string[], index: number): string {
  for (let above = Math.min(index, lines.length - 1); above >= 0; above -= 1) {
    const text = lines[above].trim();
    if (text.startsWith("#")) return text;
  }
  return `line ${index + 1}`;
}

/** The value split into runs to paint or leave plain. Joining every segment gives the value back,
 *  which is what keeps a highlight over the words it belongs to. */
export function toSegments(value: string, ranges: Range[]): Segment[] {
  const clean = ranges
    .map((range) => ({
      start: Math.max(0, Math.min(range.start, value.length)),
      end: Math.max(0, Math.min(range.end, value.length)),
    }))
    .filter((range) => range.end > range.start)
    .sort((left, right) => left.start - right.start);

  const segments: Segment[] = [];
  let cursor = 0;
  for (const range of clean) {
    // Overlapping ranges cannot both be painted; the first one wins.
    if (range.start < cursor) continue;
    if (range.start > cursor) segments.push({ text: value.slice(cursor, range.start), highlighted: false });
    segments.push({ text: value.slice(range.start, range.end), highlighted: true });
    cursor = range.end;
  }
  if (cursor < value.length) segments.push({ text: value.slice(cursor), highlighted: false });
  return segments;
}

/** The draft without this change's additions. Spliced back to front, so an earlier deletion does
 *  not move the offsets of a later one. */
export function revert(draft: string, change: Change): string {
  return [...change.added]
    .sort((left, right) => right.start - left.start)
    .reduce((text, range) => text.slice(0, range.start) + text.slice(range.end), draft);
}

/** The draft with this change's dropped text put back, spliced back to front for the same reason. */
export function restore(draft: string, change: Change): string {
  return [...change.removals]
    .sort((left, right) => right.at - left.at)
    .reduce((text, removal) => text.slice(0, removal.at) + removal.text + text.slice(removal.at), draft);
}
```

- [x] **Step 5: Run the tests to verify they pass**

```bash
cd frontend && npm test && npx tsc --noEmit && npm run lint
```

Expected: the whole Vitest suite green, at **48** - 42 in the baseline, minus the 9 deleted
`profile-hunks` cases, plus the 15 above. `tsc` will also flag
`src/components/profile-diff-view.tsx` for importing the deleted module: that file is deleted in
Task 2. To keep this task's gate clean, delete it now and accept that the profile screen does not
compile until Task 2 lands - or run Task 1 and Task 2 back to back before judging `tsc`.

If `revert(draft, change)` does not give `PROFILE` back exactly, print both with `JSON.stringify` and
look for a newline: an added run that ends with `\n` must have that newline inside its span, or
reverting leaves a blank line behind.

- [x] **Step 6: Commit**

```bash
git add frontend/src/lib/profile-changes.ts frontend/src/lib/profile-changes.test.ts
git rm frontend/src/lib/profile-hunks.ts frontend/src/lib/profile-hunks.test.ts
git commit -m "$(cat <<'EOF'
Model a rewrite as changes to act on, not lines to render

The hunk model existed to render a document with folded gaps. The profile is
about to be edited inside its own diff, so what the screen needs is not lines
but each change's added spans, its dropped text, and the offsets to select,
delete or put back.

Added spans are kept separately rather than merged into one range, because
reverting deletes them and a span covering two additions would take the
untouched words between them. Removals keep their own newlines, or putting one
back would join two lines into one.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: The box and its index

**Files:**

- Create: `frontend/src/components/highlighted-textarea.tsx`
- Create: `frontend/src/components/profile-changes-panel.tsx`
- Delete: `frontend/src/components/profile-diff-view.tsx`

**Interfaces:**

- Consumes: `toSegments`, `Change`, `Range` from Task 1.
- Produces:

  ```tsx
  <HighlightedTextarea
    boxRef={boxRef}          // RefObject<HTMLTextAreaElement | null>
    value={draft}
    onChange={setDraft}      // (value: string) => void
    ranges={ranges}          // Range[]
    readOnly={!editable}
    id="content" name="content" aria-label="Candidate profile"
    placeholder="..."
  />

  <ProfileChangesPanel
    changes={changes}        // Change[]
    addedWords={diff.addedWords}
    removedWords={diff.removedWords}
    onJump={jumpTo}          // (start: number, end: number) => void
    onRevert={applyRevert}   // (change: Change) => void
    onRestore={applyRestore} // (change: Change) => void
  />
  ```

  Task 3 renders both. Task 3's Playwright cases address the panel by
  `role="region"` / `aria-label="Changes"`, the index rows by their `Edit this in the profile`
  title, the revert control by the name `Undo`, and the restore control by `Put it back`.

- [x] **Step 1: Write the box**

Create `frontend/src/components/highlighted-textarea.tsx`. Both layers share one class string on
purpose - font, size, line height, padding, border width and wrapping have to agree to the pixel, or
the highlights drift off the words they mark.

```tsx
"use client";

import type { ComponentProps, RefObject } from "react";
import { useRef } from "react";

import { toSegments, type Range } from "@/lib/profile-changes";

/** A real textarea with a mirror of its own text painted behind it, one mark per range. The
 *  textarea keeps every native editing behaviour - caret, selection, undo, IME, form submission -
 *  and the mirror is inert. The shadcn Textarea is deliberately not used here: it sets
 *  `field-sizing-content`, which resizes the box as you type and leaves the mirror behind. */
export function HighlightedTextarea({
  boxRef,
  value,
  onChange,
  ranges,
  readOnly,
  ...rest
}: {
  boxRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
  ranges: Range[];
  readOnly?: boolean;
} & Pick<ComponentProps<"textarea">, "id" | "name" | "aria-label" | "placeholder">) {
  const mirrorRef = useRef<HTMLDivElement>(null);

  const shared =
    "h-[32rem] w-full rounded-lg border px-2.5 py-2 text-base leading-6 break-words whitespace-pre-wrap md:text-sm";

  return (
    <div className="relative">
      <div
        ref={mirrorRef}
        aria-hidden
        className={`${shared} pointer-events-none absolute inset-0 overflow-hidden border-transparent text-transparent`}
      >
        {toSegments(value, ranges).map((segment, index) =>
          segment.highlighted ? (
            <mark key={index} className="rounded bg-emerald-500/25 text-transparent">
              {segment.text}
            </mark>
          ) : (
            <span key={index}>{segment.text}</span>
          ),
        )}
        {/* A value ending in a newline has a last line with no glyph in it. Without this the mirror
            is one line shorter than the textarea and scrolls out of step at the bottom. */}
        {value.endsWith("\n") ? " " : null}
      </div>
      <textarea
        {...rest}
        ref={boxRef}
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
        onScroll={(event) => {
          const mirror = mirrorRef.current;
          if (mirror) mirror.scrollTop = event.currentTarget.scrollTop;
        }}
        className={`${shared} relative resize-none overflow-y-auto bg-transparent outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 ${
          readOnly ? "text-muted-foreground" : ""
        }`}
      />
    </div>
  );
}
```

- [x] **Step 2: Write the index and the dropped-text list**

Create `frontend/src/components/profile-changes-panel.tsx`:

```tsx
"use client";

import { Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Change } from "@/lib/profile-changes";

function words(count: number): string {
  return `${count} ${count === 1 ? "word" : "words"}`;
}

/** One row per change, above the box: the heading it landed under and a short excerpt, which
 *  scrolls and selects that text on click. Anything the rewrite dropped is listed underneath
 *  instead of in the box, because the box only holds text that is still in the document. */
export function ProfileChangesPanel({
  changes,
  addedWords,
  removedWords,
  onJump,
  onRevert,
  onRestore,
}: {
  changes: Change[];
  addedWords: number;
  removedWords: number;
  onJump: (start: number, end: number) => void;
  onRevert: (change: Change) => void;
  onRestore: (change: Change) => void;
}) {
  const dropped = changes.filter((change) => change.removals.length > 0);

  return (
    <section aria-label="Changes" className="space-y-3 rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">
        {changes.length === 0
          ? "Nothing changed. Say more about what to add, or edit the profile yourself."
          : `${changes.length} ${changes.length === 1 ? "change" : "changes"}, ${words(addedWords)} added, ${removedWords} removed`}
      </p>

      {changes.length > 0 && (
        <ul className="space-y-1">
          {changes.map((change, index) => (
            <li key={index} className="flex items-center gap-2">
              <button
                type="button"
                title="Edit this in the profile"
                onClick={() => onJump(change.selectionStart, change.selectionEnd)}
                className="flex min-w-0 flex-1 items-baseline gap-2 rounded-md px-1 py-0.5 text-left text-sm hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <span className="shrink-0 text-xs font-medium text-muted-foreground">
                  {change.label}
                </span>
                <span className="truncate">{change.excerpt}</span>
              </button>
              {change.added.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onRevert(change)}
                  aria-label={`Undo ${change.excerpt}`}
                >
                  <Undo2 aria-hidden />
                  Undo
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {dropped.length > 0 && (
        <div className="space-y-2 border-t pt-3">
          <p className="text-sm text-rose-600 dark:text-rose-400">
            A rewrite is meant to add only. This one dropped text:
          </p>
          <ul className="space-y-1">
            {dropped.map((change, index) => (
              <li key={index} className="flex items-center gap-2 text-sm">
                <span className="shrink-0 text-xs font-medium text-muted-foreground">
                  {change.label}
                </span>
                <del className="min-w-0 flex-1 truncate bg-rose-500/20">
                  {change.removals.map((removal) => removal.text).join(" ")}
                </del>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onRestore(change)}
                  aria-label={`Put it back: ${change.excerpt}`}
                >
                  Put it back
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
```

- [x] **Step 3: Delete the surface this replaces**

```bash
cd frontend && rm src/components/profile-diff-view.tsx
```

- [x] **Step 4: Check both compile**

```bash
cd frontend && npx tsc --noEmit
```

Expected: one error only, in `src/app/profile/profile-form.tsx`, which still imports
`ProfileDiffView`. Task 3 fixes it. Do not add a shim import to silence it.

- [x] **Step 5: Commit**

```bash
git add frontend/src/components/highlighted-textarea.tsx frontend/src/components/profile-changes-panel.tsx
git rm frontend/src/components/profile-diff-view.tsx
git commit -m "$(cat <<'EOF'
Paint the diff behind the profile box instead of beside it

The review panel and the editable box showed the same document twice, so
correcting an addition meant finding it in one and then hunting for it in the
other. The box now carries the highlights itself: a mirror of its own text sits
behind a real textarea, in the same box metrics, with a mark per added span.

A mirror can only paint text the box contains, so dropped text moves into a list
underneath with a control to put it back, and an index above the box keeps the
at-a-glance view that folding the document used to give.

The shadcn Textarea is not used for this one field. It sets field-sizing-content,
which resizes the box as you type and would leave the mirror behind.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: One box on the screen

**Files:**

- Modify: `frontend/src/app/profile/profile-form.tsx`

**Interfaces:**

- Consumes: everything from Tasks 1 and 2.
- Produces: the screen Task 4's Playwright cases drive. Accessible names that must exist exactly:
  `AI mode` (switch), `What to add` (instruction textarea), `Candidate profile` (the one box),
  `Rewrite profile`, `Save profile`, `Discard`, `Undo`, `Put it back`, and the `Changes` region.

- [x] **Step 1: Rewrite the form**

Replace `frontend/src/app/profile/profile-form.tsx` with:

```tsx
"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useMemo, useRef, useState, useTransition } from "react";

import { enrichProfileAction, saveProfileAction, type ProfileState } from "@/app/profile/actions";
import { HighlightedTextarea } from "@/components/highlighted-textarea";
import { ProfileChangesPanel } from "@/components/profile-changes-panel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { diffProfile } from "@/lib/profile-diff";
import { restore, revert, toChanges, type Change } from "@/lib/profile-changes";

export function ProfileForm({ content }: { content: string }) {
  const [state, submit, pending] = useActionState<ProfileState, FormData>(saveProfileAction, {});
  const [aiMode, setAiMode] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [draft, setDraft] = useState(content);
  const [proposed, setProposed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rewriting, startRewrite] = useTransition();
  const [saved, setSaved] = useState(content);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  // A save sends the new profile back down, and that ends the review: the draft rebases onto it and
  // the panel closes. Remounting on a key would do the same and would also throw away
  // useActionState, and with it the "Saved." confirmation.
  if (saved !== content) {
    setSaved(content);
    setDraft(content);
    setProposed(false);
    setInstruction("");
  }

  // Recomputed on every keystroke, in both modes: the box shows what a save would change, whether
  // the change came from a rewrite or from typing.
  const diff = useMemo(() => diffProfile(content, draft), [content, draft]);
  const changes = useMemo(() => toChanges(diff), [diff]);
  const ranges = useMemo(() => changes.flatMap((change) => change.added), [changes]);
  const editable = !aiMode || (proposed && !rewriting);

  function rewrite() {
    setError(null);
    startRewrite(async () => {
      const result = await enrichProfileAction(draft, instruction);
      if (result.content === undefined) {
        setError(result.error ?? "The rewrite failed. Try again.");
        return;
      }
      setDraft(result.content);
      setProposed(true);
    });
  }

  function discard() {
    setDraft(content);
    setProposed(false);
    setInstruction("");
    setError(null);
  }

  /** Puts the cursor on a change so it can be corrected without hunting for it. A textarea does not
   *  scroll to a selection by itself, and centring on the line the selection starts on is close
   *  enough without measuring wrapped rows. */
  function jumpTo(start: number, end: number) {
    const box = boxRef.current;
    if (!box) return;
    box.focus();
    box.setSelectionRange(start, end);
    const line = box.value.slice(0, start).split("\n").length - 1;
    const lineHeight = Number.parseFloat(getComputedStyle(box).lineHeight) || 24;
    box.scrollTop = Math.max(0, line * lineHeight - box.clientHeight / 2);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Switch id="ai-mode" checked={aiMode} onCheckedChange={setAiMode} disabled={rewriting} />
        <Label htmlFor="ai-mode" className="text-sm font-normal">
          AI mode
        </Label>
        <span className="text-sm text-muted-foreground">
          Say what to add and let it fold the update in
        </span>
      </div>

      {aiMode && (
        <div className="space-y-3 rounded-lg border p-4">
          <Label htmlFor="instruction">What to add</Label>
          <Textarea
            id="instruction"
            rows={3}
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            disabled={rewriting}
            placeholder="I finished the AWS Solutions Architect course, so add it to my certifications."
          />
          <div className="flex items-center gap-3">
            <Button type="button" onClick={rewrite} disabled={rewriting || instruction.trim() === ""}>
              {rewriting && <Loader2 className="animate-spin" aria-hidden />}
              {rewriting ? "Rewriting..." : "Rewrite profile"}
            </Button>
            {rewriting && (
              <p role="status" className="text-sm text-muted-foreground">
                This takes a few seconds.
              </p>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      )}

      {changes.length > 0 && (
        <ProfileChangesPanel
          changes={changes}
          addedWords={diff.addedWords}
          removedWords={diff.removedWords}
          onJump={jumpTo}
          onRevert={(change: Change) => setDraft(revert(draft, change))}
          onRestore={(change: Change) => setDraft(restore(draft, change))}
        />
      )}

      <form action={submit} className="space-y-4">
        <HighlightedTextarea
          boxRef={boxRef}
          id="content"
          name="content"
          aria-label="Candidate profile"
          value={draft}
          onChange={setDraft}
          ranges={ranges}
          // readOnly, not disabled: a disabled field submits nothing, and this one carries the whole
          // profile, so saving from AI mode would blank it.
          readOnly={!editable}
          placeholder="Your background, skills, what you have shipped, what you are looking for."
        />
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving..." : "Save profile"}
          </Button>
          {proposed && (
            <Button type="button" variant="ghost" onClick={discard} disabled={pending || rewriting}>
              Discard
            </Button>
          )}
          {state.saved && !pending && <p className="text-sm text-muted-foreground">Saved.</p>}
        </div>
      </form>
    </div>
  );
}
```

Two things to notice rather than change. The panel is rendered whenever there are changes, not only
in AI mode - that is the "one box everywhere" decision, and it means typing in manual mode shows an
index of unsaved edits. And `ranges` is flattened from `changes`, so the same grouping drives both
the paint and the index; there is no second source of truth about what changed.

- [x] **Step 2: Check it compiles and the unit suite still passes**

```bash
cd frontend && npx tsc --noEmit && npm run lint && npm test
```

Expected: clean, Vitest still at 48. No Vitest case is added here: every part of this task is a
render or a state update, and `AGENTS.md` keeps Vitest to real logic.

- [x] **Step 3: Drive it by hand**

Stop any dev server first, then:

```bash
cd backend && PYTHONIOENCODING=utf-8 AI_STUB=true uv run fastapi dev app/main.py --port 8000
cd frontend && npm run dev
```

At `/profile`, confirm each of these:

- Manual mode: type into the box. The typed text is highlighted in place, the index above names the
  change, and `Save profile` still works and shows `Saved.`
- The highlight sits exactly over the words it marks, at the top of the box and after scrolling to
  the bottom of a long profile. Any drift means the two class strings have diverged.
- AI mode locks the box, takes an instruction, and a rewrite highlights the addition in the box with
  no second copy of the document anywhere on screen.
- Clicking an index row scrolls the box and selects that text, ready to type over.
- `Undo` on a row removes that addition and leaves the others in place.
- Delete a line by hand: it leaves the box, appears in the dropped list with its heading, and
  `Put it back` returns it to the same spot.
- Toggle the theme. The emerald highlight and the rose dropped-text band are legible in both.

- [x] **Step 4: Commit**

```bash
git add frontend/src/app/profile/profile-form.tsx
git commit -m "$(cat <<'EOF'
Edit the profile inside its own diff

The screen had two surfaces showing one document, so every correction was a
lookup: read the change in the panel, then find it again in the box. There is
now one box. It highlights what a save would change, in place, and the panel
above it is an index rather than a second copy - one row per change, which
scrolls and selects that text on click and can undo that change alone.

Manual mode uses the same box, so typing shows what a save would change even
with no rewrite involved. Both the paint and the index come from one grouping,
so they cannot disagree about what changed.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: End to end, and the spec

**Files:**

- Modify: `frontend/e2e/profile-ai.spec.ts`
- Modify: `AGENTS.md`

**Interfaces:**

- Consumes: the accessible names Task 3 produced.
- Produces: nothing code depends on.

- [x] **Step 1: Rewrite the two cases that address the old surface**

Two existing cases in `frontend/e2e/profile-ai.spec.ts` assert things that no longer exist - a
rendered diff document, `Show whole profile`, and `... N unchanged lines ...`. Replace the case named
`a long profile shows only the changed lines, until asked for the rest` and the case named
`clicking a change selects it in the editor` with these two:

```ts
test("the index names each change and does not repeat the document", async ({ page }) => {
  await saveProfile(page, LONG);
  await rewrite(page);

  const changes = page.getByRole("region", { name: "Changes" });
  // One row, naming the heading the addition landed under.
  await expect(changes.getByText("## Certifications")).toBeVisible();
  await expect(changes.getByText(/Added by the stub/)).toBeVisible();
  await expect(changes.getByText(/1 change, .* added, 0 removed/)).toBeVisible();
  // The panel is an index, not a second copy: untouched text appears nowhere in it.
  await expect(changes.getByText("Full stack engineer, six years, based in Paris.")).toBeHidden();

  // The box holds the whole profile, with the addition in it.
  await expect(page.getByLabel("Candidate profile")).toHaveValue(`${LONG}\n${ADDED}`);
});

test("clicking a change selects it in the box", async ({ page }) => {
  await saveProfile(page, LONG);
  await rewrite(page);

  await page
    .getByRole("region", { name: "Changes" })
    .getByTitle("Edit this in the profile")
    .first()
    .click();

  const box = page.getByLabel("Candidate profile");
  await expect(box).toBeFocused();
  const selected = await box.evaluate((element) => {
    const area = element as HTMLTextAreaElement;
    return area.value.slice(area.selectionStart, area.selectionEnd);
  });
  expect(selected).toContain("Added by the stub");
});
```

The case named `hand-editing the draft re-diffs it and warns about what was dropped` asserts
`changes.locator("del")` and the warning text. Both still hold - the `del` now lives in the dropped
list rather than in a rendered document - but the warning's wording changed. Update that one
assertion:

```ts
  await expect(changes.getByText("A rewrite is meant to add only")).toBeVisible();
```

stays as it is, since the new copy still begins with that sentence. Run the case and confirm rather
than assuming.

- [x] **Step 2: Add the three new cases**

Append to `frontend/e2e/profile-ai.spec.ts`:

```ts
test("Undo removes one change and leaves the others", async ({ page }) => {
  await saveProfile(page, LONG);
  await rewrite(page);
  // The second change has to be in a different section. Two additions on adjacent lines are one
  // change - the grouping merges anything within a line of its neighbour - so appending next to the
  // stub's line would leave nothing behind to assert on.
  await page
    .getByLabel("Candidate profile")
    .fill(
      `${LONG}\n${ADDED}`.replace(
        "Contract work for two fintech startups.",
        "Contract work for two fintech startups.\nMentor two juniors.",
      ),
    );

  const changes = page.getByRole("region", { name: "Changes" });
  await expect(changes.getByRole("button", { name: /^Undo/ })).toHaveCount(2);

  // Rows run in document order, so the first is the hand-made one under `## Experience`.
  await changes.getByRole("button", { name: /^Undo/ }).first().click();

  // Exactly that change is gone, and the stub's addition is untouched.
  await expect(page.getByLabel("Candidate profile")).toHaveValue(`${LONG}\n${ADDED}`);
});

test("dropped text is listed with its heading and can be put back", async ({ page }) => {
  await saveProfile(page, LONG);
  await rewrite(page);

  // Drop a line by hand. It leaves the box, so it can only be shown in the list.
  await page
    .getByLabel("Candidate profile")
    .fill(`${LONG}\n${ADDED}`.replace("Python, FastAPI, Postgres\n", ""));

  const changes = page.getByRole("region", { name: "Changes" });
  await expect(changes.locator("del")).toContainText("Python, FastAPI, Postgres");
  await expect(changes.getByText("## Skills").first()).toBeVisible();

  await changes.getByRole("button", { name: /^Put it back/ }).click();

  await expect(page.getByLabel("Candidate profile")).toHaveValue(`${LONG}\n${ADDED}`);
  await expect(changes.locator("del")).toHaveCount(0);
});

test("manual mode highlights unsaved edits in the same box", async ({ page }) => {
  await saveProfile(page, LONG);

  // No AI mode, no rewrite: just typing.
  await page.getByLabel("Candidate profile").fill(`${LONG}\nMentor two juniors.`);

  const changes = page.getByRole("region", { name: "Changes" });
  await expect(changes.getByText(/Mentor two juniors/)).toBeVisible();
  await expect(changes.getByText(/1 change/)).toBeVisible();
});
```

- [x] **Step 3: Run the suite**

Through the PowerShell tool, with no dev server running:

```powershell
Push-Location "C:\Users\Nicolas FILIZZOLA\dev-workspace\job-application-assistant\frontend"
npx playwright test
Pop-Location
```

Expected: **30 passed** - 26 in the baseline, plus the three new cases and a fourth guarding the
wrapping parity of the box's two layers, with two rewritten in place.

If a rewritten case fails on a locator, fix the locator. If one fails on behaviour, report it rather
than loosening the assertion - the whole point of this task is that the single box behaves.

- [x] **Step 4: Bring the spec up to date**

In `AGENTS.md`, replace the second half of screen 5's bullet - everything from `The diff shows only
the changed lines` to `rewrite was.` - with:

```markdown
   one. The rewrite is shown in the box itself: additions highlighted in place, editable where they
   sit, so correcting one is not a matter of finding it twice. Above the box an index names each
   change and the heading it landed under, scrolls and selects it on click, and can undo that change
   alone. Text the rewrite dropped is no longer in the document, so it is listed under the box
   instead, struck through and restorable. Manual mode uses the same box, highlighting unsaved edits
   against the saved profile.
```

Replace the two deferred decisions that describe the old panel - `A collapsed run of unchanged lines
expands to the whole profile, not to itself` and `The diff marks changes inline rather than with a
`+` gutter` - with:

```markdown
- **The box is a textarea with a mirror painted behind it, not a `contentEditable`.** Both layers
  share one class string, so any divergence in font, padding, border or wrapping shows up as
  highlights drifting off their words. The cost is that only text the box contains can be painted,
  which is why dropped text is listed under the box rather than shown in place. The gain is a real
  caret, real undo, real form submission and real screen-reader behaviour.
- **A revert is not on the browser's undo stack.** `Undo` on a change replaces the box's value
  through React state, so `ctrl+Z` will not step back over it. A revert is itself an undo, and the
  alternative - driving edits through the deprecated `document.execCommand` to keep native history -
  is not worth the fragility.
- **This one field does not use the shadcn `Textarea`.** It sets `field-sizing-content`, which
  resizes the box as you type and leaves the mirror behind. The look is kept by sharing the classes
  that matter.
```

In the Vitest focus list, replace `the profile diff, and its grouping into hunks` with
`the profile diff, and the changes derived from it`, and replace the sentence beginning `The hunk
test asserts the same way round` with:

```markdown
The changes test asserts the same way round - that slicing the draft by a change's offsets returns
the added text, that reverting a change gives the saved profile back, and that putting a dropped
line back restores it exactly - because those offsets drive a selection, a deletion and an
insertion into the user's own document, and an off-by-one corrupts it quietly rather than failing
loudly.
```

- [x] **Step 5: Commit**

```bash
git add frontend/e2e/profile-ai.spec.ts AGENTS.md
git commit -m "$(cat <<'EOF'
Cover the single box end to end and describe it in the spec

Two cases addressed a rendered diff document and a Show whole profile toggle,
neither of which exists now; they assert the index and the box instead. Three
new cases cover what the merge added: Undo on one change leaving the others,
dropped text listed with its heading and put back, and manual mode highlighting
unsaved edits in the same box.

The spec's screen 5 and its deferred decisions described the two-surface design.
They now describe the mirror behind the textarea, what it costs - only text the
box contains can be painted - and what it buys.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Done when

- [x] `cd frontend && npm test` - 48 pass
- [x] `cd frontend && npx tsc --noEmit && npm run lint` - clean
- [x] `cd frontend && npx playwright test` - 30 pass, with no dev server running on this repo
- [x] `cd backend && uv run pytest` - 101 pass, unchanged. No backend file is touched by this plan,
      so this is a regression check rather than a result. The plan said 100; the extra case arrived
      with the `Tech test` status feature that landed on main after this was drafted, which is also
      where the Vitest baseline of 42 came from
- [x] No migration, no new dependency, no change to `openapi.json` or `api-types.ts`
- [x] `git status` shows no unexpected files staged, and the six pre-existing dirty paths
      (`.gitignore`, `skills-lock.json`, `.agents/skills/caveman/`, `.agents/skills/writing-plans/`,
      `.claude/skills/caveman/`, `.claude/skills/writing-plans/`) are untouched
- [ ] **A look at a real profile, by hand, with a real rewrite.** The stub appends one line, which is
      the easy case. Run with `AI_STUB` unset and ask for something that lands mid-document, then
      check: the highlight sits on the right words after scrolling, the index row names the right
      heading, `Undo` removes exactly that addition, and a hand edit over a highlighted span
      re-highlights sensibly as you type. Record what you saw here

## Deliberately not in this plan

Named so they read as decisions rather than oversights:

- **No folding.** A textarea cannot collapse regions, and that is the price of editing in place. The
  index is what replaces it.
- **No per-change accept.** `Undo` removes an addition; there is no "accept" because an unreverted
  change is already accepted by being in the box.
- **No syntax or Markdown rendering in the box.** It stays plain text, as the profile always has
  been.
- **No change to the enrich endpoint, the prompt, or anything in `backend/`.** This is a UI merge.
- **No keyboard shortcut for stepping between changes.** The index rows are focusable in order,
  which is enough for one user.
