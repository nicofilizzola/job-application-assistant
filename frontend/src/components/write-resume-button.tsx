"use client";

import { useState, useTransition } from "react";

import { writeResumeAction } from "@/app/applications/actions";
import { Button } from "@/components/ui/button";

export function WriteResumeButton({ id, written }: { id: string; written: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function write() {
    setError(null);
    startTransition(async () => {
      const result = await writeResumeAction(id);
      if (result.error) setError(result.error);
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={write} disabled={pending}>
        {pending ? "Writing..." : written ? "Write it again" : "Write my CV"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </>
  );
}
