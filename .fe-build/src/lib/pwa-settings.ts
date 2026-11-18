import { DASHBOARD_BASE } from "@/kernel/paths"

export type PwaStoredSettings = {
  enabled?: boolean
  name?: string
  short_name?: string
  description?: string
  theme_color?: string
  background_color?: string
  display?: "standalone" | "fullscreen" | "minimal-ui"
  orientation?: "any" | "portrait" | "landscape"
  icon_source?: "site" | "custom"
  icon_url?: string
  show_install_banner?: boolean
  splash_enabled?: boolean
}

export type PwaClientBootstrap = {
  enabled: boolean
  showInstallBanner: boolean
  splashEnabled: boolean
  name: string
  shortName: string
  themeColor: string
  backgroundColor: string
  iconUrl: string
}

export const PWA_DEFAULTS: Required<
  Pick<
    PwaStoredSettings,
    | "enabled"
    | "theme_color"
    | "background_color"
    | "display"
    | "orientation"
    | "icon_source"
    | "show_install_banner"
    | "splash_enabled"
  >
> = {
  enabled: true,
  theme_color: "#0f172a",
  background_color: "#ffffff",
  display: "standalone",
  orientation: "any",
  icon_source: "site",
  show_install_banner: true,
  splash_enabled: true,
}

export function mergePwaSettings(stored?: PwaStoredSettings | null): PwaStoredSettings {
  return { ...PWA_DEFAULTS, ...(stored ?? {}) }
}

export function resolvePwaBootstrap(input: {
  locale: string
  siteName?: string | null
  faviconUrl?: string | null
  pwa?: PwaStoredSettings | null
}): PwaClientBootstrap {
  const settings = mergePwaSettings(input.pwa)
  const isFa = input.locale.startsWith("fa")
  const siteName = (input.siteName ?? "").trim()

  let name = (settings.name ?? "").trim()
  if (!name) {
    name = siteName
      ? isFa
        ? `داشبورد (${siteName})`
        : `Dashboard (${siteName})`
      : isFa
        ? "داشبورد"
        : "Dashboard"
  }

  let shortName = (settings.short_name ?? "").trim()
  if (!shortName) {
    shortName = isFa ? "داشبورد" : "Dashboard"
  }
  if (shortName.length > 12) {
    shortName = shortName.slice(0, 12)
  }

  const customIcon = (settings.icon_url ?? "").trim()
  const siteIcon = (input.faviconUrl ?? "").trim()
  const iconUrl =
    settings.icon_source === "custom" && customIcon
      ? customIcon
      : siteIcon || "/brand/logo.png"

  return {
    enabled: settings.enabled !== false,
    showInstallBanner: settings.enabled !== false && settings.show_install_banner !== false,
    splashEnabled: settings.enabled !== false && settings.splash_enabled !== false,
    name,
    shortName,
    themeColor: settings.theme_color ?? PWA_DEFAULTS.theme_color,
    backgroundColor: settings.background_color ?? PWA_DEFAULTS.background_color,
    iconUrl,
  }
}

export function dashboardScopeUrl(): string {
  if (typeof window === "undefined") {
    return `${DASHBOARD_BASE}/`
  }
  const origin = window.location.origin
  const base = DASHBOARD_BASE.endsWith("/") ? DASHBOARD_BASE : `${DASHBOARD_BASE}/`
  return new URL(base, origin).href
}

export function buildWebManifest(input: {
  locale: string
  siteName?: string | null
  faviconUrl?: string | null
  pwa?: PwaStoredSettings | null
}) {
  const settings = mergePwaSettings(input.pwa)
  const bootstrap = resolvePwaBootstrap(input)
  const startUrl = `${DASHBOARD_BASE}/`
  const localeTag = input.locale.replace("_", "-")
  const isRtl = localeTag.toLowerCase().startsWith("fa")

  const body: Record<string, unknown> = {
    id: startUrl,
    name: bootstrap.name,
    short_name: bootstrap.shortName,
    description: (settings.description ?? "").trim() || (isRtl ? "پیشخوان فروشگاه" : "Store dashboard"),
    start_url: startUrl,
    scope: startUrl,
    display: settings.display ?? "standalone",
    display_override: [settings.display ?? "standalone", "browser"],
    background_color: bootstrap.backgroundColor,
    theme_color: bootstrap.themeColor,
    lang: localeTag,
    dir: isRtl ? "rtl" : "ltr",
    icons: [
      { src: bootstrap.iconUrl, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: bootstrap.iconUrl, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: bootstrap.iconUrl, sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: bootstrap.iconUrl, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }

  if (settings.orientation && settings.orientation !== "any") {
    body.orientation = settings.orientation
  }

  return body
}
