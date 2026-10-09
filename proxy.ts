import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

// Routes other apps / scripts call machine-to-machine. They have no Clerk
// session and authenticate themselves with an app API key or the admin key
// inside the route handler, so the login gate must let them through.
const isKeyAuthenticated = createRouteMatcher([
  '/api/diagnostics/(.*)',
  '/api/apps',
  '/api/apps/(.*)',
])

// Everything else (dashboard pages AND their /api/* data routes, incl.
// /api/admin/*) is Kilian-only: no session -> sign-in redirect for pages,
// 404 for API calls.
export default clerkMiddleware(async (auth, request) => {
  // /api/diagnostics/* only checks the app key on POST; its GET handlers read
  // every app's events/metrics with no key at all, so reads stay Kilian-only.
  const isDiagnosticsRead =
    request.nextUrl.pathname.startsWith('/api/diagnostics/') && request.method !== 'POST'
  if (!isKeyAuthenticated(request) || isDiagnosticsRead) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
