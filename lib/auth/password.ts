import bcrypt from 'bcryptjs'
import { MIN_PASSWORD_LENGTH, PASSWORD_MAX_BYTES } from './constants'

// Cost factor: how many rounds bcrypt runs. 12 = ~250 ms per check.
const SALT_ROUNDS = 12

/** The one set of password rules. Returns a human-readable error, or null. */
export function passwordError(password: string): string | null {
    if (password.length < MIN_PASSWORD_LENGTH) {
        return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
    }
    if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
        return `Password must be at most ${PASSWORD_MAX_BYTES} bytes`
    }
    return null
}

export function normalizeEmail(email: string): string {
    return email.trim().toLowerCase()
}

/** Hash a plaintext password (bcrypt embeds its own random salt). */
export function hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, SALT_ROUNDS)
}

/** Check a plaintext password against a stored bcrypt hash. */
export function verifyPassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash)
}

// Unknown email still costs one bcrypt compare, so response timing never
// reveals whether an email exists. The dummy hash is made once per instance.
let dummyHash: Promise<string> | null = null
export function verifyAgainstDummy(plain: string): Promise<false> {
    dummyHash ??= bcrypt.hash('vibradex-no-such-user', SALT_ROUNDS)
    return dummyHash.then((h) => bcrypt.compare(plain, h)).then(() => false as const)
}
