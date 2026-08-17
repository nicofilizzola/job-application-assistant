"use client";

import { useActionState } from "react";

import { saveProfileAction, type ProfileState } from "@/app/profile/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function ProfileForm({ content }: { content: string }) {
  const [state, submit, pending] = useActionState<ProfileState, FormData>(saveProfileAction, {});

  return (
    <form action={submit} className="space-y-4">
      <Textarea
        id="content"
        name="content"
        aria-label="Candidate profile"
        rows={24}
        defaultValue={content}
        placeholder="Your background, skills, what you have shipped, what you are looking for."
      />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save profile"}
        </Button>
        {state.saved && !pending && <p className="text-sm text-muted-foreground">Saved.</p>}
      </div>
    </form>
  );
}
