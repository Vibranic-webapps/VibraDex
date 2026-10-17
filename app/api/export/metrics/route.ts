import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth/session'

export async function GET(request: NextRequest) {
    const guard = await requireSession()
    if (!guard.ok) return guard.response

    const searchParams = request.nextUrl.searchParams
    const appId = searchParams.get('appId')
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
        const metrics = await prisma.metricSnapshot.findMany({
            where: {
                ...(appId && { appId }),
                timestamp: { gte: startDate },
            },
            orderBy: { timestamp: 'desc' },
            include: {
                app: { select: { name: true } },
            },
        })
        
        const csvHeader = 'Timestamp,App,Metric,Value,Unit\n'
        const csvRows = metrics.map(metric => {
            const timestamp = metric.timestamp.toISOString()
            const appName = metric.app.name.replace(/,/g, ';')
            const metricKey = metric.metricKey.replace(/,/g, ';')
            const value = metric.value
            const unit = metric.unit || ''
            return `${timestamp},${appName},${metricKey},${value},${unit}`
        }).join('\n')
        
        const csv = csvHeader + csvRows
        
        return new NextResponse(csv, {
            headers: {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="metrics-${timeRange}.csv"`,
            },
        })
    } catch (error) {
        console.error('Export error:', error)
        return NextResponse.json({ error: 'Export failed' }, { status: 500 })
    }
}
