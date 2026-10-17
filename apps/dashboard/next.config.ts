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

/** `convex dev` names the variables after the framework it detects, so accept any of them. */
function firstOf(env: Record<string, string>, names: string[]): string | undefined {
  return names.map((name) => env[name]).find((value) => value !== undefined && value.length > 0);
}

const PREFIXES = ["", "NEXT_PUBLIC_", "VITE_", "EXPO_PUBLIC_", "PUBLIC_", "REACT_APP_"];
// "dev:happy-animal-123 # team: …" → https://happy-animal-123.convex.cloud
const deploymentName = rootEnv.CONVEX_DEPLOYMENT?.split(":")[1]?.trim();
const convexUrl =
  process.env.NEXT_PUBLIC_CONVEX_URL ||
  firstOf(rootEnv, PREFIXES.map((p) => `${p}CONVEX_URL`)) ||
  (deploymentName ? `https://${deploymentName}.convex.cloud` : "");
const ingestionHost =
  process.env.NEXT_PUBLIC_INGESTION_HOST ||
  firstOf(rootEnv, PREFIXES.map((p) => `${p}CONVEX_SITE_URL`)) ||
  convexUrl.replace(/\.convex\.cloud\/?$/, ".convex.site");

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@analytics/shared"],
  env: {
    NEXT_PUBLIC_CONVEX_URL: convexUrl,
    NEXT_PUBLIC_INGESTION_HOST: ingestionHost,
  },
};

export default nextConfig;
