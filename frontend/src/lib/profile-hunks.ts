import type { Piece, ProfileDiff } from "@/lib/profile-diff";

export type HunkLine = { pieces: Piece[]; changed: boolean };

export type Hunk = {
  /** The nearest heading above the change, or `line N` when the profile has no headings. */
  label: string;
  lines: HunkLine[];
  /** Untouched lines hidden immediately before this hunk. */
  hidden: number;
  /** What a click hands the textarea. Equal offsets mean "put the cursor here": a hunk that only
   *  dropped text has nothing left in the draft to select. */
  selectionStart: number;
  selectionEnd: number;
};

export type HunkView = { hunks: Hunk[]; hiddenAfter: number };

type RawLine = HunkLine & {
  /** Offset of this line's first character in the draft. */
  start: number;
  addedStart: number | null;
  addedEnd: number | null;
};

function fresh(start: number): RawLine {
  return { pieces: [], changed: false, start, addedStart: null, addedEnd: null };
}

/**
 * The diff's pieces as lines, each keeping its own pieces so a word-level mark survives inside a
 * line, and each knowing where it starts in the draft. Only pieces that are not removed exist in
 * the draft, so a removed piece marks the line without advancing the offset.
 */
function toLines(diff: ProfileDiff): RawLine[] {
  const lines: RawLine[] = [];
  let current = fresh(0);
  let offset = 0;

  for (const piece of diff.pieces) {
    const parts = piece.text.split("\n");
    parts.forEach((part, index) => {
      if (index > 0) {
        if (piece.kind !== "removed") offset += 1;
        lines.push(current);
        current = fresh(offset);
      }
      if (part === "") return;
      current.pieces.push({ text: part, kind: piece.kind });
      if (piece.kind !== "same") current.changed = true;
      if (piece.kind === "added") {
        if (current.addedStart === null) current.addedStart = offset;
        current.addedEnd = offset + part.length;
      }
      if (piece.kind !== "removed") offset += part.length;
    });
  }
  lines.push(current);
  return lines;
}

function plain(line: RawLine): string {
  return line.pieces.map((piece) => piece.text).join("");
}

/** The question a reviewer actually has is which section the update landed in, so each hunk is
 *  labelled with the heading above it. A profile with no headings gets a line number instead. */
function labelFor(lines: RawLine[], index: number): string {
  for (let above = index; above >= 0; above -= 1) {
    const text = plain(lines[above]).trim();
    if (text.startsWith("#")) return text;
  }
  return `line ${index + 1}`;
}

/**
 * The changed lines, each with a line of context, grouped into hunks and labelled. Everything else
 * is counted rather than rendered: an additive rewrite leaves the document almost entirely
 * untouched, and rendering all of it buries the handful of lines worth reading.
 */
export function toHunks(diff: ProfileDiff, context = 1): HunkView {
  const lines = toLines(diff);
  const changed = lines.flatMap((line, index) => (line.changed ? [index] : []));
  if (changed.length === 0) return { hunks: [], hiddenAfter: 0 };

  const ranges: Array<[number, number]> = [];
  for (const index of changed) {
    const from = Math.max(0, index - context);
    const to = Math.min(lines.length - 1, index + context);
    const last = ranges.at(-1);
    // Touching or overlapping ranges become one hunk, so two neighbouring edits do not produce a
    // "0 unchanged lines" marker between them.
    if (last && from <= last[1] + 1) last[1] = Math.max(last[1], to);
    else ranges.push([from, to]);
  }

  let previousEnd = -1;
  const hunks = ranges.map(([from, to]) => {
    const slice = lines.slice(from, to + 1);
    const edited = slice.filter((line) => line.changed);
    const added = edited.filter((line) => line.addedStart !== null);
    // Labelled from the changed line, not from the context line above it, so the fallback names
    // where the edit is. For a heading the two agree, since the scan passes through both.
    const firstChanged = lines.indexOf(edited[0]);
    const hunk: Hunk = {
      label: labelFor(lines, firstChanged),
      lines: slice.map((line) => ({ pieces: line.pieces, changed: line.changed })),
      hidden: from - previousEnd - 1,
      selectionStart: added.length
        ? Math.min(...added.map((line) => line.addedStart as number))
        : edited[0].start,
      selectionEnd: added.length
        ? Math.max(...added.map((line) => line.addedEnd as number))
        : edited[0].start,
    };
    previousEnd = to;
    return hunk;
  });

  return { hunks, hiddenAfter: lines.length - 1 - previousEnd };
}
