import type { ComponentType } from "react"

/**
 * Registered extension settings panels for `/dashboard/settings/shop/ext/:moduleSlug`.
 * Only modules listed here render; unknown slugs → 404.
 */
export const EXT_MODULE_SETTINGS_PANELS: Record<string, () => Promise<{ default: ComponentType }>> = {
  // Example: "coffee-profile": () => import("@/views/settings/panels/CoffeeProfileSettingsPanel"),
}

export function hasExtModuleSettings(slug: string): boolean {
  return Object.prototype.hasOwnProperty.call(EXT_MODULE_SETTINGS_PANELS, slug)
}
