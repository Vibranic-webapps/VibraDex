import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'
import { requireSession } from '@/lib/auth/session'

type Props = {
    params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: Props) {
    const guard = await requireSession()
    if (!guard.ok) return guard.response

    try {
        const { id } = await params

        const app = await prisma.app.findUnique({
            where: { id }
        })

        if (!app) {
            return NextResponse.json(
                { error: 'App not found' },
                { status: 404 }
            )
        }

        const newApiKey = `vib_${randomUUID().replace(/-/g, '')}`

        const updatedApp = await prisma.app.update({
            where: { id },
            data: { apiKey: newApiKey }
        })

        return NextResponse.json({
            success: true,
            apiKey: updatedApp.apiKey
        })

    } catch (error) {
        console.error('Error regenerating API key:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
