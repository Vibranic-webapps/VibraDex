import { NextRequest, NextResponse } from 'next/server'
import { getSession, CLEARED_COOKIE } from '@/lib/auth/session'
import { SESSION_COOKIE } from '@/lib/auth/constants'

// GET /api/auth/expired: where requirePageSession() sends a browser whose
// cookie is missing/stale. Clears the cookie and goes to /login (otherwise
// proxy.ts would bounce /login back to / forever). A still-valid session is
// left alone and sent home, so a cross-site link can't log Kilian out.
export async function GET(request: NextRequest) {
    const session = await getSession()
    const target = new URL(session ? '/' : '/login', request.url)
    const res = NextResponse.redirect(target)
    if (!session) res.cookies.set(SESSION_COOKIE, '', CLEARED_COOKIE)
    return res
}
