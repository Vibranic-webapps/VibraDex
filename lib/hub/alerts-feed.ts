import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Read-only alerts feed for the Pi "Hub logger" (nova-hub).
 *
 * The Pi holds one secret (HUB_READ_KEY) that can do exactly one thing: list
 * recent fired alerts. It cannot read events, apps, API keys or settings and
 * cannot write anything. Pure functions live here so they can be unit-tested
 * without a database; the route file only wires them to Prisma.
 */

export const MIN_KEY_LENGTH = 32
export const MAX_ITEMS = 100
export const DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000
export const MAX_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000
export const MAX_MESSAGE_CHARS = 200

/** The configured key, or null when it is unset or too short to be safe (the route then pretends not to exist). */
export function configuredHubKey(env: Record<string, string | undefined> = process.env): string | null {
    const key = env.HUB_READ_KEY?.trim()
    return key && key.length >= MIN_KEY_LENGTH ? key : null
}

function sha256(value: string): Buffer {
    return createHash('sha256').update(value).digest()
}

/** `Authorization: Bearer <key>`, compared in constant time (both sides hashed to 32 bytes first, like lib/admin-auth.ts). */
export function bearerMatches(header: string | null, expectedKey: string): boolean {
    const match = /^Bearer (\S+)$/.exec(header ?? '')
    if (!match) return false
    return timingSafeEqual(sha256(match[1]), sha256(expectedKey))
}

export type SinceResult = { ok: true; since: Date } | { ok: false }

/**
 * `since` is an ISO-8601 timestamp. Missing = the last 24 hours. Anything further back than 7 days is
 * clamped to 7 days. Not a valid date = rejected (the route answers 400).
 */
export function parseSince(raw: string | null, now: Date = new Date()): SinceResult {
    const floor = new Date(now.getTime() - MAX_LOOKBACK_MS)
    if (raw === null || raw === '') return { ok: true, since: new Date(now.getTime() - DEFAULT_LOOKBACK_MS) }
    // Strict-ish ISO shape first: Date.parse alone accepts things like "1" or "March 7".
    if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(raw)) return { ok: false }
    const parsed = new Date(raw)
    if (Number.isNaN(parsed.getTime())) return { ok: false }
    return { ok: true, since: parsed < floor ? floor : parsed }
}

export interface HubAlertRow {
    id: string
    triggeredAt: Date
    message: string
    alert: { name: string; severity: string; app: { name: string } | null }
}

export interface HubAlertItem {
    id: string
    firedAt: string
    app: string | null
    rule: string
    severity: string
    message: string
}

// Control characters: keep the message to one clean line.
const CONTROL = /[\u0000-\u001F\u007F-\u009F]+/g

function shorten(text: string): string {
    const flat = text.replace(CONTROL, ' ').replace(/ {2,}/g, ' ').trim()
    const chars = [...flat]
    return chars.length <= MAX_MESSAGE_CHARS ? flat : `${chars.slice(0, MAX_MESSAGE_CHARS - 1).join('').trimEnd()}…`
}

/** Only these fields leave the building: no user data, no condition internals, no keys. */
export function toHubItem(row: HubAlertRow): HubAlertItem {
    return {
        id: row.id,
        firedAt: row.triggeredAt.toISOString(),
        app: row.alert.app?.name ?? null,
        rule: row.alert.name,
        severity: row.alert.severity,
        message: shorten(row.message),
    }
}

/**
 * The query returns the NEWEST rows (descending, one extra row to detect overflow). This turns them into the
 * response: at most MAX_ITEMS, oldest first. When more than MAX_ITEMS fired, the oldest ones are dropped and
 * `truncated` says so.
 */
export function buildFeed(rowsNewestFirst: HubAlertRow[], now: Date = new Date()) {
    const truncated = rowsNewestFirst.length > MAX_ITEMS
    const kept = rowsNewestFirst.slice(0, MAX_ITEMS).reverse()
    return { items: kept.map(toHubItem), truncated, now: now.toISOString() }
}
