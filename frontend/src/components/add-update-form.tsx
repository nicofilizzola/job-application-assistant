"use client";

import { useActionState, useEffect, useRef } from "react";

import { addStatusUpdateAction, type FormState } from "@/app/applications/actions";
import { Field, selectClasses } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { STATUSES } from "@/lib/status";

export function AddUpdateForm({ applicationId }: { applicationId: string }) {
  const action = addStatusUpdateAction.bind(null, applicationId);
  const [state, submit, pending] = useActionState<FormState, FormData>(action, {});
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && !state.errors) form.current?.reset();
  }, [pending, state]);

  const errors = state.errors ?? {};

  return (
    <form ref={form} action={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="status" label="Status" errors={errors.status}>
          <select id="status" name="status" defaultValue="Interview" className={selectClasses}>
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
        <Textarea id="note" name="note" rows={2} placeholder="What happened" />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding..." : "Add update"}
      </Button>
    </form>
  );
}
