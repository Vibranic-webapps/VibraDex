import { createHash, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'

// Hash both sides to a fixed 32 bytes, so timingSafeEqual never throws on a
// length mismatch and the comparison time doesn't leak the key's length.
function sha256(value: string): Buffer {
    return createHash('sha256').update(value).digest()
}

export function validateAdminKey(request: NextRequest): NextResponse | null {
    const adminKey = request.headers.get('x-admin-key')
    const expectedKey = process.env.ADMIN_API_KEY

    if (!expectedKey) {
        console.error('ADMIN_API_KEY not configured')
        return NextResponse.json(
            { error: 'Server configuration error' },
            { status: 500 }
        )
    }

    if (!adminKey) {
        return NextResponse.json(
            { error: 'Missing admin API key' },
            { status: 401 }
        )
    }

    if (!timingSafeEqual(sha256(adminKey), sha256(expectedKey))) {
        return NextResponse.json(
            { error: 'Invalid admin API key' },
            { status: 403 }
        )
    }

    return null
}
