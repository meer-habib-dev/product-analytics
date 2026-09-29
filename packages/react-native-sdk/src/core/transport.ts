import { BATCH_PATH, type BatchRequest, type BatchResponse } from "@analytics/shared";
import type { Logger, WireEvent } from "./types";

export type SendResult =
  /** Every event in the batch is settled (stored, duplicate or permanently rejected). */
  | { kind: "settled"; response: BatchResponse }
  /** Transient failure: keep the events and retry later. */
  | { kind: "retry"; reason: string; retryAfterMs?: number }
  /** The request can never succeed as sent: drop the events. */
  | { kind: "drop"; reason: string }
  /** Body too large: retry with smaller batches. */
  | { kind: "split" }
  /** The key is invalid or disabled: stop uploading until the next init. */
  | { kind: "unauthorized"; reason: string };

export type FetchLike = (input: string, init: RequestInit) => Promise<Pick<Response, "status" | "headers" | "text">>;

export class Transport {
  constructor(
    private readonly options: { host: string; apiKey: string; timeoutMs: number },
    private readonly fetchImpl: FetchLike,
    private readonly logger: Logger,
    private readonly now: () => number = Date.now,
  ) {}

  async send(events: WireEvent[]): Promise<SendResult> {
    const body: BatchRequest = { apiKey: this.options.apiKey, sentAt: this.now(), events };
    const controller = typeof AbortController === "undefined" ? undefined : new AbortController();
    const timer = setTimeout(() => controller?.abort(), this.options.timeoutMs);

    let status: number;
    let text: string;
    let retryAfter: string | null = null;
    try {
      const response = await this.fetchImpl(`${this.options.host}${BATCH_PATH}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller?.signal,
      });
      status = response.status;
      retryAfter = response.headers.get("retry-after");
      text = await response.text();
    } catch (error) {
      // Offline, DNS failure, timeout/abort: all transient from our perspective.
      return { kind: "retry", reason: `network: ${error instanceof Error ? error.message : String(error)}` };
    } finally {
      clearTimeout(timer);
    }

    return classify(status, text, retryAfter, this.logger);
  }
}

export function classify(status: number, text: string, retryAfter: string | null, logger: Logger): SendResult {
  if (status >= 200 && status < 300) {
    const response = parseBatchResponse(text);
    if (!response) return { kind: "retry", reason: "malformed response" };
    if (response.rejected > 0) logger.warn(`${response.rejected} events were rejected by the server.`, response.errors);
    return { kind: "settled", response };
  }
  if (status === 413) return { kind: "split" };
  if (status === 401 || status === 403) return { kind: "unauthorized", reason: `${status} ${text.slice(0, 200)}` };
  if (status === 408 || status === 429 || status >= 500) {
    const seconds = retryAfter ? Number(retryAfter) : NaN;
    return { kind: "retry", reason: `HTTP ${status}`, retryAfterMs: Number.isFinite(seconds) ? seconds * 1000 : undefined };
  }
  return { kind: "drop", reason: `HTTP ${status} ${text.slice(0, 200)}` };
}

function parseBatchResponse(text: string): BatchResponse | null {
  try {
    const value = JSON.parse(text) as Partial<BatchResponse>;
    if (typeof value.accepted !== "number" || typeof value.rejected !== "number") return null;
    return { duplicates: 0, ...value } as BatchResponse;
  } catch {
    return null;
  }
}
