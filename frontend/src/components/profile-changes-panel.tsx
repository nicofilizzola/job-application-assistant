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
