import { NextResponse } from 'next/server'
import { destroySession } from '@/lib/auth/session'

// POST /api/auth/logout -> 200 {ok:true}; deletes the session row, clears the cookie.
export async function POST() {
    await destroySession()
    return NextResponse.json({ ok: true })
}
