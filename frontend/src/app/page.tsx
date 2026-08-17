import Link from "next/link";

import { AppHeader } from "@/components/app-header";
import { HideClosedToggle } from "@/components/hide-closed-toggle";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { listApplications } from "@/lib/api";
import { formatDate, formatRating } from "@/lib/format";

export default async function ApplicationsPage({ searchParams }: PageProps<"/">) {
  // Hiding closed applications is the default: a third of them are already finished.
  const hideClosed = (await searchParams).closed !== "shown";
  const applications = await listApplications(!hideClosed);

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <HideClosedToggle hideClosed={hideClosed} />
          <p className="text-sm text-muted-foreground">
            {applications.length} application{applications.length === 1 ? "" : "s"}
          </p>
          <Button asChild size="sm" className="ml-auto">
            <Link href="/applications/new">New application</Link>
          </Button>
        </div>

        {applications.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nothing here yet.
          </p>
        ) : (
          <ul aria-label="Applications" className="divide-y rounded-lg border">
            {applications.map((application) => (
              <li key={application.id}>
                <Link
                  href={`/applications/${application.id}`}
                  className="flex flex-col gap-2 p-4 hover:bg-accent/50 sm:flex-row sm:items-center sm:gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{application.title}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {application.company} &middot; {application.sector} &middot;{" "}
                      {application.location}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-sm text-muted-foreground">
                    <span title="Your rating">{formatRating(application.rating)}</span>
                    {application.match_rating != null && (
                      <span
                        title="AI match"
                        className="rounded border px-1.5 py-0.5 text-xs tabular-nums"
                      >
                        AI {application.match_rating}
                      </span>
                    )}
                    <StatusBadge status={application.current_status} />
                    <time dateTime={application.last_update_date} className="tabular-nums">
                      {formatDate(application.last_update_date)}
                    </time>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
