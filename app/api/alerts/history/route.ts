import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth/session'

// GET /api/alerts/history?since=<ISO date>
export async function GET(request: NextRequest) {
    const guard = await requireSession()
    if (!guard.ok) return guard.response

    try {
        const { searchParams } = new URL(request.url)
        const since = searchParams.get('since')

        const history = await prisma.alertHistory.findMany({
            where: since ? { triggeredAt: { gt: new Date(since) } } : undefined,
            orderBy: { triggeredAt: 'desc' },
            take: 50,
            include: {
                alert: {
                    select: {
                        name: true,
                        condition: true,
                        app: { select: { name: true } },
                    },
                },
            },
        })

        return NextResponse.json(history)
    } catch (error) {
        console.error('Alert history fetch error:', error)
        return NextResponse.json({ error: 'Failed to fetch alert history' }, { status: 500 })
    }
}
