import { dashboardScopeUrl } from "@/lib/pwa-settings"

export type ServiceWorkerRegisterResult = "registered" | "skipped" | "failed"

const VERSION = process.env.NEXT_PUBLIC_DASHBOARD_VERSION ?? "1"

async function unregisterStaleWorkers(desiredScope: string): Promise<void> {
  const regs = await navigator.serviceWorker.getRegistrations()
  await Promise.all(
    regs.map(async (reg) => {
      if (reg.scope === desiredScope) return
      try {
        await reg.unregister()
      } catch {
        /* ignore */
      }
    }),
  )
}

export async function registerDashboardServiceWorker(): Promise<ServiceWorkerRegisterResult> {
  if (!("serviceWorker" in navigator)) {
    return "skipped"
  }

  const scope = dashboardScopeUrl()
  if (!scope) {
    return "skipped"
  }

  try {
    await unregisterStaleWorkers(scope)
  } catch {
    /* ignore */
  }

  const url = new URL("/sw.js", window.location.origin)
  url.searchParams.set("v", VERSION)

  try {
    const reg = await navigator.serviceWorker.register(url.href, { scope })
    void reg.update()
    return "registered"
  } catch (err) {
    console.warn("[Webino Dashboard] Service worker registration failed", err)
    return "failed"
  }
}
