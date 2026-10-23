import type { Metadata } from "next"

import { ComingSoonView } from "@/components/site-status/ComingSoonView"
import { SuspendedView } from "@/components/site-status/SuspendedView"
import { apiServer } from "@/lib/api-server"

export const dynamic = "force-dynamic"

type StatusPayload = {
  data?: { status?: string; name?: string; launch_at?: string | null; expires_at?: string | null; renew_url?: string | null; support_url?: string | null }
}

export async function generateMetadata({ params }: { params: Promise<{ kind: string }> }): Promise<Metadata> {
  const { kind } = await params
  return {
    title: kind === "suspended" ? "موقتاً در دسترس نیست" : "به‌زودی",
    robots: kind === "suspended" ? { index: false, follow: false } : undefined,
  }
}

/** Internal rewrite target for coming_soon / suspended sites (see src/middleware.ts). */
export default async function SiteStatusPage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params
  const res = await apiServer<StatusPayload>("/api/v1/public/site-status", { revalidate: false }).catch(() => null)
  const d = res?.data ?? {}
  const name = d.name || ""
  if (kind === "suspended") {
    return <SuspendedView name={name} expiresAt={d.expires_at} renewUrl={d.renew_url} supportUrl={d.support_url} />
  }
  return <ComingSoonView name={name} launchAt={d.launch_at} />
}
