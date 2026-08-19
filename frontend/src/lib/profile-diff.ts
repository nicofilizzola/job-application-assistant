import { diffLines, diffWordsWithSpace, type Change } from "diff";

export type Piece = { text: string; kind: "same" | "added" | "removed" };

export type ProfileDiff = {
  /** The draft in order, split into runs of untouched, added and removed text. Every piece but the
   *  removed ones joins back into the draft; every piece but the added ones into the saved
   *  profile. */
  pieces: Piece[];
  addedWords: number;
  /** What the rewrite dropped. Meant to be zero, since a rewrite only adds, and what the panel
   *  warns about when it is not. */
  removedWords: number;
};

/** A word is a run starting with a letter or a digit, so `##` and a stray comma are punctuation
 *  rather than something added. */
const WORD = /[\p{L}\p{N}][\p{L}\p{N}'-]*/gu;

function countWords(text: string): number {
  return text.match(WORD)?.length ?? 0;
}

function kindOf(change: Change): Piece["kind"] {
  if (change.added) return "added";
  if (change.removed) return "removed";
  return "same";
}

/**
 * The saved profile against the draft: lines first, then words inside a line the rewrite replaced.
 * Line granularity alone would call appending `, AWS` to a skills list one line removed and one
 * line added, and a removal is exactly what the panel warns about, so the word pass is what keeps
 * that warning meaningful.
 */
export function diffProfile(before: string, after: string): ProfileDiff {
  const pieces: Piece[] = [];
  let addedWords = 0;
  let removedWords = 0;

  function take(change: Change) {
    if (change.value === "") return;
    const kind = kindOf(change);
    pieces.push({ text: change.value, kind });
    if (kind === "added") addedWords += countWords(change.value);
    if (kind === "removed") removedWords += countWords(change.value);
  }

  // No options: the values have to come back verbatim, or the pieces stop joining back into the
  // two documents they came from.
  const lines = diffLines(before, after);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const next = lines[index + 1];

    // Removed then added is one line rewritten, not a delete and an insert.
    if (line.removed && next?.added) {
      for (const word of diffWordsWithSpace(line.value, next.value)) take(word);
      index += 1;
      continue;
    }
    take(line);
  }

  return { pieces, addedWords, removedWords };
}
