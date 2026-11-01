'use client'

import { useEffect, useState } from 'react'
import { usePullRefresh } from '@/components/pull-to-refresh'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Plus, Copy, RefreshCw, Trash2, Pencil, Eye, EyeOff, ExternalLink, Check } from 'lucide-react'

interface App {
    id: string
    name: string
    description: string | null
    externalUrl: string
    iconUrl: string | null
    apiKey: string
    createdAt: string
    _count?: {
        events: number
        metrics: number
    }
}

export default function AdminDashboard() {
    const [apps, setApps] = useState<App[]>([])
    const [loading, setLoading] = useState(true)
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
    const [editingApp, setEditingApp] = useState<App | null>(null)
    const [visibleApiKeys, setVisibleApiKeys] = useState<Set<string>>(new Set())
    const [copiedKey, setCopiedKey] = useState<string | null>(null)
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        externalUrl: '',
        iconUrl: ''
    })
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        fetchApps()
    }, [])

    /** Resolves true when the list loaded (pull-to-refresh needs to know). */
    const fetchApps = async (): Promise<boolean> => {
        try {
            const response = await fetch('/api/admin/apps')
            if (!response.ok) return false
            const data = await response.json()
            setApps(data.apps || [])
            return true
        } catch (error) {
            console.error('Failed to fetch apps:', error)
            return false
        } finally {
            setLoading(false)
        }
    }

    // Pull-to-refresh: reload the app list (the add/edit forms are left alone).
    usePullRefresh(async () => {
        if (!(await fetchApps())) throw new Error('admin refresh failed')
    })

    const handleAddApp = async () => {
        if (!formData.name || !formData.externalUrl) return

        setSaving(true)
        try {
            const response = await fetch('/api/admin/apps', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            })

            if (response.ok) {
                await fetchApps()
                setIsAddDialogOpen(false)
                setFormData({ name: '', description: '', externalUrl: '', iconUrl: '' })
            }
        } catch (error) {
            console.error('Failed to add app:', error)
        } finally {
            setSaving(false)
        }
    }

    const handleEditApp = async () => {
        if (!editingApp || !formData.name || !formData.externalUrl) return

        setSaving(true)
        try {
            const response = await fetch(`/api/admin/apps/${editingApp.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            })

            if (response.ok) {
                await fetchApps()
                setIsEditDialogOpen(false)
                setEditingApp(null)
                setFormData({ name: '', description: '', externalUrl: '', iconUrl: '' })
            }
        } catch (error) {
            console.error('Failed to edit app:', error)
        } finally {
            setSaving(false)
        }
    }

    const handleDeleteApp = async (appId: string) => {
        try {
            const response = await fetch(`/api/admin/apps/${appId}`, {
                method: 'DELETE'
            })

            if (response.ok) {
                await fetchApps()
            }
        } catch (error) {
            console.error('Failed to delete app:', error)
        }
    }

    const handleRegenerateKey = async (appId: string) => {
        try {
            const response = await fetch(`/api/admin/apps/${appId}/regenerate-key`, {
                method: 'POST'
            })

            if (response.ok) {
                await fetchApps()
            }
        } catch (error) {
            console.error('Failed to regenerate key:', error)
        }
    }

    const toggleApiKeyVisibility = (appId: string) => {
        setVisibleApiKeys(prev => {
            const next = new Set(prev)
            if (next.has(appId)) {
                next.delete(appId)
            } else {
                next.add(appId)
            }
            return next
        })
    }

    const copyToClipboard = async (text: string, appId: string) => {
        await navigator.clipboard.writeText(text)
        setCopiedKey(appId)
        setTimeout(() => setCopiedKey(null), 2000)
    }

    const openEditDialog = (app: App) => {
        setEditingApp(app)
        setFormData({
            name: app.name,
            description: app.description || '',
            externalUrl: app.externalUrl,
            iconUrl: app.iconUrl || ''
        })
        setIsEditDialogOpen(true)
    }

    const maskApiKey = (key: string) => {
        return key.slice(0, 8) + '••••••••••••••••' + key.slice(-4)
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">App Management</h1>
                    <p className="text-muted-foreground">
                        Register and manage applications that connect to the hub
                    </p>
                </div>

                <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                    <DialogTrigger asChild>
                        <Button size="lg">
                            <Plus className="w-4 h-4 mr-2" />
                            Add New App
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Register New Application</DialogTitle>
                            <DialogDescription>
                                Add a new application to receive diagnostic events and metrics.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">App Name *</Label>
                                <Input
                                    id="name"
                                    placeholder="My Application"
                                    value={formData.name}
                                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="description">Description</Label>
                                <Textarea
                                    id="description"
                                    placeholder="A brief description of your app"
                                    value={formData.description}
                                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="externalUrl">App URL *</Label>
                                <Input
                                    id="externalUrl"
                                    placeholder="https://myapp.example.com"
                                    value={formData.externalUrl}
                                    onChange={(e) => setFormData(prev => ({ ...prev, externalUrl: e.target.value }))}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="iconUrl">Icon URL (optional)</Label>
                                <Input
                                    id="iconUrl"
                                    placeholder="https://example.com/icon.png"
                                    value={formData.iconUrl}
                                    onChange={(e) => setFormData(prev => ({ ...prev, iconUrl: e.target.value }))}
                                />
                            </div>
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button onClick={handleAddApp} disabled={saving || !formData.name || !formData.externalUrl}>
                                {saving ? 'Creating...' : 'Create App'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {loading ? (
                <div className="text-center py-12 text-muted-foreground">
                    Loading apps...
                </div>
            ) : apps.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center">
                        <p className="text-muted-foreground mb-4">No applications registered yet</p>
                        <Button onClick={() => setIsAddDialogOpen(true)}>
                            <Plus className="w-4 h-4 mr-2" />
                            Register Your First App
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4">
                    {apps.map((app) => (
                        <Card key={app.id}>
                            <CardHeader>
                                <div className="flex items-start justify-between">
                                    <div className="space-y-1">
                                        <CardTitle className="flex items-center gap-2">
                                            {app.name}
                                            <a
                                                href={app.externalUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-muted-foreground hover:text-foreground"
                                            >
                                                <ExternalLink className="w-4 h-4" />
                                            </a>
                                        </CardTitle>
                                        <CardDescription>
                                            {app.description || 'No description'}
                                        </CardDescription>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge variant="outline">
                                            {app._count?.events || 0} events
                                        </Badge>
                                        <Badge variant="outline">
                                            {app._count?.metrics || 0} metrics
                                        </Badge>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-muted-foreground text-xs">API Key</Label>
                                    <div className="flex items-center gap-2">
                                        <code className="flex-1 bg-muted px-3 py-2 rounded-md text-sm font-mono">
                                            {visibleApiKeys.has(app.id) ? app.apiKey : maskApiKey(app.apiKey)}
                                        </code>
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            onClick={() => toggleApiKeyVisibility(app.id)}
                                        >
                                            {visibleApiKeys.has(app.id) ? (
                                                <EyeOff className="w-4 h-4" />
                                            ) : (
                                                <Eye className="w-4 h-4" />
                                            )}
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            onClick={() => copyToClipboard(app.apiKey, app.id)}
                                        >
                                            {copiedKey === app.id ? (
                                                <Check className="w-4 h-4 text-green-500" />
                                            ) : (
                                                <Copy className="w-4 h-4" />
                                            )}
                                        </Button>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 pt-2 border-t">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => openEditDialog(app)}
                                    >
                                        <Pencil className="w-3 h-3 mr-1" />
                                        Edit
                                    </Button>

                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="outline" size="sm">
                                                <RefreshCw className="w-3 h-3 mr-1" />
                                                Regenerate Key
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Regenerate API Key?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    This will invalidate the current API key. Any apps using it will stop working until updated with the new key.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction onClick={() => handleRegenerateKey(app.id)}>
                                                    Regenerate
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>

                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="destructive" size="sm">
                                                <Trash2 className="w-3 h-3 mr-1" />
                                                Delete
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Delete {app.name}?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    This will permanently delete the app and all its events and metrics. This action cannot be undone.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction
                                                    onClick={() => handleDeleteApp(app.id)}
                                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                >
                                                    Delete
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Application</DialogTitle>
                        <DialogDescription>
                            Update the application details.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="edit-name">App Name *</Label>
                            <Input
                                id="edit-name"
                                value={formData.name}
                                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="edit-description">Description</Label>
                            <Textarea
                                id="edit-description"
                                value={formData.description}
                                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="edit-externalUrl">App URL *</Label>
                            <Input
                                id="edit-externalUrl"
                                value={formData.externalUrl}
                                onChange={(e) => setFormData(prev => ({ ...prev, externalUrl: e.target.value }))}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="edit-iconUrl">Icon URL</Label>
                            <Input
                                id="edit-iconUrl"
                                value={formData.iconUrl}
                                onChange={(e) => setFormData(prev => ({ ...prev, iconUrl: e.target.value }))}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleEditApp} disabled={saving || !formData.name || !formData.externalUrl}>
                            {saving ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
