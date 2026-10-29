import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const findMany = vi.fn()
vi.mock('@/lib/prisma', () => ({ prisma: { alertHistory: { findMany: (...a: unknown[]) => findMany(...a) } } }))

import * as route from '@/app/api/hub/alerts/route'
import proxy from '@/proxy'
import { MAX_ITEMS, MAX_LOOKBACK_MS, bearerMatches, configuredHubKey, parseSince } from '@/lib/hub/alerts-feed'

const KEY = 'k'.repeat(40)
const URL_BASE = 'https://vibradex.example/api/hub/alerts'

function req(opts: { key?: string | null; header?: string; query?: string; method?: string } = {}) {
    const headers: Record<string, string> = {}
    if (opts.header !== undefined) headers.authorization = opts.header
    else if (opts.key !== null) headers.authorization = `Bearer ${opts.key ?? KEY}`
    return new NextRequest(`${URL_BASE}${opts.query ?? ''}`, { method: opts.method ?? 'GET', headers })
}

const row = (n: number, over: Record<string, unknown> = {}) => ({
    id: `h${n}`,
    triggeredAt: new Date(Date.UTC(2026, 9, 29, 8, 0, n)),
    message: `Something happened ${n}`,
    alert: { name: 'Errors', severity: 'high', app: { name: 'VibraFlow' } },
    ...over,
})

beforeEach(() => {
    findMany.mockReset()
    findMany.mockResolvedValue([])
    vi.stubEnv('HUB_READ_KEY', KEY)
})
afterEach(() => vi.unstubAllEnvs())

describe('GET /api/hub/alerts: auth (fail closed)', () => {
    it('404 with no body when HUB_READ_KEY is unset', async () => {
        vi.stubEnv('HUB_READ_KEY', '')
        const res = await route.GET(req())
        expect(res.status).toBe(404)
        expect(await res.text()).toBe('')
        expect(findMany).not.toHaveBeenCalled()
    })

    it('404 when HUB_READ_KEY is shorter than 32 characters, even with the matching key', async () => {
        vi.stubEnv('HUB_READ_KEY', 'short-key')
        const res = await route.GET(req({ key: 'short-key' }))
        expect(res.status).toBe(404)
        expect(findMany).not.toHaveBeenCalled()
    })

    it('401 without Authorization, with a wrong key, a wrong scheme and a key in the query string', async () => {
        for (const r of [
            req({ key: null }),
            req({ key: 'x'.repeat(40) }),
            req({ header: `Basic ${KEY}` }),
            req({ header: `Bearer ${KEY} extra` }),
            req({ key: null, query: `?key=${KEY}` }),
        ]) {
            const res = await route.GET(r)
            expect(res.status).toBe(401)
            expect(await res.json()).toEqual({ error: 'unauthorized' })
        }
        expect(findMany).not.toHaveBeenCalled()
    })

    it('never echoes the key, and is never cached', async () => {
        const res = await route.GET(req({ key: 'x'.repeat(40) }))
        expect(JSON.stringify(await res.json())).not.toContain(KEY)
        expect(res.headers.get('cache-control')).toBe('no-store')
    })

    it('constant-time helper handles different lengths without throwing', () => {
        expect(bearerMatches('Bearer a', KEY)).toBe(false)
        expect(bearerMatches(`Bearer ${KEY}`, KEY)).toBe(true)
        expect(bearerMatches(null, KEY)).toBe(false)
        expect(configuredHubKey({ HUB_READ_KEY: `  ${KEY}  ` })).toBe(KEY)
    })
})

