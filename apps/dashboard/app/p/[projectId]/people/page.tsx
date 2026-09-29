"use client";

import { api } from "@convex/_generated/api";
import { usePaginatedQuery } from "convex/react";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useDeferredValue, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, formatRelative, personLabel } from "@/lib/format";
import { useProjectHref, useProjectId } from "@/lib/hooks";

export default function PeoplePage() {
  const projectId = useProjectId();
  const href = useProjectHref();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const deferred = useDeferredValue(search.trim());
  const { results, status, loadMore } = usePaginatedQuery(
    api.people.queries.getPeople,
    { projectId, search: deferred || undefined },
    { initialNumItems: 50 },
  );

  return (
    <>
      <PageHeader
        title="People"
        description="Everyone who used your app. Traits appear only when you pass them to identify()."
        actions={
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search id, email or name" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        }
      />
      <Card>
        <CardContent className="pt-3">
          {status === "LoadingFirstPage" ? (
            <Skeleton className="h-64" />
          ) : results.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No people found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead className="hidden md:table-cell">Email</TableHead>
                  <TableHead className="hidden md:table-cell">Release</TableHead>
                  <TableHead className="hidden sm:table-cell">First seen</TableHead>
                  <TableHead className="text-right">Last seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((person) => (
                  <TableRow key={person._id} className="cursor-pointer" onClick={() => router.push(href(`/people/${person._id}`))}>
                    <TableCell className="max-w-56 truncate font-medium">
                      {person.name ? `${person.name} · ` : ""}
                      <span className={person.distinctId ? "" : "text-muted-foreground"}>{personLabel(person)}</span>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{person.email ?? "—"}</TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                      {[person.lastPlatform, person.lastAppVersion].filter(Boolean).join(" ") || "—"}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{formatDateTime(person.firstSeenAt)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatRelative(person.lastSeenAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {status === "CanLoadMore" && (
            <div className="mt-3 flex justify-center">
              <Button variant="outline" size="sm" onClick={() => loadMore(50)}>
                Load more
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
