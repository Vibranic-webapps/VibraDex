import 'server-only'
import crypto from 'node:crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { SESSION_COOKIE, SESSION_TTL_MS } from './constants'

export type SessionInfo = {
    sessionId: string
    userId: string
    email: string
    name: string | null
}

/**
 * Hash a raw token before it touches the database. Plain SHA-256 is enough:
 * the token is already 32 random bytes, so it doesn't need the slow, salted
 * hashing that human passwords do. A DB leak never yields a usable cookie.
 */
export function hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex')
}

const cookieBase = {
    httpOnly: true, // JS can't read it, so XSS can't steal it
    secure: process.env.NODE_ENV === 'production', // https-only in prod
    sameSite: 'lax' as const,
    path: '/',
}

/** Options that make the browser drop the cookie (same path as when set). */
export const CLEARED_COOKIE = { ...cookieBase, maxAge: 0 }

/**
 * Create a session: random token in an httpOnly cookie, only its hash in the
 * Session row. Fixed 30-day expiry (VibraFlow pattern). Route Handlers only.
 */
export async function createSession(userId: string): Promise<void> {
    const rawToken = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS)

    await prisma.session.create({
        data: { hashedToken: hashToken(rawToken), userId, expiresAt },
    })

    const cookieStore = await cookies()
    cookieStore.set(SESSION_COOKIE, rawToken, { ...cookieBase, expires: expiresAt })
}

/**
 * The current session (real DB check), or null. Safe in Route Handlers AND
 * Server Components: it only reads the cookie.
 */
export async function getSession(): Promise<SessionInfo | null> {
    const cookieStore = await cookies()
    const rawToken = cookieStore.get(SESSION_COOKIE)?.value
    if (!rawToken) return null

    const session = await prisma.session.findUnique({
        where: { hashedToken: hashToken(rawToken) },
        include: { user: { select: { email: true, name: true } } },
    })
    if (!session) return null

    // Expired: clean up the row and treat as logged out.
    if (session.expiresAt <= new Date()) {
        await prisma.session.delete({ where: { id: session.id } }).catch(() => {})
        return null
    }

    return {
        sessionId: session.id,
        userId: session.userId,
        email: session.user.email,
        name: session.user.name,
    }
}

/** 401 JSON. Also drops a stale cookie, so proxy.ts stops treating the
 *  browser as logged in and /login becomes reachable again. */
export function unauthorized(): NextResponse {
    const res = NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    res.cookies.set(SESSION_COOKIE, '', CLEARED_COOKIE)
    return res
}

/**
 * Guard for Route Handlers:
 *   const auth = await requireSession()
 *   if (!auth.ok) return auth.response
 */
export async function requireSession(): Promise<
    { ok: true; session: SessionInfo } | { ok: false; response: NextResponse }
> {
    const session = await getSession()
    if (!session) return { ok: false, response: unauthorized() }
    return { ok: true, session }
}

/**
 * Guard for Server Components that read data directly. A Server Component
 * can't clear cookies, so a missing/stale session goes through
 * /api/auth/expired, which clears the cookie and lands on /login.
 */
export async function requirePageSession(): Promise<SessionInfo> {
    const session = await getSession()
    if (!session) redirect('/api/auth/expired')
    return session
}

/** Destroy the current session: delete its row and clear the cookie. Route Handlers only. */
export async function destroySession(): Promise<void> {
    const cookieStore = await cookies()
    const rawToken = cookieStore.get(SESSION_COOKIE)?.value

    if (rawToken) {
        await prisma.session
            .deleteMany({ where: { hashedToken: hashToken(rawToken) } })
            .catch(() => {})
    }

    cookieStore.set(SESSION_COOKIE, '', CLEARED_COOKIE)
}
