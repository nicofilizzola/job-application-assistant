"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useMemo, useRef, useState, useTransition } from "react";

import { enrichProfileAction, saveProfileAction, type ProfileState } from "@/app/profile/actions";
import { HighlightedTextarea } from "@/components/highlighted-textarea";
import { ProfileChangesPanel } from "@/components/profile-changes-panel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { diffProfile } from "@/lib/profile-diff";
import { restore, revert, toChanges, type Change } from "@/lib/profile-changes";

export function ProfileForm({ content }: { content: string }) {
  const [state, submit, pending] = useActionState<ProfileState, FormData>(saveProfileAction, {});
  const [aiMode, setAiMode] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [draft, setDraft] = useState(content);
  const [proposed, setProposed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rewriting, startRewrite] = useTransition();
  const [saved, setSaved] = useState(content);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  // A save sends the new profile back down, and that ends the review: the draft rebases onto it and
  // the panel closes. Remounting on a key would do the same and would also throw away
  // useActionState, and with it the "Saved." confirmation.
  if (saved !== content) {
    setSaved(content);
    setDraft(content);
    setProposed(false);
    setInstruction("");
  }

  // Recomputed on every keystroke, in both modes: the box shows what a save would change, whether
  // the change came from a rewrite or from typing.
  const diff = useMemo(() => diffProfile(content, draft), [content, draft]);
  const changes = useMemo(() => toChanges(diff), [diff]);
  const ranges = useMemo(() => changes.flatMap((change) => change.added), [changes]);
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

  /** Puts the cursor on a change so it can be corrected without hunting for it. A textarea does not
   *  scroll to a selection by itself, and centring on the line the selection starts on is close
   *  enough without measuring wrapped rows. */
  function jumpTo(start: number, end: number) {
    const box = boxRef.current;
    if (!box) return;
    box.focus();
    box.setSelectionRange(start, end);
    const line = box.value.slice(0, start).split("\n").length - 1;
    const lineHeight = Number.parseFloat(getComputedStyle(box).lineHeight) || 24;
    box.scrollTop = Math.max(0, line * lineHeight - box.clientHeight / 2);
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
            <Button type="button" onClick={rewrite} disabled={rewriting || instruction.trim() === ""}>
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

      {changes.length > 0 && (
        <ProfileChangesPanel
          changes={changes}
          addedWords={diff.addedWords}
          removedWords={diff.removedWords}
          onJump={jumpTo}
          onRevert={(change: Change) => setDraft(revert(draft, change))}
          onRestore={(change: Change) => setDraft(restore(draft, change))}
        />
      )}

      <form action={submit} className="space-y-4">
        <HighlightedTextarea
          boxRef={boxRef}
          id="content"
          name="content"
          aria-label="Candidate profile"
          value={draft}
          onChange={setDraft}
          ranges={ranges}
          // readOnly, not disabled: a disabled field submits nothing, and this one carries the whole
          // profile, so saving from AI mode would blank it.
          readOnly={!editable}
          placeholder="Your background, skills, what you have shipped, what you are looking for."
        />
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving..." : "Save profile"}
          </Button>
          {proposed && (
            <Button type="button" variant="ghost" onClick={discard} disabled={pending || rewriting}>
              Discard
            </Button>
          )}
          {state.saved && !pending && <p className="text-sm text-muted-foreground">Saved.</p>}
        </div>
      </form>
    </div>
  );
}
