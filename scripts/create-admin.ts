/**
 * npm run admin:create
 *
 * Creates the single Vibradex admin, or resets that admin's password.
 * Vibradex is a single-admin hub: if a user with a DIFFERENT email already
 * exists, this refuses (no second account, no public sign-up).
 *
 * Input: ADMIN_EMAIL / ADMIN_PASSWORD env vars, otherwise interactive prompts
 * (password hidden). Reads DATABASE_URL from .env / .env.local like Next does,
 * and prints the target DB host first so you know which database you touch.
 * A password reset also logs out every existing session.
 */
import { loadEnvConfig } from '@next/env'
import readline from 'node:readline'
import { Writable } from 'node:stream'
import { PrismaClient } from '@prisma/client'
import { EMAIL_MAX } from '../lib/auth/constants'
import { hashPassword, normalizeEmail, passwordError } from '../lib/auth/password'

loadEnvConfig(process.cwd())

function ask(question: string, hidden = false): Promise<string> {
    let muted = false
    const output = new Writable({
        write(chunk, _enc, cb) {
            if (!muted) process.stdout.write(chunk)
            cb()
        },
    })
    const rl = readline.createInterface({ input: process.stdin, output, terminal: true })
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close()
            if (hidden) process.stdout.write('\n')
            resolve(answer)
        })
        muted = hidden
    })
}

function fail(message: string): never {
    console.error(`\nError: ${message}`)
    process.exit(1)
}

async function main() {
    const dbUrl = process.env.DATABASE_URL
    if (!dbUrl) fail('DATABASE_URL is not set (.env / .env.local or the environment).')
    let host = 'unknown'
    try { host = new URL(dbUrl).host } catch { /* shown as unknown */ }
    console.log(`Target database host: ${host}`)

    const email = normalizeEmail(process.env.ADMIN_EMAIL ?? (await ask('Admin email: ')))
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > EMAIL_MAX) {
        fail('That is not a valid email address.')
    }

    let password = process.env.ADMIN_PASSWORD
    if (!password) {
        password = await ask('Password (min 12 chars, hidden): ', true)
        const again = await ask('Repeat password: ', true)
        if (password !== again) fail('Passwords do not match.')
    }
    const pwError = passwordError(password)
    if (pwError) fail(pwError)

    const prisma = new PrismaClient()
    try {
        const users = await prisma.user.findMany({ select: { id: true, email: true } })
        const other = users.find((u) => u.email !== email)
        if (other) {
            fail(`A different admin already exists (${other.email}). Vibradex allows one admin only; `
                + 'run this again with that email to reset its password.')
        }

        const passwordHash = await hashPassword(password)
        const existing = users.find((u) => u.email === email)

        if (existing) {
            await prisma.$transaction([
                prisma.user.update({ where: { id: existing.id }, data: { passwordHash } }),
                prisma.session.deleteMany({ where: { userId: existing.id } }),
            ])
            console.log(`Password reset for ${email}. All existing sessions were logged out.`)
        } else {
            await prisma.user.create({ data: { email, passwordHash } })
            console.log(`Admin ${email} created. Log in at /login.`)
        }
    } finally {
        await prisma.$disconnect()
    }
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
