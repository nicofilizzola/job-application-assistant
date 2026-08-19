import { Check, X } from "lucide-react";

/** The AI match, rendered the same way in both places it appears: on the detail screen, and on the
 *  create form as a preview of an analysis that has not been saved yet. Presentational only, with
 *  no "use client" and no server-only import, so a client component can import it too. */
export function MatchPanel({
  rating,
  summary,
  strengths,
  weaknesses,
}: {
  rating: number;
  summary: string | null;
  strengths: string[] | null;
  weaknesses: string[] | null;
}) {
  // Boolean(), not a bare `||`: React renders a literal 0 for `strengths?.length` when it is empty.
  const hasColumns = Boolean(strengths?.length || weaknesses?.length);

  return (
    <section aria-label="AI match" className="space-y-3 rounded-lg border p-4">
      <div>
        <p className="text-sm text-muted-foreground">AI match</p>
        <p className="text-lg font-medium">{rating} / 5</p>
      </div>
      {summary && <p className="text-sm break-words">{summary}</p>}
      {hasColumns && (
        <div className="grid gap-4 sm:grid-cols-2">
          <MatchColumn title="What matches well" items={strengths} marker="check" />
          <MatchColumn title="Weaknesses" items={weaknesses} marker="cross" />
        </div>
      )}
    </section>
  );
}

/** An empty column is a real state, not an error: a 5/5 match can have no weakness worth naming,
 *  and a score written before this screen existed has no lists at all. */
function MatchColumn({
  title,
  items,
  marker,
}: {
  title: string;
  items: string[] | null;
  marker: "check" | "cross";
}) {
  if (!items?.length) return null;

  // The shape carries the meaning; the colour only reinforces it, since emerald and rose read the
  // same to a colourblind eye.
  const Icon = marker === "check" ? Check : X;
  const iconClass =
    marker === "check"
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-rose-600 dark:text-rose-400";

  return (
    <div>
      <h3 className="text-sm font-medium">{title}</h3>
      <ul className="mt-1 space-y-1 text-sm">
        {items.map((item, index) => (
          <li key={index} className="flex gap-2 break-words">
            <Icon aria-hidden className={`mt-0.5 size-4 shrink-0 ${iconClass}`} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
