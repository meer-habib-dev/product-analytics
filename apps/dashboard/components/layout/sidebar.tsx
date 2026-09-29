"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Filter,
  LayoutDashboard,
  LineChart,
  LogOut,
  Package,
  Settings,
  Timer,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { NativeSelect } from "@/components/ui/native-select";
import { useProjectHref, useProjectId } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const NAV = [
  { path: "", label: "Overview", icon: LayoutDashboard },
  { path: "/events", label: "Events", icon: Activity },
  { path: "/insights", label: "Insights", icon: LineChart },
  { path: "/funnels", label: "Funnels", icon: Filter },
  { path: "/people", label: "People", icon: Users },
  { path: "/sessions", label: "Sessions", icon: Timer },
  { path: "/errors", label: "Errors", icon: AlertTriangle },
  { path: "/releases", label: "Releases", icon: Package },
  { path: "/settings", label: "Settings", icon: Settings },
];

function useActive() {
  const pathname = usePathname();
  const projectId = useProjectId();
  const base = `/p/${projectId}`;
  return (path: string) => (path === "" ? pathname === base || pathname === `${base}/setup` : pathname.startsWith(base + path));
}

function ProjectSwitcher() {
  const projects = useQuery(api.projects.queries.listMine);
  const projectId = useProjectId();
  const router = useRouter();
  return (
    <NativeSelect
      aria-label="Project"
      value={projectId}
      onChange={(e) => router.push(e.target.value === "new" ? "/projects/new" : `/p/${e.target.value}`)}
    >
      {projects?.map((p) => (
        <option key={p._id} value={p._id}>
          {p.name}
        </option>
      ))}
      <option value="new">+ New project</option>
    </NativeSelect>
  );
}

export function Sidebar() {
  const href = useProjectHref();
  const isActive = useActive();
  const { signOut } = useAuthActions();
  const router = useRouter();

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r bg-sidebar md:flex">
      <div className="flex items-center gap-2 px-4 pb-3 pt-4">
        <div className="flex size-6 items-center justify-center rounded bg-primary text-primary-foreground">
          <BarChart3 className="size-3.5" />
        </div>
        <span className="text-sm font-semibold">Analytics</span>
      </div>
      <div className="px-3 pb-3">
        <ProjectSwitcher />
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 px-2">
        {NAV.map(({ path, label, icon: Icon }) => (
          <Link
            key={path}
            href={href(path)}
            className={cn(
              "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              isActive(path) && "bg-accent font-medium text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        ))}
      </nav>
      <button
        type="button"
        onClick={() => void signOut().then(() => router.replace("/login"))}
        className="m-2 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <LogOut className="size-4" />
        Sign out
      </button>
    </aside>
  );
}

/** Small screens: project switcher plus a horizontally scrolling nav. */
export function MobileNav() {
  const href = useProjectHref();
  const isActive = useActive();
  return (
    <div className="border-b bg-sidebar md:hidden">
      <div className="px-4 pt-3">
        <ProjectSwitcher />
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 py-2">
        {NAV.map(({ path, label }) => (
          <Link
            key={path}
            href={href(path)}
            className={cn(
              "shrink-0 rounded-md px-2.5 py-1 text-sm text-muted-foreground",
              isActive(path) && "bg-accent font-medium text-foreground",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
