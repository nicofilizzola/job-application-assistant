"use client";

import { useState, useTransition } from "react";

import { scoreMatchAction } from "@/app/applications/actions";
import { Button } from "@/components/ui/button";

export function ScoreMatchButton({ id, scored }: { id: string; scored: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function score() {
    setError(null);
    startTransition(async () => {
      const result = await scoreMatchAction(id);
      if (result.error) setError(result.error);
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={score} disabled={pending}>
        {pending ? "Scoring..." : scored ? "Score again" : "Score this match"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </>
  );
}
