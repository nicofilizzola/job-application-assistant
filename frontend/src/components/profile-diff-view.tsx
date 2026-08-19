import type { ProfileDiff } from "@/lib/profile-diff";

function words(count: number): string {
  return `${count} ${count === 1 ? "word" : "words"}`;
}

/** The draft against the saved profile: untouched text plain, additions marked, anything the
 *  rewrite dropped struck through. `ins` and `del` carry that on their own, so emerald and rose
 *  reinforce the signal rather than being it. Presentational only - no "use client" and no
 *  server-only import, so the client form can render it. */
export function ProfileDiffView({ diff }: { diff: ProfileDiff }) {
  const untouched = diff.addedWords === 0 && diff.removedWords === 0;

  return (
    <section aria-label="Changes" className="space-y-3 rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">
        {untouched
          ? "Nothing changed. Say more about what to add, or edit the profile yourself."
          : `${words(diff.addedWords)} added, ${diff.removedWords} removed`}
      </p>
      {diff.removedWords > 0 && (
        <p className="text-sm text-rose-600 dark:text-rose-400">
          A rewrite is meant to add only. Check the struck-through text before saving.
        </p>
      )}
      <div className="max-h-96 overflow-y-auto text-sm break-words whitespace-pre-wrap">
        {diff.pieces.map((piece, index) => {
          if (piece.kind === "added") {
            return (
              <ins key={index} className="bg-emerald-500/20 no-underline">
                {piece.text}
              </ins>
            );
          }
          if (piece.kind === "removed") {
            return (
              <del key={index} className="bg-rose-500/20">
                {piece.text}
              </del>
            );
          }
          return <span key={index}>{piece.text}</span>;
        })}
      </div>
    </section>
  );
}
