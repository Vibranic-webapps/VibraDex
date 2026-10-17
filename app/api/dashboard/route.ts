import { NextRequest, NextResponse } from 'next/server'
import { getDashboardStats, getRecentEvents, getEventsOverTime, getAppsWithStatus } from '@/lib/db/queries'
import { requireSession } from '@/lib/auth/session'

export async function GET(request: NextRequest) {
    const guard = await requireSession()
    if (!guard.ok) return guard.response

    const searchParams = request.nextUrl.searchParams
    const timeRange = searchParams.get('timeRange') || '24h'
    
    let hours: number
    switch (timeRange) {
        case '1h':
            hours = 1
            break
        case '24h':
            hours = 24
            break
        case '7d':
            hours = 168
            break
        case '30d':
            hours = 720
            break
        default:
            hours = 24
    }
    
    try {
        const [stats, recentEvents, eventsOverTime, apps] = await Promise.all([
            getDashboardStats(),
            getRecentEvents(5),
            getEventsOverTime(hours),
            getAppsWithStatus()
        ])
        
        const appsForCards = apps.map(app => ({
            id: app.id,
            name: app.name,
            description: app.description || undefined,
            externalUrl: app.externalUrl,
            iconUrl: app.iconUrl || undefined,
            diagnostics: {
                status: app.status as "healthy" | "warning" | "down",
                metrics: [
                    { key: "events", label: "Events", value: app.eventCount },
                    { key: "metrics", label: "Metrics", value: app.metricCount }
                ]
            }
        }))
        
        return NextResponse.json({
            stats,
            recentEvents,
            eventsOverTime,
            apps: appsForCards,
        })
    } catch (error) {
        console.error('Dashboard fetch error:', error)
        return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 })
    }
}
