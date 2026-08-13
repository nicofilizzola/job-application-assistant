import { Badge } from "@/components/ui/badge";
import { statusClasses, type Status } from "@/lib/status";
import { cn } from "@/lib/utils";

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  // The label is always rendered: rose and emerald read the same to a colourblind eye.
  return (
    <Badge variant="outline" className={cn(statusClasses(status), className)}>
      {status}
    </Badge>
  );
}
