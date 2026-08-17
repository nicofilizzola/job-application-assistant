"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { analyseJobAdAction } from "@/app/applications/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { JobAnalysis } from "@/lib/api";

export function JobAdAnalyser({
  onAnalysed,
}: {
  onAnalysed: (analysis: JobAnalysis, adText: string) => void;
}) {
  const [enabled, setEnabled] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unscored, setUnscored] = useState(false);
  const [pending, startTransition] = useTransition();

  function analyse() {
    setError(null);
    startTransition(async () => {
      const result = await analyseJobAdAction(text);
      if (result.error || !result.analysis) {
        setError(result.error ?? "The advert could not be read. Try again.");
        return;
      }
      setUnscored(result.analysis.match_rating === null);
      onAnalysed(result.analysis, text);
    });
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <Switch id="ai-mode" checked={enabled} onCheckedChange={setEnabled} disabled={pending} />
        <Label htmlFor="ai-mode" className="text-sm font-normal">
          AI mode
        </Label>
        <span className="text-sm text-muted-foreground">
          Paste the advert and let it fill this in
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
            disabled={pending}
            placeholder="Paste the whole job advert here"
          />
          <div className="flex items-center gap-3">
            <Button type="button" onClick={analyse} disabled={pending || text.trim() === ""}>
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              {pending ? "Reading the advert..." : "Fill the form"}
            </Button>
            {pending && (
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
          {unscored && !pending && (
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
