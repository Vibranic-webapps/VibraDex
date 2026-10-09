import { requirePageSession } from "@/lib/auth/session"
import { notFound } from "next/navigation"
import { getAppById } from "@/lib/db/queries"
import { AppDetailView } from "@/components/dashboard/app-detail-view"

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ id: string }>
}

export default async function AppDetailPage({ params }: Props) {
  await requirePageSession()
  const { id } = await params
  const app = await getAppById(id)

  if (!app) {
    notFound()
  }

  return <AppDetailView app={app} />
}
