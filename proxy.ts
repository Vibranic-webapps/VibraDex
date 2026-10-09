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
  if (!isKeyAuthenticated(request)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
