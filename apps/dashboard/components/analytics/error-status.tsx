import { AlertTriangle, CheckCircle2, EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/** Status always pairs color with an icon and a label, never color alone. */
export function ErrorStatusBadge({ status }: { status: "unresolved" | "resolved" | "ignored" }) {
  if (status === "resolved")
    return (
      <Badge variant="good">
        <CheckCircle2 className="size-3 text-status-good" /> Resolved
      </Badge>
    );
  if (status === "ignored")
    return (
      <Badge variant="outline">
        <EyeOff className="size-3" /> Ignored
      </Badge>
    );
  return (
    <Badge variant="critical">
      <AlertTriangle className="size-3 text-status-critical" /> Unresolved
    </Badge>
  );
}
