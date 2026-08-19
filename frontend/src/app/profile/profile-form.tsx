"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useMemo, useState, useTransition } from "react";

import { enrichProfileAction, saveProfileAction, type ProfileState } from "@/app/profile/actions";
import { ProfileDiffView } from "@/components/profile-diff-view";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { diffProfile } from "@/lib/profile-diff";

export function ProfileForm({ content }: { content: string }) {
  const [state, submit, pending] = useActionState<ProfileState, FormData>(saveProfileAction, {});
  const [aiMode, setAiMode] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [draft, setDraft] = useState(content);
  const [proposed, setProposed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rewriting, startRewrite] = useTransition();
  const [saved, setSaved] = useState(content);

  // A save sends the new profile back down, and that ends the review: the draft rebases onto it and
  // the AI panel closes. Remounting on a key would do the same and would also throw away
  // useActionState, and with it the "Saved." confirmation.
  if (saved !== content) {
    setSaved(content);
    setDraft(content);
    setProposed(false);
    setInstruction("");
  }

  // Recomputed on every keystroke: hand-editing the draft is part of reviewing it, so the diff has
  // to follow the edit rather than freeze on what the model returned.
  const diff = useMemo(() => diffProfile(content, draft), [content, draft]);
  const editable = !aiMode || (proposed && !rewriting);

  function rewrite() {
    setError(null);
    startRewrite(async () => {
      const result = await enrichProfileAction(draft, instruction);
      if (result.content === undefined) {
        setError(result.error ?? "The rewrite failed. Try again.");
        return;
      }
      setDraft(result.content);
      setProposed(true);
    });
  }

  function discard() {
    setDraft(content);
    setProposed(false);
    setInstruction("");
    setError(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Switch id="ai-mode" checked={aiMode} onCheckedChange={setAiMode} disabled={rewriting} />
        <Label htmlFor="ai-mode" className="text-sm font-normal">
          AI mode
        </Label>
        <span className="text-sm text-muted-foreground">
          Say what to add and let it fold the update in
        </span>
      </div>

      {aiMode && (
        <div className="space-y-3 rounded-lg border p-4">
          <Label htmlFor="instruction">What to add</Label>
          <Textarea
            id="instruction"
            rows={3}
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            disabled={rewriting}
            placeholder="I finished the AWS Solutions Architect course, so add it to my certifications."
          />
          <div className="flex items-center gap-3">
            <Button
              type="button"
              onClick={rewrite}
              disabled={rewriting || instruction.trim() === ""}
            >
              {rewriting && <Loader2 className="animate-spin" aria-hidden />}
              {rewriting ? "Rewriting..." : "Rewrite profile"}
            </Button>
            {rewriting && (
              <p role="status" className="text-sm text-muted-foreground">
                This takes a few seconds.
              </p>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      )}

      {aiMode && proposed && <ProfileDiffView diff={diff} />}

      <form action={submit} className="space-y-4">
        <Textarea
          id="content"
          name="content"
          aria-label="Candidate profile"
          rows={24}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          // readOnly, not disabled: a disabled field submits nothing, and this one carries the whole
          // profile, so saving from AI mode would blank it.
          readOnly={!editable}
          className={editable ? undefined : "text-muted-foreground"}
          placeholder="Your background, skills, what you have shipped, what you are looking for."
        />
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving..." : "Save profile"}
          </Button>
          {proposed && (
            <Button
              type="button"
              variant="ghost"
              onClick={discard}
              disabled={pending || rewriting}
            >
              Discard
            </Button>
          )}
          {state.saved && !pending && <p className="text-sm text-muted-foreground">Saved.</p>}
        </div>
      </form>
    </div>
  );
}
