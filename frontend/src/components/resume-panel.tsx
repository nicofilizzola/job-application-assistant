"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

/** The tailored CV, rendered the same way in both places it appears: on the detail screen, and on
 *  the create form as a preview of a CV that has not been saved yet. A <pre>, because the model
 *  returns a laid-out plain-text document and its blank lines are the layout. */
export function ResumePanel({ resume }: { resume: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(resume);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section aria-label="Tailored CV" className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Tailored CV</p>
        {/* The word sits beside the icon: an icon-only button says nothing to a screen reader. */}
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      {/* font-sans, because the document wants preserved line breaks, not a monospace typeface. */}
      <pre className="max-h-96 overflow-auto font-sans text-sm whitespace-pre-wrap">{resume}</pre>
    </section>
  );
}
