"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { Piece, ProfileDiff } from "@/lib/profile-diff";
import { toHunks, type HunkLine } from "@/lib/profile-hunks";

function words(count: number): string {
  return `${count} ${count === 1 ? "word" : "words"}`;
}

/** The draft against the saved profile. Only the changed lines and a line of context are rendered:
 *  an additive rewrite leaves a long profile almost entirely untouched, and showing all of it buries
 *  the few lines worth reading. Each group is labelled with the heading it sits under, which is the
 *  question a reviewer actually has, and clicking one puts the cursor on it in the editor below.
 *  `ins` and `del` carry the meaning on their own, so emerald and rose only reinforce it. */
export function ProfileDiffView({
  diff,
  onJump,
}: {
  diff: ProfileDiff;
  onJump: (start: number, end: number) => void;
}) {
  const [whole, setWhole] = useState(false);
  const view = useMemo(() => toHunks(diff), [diff]);
  const untouched = diff.addedWords === 0 && diff.removedWords === 0;

  return (
    <section aria-label="Changes" className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-x-3">
        <p className="text-sm text-muted-foreground">
          {untouched
            ? "Nothing changed. Say more about what to add, or edit the profile yourself."
            : `${words(diff.addedWords)} added, ${diff.removedWords} removed`}
        </p>
        {!untouched && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setWhole(!whole)}>
            {whole ? "Show changes only" : "Show whole profile"}
          </Button>
        )}
      </div>

      {diff.removedWords > 0 && (
        <p className="text-sm text-rose-600 dark:text-rose-400">
          A rewrite is meant to add only. Check the struck-through text before saving.
        </p>
      )}

      {whole || untouched ? (
        <div className="max-h-96 overflow-y-auto text-sm break-words whitespace-pre-wrap">
          {diff.pieces.map((piece, index) => (
            <Mark key={index} piece={piece} />
          ))}
        </div>
      ) : (
        <div className="max-h-96 space-y-4 overflow-y-auto text-sm">
          {view.hunks.map((hunk, index) => (
            <div key={index} className="space-y-1">
              {hunk.hidden > 0 && <Skipped count={hunk.hidden} onClick={() => setWhole(true)} />}
              <p className="text-xs font-medium text-muted-foreground">{hunk.label}</p>
              <button
                type="button"
                onClick={() => onJump(hunk.selectionStart, hunk.selectionEnd)}
                title="Edit this in the profile below"
                className="block w-full rounded-md px-1 text-left hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {hunk.lines.map((line, row) => (
                  <Line key={row} line={line} />
                ))}
              </button>
            </div>
          ))}
          {view.hiddenAfter > 0 && (
            <Skipped count={view.hiddenAfter} onClick={() => setWhole(true)} />
          )}
        </div>
      )}
    </section>
  );
}

function Line({ line }: { line: HunkLine }) {
  return (
    <p className="break-words whitespace-pre-wrap">
      {line.pieces.map((piece, index) => (
        <Mark key={index} piece={piece} />
      ))}
    </p>
  );
}

function Mark({ piece }: { piece: Piece }) {
  if (piece.kind === "added") {
    return <ins className="bg-emerald-500/20 no-underline">{piece.text}</ins>;
  }
  if (piece.kind === "removed") {
    return <del className="bg-rose-500/20">{piece.text}</del>;
  }
  return <span>{piece.text}</span>;
}

function Skipped({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
    >
      ... {count} unchanged {count === 1 ? "line" : "lines"} ...
    </button>
  );
}
