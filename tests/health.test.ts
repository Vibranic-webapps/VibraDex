import { describe, expect, it } from 'vitest'
import { checkHealth } from '@/lib/health'

const clock = () => {
    let t = 1000
    return () => (t += 25)
}

describe('checkHealth', () => {
    it('ping works -> 200, ok, db up', async () => {
        const r = await checkHealth(async () => 1, 50, clock())
        expect(r.status).toBe(200)
        expect(r.body).toEqual({ ok: true, db: 'up', ms: 25 })
    })

    it('ping throws -> 503, db down, error text not leaked', async () => {
        const r = await checkHealth(async () => { throw new Error('password authentication failed for user neondb_owner') }, 50, clock())
        expect(r.status).toBe(503)
        expect(r.body).toMatchObject({ ok: false, db: 'down' })
        expect(JSON.stringify(r)).not.toContain('neondb_owner')
    })

    it('ping hangs -> times out as 503 instead of hanging', async () => {
        const r = await checkHealth(() => new Promise(() => {}), 20)
        expect(r.status).toBe(503)
        expect(r.body.db).toBe('down')
    })
})
