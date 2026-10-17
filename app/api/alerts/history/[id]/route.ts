import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth/session'

// PATCH /api/alerts/history/[id] — mark as resolved
export async function PATCH(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const guard = await requireSession()
    if (!guard.ok) return guard.response

    const { id } = await params

    try {
        await prisma.alertHistory.updateMany({
            where: { id },
            data: { resolved: true, resolvedAt: new Date() },
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Alert history resolve error:', error)
        return NextResponse.json({ error: 'Failed to resolve alert' }, { status: 500 })
    }
}
