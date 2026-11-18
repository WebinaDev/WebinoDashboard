export const CAFE_MENU_SKINS = [
  "cafe-reyhoon",
  "cafe-mash-donald",
  "cafe-kerase",
  "cafe-super",
  "cafe-menew",
  "cafe-signature",
] as const

export type CafeMenuSkin = (typeof CAFE_MENU_SKINS)[number]

/** Map the site theme slug onto a catalogue skin. cafe-starter (and unknown cafe slugs) use Reyhoon. */
export function resolveCafeSkin(slug?: string | null): CafeMenuSkin {
  if ((CAFE_MENU_SKINS as readonly string[]).includes(slug ?? "")) return slug as CafeMenuSkin
  return "cafe-reyhoon"
}

export function cafeSkinLayout(skin: string): "phone" | "market" | "catalogue" | "signature" {
  if (skin === "cafe-menew") return "catalogue"
  if (skin === "cafe-signature") return "signature"
  if (skin === "cafe-super") return "market"
  return "phone"
}
