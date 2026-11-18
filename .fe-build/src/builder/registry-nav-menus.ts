import type { FieldDef, WidgetDef } from "./types"

/**
 * «منوها» ↔ page builder: nav/header/footer widgets get a `nav-menu` field that picks a menu from the Menus
 * section and edits its items inline (saved back to the same /nav-menus data). Empty = legacy links props.
 */
const MENU_FIELD: FieldDef = { kind: "nav-menu", key: "menu", label: "منو (از بخش منوها)" }

const FOOTER_FIELDS: FieldDef[] = [1, 2, 3, 4].map((n) => ({ kind: "nav-menu", key: `menu_${n}`, label: `ستون ${["اول", "دوم", "سوم", "چهارم"][n - 1]} فوتر (منو)` }))

const SINGLE = new Set(["menu", "nav-menu", "nav-dropdown", "store-header", "site-header"])
const FOOTERS = new Set(["store-footer", "site-footer"])

export function applyNavMenuFields(list: WidgetDef[]): void {
  for (const def of list) {
    const has = (k: string) => def.fields.some((f) => f.key === k)
    if (SINGLE.has(def.type) && !has("menu")) def.fields.unshift(MENU_FIELD)
    if (FOOTERS.has(def.type) && !has("menu_1")) def.fields.unshift(...FOOTER_FIELDS)
  }
}

export function footerMenuSlugs(props: Record<string, unknown>): string[] {
  return [1, 2, 3, 4].map((n) => props[`menu_${n}`]).filter((v): v is string => typeof v === "string" && v.trim() !== "")
}
