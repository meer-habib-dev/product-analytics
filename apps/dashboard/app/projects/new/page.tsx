"use client";

import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function NewProjectPage() {
  const createProject = useMutation(api.projects.mutations.create);
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const projectId = await createProject({ name });
      router.push(`/p/${projectId}/setup`);
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm">
        <h1 className="text-xl font-semibold">Create a project</h1>
        <p className="mt-1 text-sm text-muted-foreground">One project per app, e.g. Ringo or Spendly. You'll get an API key next.</p>
        <div className="mt-6 flex flex-col gap-1.5">
          <Label htmlFor="name">Project name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ringo" maxLength={64} required autoFocus />
        </div>
        <Button type="submit" className="mt-4 w-full" disabled={pending || !name.trim()}>
          {pending ? "Creating…" : "Create project"}
        </Button>
      </form>
    </main>
  );
}
