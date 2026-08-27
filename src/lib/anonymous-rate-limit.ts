import { createHmac } from "node:crypto";
import { inArray, lte, sql } from "drizzle-orm";
import type { getDb } from "@/db";
import { anonymousActionRateLimits } from "@/db/schema";
import { sessionSecretRaw } from "@/lib/secret";

export const ANONYMOUS_ACTION_RETRY_ERROR = "Please wait a while and try again.";

export type AnonymousActionRateLimit = {
  max: number;
  windowMs: number;
};

export type AnonymousActionRateLimits = Partial<{
  ip: AnonymousActionRateLimit;
  ipTarget: AnonymousActionRateLimit;
  subjectTarget: AnonymousActionRateLimit;
  target: AnonymousActionRateLimit;
}>;

export type AnonymousActionRateLimitInput = {
  action: string;
  target: { kind: string; id: string };
  /** Normalized internally; for example an email address or inquiry thread id. */
  subject?: string;
  ip: string;
  limits: AnonymousActionRateLimits;
  /** Test seam. Production callers should leave this unset. */
  now?: Date;
};

type Database = Awaited<ReturnType<typeof getDb>>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Scope = "ip" | "ip_target" | "subject_target" | "target";

const RETENTION_AFTER_WINDOW_MS = 24 * 60 * 60 * 1000;
const CLEANUP_BATCH_SIZE = 250;
const MAX_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_HITS = 10_000;

class LimitReached extends Error {}

function errorCode(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    if ("code" in current && typeof current.code === "string") return current.code;
    current = "cause" in current ? current.cause : null;
  }
  return null;
}

function normalizedKind(value: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_:-]{0,63}$/.test(normalized)) {
    throw new Error(`Invalid anonymous rate-limit ${label}`);
  }
  return normalized;
}

function normalizedDimension(value: string | undefined, label: string): string {
  const normalized = (value ?? "").normalize("NFKC").trim().toLowerCase();
  if (!normalized || normalized.length > 512) {
    throw new Error(`Invalid anonymous rate-limit ${label}`);
  }
  return normalized;
}

function checkedLimit(value: AnonymousActionRateLimit): AnonymousActionRateLimit {
  if (
    !Number.isInteger(value.max) ||
    value.max < 1 ||
    value.max > MAX_HITS ||
    !Number.isInteger(value.windowMs) ||
    value.windowMs < 1_000 ||
    value.windowMs > MAX_WINDOW_MS
  ) {
    throw new Error("Invalid anonymous rate-limit window");
  }
  return value;
}

function keyHash(parts: string[]): string {
  return createHmac("sha256", sessionSecretRaw())
    .update(["anonymous-action-rate-limit:v1", ...parts].join("\0"))
    .digest("hex");
}

async function pruneExpiredRows(db: Database, now: Date): Promise<void> {
  const expired = await db
    .select({ id: anonymousActionRateLimits.id })
    .from(anonymousActionRateLimits)
    .where(lte(anonymousActionRateLimits.expiresAt, now))
    .orderBy(anonymousActionRateLimits.expiresAt)
    .limit(CLEANUP_BATCH_SIZE);
  if (expired.length) {
    await db
      .delete(anonymousActionRateLimits)
      .where(inArray(anonymousActionRateLimits.id, expired.map((row) => row.id)));
  }
}

