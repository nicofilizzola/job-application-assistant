"use client";

import Link from "next/link";
import { useActionState } from "react";

import type { FormState } from "@/app/applications/actions";
import { Field, selectClasses } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ApplicationDetail } from "@/lib/api";
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
  const errors = state.errors ?? {};
  const creating = application === undefined;

  return (
    <form action={submit} className="space-y-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <Field name="title" label="Job title" errors={errors.title}>
          <Input id="title" name="title" defaultValue={application?.title} required />
        </Field>
        <Field name="company" label="Company" errors={errors.company}>
          <Input id="company" name="company" defaultValue={application?.company} required />
        </Field>
        <Field name="sector" label="Sector" errors={errors.sector}>
          <Input id="sector" name="sector" defaultValue={application?.sector} required />
        </Field>
        <Field name="location" label="Location" errors={errors.location}>
          <Input id="location" name="location" defaultValue={application?.location} required />
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
              <Input id="date" name="date" type="date" required />
            </Field>
          </div>
          <Field name="note" label="Note" errors={errors.note}>
            <Textarea id="note" name="note" rows={2} />
          </Field>
        </fieldset>
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
  );
}
