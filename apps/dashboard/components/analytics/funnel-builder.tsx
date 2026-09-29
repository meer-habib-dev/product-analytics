"use client";

import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

const WINDOWS = [
  { label: "1 hour", ms: 3600_000 },
  { label: "1 day", ms: 86_400_000 },
  { label: "7 days", ms: 7 * 86_400_000 },
  { label: "14 days", ms: 14 * 86_400_000 },
  { label: "30 days", ms: 30 * 86_400_000 },
];

type Step = { eventName: string; label?: string };

export function FunnelBuilder({
  projectId,
  funnel,
  open,
  onOpenChange,
  onSaved,
}: {
  projectId: Id<"projects">;
  funnel?: Doc<"funnels"> & { steps: Doc<"funnelSteps">[] };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (id: Id<"funnels">) => void;
}) {
  const definitions = useQuery(api.analytics.events.listEventDefinitions, { projectId });
  const create = useMutation(api.funnels.mutations.create);
  const update = useMutation(api.funnels.mutations.update);
  const [name, setName] = useState(funnel?.name ?? "");
  const [windowMs, setWindowMs] = useState(funnel?.conversionWindowMs ?? 86_400_000);
  const [steps, setSteps] = useState<Step[]>(
    funnel?.steps.map((s) => ({ eventName: s.eventName, label: s.label })) ?? [{ eventName: "" }, { eventName: "" }],
  );
  const [error, setError] = useState<string | null>(null);

  const eventNames = definitions?.map((d) => d.eventName) ?? [];
  const valid = name.trim() && steps.length >= 2 && steps.every((s) => s.eventName);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const payload = { name, conversionWindowMs: windowMs, steps };
      if (funnel) {
        await update({ funnelId: funnel._id, ...payload });
        onSaved?.(funnel._id);
      } else {
        onSaved?.(await create({ projectId, ...payload }));
      }
      onOpenChange(false);
    } catch {
      setError("Could not save the funnel.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{funnel ? "Edit funnel" : "New funnel"}</DialogTitle>
            <DialogDescription>Steps must happen in order, within the conversion window of the first step.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="funnel-name">Name</Label>
            <Input id="funnel-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Paywall conversion" maxLength={80} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Steps</Label>
            {steps.map((step, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-4 text-xs text-muted-foreground">{i + 1}</span>
                <NativeSelect
                  className="flex-1"
                  value={step.eventName}
                  aria-label={`Step ${i + 1} event`}
                  onChange={(e) => setSteps(steps.map((s, j) => (j === i ? { ...s, eventName: e.target.value } : s)))}
                >
                  <option value="">Choose an event…</option>
                  {[...new Set([...eventNames, step.eventName].filter(Boolean))].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </NativeSelect>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove step"
                  disabled={steps.length <= 2}
                  onClick={() => setSteps(steps.filter((_, j) => j !== i))}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            {steps.length < 10 && (
              <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setSteps([...steps, { eventName: "" }])}>
                <Plus /> Add step
              </Button>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="funnel-window">Conversion window</Label>
            <NativeSelect id="funnel-window" value={windowMs} onChange={(e) => setWindowMs(Number(e.target.value))}>
              {WINDOWS.map((w) => (
                <option key={w.ms} value={w.ms}>
                  {w.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          {error && <p className="text-sm text-status-critical">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid}>
              Save funnel
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