async function consumeScope(
  tx: Transaction,
  input: { action: string; targetKind: string; scope: Scope; hash: string },
  limit: AnonymousActionRateLimit,
  now: Date,
): Promise<void> {
  const resetBefore = new Date(now.getTime() - limit.windowMs);
  const expiresAt = new Date(now.getTime() + limit.windowMs + RETENTION_AFTER_WINDOW_MS);
  const reset = sql`${anonymousActionRateLimits.windowStartedAt} <= ${resetBefore}`;
  const consumed = await tx
    .insert(anonymousActionRateLimits)
    .values({
      action: input.action,
      targetKind: input.targetKind,
      scope: input.scope,
      keyHash: input.hash,
      windowStartedAt: now,
      hitCount: 1,
      expiresAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        anonymousActionRateLimits.action,
        anonymousActionRateLimits.targetKind,
        anonymousActionRateLimits.scope,
        anonymousActionRateLimits.keyHash,
      ],
      set: {
        hitCount: sql`case when ${reset} then 1 else ${anonymousActionRateLimits.hitCount} + 1 end`,
        windowStartedAt: sql`case when ${reset} then ${now} else ${anonymousActionRateLimits.windowStartedAt} end`,
        expiresAt: sql`case when ${reset} then ${expiresAt} else ${anonymousActionRateLimits.expiresAt} end`,
        updatedAt: now,
      },
      setWhere: sql`${reset} OR ${anonymousActionRateLimits.hitCount} < ${limit.max}`,
    })
    .returning({ id: anonymousActionRateLimits.id });
  if (!consumed.length) throw new LimitReached();
}

/**
 * Atomically consumes every configured dimension for one external-delivery
 * action, whether its subject is anonymous or an authenticated account.
 *
 * Each dimension is an upsert whose `count < max` predicate is evaluated while
 * PostgreSQL holds the conflicting row lock. All dimensions share one
 * serializable transaction, so a rejected request rolls back earlier counter
 * increments and concurrent requests cannot both step through the last slot.
 */
export async function takeAnonymousActionRateLimit(
  db: Database,
  rawInput: AnonymousActionRateLimitInput,
): Promise<boolean> {
  const action = normalizedKind(rawInput.action, "action");
  const targetKind = normalizedKind(rawInput.target.kind, "target kind");
  const targetId = normalizedDimension(rawInput.target.id, "target id");
  const ip = normalizedDimension(rawInput.ip, "IP address");
  const subject = rawInput.subject === undefined
    ? null
    : normalizedDimension(rawInput.subject, "subject");
  const now = rawInput.now ? new Date(rawInput.now) : new Date();
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid anonymous rate-limit time");

  const dimensions: Array<{
    scope: Scope;
    hash: string;
    limit: AnonymousActionRateLimit;
  }> = [];
  if (rawInput.limits.ip) {
    dimensions.push({
      scope: "ip",
      hash: keyHash([action, "ip", ip]),
      limit: checkedLimit(rawInput.limits.ip),
    });
  }
  if (rawInput.limits.ipTarget) {
    dimensions.push({
      scope: "ip_target",
      hash: keyHash([action, "ip_target", targetKind, targetId, ip]),
      limit: checkedLimit(rawInput.limits.ipTarget),
    });
  }
  if (rawInput.limits.subjectTarget) {
    if (!subject) throw new Error("Anonymous subject-target limit requires a subject");
    dimensions.push({
      scope: "subject_target",
      hash: keyHash([action, "subject_target", targetKind, targetId, subject]),
      limit: checkedLimit(rawInput.limits.subjectTarget),
    });
  }
  if (rawInput.limits.target) {
    dimensions.push({
      scope: "target",
      hash: keyHash([action, "target", targetKind, targetId]),
      limit: checkedLimit(rawInput.limits.target),
    });
  }
  if (!dimensions.length) throw new Error("Anonymous rate limit needs at least one dimension");

  // This is deliberately outside the counter transaction: a rejected action
  // rolls its counters back, but still gets to drain a bounded cleanup batch.
  await pruneExpiredRows(db, now);

  for (let attempt = 0; ; attempt++) {
    try {
      await db.transaction(
        async (tx) => {
          for (const dimension of dimensions) {
            await consumeScope(
              tx,
              { action, targetKind, scope: dimension.scope, hash: dimension.hash },
              dimension.limit,
              now,
            );
          }
        },
        { isolationLevel: "serializable" },
      );
      return true;
    } catch (error) {
      if (error instanceof LimitReached) return false;
      const retryable = errorCode(error) === "40001" || errorCode(error) === "40P01";
      if (!retryable || attempt >= 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
    }
  }
}
