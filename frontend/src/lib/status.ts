import type { components } from "@/lib/api-types";

export type Status = components["schemas"]["Status"];

export const STATUSES: readonly Status[] = [
  "Contacted",
  "Applied",
  "Interview",
  "Offer",
  "Rejected",
  "Withdrawn",
] as const;

const CLOSED: readonly Status[] = ["Rejected", "Withdrawn"] as const;

export function isClosed(status: Status): boolean {
  return CLOSED.includes(status);
}

/**
 * Colour is never the only signal - every badge also carries its label. Rose and emerald are
 * indistinguishable to a red-green colourblind reader, so the text is what actually communicates.
 */
const CLASSES: Record<Status, string> = {
  Contacted:
    "border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200",
  Applied:
    "border-zinc-300 bg-zinc-100 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
  Interview:
    "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
  Offer:
    "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  Rejected:
    "border-rose-300 bg-rose-100 text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200",
  Withdrawn: "border-zinc-200 bg-transparent text-muted-foreground dark:border-zinc-800",
};

export function statusClasses(status: Status): string {
  return CLASSES[status];
}
