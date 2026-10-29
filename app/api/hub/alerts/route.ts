import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
    MAX_ITEMS,
    bearerMatches,
    buildFeed,
    configuredHubKey,
    parseSince,
} from '@/lib/hub/alerts-feed'

// Never cache: the answer depends on the clock and on the database.
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

/**
 * GET /api/hub/alerts?since=<ISO>
 *
 * Read-only feed for the Pi Hub logger. Authenticates with `Authorization: Bearer <HUB_READ_KEY>`
 * (not the browser session, not the admin key). GET only: there is deliberately no POST/PUT/PATCH/DELETE export.
 * Fails closed: with HUB_READ_KEY unset (or shorter than 32 characters) the route answers 404 as if it did not exist.
 */
export async function GET(request: NextRequest) {
    const key = configuredHubKey()
    if (!key) return new NextResponse(null, { status: 404, headers: NO_STORE })

    if (!bearerMatches(request.headers.get('authorization'), key)) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE })
    }

    const since = parseSince(request.nextUrl.searchParams.get('since'))
    if (!since.ok) {
        return NextResponse.json(
            { error: 'invalid_since', hint: 'Use an ISO-8601 timestamp, e.g. 2026-10-29T08:00:00Z' },
            { status: 400, headers: NO_STORE },
        )
    }

    try {
        const rows = await prisma.alertHistory.findMany({
            where: { triggeredAt: { gt: since.since } },
            orderBy: { triggeredAt: 'desc' },
            take: MAX_ITEMS + 1, // one extra to know whether the list was cut
            select: {
                id: true,
                triggeredAt: true,
                message: true,
                alert: { select: { name: true, severity: true, app: { select: { name: true } } } },
            },
        })
        return NextResponse.json(buildFeed(rows), { headers: NO_STORE })
    } catch (error) {
        console.error('Hub alerts feed error:', error instanceof Error ? error.message : 'unknown')
        return NextResponse.json({ error: 'server_error' }, { status: 500, headers: NO_STORE })
    }
}
