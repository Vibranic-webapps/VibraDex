import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE } from '@/lib/auth/constants'

// Pages that must stay reachable when logged out.
const PUBLIC_PAGES = ['/login']

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

// Routes other apps / scripts call server-to-server (no browser, so no Origin
// header). They authenticate with an app key (x-api-key) or the admin key
// (x-admin-key) inside the handler, so they skip the Origin check.
function isKeyAuthenticatedWrite(pathname: string, method: string): boolean {
    if (pathname === '/api/apps' || pathname.startsWith('/api/apps/')) return true
    return method === 'POST'
        && (pathname === '/api/diagnostics/events' || pathname === '/api/diagnostics/metrics')
}

/**
 * CSRF guard: every browser write to /api/* must come from this app's own
 * pages. SameSite=Lax treats every *.kilianfrederix.net app as the SAME site,
 * so a bug on a sibling subdomain could still POST with Kilian's cookie; and
 * a form on any site could otherwise log a browser in (login CSRF).
 * Browsers always send Origin on POST/PATCH/DELETE.
 */
function hasValidOrigin(request: NextRequest): boolean {
    const origin = request.headers.get('origin')
    let originHost = ''
    try {
        originHost = origin ? new URL(origin).host : ''
    } catch {
        // Malformed Origin (or the literal "null" from sandboxed frames): refuse.
    }
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
    return Boolean(originHost) && originHost === host
}

export default function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl

    // API: the handlers enforce the session themselves (requireSession, real
    // DB check, 401 JSON); the proxy only adds the Origin check on writes.
    if (pathname.startsWith('/api')) {
        if (
            !SAFE_METHODS.has(request.method)
            && !isKeyAuthenticatedWrite(pathname, request.method)
            && !hasValidOrigin(request)
        ) {
            return NextResponse.json({ error: 'invalid_origin' }, { status: 403 })
        }
        return NextResponse.next()
    }

    // Pages: cookie-presence check only (cheap, no DB here). A forged/stale
    // cookie gets past this, but every API call 401s and pages that read the
    // DB directly call requirePageSession().
    const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value)
    const isPublicPage = PUBLIC_PAGES.some((p) => pathname === p || pathname.startsWith(p + '/'))

    if (!hasSession && !isPublicPage) {
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        url.search = ''
        return NextResponse.redirect(url)
    }

    if (hasSession && isPublicPage) {
        const url = request.nextUrl.clone()
        url.pathname = '/'
        url.search = ''
        return NextResponse.redirect(url)
    }

    return NextResponse.next()
}

export const config = {
    matcher: [
        '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
        '/(api|trpc)(.*)',
    ],
}
