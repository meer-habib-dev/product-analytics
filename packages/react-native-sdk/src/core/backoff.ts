/** Exponential backoff with jitter so a fleet of devices doesn't retry in lockstep after an outage. */
export class Backoff {
  private attempts = 0;
  private nextAttemptAt = 0;

  constructor(
    private readonly minMs: number,
    private readonly maxMs: number,
    private readonly random: () => number = Math.random,
  ) {}

  failure(now: number, retryAfterMs?: number): number {
    const exponential = Math.min(this.maxMs, this.minMs * 2 ** this.attempts);
    const jittered = exponential / 2 + (this.random() * exponential) / 2;
    const delay = Math.min(this.maxMs, Math.max(jittered, retryAfterMs ?? 0));
    this.attempts++;
    this.nextAttemptAt = now + delay;
    return delay;
  }

  success(): void {
    this.attempts = 0;
    this.nextAttemptAt = 0;
  }

  canAttempt(now: number): boolean {
    return now >= this.nextAttemptAt;
  }

  get failures(): number {
    return this.attempts;
  }
}
