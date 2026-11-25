export type BusinessNavPreset = {
  preset: string
  sectionOverrides?: Record<string, string>
  hiddenSlugs?: string[]
}

export const BUSINESS_PRESETS: Record<string, BusinessNavPreset> = {
  cafe: {
    preset: "cafe",
    sectionOverrides: { catalog: "nav.menu" },
  },
  cosmetics: {
    preset: "cosmetics",
    hiddenSlugs: ["native_api"],
  },
  digital: {
    preset: "digital",
  },
  agency: {
    preset: "agency",
    hiddenSlugs: ["catalog", "cart", "checkout", "inventory"],
  },
  startup: {
    preset: "startup",
    hiddenSlugs: ["catalog", "cart", "checkout"],
  },
  freelancer: {
    preset: "freelancer",
    hiddenSlugs: ["catalog", "cart", "checkout", "inventory", "marketing"],
  },
  personal: {
    preset: "personal",
    // Accounting stays visible on every preset: invoicing and expenses are not
    // shop-only, and hiding the nav made the ledger unreachable on personal sites
    // even though the module was enabled for them.
    hiddenSlugs: ["catalog", "cart", "checkout", "inventory", "marketing"],
  },
}

export function resolveBusinessPreset(
  themePreset?: string | null,
  businessTypeSlug?: string | null,
): BusinessNavPreset | null {
  const key = themePreset || businessTypeSlug
  if (!key) return null
  return BUSINESS_PRESETS[key] ?? null
}
