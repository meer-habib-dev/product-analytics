import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { EventContextValue, Properties } from "../lib/validators";

/**
 * Resolves (anonymousId, distinctId?) to a person during ingestion.
 *
 * Rules:
 * - An anonymous person is promoted in place the first time its anonymousId is
 *   seen with a distinctId, so pre-login and post-login activity is one person.
 * - If the distinctId already has a person, the anonymous person is merged
 *   into it (marked `mergedIntoId`, alias re-pointed) and its events are
 *   re-pointed in the background.
 * - An anonymousId that already belongs to an *identified* person is never
 *   re-assigned. This protects shared devices where `reset()` wasn't called:
 *   user B's events go to B, and A's history never absorbs B.
 */
export class IdentityResolver {
  private readonly byAnonymous = new Map<string, Id<"people">>();
  private readonly byDistinct = new Map<string, Id<"people">>();

  constructor(
    private readonly ctx: MutationCtx,
    private readonly projectId: Id<"projects">,
  ) {}

  async resolve(event: { anonymousId: string; distinctId?: string; timestamp: number }): Promise<{
    personId: Id<"people">;
    isNew: boolean;
  }> {
    if (event.distinctId) return this.resolveIdentified(event.anonymousId, event.distinctId, event.timestamp);

    const cached = this.byAnonymous.get(event.anonymousId);
    if (cached) return { personId: cached, isNew: false };

    const alias = await this.findAlias(event.anonymousId);
    if (alias) {
      const personId = await this.followMerges(alias.personId);
      this.byAnonymous.set(event.anonymousId, personId);
      return { personId, isNew: false };
    }

    const personId = await this.insertPerson(undefined, event.timestamp);
    await this.ctx.db.insert("personAliases", { projectId: this.projectId, anonymousId: event.anonymousId, personId });
    this.byAnonymous.set(event.anonymousId, personId);
    return { personId, isNew: true };
  }

  private async resolveIdentified(anonymousId: string, distinctId: string, timestamp: number) {
    const cacheKey = `${distinctId}\u0000${anonymousId}`;
    const cached = this.byDistinct.get(cacheKey);
    if (cached) return { personId: cached, isNew: false };

    const identified = await this.ctx.db
      .query("people")
      .withIndex("by_project_distinct", (q) => q.eq("projectId", this.projectId).eq("distinctId", distinctId))
      .first();
    const alias = await this.findAlias(anonymousId);
    const aliasPerson = alias ? await this.ctx.db.get(await this.followMerges(alias.personId)) : null;

    let personId: Id<"people">;
    let isNew = false;

    if (identified) {
      personId = identified._id;
      if (alias && aliasPerson && aliasPerson._id !== personId && aliasPerson.distinctId === undefined) {
        await this.merge(aliasPerson, identified);
        await this.ctx.db.patch(alias._id, { personId });
      }
    } else if (aliasPerson && aliasPerson.distinctId === undefined) {
      personId = aliasPerson._id;
      await this.ctx.db.patch(personId, { distinctId, searchText: distinctId });
    } else {
      personId = await this.insertPerson(distinctId, timestamp);
      isNew = true;
    }

    if (!alias) {
      await this.ctx.db.insert("personAliases", { projectId: this.projectId, anonymousId, personId });
    }
    const aliasOwner = alias ? await this.followMerges(alias.personId) : personId;
    this.byAnonymous.set(anonymousId, aliasOwner);
    this.byDistinct.set(cacheKey, personId);
    return { personId, isNew };
  }

  private async merge(anonymous: Doc<"people">, target: Doc<"people">): Promise<void> {
    await this.ctx.db.patch(anonymous._id, { mergedIntoId: target._id });
    if (anonymous.firstSeenAt < target.firstSeenAt) {
      await this.ctx.db.patch(target._id, { firstSeenAt: anonymous.firstSeenAt });
    }
    await this.ctx.scheduler.runAfter(0, internal.people.merge.reassignPerson, {
      fromPersonId: anonymous._id,
      toPersonId: target._id,
    });
  }

  private async followMerges(personId: Id<"people">): Promise<Id<"people">> {
    let current = personId;
    for (let depth = 0; depth < 5; depth++) {
      const person = await this.ctx.db.get(current);
      if (!person?.mergedIntoId) return current;
      current = person.mergedIntoId;
    }
    return current;
  }

  private findAlias(anonymousId: string) {
    return this.ctx.db
      .query("personAliases")
      .withIndex("by_project_anonymous", (q) => q.eq("projectId", this.projectId).eq("anonymousId", anonymousId))
      .first();
  }

  private insertPerson(distinctId: string | undefined, timestamp: number) {
    return this.ctx.db.insert("people", {
      projectId: this.projectId,
      distinctId,
      properties: {},
      firstSeenAt: timestamp,
      lastSeenAt: timestamp,
      searchText: distinctId ?? "",
    });
  }
}

/** Per-person "last seen" and trait updates, written once per batch. */
export class PersonUpdates {
  private readonly updates = new Map<Id<"people">, { firstSeenAt: number; lastSeenAt: number; context?: EventContextValue; traits: Properties }>();

  touch(personId: Id<"people">, timestamp: number, context: EventContextValue): void {
    const entry = this.updates.get(personId);
    if (!entry) {
      this.updates.set(personId, { firstSeenAt: timestamp, lastSeenAt: timestamp, context, traits: {} });
      return;
    }
    entry.firstSeenAt = Math.min(entry.firstSeenAt, timestamp);
    if (timestamp >= entry.lastSeenAt) {
      entry.lastSeenAt = timestamp;
      entry.context = context;
    }
  }

  setTraits(personId: Id<"people">, traits: Properties): void {
    const entry = this.updates.get(personId);
    if (entry) Object.assign(entry.traits, traits);
  }

  async apply(ctx: MutationCtx): Promise<void> {
    for (const [personId, update] of this.updates) {
      const person = await ctx.db.get(personId);
      if (!person) continue;
      const properties = { ...person.properties, ...update.traits };
      const isLatest = update.lastSeenAt >= person.lastSeenAt;
      await ctx.db.patch(personId, {
        firstSeenAt: Math.min(person.firstSeenAt, update.firstSeenAt),
        lastSeenAt: Math.max(person.lastSeenAt, update.lastSeenAt),
        properties,
        searchText: buildSearchText(person.distinctId, properties),
        ...(isLatest && update.context
          ? { lastPlatform: update.context.platform, lastAppVersion: update.context.appVersion }
          : {}),
      });
    }
  }
}

export function buildSearchText(distinctId: string | undefined, properties: Properties): string {
  const parts = [distinctId, properties.email, properties.name, properties.username];
  return parts.filter((p): p is string => typeof p === "string" && p.length > 0).join(" ");
}
