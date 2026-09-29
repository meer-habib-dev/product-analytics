import type { Backoff } from "./backoff";
import type { EventQueue } from "./queue";
import type { Transport } from "./transport";
import type { Logger } from "./types";

export interface UploaderOptions {
  flushAt: number;
  flushIntervalMs: number;
  maxBatchSize: number;
}

/**
 * Moves events from the queue to the server in batches. Only one upload runs
 * at a time; failures leave events queued and push the next automatic
 * attempt out with exponential backoff. Never throws to the caller.
 */
export class Uploader {
  private inProgress: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private batchSize: number;
  private unauthorized = false;

  constructor(
    private readonly queue: EventQueue,
    private readonly transport: Transport,
    private readonly backoff: Backoff,
    private readonly options: UploaderOptions,
    private readonly logger: Logger,
    private readonly now: () => number = Date.now,
  ) {
    this.batchSize = options.maxBatchSize;
  }

  start(): void {
    this.stop();
    this.timer = setInterval(() => this.flushIfDue(), this.options.flushIntervalMs);
  }

  stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Called after each enqueue; flushes once the size threshold is reached. */
  onEnqueued(): void {
    if (this.queue.pendingCount >= this.options.flushAt) this.flushIfDue();
  }

  /** Automatic flush: respects backoff so a dead network isn't hammered. */
  flushIfDue(): void {
    if (this.queue.pendingCount > 0 && this.backoff.canAttempt(this.now())) void this.flush();
  }

  /** Explicit flush (developer call or app backgrounding): attempts immediately. */
  flush(): Promise<void> {
    if (this.unauthorized) return Promise.resolve();
    this.inProgress ??= this.drain()
      .catch((error) => this.logger.warn("Flush failed unexpectedly.", error))
      .finally(() => {
        this.inProgress = null;
      });
    return this.inProgress;
  }

  private async drain(): Promise<void> {
    for (;;) {
      const batch = this.queue.takeBatch(this.batchSize);
      if (batch.length === 0) return;
      const ids = batch.map((e) => e.eventId);
      const result = await this.transport.send(batch);

      switch (result.kind) {
        case "settled":
          this.queue.ack(ids);
          this.backoff.success();
          this.logger.debug(
            `Uploaded ${batch.length} events (accepted ${result.response.accepted}, duplicates ${result.response.duplicates}, rejected ${result.response.rejected}).`,
          );
          continue;
        case "drop":
          this.queue.ack(ids);
          this.logger.warn(`Server refused a batch; dropping ${batch.length} events. ${result.reason}`);
          continue;
        case "split":
          if (this.batchSize > 1) {
            this.queue.release(ids);
            this.batchSize = Math.ceil(this.batchSize / 2);
            this.logger.debug(`Batch too large; retrying with ${this.batchSize} events per request.`);
          } else {
            this.queue.ack(ids);
            this.logger.warn("Dropping an event the server considers too large.");
          }
          continue;
        case "unauthorized":
          this.queue.release(ids);
          this.unauthorized = true;
          this.logger.warn(`Uploads stopped: the API key was rejected (${result.reason}). Events stay queued.`);
          return;
        case "retry": {
          this.queue.release(ids);
          const delay = this.backoff.failure(this.now(), result.retryAfterMs);
          this.logger.debug(`Upload failed (${result.reason}); next automatic attempt in ${Math.round(delay / 1000)}s.`);
          return;
        }
      }
    }
  }
}
