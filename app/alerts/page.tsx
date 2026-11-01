"use client"

import { useEffect, useRef, useState } from "react"
import { usePullRefresh } from "@/components/pull-to-refresh"
import { subscribeToPush, registerServiceWorker } from "@/lib/push-client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Bell, BellOff, BellRing, Check, Plus, Trash2, Power, PowerOff } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface Alert {
  id: string
  name: string
  appId: string | null
  condition: string
  severity: string
  keyword: string | null
  enabled: boolean
  app: { name: string } | null
}

interface App {
  id: string
  name: string
}

interface HistoryEntry {
  id: string
  alertId: string
  triggeredAt: string
  message: string
  resolved: boolean
  resolvedAt: string | null
  alert: {
    name: string
    condition: string
    app: { name: string } | null
  } | null
}

const conditionLabels: Record<string, string> = {
  high_severity: "High severity event occurs",
  any_error: "Any error event occurs",
  message_contains: "Message contains",
  app_down: "App goes down",
  metric_threshold: "Metric exceeds threshold",
}

function severityVariant(s: string): "destructive" | "default" | "secondary" {
  if (s === "high") return "destructive"
  if (s === "medium") return "default"
  return "secondary"
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [apps, setApps] = useState<App[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">("default")
  const [inAppBanners, setInAppBanners] = useState<{ id: string; title: string; body: string }[]>([])
  const [newAlert, setNewAlert] = useState({
    name: "",
    appId: "all",
    condition: "high_severity",
    severity: "high",
    keyword: "",
  })

  // Track latest seen history entry to detect new ones for notifications
  const latestSeenAt = useRef<string | null>(null)

  // Read current notification permission on mount
  useEffect(() => {
    if (!("Notification" in window)) {
      setNotifPermission("unsupported")
    } else {
      setNotifPermission(Notification.permission)
      // Ensure the service worker is registered so push can arrive even if
      // permission was granted on a previous visit.
      void registerServiceWorker()
    }
  }, [])

  const requestNotifPermission = async () => {
    if (!("Notification" in window)) return
    // Requests permission, subscribes to Web Push, and stores the subscription.
    await subscribeToPush()
    setNotifPermission(Notification.permission)
  }

  const fireNotification = (entry: HistoryEntry) => {
    const title = `⚠️ Alert: ${entry.alert?.name ?? "Unknown alert"}`
    const body = entry.message

    // In-app banner — always works regardless of OS/browser notification settings
    const bannerId = entry.id
    setInAppBanners((prev) => {
      if (prev.some((b) => b.id === bannerId)) return prev
      return [...prev, { id: bannerId, title, body }]
    })
    // Auto-dismiss after 8 seconds
    setTimeout(() => {
      setInAppBanners((prev) => prev.filter((b) => b.id !== bannerId))
    }, 8000)

    // Browser notification — best effort, log errors instead of silently swallowing
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification(title, { body, icon: "/favicon.ico" })
      } catch (err) {
        console.warn("Browser notification failed:", err)
      }
    }
  }

  /** Resolves true when both lists loaded (pull-to-refresh needs to know). */
  const fetchAlerts = async (): Promise<boolean> => {
    try {
      const [alertsRes, appsRes] = await Promise.all([
        fetch("/api/alerts"),
        fetch("/api/admin/apps"),
      ])
      if (alertsRes.ok) {
        const data = await alertsRes.json()
        setAlerts(Array.isArray(data) ? data : [])
      }
      if (appsRes.ok) {
        const data = await appsRes.json()
        setApps(Array.isArray(data) ? data : [])
      }
      return alertsRes.ok && appsRes.ok
    } catch (error) {
      console.error("Failed to fetch alerts:", error)
      return false
    } finally {
      setIsLoading(false)
    }
  }

  /** Resolves true when the request worked, even if nothing was new. */
  const fetchHistory = async (isInitial = false): Promise<boolean> => {
    try {
      // On polling (not initial load), only ask for entries newer than last seen
      const url = !isInitial && latestSeenAt.current
        ? `/api/alerts/history?since=${encodeURIComponent(latestSeenAt.current)}`
        : "/api/alerts/history"

      const res = await fetch(url)
      if (!res.ok) return false

      const data: HistoryEntry[] = await res.json()
      if (!Array.isArray(data) || data.length === 0) return true

      if (isInitial) {
        setHistory(data)
        if (data.length > 0) {
          latestSeenAt.current = data[0].triggeredAt
          // Fire notifications for recent unresolved entries (triggered in the last 10 minutes)
          // so coming back to the page still alerts you if something fired while you were away
          const tenMinutesAgo = Date.now() - 10 * 60 * 1000
          data
            .filter((e) => !e.resolved && new Date(e.triggeredAt).getTime() > tenMinutesAgo)
            .forEach(fireNotification)
        }
      } else {
        // New entries — fire notifications and prepend to history list
        data.forEach(fireNotification)
        setHistory((prev) => [...data, ...prev].slice(0, 50))
        latestSeenAt.current = data[0].triggeredAt
      }
      return true
    } catch (error) {
      console.error("Failed to fetch alert history:", error)
      return false
    }
  }

  // Initial load
  useEffect(() => {
    async function load() {
      await Promise.all([fetchAlerts(), fetchHistory(true)])
    }
    void load()
  }, [])

  // Pull-to-refresh: reload the rules and pick up any new triggers. Uses the polling variant of
  // the history fetch (only entries newer than the last seen), so old alerts are not notified again.
  usePullRefresh(async () => {
    const results = await Promise.all([fetchAlerts(), fetchHistory(false)])
    if (results.some((ok) => !ok)) throw new Error("alerts refresh failed")
  })

  // Poll history every 30s for new triggers
  useEffect(() => {
    const interval = setInterval(() => void fetchHistory(false), 30000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifPermission])

  const handleCreateAlert = async () => {
    try {
      const response = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newAlert.name,
          appId: newAlert.appId === "all" ? null : newAlert.appId,
          condition: newAlert.condition,
          severity: newAlert.severity,
          keyword: newAlert.keyword,
        }),
      })
      if (response.ok) {
        setIsDialogOpen(false)
        setNewAlert({ name: "", appId: "all", condition: "high_severity", severity: "high", keyword: "" })
        void fetchAlerts()
      }
    } catch (error) {
      console.error("Failed to create alert:", error)
    }
  }

  const handleToggleAlert = async (id: string, enabled: boolean) => {
    try {
      await fetch(`/api/alerts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      })
      void fetchAlerts()
    } catch (error) {
      console.error("Failed to toggle alert:", error)
    }
  }

  const handleDeleteAlert = async (id: string) => {
    try {
      await fetch(`/api/alerts/${id}`, { method: "DELETE" })
      void fetchAlerts()
    } catch (error) {
      console.error("Failed to delete alert:", error)
    }
  }

  const handleResolve = async (id: string) => {
    try {
      const res = await fetch(`/api/alerts/history/${id}`, { method: "PATCH" })
      if (res.ok) {
        // Re-fetch so the UI always reflects actual DB state
        await fetchHistory(true)
      }
    } catch (error) {
      console.error("Failed to resolve alert:", error)
    }
  }

  return (
    <div className="space-y-6">
      {/* In-app alert banners */}
      {inAppBanners.length > 0 && (
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
          {inAppBanners.map((banner) => (
            <div
              key={banner.id}
              className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 shadow-lg backdrop-blur"
            >
              <BellRing className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-destructive">{banner.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{banner.body}</p>
              </div>
              <button
                onClick={() => setInAppBanners((prev) => prev.filter((b) => b.id !== banner.id))}
                className="text-muted-foreground hover:text-foreground shrink-0 text-lg leading-none"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Alerts</h1>
          <p className="text-muted-foreground">
            Configure notifications for critical events
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Notification permission button */}
          {notifPermission === "unsupported" ? null : notifPermission === "granted" ? (
            <Button variant="outline" size="sm" disabled>
              <BellRing className="h-4 w-4 mr-2 text-green-500" />
              Notifications on
            </Button>
          ) : notifPermission === "denied" ? (
            <Button variant="outline" size="sm" disabled>
              <BellOff className="h-4 w-4 mr-2 text-destructive" />
              Notifications blocked
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={requestNotifPermission}>
              <Bell className="h-4 w-4 mr-2" />
              Enable notifications
            </Button>
          )}

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Alert
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Alert</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <label className="text-sm font-medium">Alert Name</label>
                  <Input
                    value={newAlert.name}
                    onChange={(e) => setNewAlert({ ...newAlert, name: e.target.value })}
                    placeholder="e.g., Critical Error Alert"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">App (optional)</label>
                  <Select
                    value={newAlert.appId}
                    onValueChange={(value) => setNewAlert({ ...newAlert, appId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All apps" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All apps</SelectItem>
                      {apps.map((app) => (
                        <SelectItem key={app.id} value={app.id}>
                          {app.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Condition</label>
                  <Select
                    value={newAlert.condition}
                    onValueChange={(value) => setNewAlert({ ...newAlert, condition: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high_severity">High severity event</SelectItem>
                      <SelectItem value="any_error">Any error event</SelectItem>
                      <SelectItem value="message_contains">Event message contains…</SelectItem>
                      <SelectItem value="app_down">App goes down</SelectItem>
                      <SelectItem value="metric_threshold">Metric threshold</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {newAlert.condition === "message_contains" && (
                  <div>
                    <label className="text-sm font-medium">Keyword</label>
                    <Input
                      value={newAlert.keyword}
                      onChange={(e) => setNewAlert({ ...newAlert, keyword: e.target.value })}
                      placeholder='e.g. "deleted"'
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Fires when an event message contains this text (case-insensitive).
                    </p>
                  </div>
                )}
                <div>
                  <label className="text-sm font-medium">Alert Severity</label>
                  <Select
                    value={newAlert.severity}
                    onValueChange={(value) => setNewAlert({ ...newAlert, severity: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleCreateAlert} className="w-full">
                  Create Alert
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Configured alerts */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : alerts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Bell className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No alerts configured</h3>
            <p className="text-muted-foreground text-sm">
              Create an alert to get notified when something goes wrong
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {alerts.map((alert) => (
            <Card key={alert.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Bell className={`h-5 w-5 ${alert.enabled ? "text-primary" : "text-muted-foreground"}`} />
                    <div>
                      <CardTitle className="text-base">{alert.name}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {alert.app ? alert.app.name : "All apps"} — {conditionLabels[alert.condition] || alert.condition}
                        {alert.condition === "message_contains" && alert.keyword ? ` "${alert.keyword}"` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={severityVariant(alert.severity)}>{alert.severity}</Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleToggleAlert(alert.id, alert.enabled)}
                    >
                      {alert.enabled ? (
                        <Power className="h-4 w-4 text-green-500" />
                      ) : (
                        <PowerOff className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteAlert(alert.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {/* Alert history feed */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <BellRing className="h-4 w-4" />
            Trigger History
            {history.filter((e) => !e.resolved).length > 0 && (
              <Badge variant="destructive" className="text-xs">
                {history.filter((e) => !e.resolved).length} unresolved
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No alerts have triggered yet — send a high-severity event from the Demo App to test
            </p>
          ) : (
            <div className="space-y-0.5">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  className={`flex items-start justify-between gap-3 py-3 border-b border-border/40 last:border-0 ${
                    entry.resolved ? "opacity-50" : ""
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                        entry.resolved ? "bg-muted-foreground" : "bg-destructive"
                      }`}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {entry.alert?.name ?? "Deleted alert"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{entry.message}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {entry.alert?.app?.name ?? "All apps"} · {relativeTime(entry.triggeredAt)}
                        {entry.resolved && entry.resolvedAt && (
                          <span> · resolved {relativeTime(entry.resolvedAt)}</span>
                        )}
                      </p>
                    </div>
                  </div>
                  {!entry.resolved && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 h-7 w-7"
                      onClick={() => handleResolve(entry.id)}
                      title="Mark as resolved"
                    >
                      <Check className="h-3.5 w-3.5 text-green-500" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
