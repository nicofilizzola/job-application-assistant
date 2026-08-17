"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import type { FormState } from "@/app/applications/actions";
import { Field, selectClasses } from "@/components/field";
import { JobAdAnalyser } from "@/components/job-ad-analyser";
import { MatchPanel } from "@/components/match-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ApplicationDetail, JobAnalysis } from "@/lib/api";
import { todayIso } from "@/lib/format";
import { STATUSES } from "@/lib/status";

const RATINGS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

export function ApplicationForm({
  action,
  application,
  cancelHref,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  application?: ApplicationDetail;
  cancelHref: string;
}) {
  const [state, submit, pending] = useActionState<FormState, FormData>(action, {});
  const [prefill, setPrefill] = useState<{ analysis: JobAnalysis; adText: string } | null>(null);
  // The form is uncontrolled, so a new analysis only reaches the inputs by remounting them.
  const [prefillKey, setPrefillKey] = useState(0);
  const errors = state.errors ?? {};
  const creating = application === undefined;
  const analysis = prefill?.analysis;

  function applyAnalysis(next: JobAnalysis, adText: string) {
    setPrefill({ analysis: next, adText });
    setPrefillKey((count) => count + 1);
  }

  return (
    <div className="space-y-6">
      {creating && <JobAdAnalyser onAnalysed={applyAnalysis} />}

      {analysis?.match_rating != null && (
        <MatchPanel
          rating={analysis.match_rating}
          summary={analysis.match_summary}
          strengths={analysis.match_strengths}
          weaknesses={analysis.match_weaknesses}
        />
      )}

      <form key={prefillKey} action={submit} className="space-y-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <Field name="title" label="Job title" errors={errors.title}>
            <Input
              id="title"
              name="title"
              defaultValue={analysis?.title ?? application?.title}
              required
            />
          </Field>
          <Field name="company" label="Company" errors={errors.company}>
            <Input
              id="company"
              name="company"
              defaultValue={analysis?.company ?? application?.company}
              required
            />
          </Field>
          <Field name="sector" label="Sector" errors={errors.sector}>
            <Input
              id="sector"
              name="sector"
              defaultValue={analysis?.sector ?? application?.sector}
              required
            />
          </Field>
          <Field name="location" label="Location" errors={errors.location}>
            <Input
              id="location"
              name="location"
              defaultValue={analysis?.location ?? application?.location}
              required
            />
          </Field>
          <Field name="rating" label="Rating" errors={errors.rating}>
            <select
              id="rating"
              name="rating"
              defaultValue={application?.rating ?? ""}
              className={selectClasses}
            >
              <option value="">Not rated</option>
              {RATINGS.map((rating) => (
                <option key={rating} value={rating}>
                  {rating}
                </option>
              ))}
            </select>
          </Field>
          <Field name="link" label="Job posting link" errors={errors.link}>
            <Input id="link" name="link" defaultValue={application?.link ?? ""} />
          </Field>
        </div>

        <Field name="comment" label="Comment" errors={errors.comment}>
          <Textarea id="comment" name="comment" rows={4} defaultValue={application?.comment ?? ""} />
        </Field>

        {creating && (
          <fieldset className="space-y-6 rounded-lg border p-4">
            <legend className="px-1 text-sm font-medium">First status update</legend>
            <div className="grid gap-6 sm:grid-cols-2">
              <Field name="status" label="Status" errors={errors.status}>
                <select id="status" name="status" defaultValue="Applied" className={selectClasses}>
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </Field>
              <Field name="date" label="Date" errors={errors.date}>
                <Input
                  id="date"
                  name="date"
                  type="date"
                  defaultValue={analysis ? todayIso() : undefined}
                  required
                />
              </Field>
            </div>
            <Field name="note" label="Note" errors={errors.note}>
              <Textarea id="note" name="note" rows={2} />
            </Field>
          </fieldset>
        )}

        {prefill && (
          <>
            <input type="hidden" name="job_ad" value={prefill.adText} />
            <input type="hidden" name="match_rating" value={analysis?.match_rating ?? ""} />
            <input type="hidden" name="match_summary" value={analysis?.match_summary ?? ""} />
            {/* One input per entry, so formData.getAll rebuilds the list on the server. */}
            {(analysis?.match_strengths ?? []).map((item, index) => (
              <input key={index} type="hidden" name="match_strengths" value={item} />
            ))}
            {(analysis?.match_weaknesses ?? []).map((item, index) => (
              <input key={index} type="hidden" name="match_weaknesses" value={item} />
            ))}
          </>
        )}

        <div className="flex gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving..." : creating ? "Create application" : "Save changes"}
          </Button>
          <Button type="button" variant="ghost" asChild>
            <Link href={cancelHref}>Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
