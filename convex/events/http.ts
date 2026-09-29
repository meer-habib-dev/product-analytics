import {
  type BatchErrorCode,
  type BatchErrorResponse,
  type BatchResponse,
  INGESTION_LIMITS,
} from "@analytics/shared";
import { parseEnvelope, validateEvents } from "@analytics/shared/validation";
import { internal } from "../_generated/api";
import { httpAction } from "../_generated/server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(status: number, body: BatchResponse | BatchErrorResponse): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function fail(status: number, error: BatchErrorCode, message: string): Response {
  return json(status, { error, message });
}

/**
 * POST /v1/batch — the only entry point for SDK traffic.
 * Status codes are part of the SDK contract:
 *   200  batch settled (stored, duplicate or permanently rejected) → drop it
 *   4xx  request can never succeed as-is → drop it (401/403: stop sending)
 *   5xx  transient → keep and retry with backoff
 */
export const ingestBatchHttp = httpAction(async (ctx, request) => {
  const receivedAt = Date.now();

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > INGESTION_LIMITS.maxRequestBytes) {
    return fail(413, "payload_too_large", `Request body must be at most ${INGESTION_LIMITS.maxRequestBytes} bytes.`);
  }
  const text = await request.text();
  if (text.length > INGESTION_LIMITS.maxRequestBytes) {
    return fail(413, "payload_too_large", `Request body must be at most ${INGESTION_LIMITS.maxRequestBytes} bytes.`);
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return fail(400, "invalid_json", "Request body is not valid JSON.");
  }

  const envelope = parseEnvelope(body);
  if (!envelope.ok) return fail(400, envelope.error, envelope.message);

  try {
    const key = await ctx.runQuery(internal.projects.apiKeys.resolveIngestionKey, { key: envelope.apiKey });
    if (!key) return fail(401, "invalid_api_key", "Unknown project API key.");
    if (!key.enabled) return fail(403, "project_disabled", "This project API key is disabled.");

    const { events, rejections } = validateEvents(envelope.events, { receivedAt, sentAt: envelope.sentAt });

    let stored = { accepted: 0, duplicates: 0 };
    if (events.length > 0) {
      stored = await ctx.runMutation(internal.events.ingest.ingestBatch, {
        projectId: key.projectId,
        apiKeyId: key.keyId,
        receivedAt,
        events,
      });
    }

    return json(200, {
      accepted: stored.accepted,
      duplicates: stored.duplicates,
      rejected: rejections.length,
      ...(rejections.length > 0 ? { errors: rejections.slice(0, 20) } : {}),
    });
  } catch (error) {
    // Logged server-side only; clients get a generic retryable error.
    console.error("Batch ingestion failed", error);
    return fail(500, "internal_error", "Could not store events. Retry later.");
  }
});

export const ingestPreflight = httpAction(async () => new Response(null, { status: 204, headers: CORS_HEADERS }));
