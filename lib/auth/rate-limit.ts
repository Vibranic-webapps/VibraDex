import 'server-only'
import { createHash } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * Rate limiting, stored in Postgres (the RateLimit table). Ported from Vibrafit.
 *
 * Why the database: Vercel runs many short-lived serverless instances with no
 * shared memory, so an in-memory counter would reset on every cold start.
 * Postgres is the one thing every instance shares.
 *
 * Model: fixed window per key. The first hit opens a window; hits inside it
 * count up; the first hit after it expires starts a new window at 1.
 * All limits live here, so they can be tuned in one place.
 */
export interface Limit {
    bucket: string
    max: number
    windowMs: number
}

const MINUTE = 60_000

export const LIMITS = {
    // Failed logins for one email, from ANY IP. Every attempt is counted up
    // front and a success clears it, so effectively only failures add up.
    // Single-admin hub: this is a global brute-force cap on Kilian's account.
    loginFailEmail: { bucket: 'login-fail-email', max: 5, windowMs: 15 * MINUTE },
    // Login attempts from one IP across all emails. A success refunds only its
    // own hit (one valid login must not reset an attacker's budget).
    loginFailIp: { bucket: 'login-fail-ip', max: 20, windowMs: 15 * MINUTE },
} satisfies Record<string, Limit>

// Rows are swept once they're this old. Must exceed the longest window.
const SWEEP_AFTER_MS = 24 * 60 * MINUTE
const SWEEP_PROBABILITY = 0.02

/** The client IP. On Vercel, x-forwarded-for is set by Vercel's edge (a
 *  client-sent value is overwritten), so its first entry is the real client. */
export function clientIp(request: NextRequest): string {
    const xff = request.headers.get('x-forwarded-for')
    return xff?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
}

/** DB key: bucket in clear, the identity (email / IP) only as a SHA-256 hash. */
function keyFor(limit: Limit, parts: string[]): string {
    const digest = createHash('sha256').update(parts.join('\n')).digest('hex')
    return `${limit.bucket}:${digest}`
}

/**
 * Count one hit atomically (single INSERT ... ON CONFLICT DO UPDATE, judged
 * by the database clock) and say whether it is still within the limit.
 *
 * Password checks must CONSUME FIRST, then verify, then clear/refund on
 * success. "Check, verify, record" lets a parallel burst through, because
 * bcrypt takes ~250 ms and every request passes the check before the first
 * failure is written. Consuming first also means a locked-out client gets 429
 * even with the right password, so 429-vs-200 is no password oracle.
 */
export async function consumeRateLimit(
    limit: Limit,
    parts: string[],
): Promise<{ allowed: boolean; retryAfterSec: number }> {
    const key = keyFor(limit, parts)
    const windowSecs = limit.windowMs / 1000

    const rows = await prisma.$queryRaw<{ count: number; windowStart: Date }[]>`
        INSERT INTO "RateLimit" ("key", "count", "windowStart")
        VALUES (${key}, 1, (now() AT TIME ZONE 'UTC'))
        ON CONFLICT ("key") DO UPDATE SET
          "count" = CASE
            WHEN "RateLimit"."windowStart" <= (now() AT TIME ZONE 'UTC') - make_interval(secs => ${windowSecs})
            THEN 1 ELSE "RateLimit"."count" + 1 END,
          "windowStart" = CASE
            WHEN "RateLimit"."windowStart" <= (now() AT TIME ZONE 'UTC') - make_interval(secs => ${windowSecs})
            THEN (now() AT TIME ZONE 'UTC') ELSE "RateLimit"."windowStart" END
        RETURNING "count", "windowStart"`

    // Opportunistic cleanup instead of a cron.
    if (Math.random() < SWEEP_PROBABILITY) {
        await prisma.rateLimit
            .deleteMany({ where: { windowStart: { lt: new Date(Date.now() - SWEEP_AFTER_MS) } } })
            .catch(() => {})
    }

    const { count, windowStart } = rows[0]!
    const retryAfterSec = Math.max(
        1,
        Math.ceil((new Date(windowStart).getTime() + limit.windowMs - Date.now()) / 1000),
    )
    return { allowed: count <= limit.max, retryAfterSec }
}

/** Give back one hit (success on a counter that must not be fully cleared). */
export async function refundRateLimit(limit: Limit, parts: string[]): Promise<void> {
    await prisma.rateLimit.updateMany({
        where: { key: keyFor(limit, parts), count: { gt: 0 } },
        data: { count: { decrement: 1 } },
    })
}

/** Forget a key, e.g. after a successful login. */
export async function clearRateLimit(limit: Limit, parts: string[]): Promise<void> {
    await prisma.rateLimit.deleteMany({ where: { key: keyFor(limit, parts) } })
}
