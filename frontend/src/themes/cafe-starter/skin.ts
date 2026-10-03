export const CAFE_MENU_SKINS = [
  "cafe-reyhoon",
  "cafe-mash-donald",
  "cafe-kerase",
  "cafe-super",
  "cafe-menew",
] as const

export type CafeMenuSkin = (typeof CAFE_MENU_SKINS)[number]

/** Map the site theme slug onto a catalogue skin. cafe-starter is the Reyhoon skin. */
export function resolveCafeSkin(slug?: string | null): string {
  if (slug === "cafe-mash-donald" || slug === "cafe-kerase" || slug === "cafe-super" || slug === "cafe-menew" || slug === "cafe-reyhoon") {
    return slug
  }
  if (!slug || slug === "cafe-starter") return "cafe-reyhoon"
  return slug
}

export function cafeSkinLayout(skin: string): "phone" | "market" | "catalogue" | "plain" {
  if (skin === "cafe-menew") return "catalogue"
  if (skin === "cafe-super") return "market"
  if (skin === "cafe-reyhoon" || skin === "cafe-mash-donald" || skin === "cafe-kerase") return "phone"
  return "plain"
}
