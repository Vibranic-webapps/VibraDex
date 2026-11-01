// Shared, dependency-free auth constants.
// Safe to import from proxy.ts (no Prisma / node:crypto here).

// Name of the cookie that carries the raw session token.
export const SESSION_COOKIE = 'vibradex_session'

// How long a login lasts (fixed, not sliding, same as VibraFlow).
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30

// Password rules for the single admin account (enforced in scripts/create-admin.ts).
export const MIN_PASSWORD_LENGTH = 12
// bcrypt only looks at the first 72 bytes; longer passwords are refused.
export const PASSWORD_MAX_BYTES = 72
export const EMAIL_MAX = 254
