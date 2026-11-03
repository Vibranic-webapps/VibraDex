"use client"

import { usePathname } from "next/navigation"
import { Sidebar } from "@/components/dashboard/sidebar"
import { Topbar } from "@/components/dashboard/topbar"
import { PullToRefresh } from "@/components/pull-to-refresh"

// Pages that render on their own, without the dashboard chrome.
const BARE_PAGES = ["/login"]

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (BARE_PAGES.includes(pathname)) {
    return <main className="min-h-screen bg-background">{children}</main>
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex flex-col flex-1">
        <Topbar />
        <PullToRefresh className="flex-1 overflow-auto p-6">{children}</PullToRefresh>
      </div>
    </div>
  )
}
