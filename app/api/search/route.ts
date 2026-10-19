import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth/session'

export async function GET(request: NextRequest) {
    const guard = await requireSession()
    if (!guard.ok) return guard.response

    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('q')?.toLowerCase() || ''
    
    if (query.length < 2) {
        return NextResponse.json({ results: [] })
    }
    
    try {
        const [apps, events] = await Promise.all([
            prisma.app.findMany({
                where: {
                    OR: [
                        { name: { contains: query, mode: 'insensitive' } },
                        { description: { contains: query, mode: 'insensitive' } },
                    ],
                },
                take: 5,
                select: {
                    id: true,
                    name: true,
                    description: true,
                },
            }),
            prisma.diagnosticEvent.findMany({
                where: {
                    OR: [
                        { message: { contains: query, mode: 'insensitive' } },
                        { type: { contains: query, mode: 'insensitive' } },
                    ],
                },
                take: 5,
                orderBy: { timestamp: 'desc' },
                select: {
                    id: true,
                    message: true,
                    severity: true,
                    type: true,
                    app: {
                        select: { name: true },
                    },
                },
            }),
        ])
        
        const results = [
            ...apps.map((app) => ({
                type: 'app' as const,
                id: app.id,
                title: app.name,
                subtitle: app.description || 'Application',
            })),
            ...events.map((event) => ({
                type: 'event' as const,
                id: event.id,
                title: event.message,
                subtitle: `${event.severity} - ${event.app.name}${event.type ? ` - ${event.type}` : ''}`,
            })),
        ]
        
        return NextResponse.json({ results })
    } catch (error) {
        console.error('Search error:', error)
        return NextResponse.json({ results: [] })
    }
}
