"use client"

import { useEffect, useState, useCallback } from "react"
import { usePullRefresh } from "@/components/pull-to-refresh"
import { EventsTableClient } from "@/components/dashboard/events-table-client"
import { TimeRangeSelect } from "@/components/time-range-select"
import { ExportButton } from "@/components/export-button"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Event {
  id: string
  appId: string
  type: string
  severity: string
  message: string
  details: unknown
  stackTrace: string | null
  userAgent: string | null
  ipAddress: string | null
  timestamp: Date
  app: { id: string; name: string }
}

interface App {
  id: string
  name: string
}

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([])
  const [apps, setApps] = useState<App[]>([])
  const [timeRange, setTimeRange] = useState("24h")
  const [isLoading, setIsLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchEvents = useCallback(async () => {
    try {
      const response = await fetch(`/api/events?timeRange=${timeRange}`)
      if (response.ok) {
        const data = await response.json()
        setEvents(data.events)
        setApps(data.apps)
        setLastUpdated(new Date())
      }
    } catch (error) {
      console.error("Failed to fetch events:", error)
    } finally {
      setIsLoading(false)
    }
  }, [timeRange])

  useEffect(() => {
    fetchEvents()
    const interval = setInterval(fetchEvents, 30000)
    return () => clearInterval(interval)
  }, [fetchEvents])

  // Pull-to-refresh: refetch the log (throws when the hub can't be reached).
  usePullRefresh(async () => {
    const response = await fetch(`/api/events?timeRange=${timeRange}`)
    if (!response.ok) throw new Error("events refresh failed")
    const data = await response.json()
    setEvents(data.events)
    setApps(data.apps)
    setLastUpdated(new Date())
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Events Log</h1>
          <p className="text-muted-foreground">
            All diagnostic events from your applications
            {lastUpdated && (
              <span className="ml-2 text-xs">
                (Updated {lastUpdated.toLocaleTimeString()})
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={fetchEvents} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <TimeRangeSelect value={timeRange} onChange={setTimeRange} />
          <ExportButton type="events" timeRange={timeRange} />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <EventsTableClient events={events} apps={apps} />
      )}
    </div>
  )
}
