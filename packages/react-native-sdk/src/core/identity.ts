import { prefixedId } from "./uuid";
import type { Logger, StorageAdapter } from "./types";

const ANONYMOUS_KEY = "anonymousId";
const DISTINCT_KEY = "distinctId";

/**
 * Owns the device's anonymous id and the identified user id.
 * Both are persisted so identity survives restarts.
 */
export class IdentityManager {
  private anonymous = "";
  private distinct: string | undefined;

  constructor(
    private readonly storage: StorageAdapter,
    private readonly keyPrefix: string,
    private readonly logger: Logger,
  ) {}

  async load(): Promise<void> {
    try {
      const [anonymousId, distinctId] = await Promise.all([
        this.storage.getItem(this.key(ANONYMOUS_KEY)),
        this.storage.getItem(this.key(DISTINCT_KEY)),
      ]);
      this.anonymous = anonymousId || "";
      this.distinct = distinctId || undefined;
    } catch (error) {
      this.logger.warn("Could not restore identity.", error);
    }
    if (!this.anonymous) this.rotateAnonymousId();
  }

  get anonymousId(): string {
    return this.anonymous;
  }

  get distinctId(): string | undefined {
    return this.distinct;
  }

  /** Returns true when the identity actually changed. */
  identify(distinctId: string): boolean {
    if (this.distinct === distinctId) return false;
    this.distinct = distinctId;
    this.write(DISTINCT_KEY, distinctId);
    return true;
  }

  /** Logout: forget the user and start a brand new anonymous identity. */
  reset(): void {
    this.distinct = undefined;
    this.remove(DISTINCT_KEY);
    this.rotateAnonymousId();
  }

  private rotateAnonymousId(): void {
    this.anonymous = prefixedId("anon");
    this.write(ANONYMOUS_KEY, this.anonymous);
  }

  private key(name: string): string {
    return `${this.keyPrefix}.${name}`;
  }

  private write(name: string, value: string): void {
    void Promise.resolve()
      .then(() => this.storage.setItem(this.key(name), value))
      .catch((error) => this.logger.warn("Could not persist identity.", error));
  }

  private remove(name: string): void {
    void Promise.resolve()
      .then(() => this.storage.removeItem(this.key(name)))
      .catch((error) => this.logger.warn("Could not persist identity.", error));
  }
}
