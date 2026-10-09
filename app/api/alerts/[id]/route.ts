import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth/session'

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const guard = await requireSession()
    if (!guard.ok) return guard.response

    const { id } = await params
    
    try {
        const body = await request.json()
        
        const alert = await prisma.alert.update({
            where: { id },
            data: body,
            include: {
                app: { select: { name: true } },
            },
        })
        
        return NextResponse.json(alert)
    } catch (error) {
        console.error('Alert update error:', error)
        return NextResponse.json({ error: 'Failed to update alert' }, { status: 500 })
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const guard = await requireSession()
    if (!guard.ok) return guard.response

    const { id } = await params
    
    try {
        await prisma.alert.delete({
            where: { id },
        })
        
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Alert deletion error:', error)
        return NextResponse.json({ error: 'Failed to delete alert' }, { status: 500 })
    }
}
