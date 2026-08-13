"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/** The state lives in the URL so a refresh keeps it and the view can be linked to. */
export function HideClosedToggle({ hideClosed }: { hideClosed: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function toggle(nextHideClosed: boolean) {
    const params = new URLSearchParams(searchParams);
    if (nextHideClosed) {
      params.delete("closed");
    } else {
      params.set("closed", "shown");
    }
    const query = params.toString();
    router.push(query ? `/?${query}` : "/");
  }

  return (
    <div className="flex items-center gap-2">
      <Switch id="hide-closed" checked={hideClosed} onCheckedChange={toggle} />
      <Label htmlFor="hide-closed" className="text-sm font-normal">
        Hide closed
      </Label>
    </div>
  );
}