describe('GET /api/hub/alerts: data', () => {
    it('200 with minimal fields, oldest first, and only the whitelisted columns', async () => {
        findMany.mockResolvedValue([row(2), row(1)]) // db answers newest first
        const res = await route.GET(req())
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.items.map((i: { id: string }) => i.id)).toEqual(['h1', 'h2'])
        expect(Object.keys(body.items[0]).sort()).toEqual(['app', 'firedAt', 'id', 'message', 'rule', 'severity'])
        expect(body.items[0]).toMatchObject({ firedAt: '2026-10-29T08:00:01.000Z', app: 'VibraFlow', rule: 'Errors', severity: 'high' })
        expect(body.truncated).toBe(false)
        const args = findMany.mock.calls[0][0]
        expect(args.select).toEqual({
            id: true,
            triggeredAt: true,
            message: true,
            alert: { select: { name: true, severity: true, app: { select: { name: true } } } },
        })
    })

    it('caps at 100 items and says it was truncated', async () => {
        findMany.mockResolvedValue(Array.from({ length: MAX_ITEMS + 1 }, (_, i) => row(MAX_ITEMS + 1 - i)))
        const body = await (await route.GET(req())).json()
        expect(body.items).toHaveLength(MAX_ITEMS)
        expect(body.truncated).toBe(true)
        expect(body.items.at(-1).id).toBe(`h${MAX_ITEMS + 1}`) // the newest is kept
        expect(findMany.mock.calls[0][0].take).toBe(MAX_ITEMS + 1)
    })

    it('truncates long messages, flattens control characters, and tolerates a deleted app', async () => {
        findMany.mockResolvedValue([row(1, { message: `line1\nline2\u0000${'x'.repeat(500)}`, alert: { name: 'N', severity: 'low', app: null } })])
        const item = (await (await route.GET(req())).json()).items[0]
        expect(item.message.length).toBeLessThanOrEqual(200)
        expect(item.message.startsWith('line1 line2 x')).toBe(true)
        expect(item.message.endsWith('…')).toBe(true)
        expect(item.app).toBeNull()
    })

    it('400 for an invalid since, without touching the database', async () => {
        for (const q of ['?since=banana', '?since=1', '?since=2026-13-45', '?since=Tue Oct 29 2026']) {
            const res = await route.GET(req({ query: q }))
            expect(res.status).toBe(400)
            expect((await res.json()).error).toBe('invalid_since')
        }
        expect(findMany).not.toHaveBeenCalled()
    })

    it('defaults to 24 h and clamps the look-back to 7 days', () => {
        const now = new Date('2026-10-29T12:00:00Z')
        expect(parseSince(null, now)).toEqual({ ok: true, since: new Date('2026-10-28T12:00:00Z') })
        expect(parseSince('2020-01-01T00:00:00Z', now)).toEqual({ ok: true, since: new Date(now.getTime() - MAX_LOOKBACK_MS) })
        expect(parseSince('2026-10-29T08:00:00+01:00', now)).toEqual({ ok: true, since: new Date('2026-10-29T07:00:00Z') })
        expect(parseSince('2026-10-29', now)).toMatchObject({ ok: true })
    })

    it('passes the parsed since to the query', async () => {
        await route.GET(req({ query: '?since=' + new Date(Date.now() - 3600_000).toISOString() }))
        const gt = findMany.mock.calls[0][0].where.triggeredAt.gt as Date
        expect(Math.abs(Date.now() - gt.getTime() - 3600_000)).toBeLessThan(5000)
    })

    it('500 without details when the database fails', async () => {
        findMany.mockRejectedValue(new Error('password authentication failed for user "x"'))
        const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        const res = await route.GET(req())
        spy.mockRestore()
        expect(res.status).toBe(500)
        expect(await res.json()).toEqual({ error: 'server_error' })
    })
})

describe('read-only by construction', () => {
    it('exports GET and nothing else callable', () => {
        const methods = Object.keys(route).filter((k) => /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(k))
        expect(methods).toEqual(['GET'])
    })

    it('the proxy still refuses a browser write to the new path (not a key-authenticated write route)', () => {
        const res = proxy(new NextRequest(URL_BASE, { method: 'POST', headers: { authorization: `Bearer ${KEY}` } }))
        expect(res.status).toBe(403)
    })
})

describe('every other API route keeps its own protection', () => {
    // proxy.ts does not gate /api reads: each handler authenticates itself. This guards that nobody removes it.
    const root = join(process.cwd(), 'app', 'api')
    const files: string[] = []
    const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
            const p = join(dir, name)
            if (statSync(p).isDirectory()) walk(p)
            else if (name === 'route.ts') files.push(p)
        }
    }
    walk(root)

    // Intentionally without a session guard: they create or end a session, or report "no session".
    const OPEN = new Set(['auth/login', 'auth/logout', 'auth/expired'])
    const GUARD = /requireSession|validateAdminKey|x-api-key|getSession|configuredHubKey/

    it('finds the routes', () => expect(files.length).toBeGreaterThan(15))

    for (const file of files) {
        const name = relative(root, file).split(sep).slice(0, -1).join('/')
        if (OPEN.has(name)) continue
        it(`${name || '(root)'} has an auth guard`, () => {
            expect(readFileSync(file, 'utf8')).toMatch(GUARD)
        })
    }

    it('the session guard runs before any query (alerts/history)', () => {
        const src = readFileSync(join(root, 'alerts', 'history', 'route.ts'), 'utf8')
        expect(src.indexOf('requireSession')).toBeLessThan(src.indexOf('prisma.'))
    })

    it('proxy.ts has no special case for the hub path (GET /api/* is left to the handlers)', () => {
        const src = readFileSync(join(process.cwd(), 'proxy.ts'), 'utf8')
        expect(src).not.toMatch(/api\/hub/)
    })
})
