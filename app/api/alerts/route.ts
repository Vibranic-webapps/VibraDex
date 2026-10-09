import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth/session'

export async function GET() {
    const guard = await requireSession()
    if (!guard.ok) return guard.response

    try {
        const alerts = await prisma.alert.findMany({
            include: {
                app: { select: { name: true } },
            },
            orderBy: { createdAt: 'desc' },
        })
        
        return NextResponse.json(alerts)
    } catch (error) {
        console.error('Alerts fetch error:', error)
        return NextResponse.json({ error: 'Failed to fetch alerts' }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    const guard = await requireSession()
    if (!guard.ok) return guard.response

    try {
        const body = await request.json()
        const { name, appId, condition, severity, keyword } = body

        if (!name || !condition || !severity) {
            return NextResponse.json(
                { error: 'Name, condition, and severity are required' },
                { status: 400 }
            )
        }

        if (condition === 'message_contains' && !keyword?.trim()) {
            return NextResponse.json(
                { error: 'A keyword is required for the "message contains" condition' },
                { status: 400 }
            )
        }

        const alert = await prisma.alert.create({
            data: {
                name,
                appId: appId || null,
                condition,
                severity,
                keyword: condition === 'message_contains' ? keyword.trim() : null,
            },
            include: {
                app: { select: { name: true } },
            },
        })
        
        return NextResponse.json(alert)
    } catch (error) {
        console.error('Alert creation error:', error)
        return NextResponse.json({ error: 'Failed to create alert' }, { status: 500 })
    }
}
