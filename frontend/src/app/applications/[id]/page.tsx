import Link from "next/link";
import { notFound } from "next/navigation";

import { AddUpdateForm } from "@/components/add-update-form";
import { AppHeader } from "@/components/app-header";
import { DeleteApplication } from "@/components/delete-application";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, getApplication } from "@/lib/api";
import { formatDate, formatRating } from "@/lib/format";

export default async function ApplicationPage({ params }: PageProps<"/applications/[id]">) {
  const { id } = await params;

  let application;
  try {
    application = await getApplication(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-6">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight break-words">
              {application.title}
            </h1>
            <p className="text-muted-foreground break-words whitespace-pre-line">
              {application.company}
            </p>
          </div>
          <StatusBadge status={application.current_status} className="mt-1" />
        </div>

        <dl className="grid gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Sector</dt>
            <dd className="break-words">{application.sector}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Location</dt>
            <dd className="break-words">{application.location}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Rating</dt>
            <dd>{formatRating(application.rating)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Last update</dt>
            <dd>{formatDate(application.last_update_date)}</dd>
          </div>
        </dl>

        {application.link && (
          <div className="text-sm">
            <p className="text-muted-foreground">Job posting</p>
            <a
              href={application.link}
              target="_blank"
              rel="noreferrer noopener"
              className="text-primary underline underline-offset-4 break-all"
            >
              {application.link}
            </a>
          </div>
        )}

        {application.comment && (
          <div className="text-sm">
            <p className="text-muted-foreground">Comment</p>
            <p className="break-words whitespace-pre-line">{application.comment}</p>
          </div>
        )}

        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/applications/${application.id}/edit`}>Edit</Link>
          </Button>
          <DeleteApplication id={application.id} title={application.title} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add a status update</CardTitle>
          </CardHeader>
          <CardContent>
            <AddUpdateForm applicationId={application.id} />
          </CardContent>
        </Card>

        <section className="space-y-3">
          <h2 className="text-base font-medium">Timeline</h2>
          <ol className="divide-y rounded-lg border">
            {application.updates.map((update) => (
              <li key={update.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:gap-4">
                <div className="flex shrink-0 items-center gap-3 sm:w-56">
                  <StatusBadge status={update.status} />
                  <time dateTime={update.date} className="text-sm text-muted-foreground">
                    {formatDate(update.date)}
                  </time>
                </div>
                {update.note && (
                  <p className="min-w-0 flex-1 text-sm break-words whitespace-pre-line">
                    {update.note}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </section>
      </main>
    </>
  );
}
