import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth/session'

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ appId: string }> }
) {
    const guard = await requireSession()
    if (!guard.ok) return guard.response

    const { appId } = await params
    const searchParams = request.nextUrl.searchParams
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
        const records = await prisma.uptimeRecord.findMany({
            where: {
                appId,
                checkedAt: { gte: startDate },
            },
            orderBy: { checkedAt: 'asc' },
        })
        
        const totalRecords = records.length
        const healthyRecords = records.filter(r => r.status === 'healthy').length
        const uptimePercentage = totalRecords > 0 ? (healthyRecords / totalRecords) * 100 : 100
        
        const hourlyStatus: { hour: string; status: string }[] = []
        const hours = timeRange === '1h' ? 1 : timeRange === '24h' ? 24 : timeRange === '7d' ? 168 : 720
        
        for (let i = hours - 1; i >= 0; i--) {
            const hourStart = new Date(now.getTime() - (i + 1) * 60 * 60 * 1000)
            const hourEnd = new Date(now.getTime() - i * 60 * 60 * 1000)
            
            const hourRecords = records.filter(r => 
                r.checkedAt >= hourStart && r.checkedAt < hourEnd
            )
            
            let status = 'unknown'
            if (hourRecords.length > 0) {
                const hasDown = hourRecords.some(r => r.status === 'down')
                const hasWarning = hourRecords.some(r => r.status === 'warning')
                status = hasDown ? 'down' : hasWarning ? 'warning' : 'healthy'
            }
            
            hourlyStatus.push({
                hour: hourStart.toISOString(),
                status,
            })
        }
        
        return NextResponse.json({
            uptimePercentage: uptimePercentage.toFixed(2),
            totalChecks: totalRecords,
            healthyChecks: healthyRecords,
            hourlyStatus: hourlyStatus.slice(-24),
        })
    } catch (error) {
        console.error('Uptime fetch error:', error)
        return NextResponse.json({ error: 'Failed to fetch uptime' }, { status: 500 })
    }
}
