import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'
import { requireSession } from '@/lib/auth/session'

export async function GET() {
    const guard = await requireSession()
    if (!guard.ok) return guard.response

    try {
        const apps = await prisma.app.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                _count: {
                    select: {
                        events: true,
                        metrics: true
                    }
                }
            }
        })

        return NextResponse.json({ apps })

    } catch (error) {
        console.error('Error fetching apps:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}

export async function POST(request: NextRequest) {
    const guard = await requireSession()
    if (!guard.ok) return guard.response

    try {
        const body = await request.json()
        const { name, description, externalUrl, iconUrl } = body

        if (!name || !externalUrl) {
            return NextResponse.json(
                { error: 'Missing required fields: name, externalUrl' },
                { status: 400 }
            )
        }

        const apiKey = `vib_${randomUUID().replace(/-/g, '')}`
        
        const app = await prisma.app.create({
            data: {
                name,
                description: description || null,
                externalUrl,
                iconUrl: iconUrl || null,
                apiKey,
            }
        })

        return NextResponse.json({
            success: true,
            app
        }, { status: 201 })

    } catch (error) {
        console.error('Error creating app:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
