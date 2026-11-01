import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth/session'

// POST /api/diagnostics/metrics
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

        // Parse request body - can be single metric or array
        const body = await request.json()
        const metrics = Array.isArray(body) ? body : [body]

        // Validate all metrics first
        for (const metric of metrics) {
            if (!metric.metricKey || metric.value === undefined) {
                return NextResponse.json(
                    { error: 'Missing required fields: metricKey, value' },
                    { status: 400 }
                )
            }
        }

        // Create all metrics
        const createdMetrics = await Promise.all(
            metrics.map(async (metric) => {
                const { metricKey, value, unit } = metric

                return prisma.metricSnapshot.create({
                    data: {
                        appId: app.id,
                        metricKey,
                        value: parseFloat(value),
                        unit: unit || null,
                    }
                })
            })
        )

        return NextResponse.json({
            success: true,
            count: createdMetrics.length
        })

    } catch (error) {
        console.error('Error creating metrics:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}

// GET /api/diagnostics/metrics?appId=xxx&metricKey=xxx&hours=24
export async function GET(request: NextRequest) {
    const guard = await requireSession()
    if (!guard.ok) return guard.response

    try {
        const { searchParams } = new URL(request.url)
        const appId = searchParams.get('appId')
        const metricKey = searchParams.get('metricKey')
        const hours = parseInt(searchParams.get('hours') || '24')

        if (!appId) {
            return NextResponse.json(
                { error: 'appId is required' },
                { status: 400 }
            )
        }

        // Calculate time range
        const since = new Date(Date.now() - hours * 60 * 60 * 1000)

        // Build query
        const where: any = {
            appId,
            timestamp: { gte: since }
        }
        if (metricKey) where.metricKey = metricKey

        const metrics = await prisma.metricSnapshot.findMany({
            where,
            orderBy: { timestamp: 'asc' }
        })

        // Group by metric key for easier consumption
        const grouped = metrics.reduce((acc, metric) => {
            if (!acc[metric.metricKey]) {
                acc[metric.metricKey] = []
            }
            acc[metric.metricKey].push({
                value: metric.value,
                unit: metric.unit,
                timestamp: metric.timestamp
            })
            return acc
        }, {} as Record<string, any[]>)

        return NextResponse.json({ metrics: grouped })

    } catch (error) {
        console.error('Error fetching metrics:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
