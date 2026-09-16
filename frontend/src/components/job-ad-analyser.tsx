"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { analyseJobAdAction, tailorResumeAction } from "@/app/applications/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { JobAnalysis } from "@/lib/api";

export function JobAdAnalyser({
  onAnalysed,
  onTailored,
}: {
  onAnalysed: (analysis: JobAnalysis, adText: string) => void;
  onTailored: (resume: string) => void;
}) {
  const [enabled, setEnabled] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unscored, setUnscored] = useState(false);
  const [filling, startFilling] = useTransition();
  const [writing, startWriting] = useTransition();
  // One advert box feeding two calls. Neither runs while the other is in flight, so the text a
  // result belongs to is always the text that is still in the box.
  const busy = filling || writing;

  function analyse() {
    setError(null);
    startFilling(async () => {
      const result = await analyseJobAdAction(text);
      if (result.error || !result.analysis) {
        setError(result.error ?? "The advert could not be read. Try again.");
        return;
      }
      setUnscored(result.analysis.match_rating === null);
      onAnalysed(result.analysis, text);
    });
  }

  function tailor() {
    setError(null);
    startWriting(async () => {
      const result = await tailorResumeAction(text);
      if (result.error || !result.resume) {
        setError(result.error ?? "The CV could not be written. Try again.");
        return;
      }
      onTailored(result.resume);
    });
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <Switch id="ai-mode" checked={enabled} onCheckedChange={setEnabled} disabled={busy} />
        <Label htmlFor="ai-mode" className="text-sm font-normal">
          AI mode
        </Label>
        <span className="text-sm text-muted-foreground">
          Paste the advert to fill this in and to write a CV for it
        </span>
      </div>

      {enabled && (
        <div className="space-y-3">
          <Textarea
            id="job-ad"
            aria-label="Job advert"
            rows={8}
            value={text}
            onChange={(event) => setText(event.target.value)}
            disabled={busy}
            placeholder="Paste the whole job advert here"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={analyse} disabled={busy || text.trim() === ""}>
              {filling && <Loader2 className="animate-spin" aria-hidden />}
              {filling ? "Reading the advert..." : "Fill the form"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={tailor}
              disabled={busy || text.trim() === ""}
            >
              {writing && <Loader2 className="animate-spin" aria-hidden />}
              {writing ? "Writing your CV..." : "Write my CV"}
            </Button>
            {busy && (
              <p role="status" className="text-sm text-muted-foreground">
                {/* Measured at 65s against a 58k-character profile, so not "up to a minute". */}
                {writing ? "This takes about a minute." : "This takes a few seconds."}
              </p>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {unscored && !busy && (
            <p className="text-sm text-muted-foreground">
              Fields filled in, but there is no match score:{" "}
              <Link href="/profile" className="text-primary underline underline-offset-4">
                your profile is empty
              </Link>
              .
            </p>
          )}
        </div>
      )}
    </div>
  );
}
