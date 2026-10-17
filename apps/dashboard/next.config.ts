import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { NextConfig } from "next";

/**
 * `convex dev` writes CONVEX_URL / CONVEX_SITE_URL to the repo-root
 * .env.local. Reuse them locally so the dashboard needs no manual env setup.
 * Explicit NEXT_PUBLIC_* values (e.g. injected by `convex deploy` on Vercel) win.
 */
function readRootEnv(): Record<string, string> {
  const file = resolve(process.cwd(), "../../.env.local");
  if (!existsSync(file)) return {};
  const entries = readFileSync(file, "utf8")
    .split("\n")
    .map((line) => /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(?:#.*)?$/.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => [match[1]!, match[2]!.replace(/^["']|["']$/g, "")] as const);
  return Object.fromEntries(entries);
}

const rootEnv = readRootEnv();
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || rootEnv.CONVEX_URL || "";
const ingestionHost = process.env.NEXT_PUBLIC_INGESTION_HOST || rootEnv.CONVEX_SITE_URL || "";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@analytics/shared"],
  env: {
    NEXT_PUBLIC_CONVEX_URL: convexUrl,
    NEXT_PUBLIC_INGESTION_HOST: ingestionHost,
  },
};

export default nextConfig;
