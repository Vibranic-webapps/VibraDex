'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function UserMenu() {
    const router = useRouter()
    const [email, setEmail] = useState<string | null>(null)
    const [signingOut, setSigningOut] = useState(false)

    useEffect(() => {
        fetch('/api/auth/me')
            .then((res) => {
                // Stale or forged cookie: this route clears it and lands on /login.
                if (res.status === 401) {
                    window.location.href = '/api/auth/expired'
                    return null
                }
                return res.ok ? res.json() : null
            })
            .then((me) => setEmail(me?.email ?? null))
            .catch(() => setEmail(null))
    }, [])

    async function signOut() {
        setSigningOut(true)
        try {
            await fetch('/api/auth/logout', { method: 'POST' })
        } finally {
            router.replace('/login')
            router.refresh()
        }
    }

    return (
        <div className="flex items-center gap-2">
            {email && (
                <span className="hidden sm:inline text-xs text-muted-foreground max-w-48 truncate" title={email}>
                    {email}
                </span>
            )}
            <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={signOut}
                disabled={signingOut}
                aria-label="Sign out"
            >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Sign out</span>
            </Button>
        </div>
    )
}
