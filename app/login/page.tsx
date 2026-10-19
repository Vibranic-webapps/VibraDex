'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Error codes from POST /api/auth/login, mapped to plain words.
const ERRORS: Record<string, string> = {
    invalid_input: 'Enter your email and password.',
    invalid_credentials: 'That email and password don’t match.',
    too_many_attempts: 'Too many attempts. Wait 15 minutes and try again.',
}
const FALLBACK_ERROR = 'Something went wrong. Check your connection and try again.'

export default function LoginPage() {
    const router = useRouter()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setError(null)
        setLoading(true)
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim(), password }),
            })
            if (res.ok) {
                router.replace('/')
                router.refresh()
                return
            }
            const body = await res.json().catch(() => ({}))
            setError(ERRORS[body?.error] ?? FALLBACK_ERROR)
        } catch {
            setError(FALLBACK_ERROR)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center p-4">
            <Card className="w-full max-w-sm">
                <CardHeader>
                    <CardTitle>Vibradex</CardTitle>
                    <CardDescription>Sign in to the diagnostics hub.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                autoComplete="username"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="password">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                autoComplete="current-password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                        <p role="alert" aria-live="polite" className="min-h-5 text-sm text-destructive">
                            {error}
                        </p>
                        <Button type="submit" disabled={loading || !email || !password}>
                            {loading ? 'Signing in…' : 'Sign in'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
