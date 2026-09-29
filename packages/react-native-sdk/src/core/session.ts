import { prefixedId } from "./uuid";

export interface SessionTransition {
  /** The session that ended, with the time of its last activity. */
  ended?: { sessionId: string; lastActivityAt: number };
  started: { sessionId: string; startedAt: number };
}

/**
 * Sessions live in memory only: every cold start begins a new session, and
 * so does activity (or returning to the foreground) after `timeoutMs` of
 * inactivity. The server derives session end from the last event, so a
 * killed app never leaves a session "open".
 */
export class SessionManager {
  private current: { sessionId: string; startedAt: number; lastActivityAt: number } | undefined;

  constructor(private readonly timeoutMs: number) {}

  get sessionId(): string | undefined {
    return this.current?.sessionId;
  }

  start(now: number): SessionTransition {
    const ended = this.current ? { sessionId: this.current.sessionId, lastActivityAt: this.current.lastActivityAt } : undefined;
    this.current = { sessionId: prefixedId("sess"), startedAt: now, lastActivityAt: now };
    return { ended, started: { sessionId: this.current.sessionId, startedAt: now } };
  }

  /** Records activity; returns a transition if the previous session had expired. */
  touch(now: number): SessionTransition | undefined {
    const transition = this.isExpired(now) ? this.start(now) : undefined;
    if (this.current) this.current.lastActivityAt = Math.max(this.current.lastActivityAt, now);
    return transition;
  }

  isExpired(now: number): boolean {
    return !this.current || now - this.current.lastActivityAt >= this.timeoutMs;
  }
}
