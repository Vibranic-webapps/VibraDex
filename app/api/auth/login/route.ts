import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { EMAIL_MAX, PASSWORD_MAX_BYTES } from '@/lib/auth/constants'
import { normalizeEmail, verifyAgainstDummy, verifyPassword } from '@/lib/auth/password'
import { createSession } from '@/lib/auth/session'
import {
    clearRateLimit, clientIp, consumeRateLimit, LIMITS, refundRateLimit,
} from '@/lib/auth/rate-limit'

// POST /api/auth/login {email, password}
// 200 {email} + cookie | 400 invalid_input | 401 invalid_credentials | 429 too_many_attempts
export async function POST(request: NextRequest) {
    let body: unknown
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
    }
    const { email, password } = (body ?? {}) as Record<string, unknown>
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
        return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
    }

    try {
        const normalizedEmail = normalizeEmail(email)
        const ip = clientIp(request)

        // Counted BEFORE the password is checked (see rate-limit.ts). IP first,
        // so a blocked IP stops burning the account's budget.
        const ipHit = await consumeRateLimit(LIMITS.loginFailIp, [ip])
        const emailHit = ipHit.allowed
            ? await consumeRateLimit(LIMITS.loginFailEmail, [normalizedEmail])
            : null
        if (!ipHit.allowed || !emailHit?.allowed) {
            const retryAfter = ipHit.allowed ? emailHit!.retryAfterSec : ipHit.retryAfterSec
            return NextResponse.json(
                { error: 'too_many_attempts' },
                { status: 429, headers: { 'Retry-After': String(retryAfter) } },
            )
        }

        // Oversized input can't match the stored account; skip the lookup but
        // still count it as a failure.
        const plausible = normalizedEmail.length <= EMAIL_MAX
            && Buffer.byteLength(password, 'utf8') <= PASSWORD_MAX_BYTES
        const user = plausible
            ? await prisma.user.findUnique({ where: { email: normalizedEmail } })
            : null

        // Unknown email still costs one bcrypt compare and gets the same error:
        // never reveal which email is the admin, by message or by timing.
        const passwordOk = user
            ? await verifyPassword(password, user.passwordHash)
            : await verifyAgainstDummy(password)
        if (!user || !passwordOk) {
            return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 })
        }

        await clearRateLimit(LIMITS.loginFailEmail, [normalizedEmail])
        await refundRateLimit(LIMITS.loginFailIp, [ip])
        await createSession(user.id)

        return NextResponse.json({ email: user.email })
    } catch (error) {
        console.error('Login error:', error)
        return NextResponse.json({ error: 'server_error' }, { status: 500 })
    }
}
