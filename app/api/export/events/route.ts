import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth/session'

export async function GET(request: NextRequest) {
    const guard = await requireSession()
    if (!guard.ok) return guard.response

    const searchParams = request.nextUrl.searchParams
    const appId = searchParams.get('appId')
    const severity = searchParams.get('severity')
    const timeRange = searchParams.get('timeRange') || '7d'
    
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
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    }
    
    try {
        const events = await prisma.diagnosticEvent.findMany({
            where: {
                ...(appId && { appId }),
                ...(severity && { severity }),
                timestamp: { gte: startDate },
            },
            orderBy: { timestamp: 'desc' },
            include: {
                app: { select: { name: true } },
            },
        })
        
        const csvHeader = 'Timestamp,App,Severity,Type,Message\n'
        const csvRows = events.map(event => {
            const timestamp = event.timestamp.toISOString()
            const appName = event.app.name.replace(/,/g, ';')
            const severity = event.severity
            const type = event.type.replace(/,/g, ';')
            const message = event.message.replace(/,/g, ';').replace(/\n/g, ' ')
            return `${timestamp},${appName},${severity},${type},"${message}"`
        }).join('\n')
        
        const csv = csvHeader + csvRows
        
        return new NextResponse(csv, {
            headers: {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="events-${timeRange}.csv"`,
            },
        })
    } catch (error) {
        console.error('Export error:', error)
        return NextResponse.json({ error: 'Export failed' }, { status: 500 })
    }
}
