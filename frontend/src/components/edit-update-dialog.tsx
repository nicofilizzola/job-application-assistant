"use client";

import { useActionState, useEffect, useState } from "react";

import {
  deleteStatusUpdateAction,
  editStatusUpdateAction,
  type FormState,
} from "@/app/applications/actions";
import { Field, selectClasses } from "@/components/field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { StatusUpdateRead } from "@/lib/api";
import { STATUSES } from "@/lib/status";

type Props = {
  applicationId: string;
  update: StatusUpdateRead;
  deletable: boolean;
};

export function EditUpdateDialog({ applicationId, update, deletable }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit status update</DialogTitle>
          <DialogDescription>
            Correct the status, the date or the note. The current status is derived from the newest
            entry, so a changed date can change it.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so useActionState starts clean on every reopen. */}
        <UpdateForm
          applicationId={applicationId}
          update={update}
          deletable={deletable}
          onSaved={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function UpdateForm({ applicationId, update, deletable, onSaved }: Props & { onSaved: () => void }) {
  const action = editStatusUpdateAction.bind(null, applicationId, update.id);
  const remove = deleteStatusUpdateAction.bind(null, applicationId, update.id);
  const [state, submit, pending] = useActionState<FormState, FormData>(action, {});
  const errors = state.errors ?? {};

  useEffect(() => {
    if (state.saved) onSaved();
  }, [state.saved, onSaved]);

  // The add-update form on the same page owns the bare ids, so these have to be suffixed.
  const statusId = `status-${update.id}`;
  const dateId = `date-${update.id}`;
  const noteId = `note-${update.id}`;

  return (
    <form action={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name={statusId} label="Status" errors={errors.status}>
          <select id={statusId} name="status" defaultValue={update.status} className={selectClasses}>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </Field>
        <Field name={dateId} label="Date" errors={errors.date}>
          <Input id={dateId} name="date" type="date" defaultValue={update.date} required />
        </Field>
      </div>
      <Field name={noteId} label="Note" errors={errors.note}>
        <Textarea id={noteId} name="note" rows={3} defaultValue={update.note ?? ""} />
      </Field>
      <DialogFooter>
        {deletable && (
          <Button type="submit" formAction={remove} variant="destructive">
            Delete update
          </Button>
        )}
        <DialogClose asChild>
          <Button type="button" variant="ghost">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save update"}
        </Button>
      </DialogFooter>
    </form>
  );
}
