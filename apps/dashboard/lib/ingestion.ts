/**
 * The public ingestion host shown in setup snippets. Convex serves HTTP
 * actions from the `.convex.site` twin of the deployment's `.convex.cloud` URL.
 */
export function ingestionHost(): string {
  const explicit = process.env.NEXT_PUBLIC_INGESTION_HOST;
  if (explicit) return explicit.replace(/\/+$/, "");
  const cloud = process.env.NEXT_PUBLIC_CONVEX_URL ?? "";
  return cloud ? cloud.replace(/\.convex\.cloud\/?$/, ".convex.site") : "https://<your-deployment>.convex.site";
}
