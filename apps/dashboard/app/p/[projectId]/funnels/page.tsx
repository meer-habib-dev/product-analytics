"use client";

import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EmptyState } from "@/components/analytics/empty-state";
import { FunnelBuilder } from "@/components/analytics/funnel-builder";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelative } from "@/lib/format";
import { useProjectHref, useProjectId } from "@/lib/hooks";

export default function FunnelsPage() {
  const projectId = useProjectId();
  const href = useProjectHref();
  const router = useRouter();
  const funnels = useQuery(api.funnels.queries.list, { projectId });
  const [open, setOpen] = useState(false);

  const newButton = (
    <Button onClick={() => setOpen(true)}>
      <Plus /> New funnel
    </Button>
  );

  return (
    <>
      <PageHeader title="Funnels" description="Where users drop off between steps, and how releases change conversion." actions={newButton} />
      {funnels === undefined ? (
        <Skeleton className="h-40" />
      ) : funnels.length === 0 ? (
        <EmptyState
          title="No funnels yet"
          description="For example: paywall_viewed → plan_selected → checkout_started → subscription_started."
          action={newButton}
        />
      ) : (
        <Card className="divide-y">
          {funnels.map((funnel) => (
            <Link key={funnel._id} href={href(`/funnels/${funnel._id}`)} className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-accent/40">
              <div className="min-w-0">
                <div className="text-sm font-medium">{funnel.name}</div>
                <div className="truncate font-mono text-xs text-muted-foreground">{funnel.steps.map((s) => s.eventName).join(" → ")}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                updated {formatRelative(funnel.updatedAt)}
                <ChevronRight className="size-4" />
              </div>
            </Link>
          ))}
        </Card>
      )}
      {open && (
        <FunnelBuilder projectId={projectId} open={open} onOpenChange={setOpen} onSaved={(id) => router.push(href(`/funnels/${id}`))} />
      )}
    </>
  );
}
