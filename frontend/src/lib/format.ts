const DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Status update dates are calendar days, not instants. Formatting them in the reader's local
 * zone would show the previous day anywhere west of UTC, so the zone is pinned.
 */
export function formatDate(isoDate: string): string {
  return DAY.format(new Date(`${isoDate}T00:00:00Z`));
}

export function formatRating(rating: number | null | undefined): string {
  return rating == null ? "-" : String(rating);
}
