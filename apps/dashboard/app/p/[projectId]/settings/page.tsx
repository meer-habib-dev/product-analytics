"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { CodeBlock } from "@/components/analytics/code-block";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRelative } from "@/lib/format";
import { useProjectHref, useProjectId } from "@/lib/hooks";
import { ingestionHost } from "@/lib/ingestion";

export default function SettingsPage() {
  const projectId = useProjectId();
  const href = useProjectHref();
  const project = useQuery(api.projects.queries.get, { projectId });
  const keys = useQuery(api.projects.apiKeys.list, { projectId });
  const rename = useMutation(api.projects.mutations.rename);
  const createKey = useMutation(api.projects.apiKeys.create);
  const setEnabled = useMutation(api.projects.apiKeys.setEnabled);
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isOwner = project?.role === "owner";

  async function onRename(event: FormEvent) {
    event.preventDefault();
    if (name) await rename({ projectId, name });
    setName(null);
  }

  async function toggle(keyId: Id<"projectApiKeys">, enabled: boolean) {
    setError(null);
    try {
      await setEnabled({ keyId, enabled });
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^.*Uncaught ConvexError: /, "") : "Failed");
    }
  }

  return (
    <>
      <PageHeader title="Settings" />
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Project</CardTitle>
              <CardDescription>Project id: <code className="font-mono">{projectId}</code></CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={onRename} className="flex max-w-md gap-2">
              <Input value={name ?? project?.name ?? ""} onChange={(e) => setName(e.target.value)} disabled={!isOwner} maxLength={64} />
              <Button type="submit" variant="outline" disabled={!isOwner || !name?.trim()}>
                Save
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Ingestion keys</CardTitle>
              <CardDescription>
                Public keys that can only submit events to this project. They grant no read or admin access. Disable a key to
                stop accepting its events immediately.
              </CardDescription>
            </div>
            {isOwner && (
              <Button size="sm" variant="outline" onClick={() => void createKey({ projectId, name: `Key ${(keys?.length ?? 0) + 1}` })}>
                New key
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {error && <p className="mb-2 text-sm text-status-critical">{error}</p>}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys?.map((key) => (
                  <TableRow key={key._id}>
                    <TableCell>{key.name}</TableCell>
                    <TableCell className="font-mono text-xs">{key.key}</TableCell>
                    <TableCell>
                      <Badge variant={key.enabled ? "good" : "outline"}>{key.enabled ? "Enabled" : "Disabled"}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{key.lastUsedAt ? formatRelative(key.lastUsedAt) : "Never"}</TableCell>
                    <TableCell className="text-right">
                      {isOwner && (
                        <Button size="sm" variant="ghost" onClick={() => void toggle(key._id, !key.enabled)}>
                          {key.enabled ? "Disable" : "Enable"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-4">
              <p className="mb-2 text-xs text-muted-foreground">Ingestion endpoint</p>
              <CodeBlock code={`${ingestionHost()}/v1/batch`} />
            </div>
            <Link href={href("/setup")} className="mt-3 inline-block text-sm text-muted-foreground hover:text-foreground">
              SDK setup guide →
            </Link>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
