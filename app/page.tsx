"use client"

import { useEffect, useState } from "react"
import { usePullRefresh } from "@/components/pull-to-refresh"
import { StatsCards } from "@/components/dashboard/stats-cards"
import { EventsChart } from "@/components/dashboard/events-chart"
import { RecentEvents } from "@/components/dashboard/recent-events"
import { TimeRangeSelect } from "@/components/time-range-select"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
// import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

interface DashboardData {
  stats: {
    totalApps: number
    totalEvents: number
    eventsLast24h: number
    criticalEvents: number
  }
  recentEvents: Array<{
    id: string
    type: string
    severity: string
    message: string
    timestamp: Date
    app: { name: string }
  }>
  eventsOverTime: Array<{
    hour: string
    errors: number
    warnings: number
    info: number
  }>
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [timeRange, setTimeRange] = useState("24h")
  const [isLoading, setIsLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const response = await fetch(`/api/dashboard?timeRange=${timeRange}`)
        if (response.ok) {
          const result = await response.json()
          setData(result)
          setLastUpdated(new Date())
        }
      } catch (error) {
        console.error("Failed to fetch dashboard:", error)
      } finally {
        setIsLoading(false)
      }
    }

    void fetchDashboard()
    const interval = setInterval(() => void fetchDashboard(), 30000)
    return () => clearInterval(interval)
  }, [timeRange, refreshTrigger])

  // Pull-to-refresh: refetch the numbers (throws when the hub can't be reached).
  usePullRefresh(async () => {
    const response = await fetch(`/api/dashboard?timeRange=${timeRange}`)
    if (!response.ok) throw new Error("dashboard refresh failed")
    setData(await response.json())
    setLastUpdated(new Date())
  })

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Monitor all your applications from one place
            {lastUpdated && (
              <span className="ml-2 text-xs">
                (Updated {lastUpdated.toLocaleTimeString()})
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setRefreshTrigger(t => t + 1)}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
          <TimeRangeSelect value={timeRange} onChange={setTimeRange} />
        </div>
      </div>

      <StatsCards recentEvents={0} {...data.stats} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <EventsChart data={data.eventsOverTime} />
        <RecentEvents events={data.recentEvents} />
      </div>

    </div>
  )
}