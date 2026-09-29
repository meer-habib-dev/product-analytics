import type { Logger, StorageAdapter, WireEvent } from "./types";

export interface QueueLimits {
  maxQueueSize: number;
  maxQueueBytes: number;
  /** Individual events larger than this are dropped on enqueue. */
  maxEventBytes: number;
}

interface Entry {
  event: WireEvent;
  bytes: number;
}

/**
 * Persistent FIFO of events waiting to be uploaded.
 *
 * - `enqueue` is synchronous and never touches the network.
 * - Persistence is coalesced: many events tracked in the same tick cause a
 *   single storage write.
 * - When full, the OLDEST events are discarded first. Recent behaviour is
 *   more valuable, and analytics must never exhaust app storage.
 * - Events handed to the uploader are "in flight" until acked or released,
 *   so they're never sent twice concurrently or evicted mid-request.
 */
export class EventQueue {
  private entries: Entry[] = [];
  private readonly inFlight = new Set<string>();
  private totalBytes = 0;
  private persistScheduled = false;

  constructor(
    private readonly storage: StorageAdapter,
    private readonly storageKey: string,
    private readonly limits: QueueLimits,
    private readonly logger: Logger,
  ) {}

  /** Restores events persisted by a previous app run, ahead of anything queued since start-up. */
  async load(): Promise<void> {
    let restored: WireEvent[] = [];
    try {
      const raw = await this.storage.getItem(this.storageKey);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) restored = parsed.filter(isWireEvent);
      }
    } catch (error) {
      this.logger.warn("Could not restore the event queue; starting empty.", error);
    }
    const pending = this.entries;
    this.entries = [];
    this.totalBytes = 0;
    for (const event of [...restored, ...pending.map((e) => e.event)]) this.push(event);
    this.enforceLimits();
    if (restored.length > 0) this.logger.debug(`Restored ${restored.length} queued events.`);
  }

  get size(): number {
    return this.entries.length;
  }

  get pendingCount(): number {
    return this.entries.length - this.inFlight.size;
  }

  enqueue(event: WireEvent): boolean {
    const bytes = byteLength(event);
    if (bytes > this.limits.maxEventBytes) {
      this.logger.warn(`Dropping "${event.eventName}": ${bytes} bytes exceeds the per-event limit.`);
      return false;
    }
    this.entries.push({ event, bytes });
    this.totalBytes += bytes;
    this.enforceLimits();
    this.schedulePersist();
    return true;
  }

  /** Oldest events not already in flight, marked as in flight. */
  takeBatch(max: number): WireEvent[] {
    const batch: WireEvent[] = [];
    for (const entry of this.entries) {
      if (batch.length >= max) break;
      if (this.inFlight.has(entry.event.eventId)) continue;
      this.inFlight.add(entry.event.eventId);
      batch.push(entry.event);
    }
    return batch;
  }

  /** Removes events the server has settled. */
  ack(eventIds: string[]): void {
    const ids = new Set(eventIds);
    ids.forEach((id) => this.inFlight.delete(id));
    this.removeWhere((entry) => ids.has(entry.event.eventId));
    this.schedulePersist();
  }

  /** Returns events to the queue after a failed attempt so they are retried. */
  release(eventIds: string[]): void {
    eventIds.forEach((id) => this.inFlight.delete(id));
  }

  clear(): void {
    this.entries = [];
    this.totalBytes = 0;
    this.inFlight.clear();
    this.schedulePersist();
  }

  /** Writes immediately; used when the app is backgrounded or about to crash. */
  persistNow(): void {
    this.persistScheduled = false;
    try {
      const result = this.storage.setItem(this.storageKey, JSON.stringify(this.entries.map((e) => e.event)));
      if (result instanceof Promise) result.catch((error) => this.logger.warn("Persisting the queue failed.", error));
    } catch (error) {
      this.logger.warn("Persisting the queue failed.", error);
    }
  }

  private schedulePersist(): void {
    if (this.persistScheduled) return;
    this.persistScheduled = true;
    Promise.resolve().then(() => {
      if (this.persistScheduled) this.persistNow();
    });
  }

  private push(event: WireEvent): void {
    const bytes = byteLength(event);
    this.entries.push({ event, bytes });
    this.totalBytes += bytes;
  }

  private enforceLimits(): void {
    let dropped = 0;
    while (this.entries.length > this.limits.maxQueueSize || this.totalBytes > this.limits.maxQueueBytes) {
      const index = this.entries.findIndex((e) => !this.inFlight.has(e.event.eventId));
      if (index === -1) break;
      const [removed] = this.entries.splice(index, 1);
      this.totalBytes -= removed!.bytes;
      dropped++;
    }
    if (dropped > 0) this.logger.warn(`Queue full: discarded ${dropped} oldest events.`);
  }

  private removeWhere(predicate: (entry: Entry) => boolean): void {
    const kept: Entry[] = [];
    for (const entry of this.entries) {
      if (predicate(entry)) this.totalBytes -= entry.bytes;
      else kept.push(entry);
    }
    this.entries = kept;
  }
}

function byteLength(event: WireEvent): number {
  // UTF-16 length is a close enough proxy; exact byte counts aren't worth the cost here.
  return JSON.stringify(event).length;
}

function isWireEvent(value: unknown): value is WireEvent {
  const v = value as Partial<WireEvent> | null;
  return (
    typeof v === "object" &&
    v !== null &&
    typeof v.eventId === "string" &&
    typeof v.eventName === "string" &&
    typeof v.anonymousId === "string" &&
    typeof v.timestamp === "number"
  );
}
