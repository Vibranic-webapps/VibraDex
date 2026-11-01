import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendPush } from '@/lib/push'
import { requireSession } from '@/lib/auth/session'

// Does an incoming event satisfy an alert's condition?
function alertMatches(
    alert: { condition: string; keyword: string | null },
    event: { type: string; severity: string; message: string },
): boolean {
    switch (alert.condition) {
        case 'high_severity':
        case 'app_down':
            return event.severity === 'high'
        case 'any_error':
            return event.type === 'error'
        case 'message_contains':
            return !!alert.keyword && event.message.toLowerCase().includes(alert.keyword.toLowerCase())
        default:
            return false
    }
}

// POST /api/diagnostics/events
export async function POST(request: NextRequest) {
    try {
        // Get API key from Authorization header
        const apiKey = request.headers.get('x-api-key')

        if (!apiKey) {
            return NextResponse.json(
                { error: 'Missing API key' },
                { status: 401 }
            )
        }

        // Verify API key and get app
        const app = await prisma.app.findUnique({
            where: { apiKey }
        })

        if (!app) {
            return NextResponse.json(
                { error: 'Invalid API key' },
                { status: 401 }
            )
        }

        // Parse request body
        const body = await request.json()
        const { type, severity, message, details, stackTrace } = body

        // Validate required fields
        if (!type || !severity || !message) {
            return NextResponse.json(
                { error: 'Missing required fields: type, severity, message' },
                { status: 400 }
            )
        }

        // Create diagnostic event
        const event = await prisma.diagnosticEvent.create({
            data: {
                appId: app.id,
                type,
                severity,
                message,
                details: details || null,
                stackTrace: stackTrace || null,
                userAgent: request.headers.get('user-agent') || null,
                ipAddress: request.headers.get('x-forwarded-for') ||
                    request.headers.get('x-real-ip') || null,
            }
        })
        
        // Record uptime status based on event severity
        const uptimeStatus = severity === 'high' ? 'down' : severity === 'medium' ? 'warning' : 'healthy'
        await prisma.uptimeRecord.create({
            data: {
                appId: app.id,
                status: uptimeStatus,
            }
        })
        
        // Evaluate every enabled alert (for this app or global) against the event.
        const alerts = await prisma.alert.findMany({
            where: {
                enabled: true,
                OR: [{ appId: app.id }, { appId: null }],
            },
        })

        for (const alert of alerts) {
            if (!alertMatches(alert, { type, severity, message })) continue

            await prisma.alertHistory.create({
                data: {
                    alertId: alert.id,
                    message: `${app.name}: ${message}`,
                },
            })

            await sendPush({
                title: `Alert: ${alert.name}`,
                body: `${app.name}: ${message}`,
                url: '/alerts',
                tag: alert.id,
            })
        }

        return NextResponse.json({
            success: true,
            eventId: event.id
        })

    } catch (error) {
        console.error('Error creating diagnostic event:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}

// GET /api/diagnostics/events?appId=xxx&limit=50
export async function GET(request: NextRequest) {
    const guard = await requireSession()
    if (!guard.ok) return guard.response

    try {
        const { searchParams } = new URL(request.url)
        const appId = searchParams.get('appId')
        const limit = parseInt(searchParams.get('limit') || '50')
        const type = searchParams.get('type')
        const severity = searchParams.get('severity')

        // Build query filters
        const where: any = {}
        if (appId) where.appId = appId
        if (type) where.type = type
        if (severity) where.severity = severity

        const events = await prisma.diagnosticEvent.findMany({
            where,
            orderBy: { timestamp: 'desc' },
            take: limit,
            include: {
                app: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            }
        })

        return NextResponse.json({ events })

    } catch (error) {
        console.error('Error fetching events:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
