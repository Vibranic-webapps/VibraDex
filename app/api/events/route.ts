import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth/session'

export async function GET(request: NextRequest) {
    const guard = await requireSession()
    if (!guard.ok) return guard.response

    const searchParams = request.nextUrl.searchParams
    const timeRange = searchParams.get('timeRange') || '24h'
    const appId = searchParams.get('appId')
    const severity = searchParams.get('severity')
    
    const now = new Date()
    let startDate: Date
    
    switch (timeRange) {
        case '1h':
            startDate = new Date(now.getTime() - 60 * 60 * 1000)
            break
        case '24h':
            startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
            break
        case '7d':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
            break
        case '30d':
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
            break
        default:
            startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    }
    
    try {
        const [events, apps] = await Promise.all([
            prisma.diagnosticEvent.findMany({
                where: {
                    timestamp: { gte: startDate },
                    ...(appId && { appId }),
                    ...(severity && { severity }),
                },
                orderBy: { timestamp: 'desc' },
                take: 500,
                include: {
                    app: { select: { id: true, name: true } },
                },
            }),
            prisma.app.findMany({
                select: { id: true, name: true },
                orderBy: { name: 'asc' },
            }),
        ])
        
        return NextResponse.json({ events, apps })
    } catch (error) {
        console.error('Events fetch error:', error)
        return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 })
    }
}
