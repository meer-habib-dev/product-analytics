"use client";

import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { CodeBlock } from "@/components/analytics/code-block";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useProjectHref, useProjectId } from "@/lib/hooks";
import { ingestionHost } from "@/lib/ingestion";

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[28px_1fr] gap-3">
      <span className="flex size-6 items-center justify-center rounded-full border text-xs font-medium">{n}</span>
      <div className="min-w-0">
        <h2 className="text-sm font-medium">{title}</h2>
        <div className="mt-2 flex flex-col gap-2 text-sm text-muted-foreground">{children}</div>
      </div>
    </li>
  );
}

export default function SetupPage() {
  const projectId = useProjectId();
  const href = useProjectHref();
  const project = useQuery(api.projects.queries.get, { projectId });
  const keys = useQuery(api.projects.apiKeys.list, { projectId });
  const apiKey = keys?.find((k) => k.enabled)?.key ?? "proj_…";
  const host = ingestionHost();
  const received = project?.firstEventAt !== undefined;

  return (
    <>
      <PageHeader title="Set up your app" description="About five minutes from install to first event." />
      <Card>
        <CardContent className="pt-5">
          <ol className="flex flex-col gap-6">
            <Step n={1} title="Install the SDK and its peer dependencies">
              <CodeBlock code={"npx expo install @analytics/react-native react-native-mmkv react-native-nitro-modules expo-application expo-device"} />
              <p>MMKV needs a development build (it is not available in Expo Go, where the SDK falls back to in-memory storage).</p>
            </Step>
            <Step n={2} title="Add your project key">
              <p>This key can only send events to this project. It is safe to ship in your app.</p>
              <CodeBlock code={`EXPO_PUBLIC_ANALYTICS_KEY=${apiKey}\nEXPO_PUBLIC_ANALYTICS_HOST=${host}`} />
            </Step>
            <Step n={3} title="Initialize once, at startup (e.g. app/_layout.tsx)">
              <CodeBlock
                code={`import { analytics } from "@analytics/react-native";

analytics.init({
  apiKey: process.env.EXPO_PUBLIC_ANALYTICS_KEY!,
  host: process.env.EXPO_PUBLIC_ANALYTICS_HOST!,
  debug: __DEV__,
});`}
              />
            </Step>
            <Step n={4} title="Track screens and events">
              <CodeBlock
                code={`// expo-router: in your root layout
const pathname = usePathname();
useEffect(() => analytics.screen(pathname), [pathname]);

analytics.track("paywall_viewed");
analytics.track("plan_selected", { plan: "yearly", price: 49.99 });

// after login / logout
analytics.identify(user.id, { plan: user.plan });
analytics.reset();`}
              />
            </Step>
          </ol>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-md border bg-muted/40 px-4 py-3">
            {received ? (
              <span className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="size-4 text-status-good" /> Events are arriving.
              </span>
            ) : (
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Waiting for the first event… this updates live.
              </span>
            )}
            <Button asChild variant={received ? "default" : "outline"}>
              <Link href={href("/events")}>Open live events</Link>
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            No device handy? Send a test batch: <code className="font-mono">curl -X POST {host}/v1/batch -H 'content-type: application/json' -d
            {` '{"apiKey":"${apiKey}","events":[{"eventId":"test-1","eventName":"test_event","anonymousId":"anon_test","timestamp":${"$"}(date +%s000)}]}'`}</code>
          </p>
        </CardContent>
      </Card>
    </>
  );
}
