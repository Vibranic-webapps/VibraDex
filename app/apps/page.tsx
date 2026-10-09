import { requirePageSession } from "@/lib/auth/session"
import { getAppsWithStatus } from "@/lib/db/queries"
import { AppCard } from "@/components/dashboard/app-card"

export const dynamic = 'force-dynamic'

export default async function AppsPage() {
  await requirePageSession()
  const apps = await getAppsWithStatus()

  const appsForCards = apps.map(app => ({
    id: app.id,
    name: app.name,
    description: app.description || undefined,
    externalUrl: app.externalUrl,
    iconUrl: app.iconUrl || undefined,
    diagnostics: {
      status: app.status as "healthy" | "warning" | "down",
      metrics: [
        { key: "events", label: "Events", value: app.eventCount },
        { key: "metrics", label: "Metrics", value: app.metricCount }
      ]
    }
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Applications</h1>
        <p className="text-muted-foreground">All registered applications sending data to this hub</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {appsForCards.length === 0 ? (
          <p className="text-muted-foreground col-span-full text-center py-12">
            No applications registered yet. Connect an app to start receiving data.
          </p>
        ) : (
          appsForCards.map(app => (
            <AppCard key={app.id} app={app} />
          ))
        )}
      </div>
    </div>
  )
}
