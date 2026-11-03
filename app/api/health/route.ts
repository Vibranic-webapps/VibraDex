import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkHealth } from '@/lib/health'

// Never cache: a cached "ok" would hide a dead database.
export const dynamic = 'force-dynamic'

// Public on purpose (proxy.ts lets GET /api through). See lib/health.ts.
export async function GET() {
    const { status, body } = await checkHealth(() => prisma.$queryRaw`SELECT 1`)
    return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}
