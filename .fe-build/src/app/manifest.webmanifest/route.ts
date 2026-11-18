import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import { buildWebManifest, mergePwaSettings, type PwaStoredSettings } from "@/lib/pwa-settings"
import { apiServer } from "@/lib/api-server"

export const dynamic = "force-dynamic"

type TenantPayload = {
  data: {
    name: string
    store_display_name?: string | null
    branding?: {
      favicon_url?: string | null
      pwa?: PwaStoredSettings | null
    } | null
  }
}

export async function GET() {
  const jar = await cookies()
  const localeCookie = jar.get("NEXT_LOCALE")?.value
  const locale = localeCookie === "en" ? "en" : "fa"

  const tenant = await apiServer<TenantPayload>("/api/v1/public/tenant", {
    revalidate: 60,
    tags: ["tenant"],
  })

  const pwa = mergePwaSettings(tenant?.data?.branding?.pwa)
  if (pwa.enabled === false) {
    return new NextResponse("Not found", { status: 404 })
  }

  const siteName = tenant?.data?.store_display_name ?? tenant?.data?.name ?? ""
  const body = buildWebManifest({
    locale,
    siteName,
    faviconUrl: tenant?.data?.branding?.favicon_url,
    pwa,
  })

  return NextResponse.json(body, {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "no-cache, must-revalidate, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
