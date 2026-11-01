import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth/session'

// GET /api/auth/me -> 200 {email, name} | 401 (also clears a stale cookie)
export async function GET() {
    const auth = await requireSession()
    if (!auth.ok) return auth.response
    return NextResponse.json({ email: auth.session.email, name: auth.session.name })
}
