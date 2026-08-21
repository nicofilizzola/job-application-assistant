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
