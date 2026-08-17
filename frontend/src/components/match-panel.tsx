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
          <MatchColumn title="What matches well" items={strengths} />
          <MatchColumn title="Weaknesses" items={weaknesses} />
        </div>
      )}
    </section>
  );
}

/** An empty column is a real state, not an error: a 5/5 match can have no weakness worth naming,
 *  and a score written before this screen existed has no lists at all. */
function MatchColumn({ title, items }: { title: string; items: string[] | null }) {
  if (!items?.length) return null;

  return (
    <div>
      <h3 className="text-sm font-medium">{title}</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm marker:text-muted-foreground">
        {items.map((item, index) => (
          <li key={index} className="break-words">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
