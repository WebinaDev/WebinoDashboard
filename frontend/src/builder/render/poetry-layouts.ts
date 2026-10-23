/* Layout options for poetry widgets (pure, tested). All defaults keep the previous rendering. */
import type { CSSProperties } from "react"
import { propBool, propNum, propStr } from "../props"

type P = Record<string, unknown>

/** poetry-hero heroLayout: "split" (default, image beside text) | "overlay" (image behind text + decor slots). */
export const heroIsOverlay = (p: P) => propStr(p, "heroLayout", "split") === "overlay"

/** poet-about aboutLayout: "auto" (default) | "horizontal" (image left / text right, stays a row at half width); card: "none" | "light". */
export function aboutClass(p: P): string {
  const c = ["wpz-about"]
  if (propStr(p, "aboutLayout", "auto") === "horizontal") c.push("wpz-about-h")
  if (propStr(p, "card", "none") === "light") c.push("wpz-card-light")
  return c.join(" ")
}

/** shop-showcase slidesNarrow (0 = off): slides-per-view when the widget's own width ≤ 720px (container query, not viewport). */
export function shopNarrowSpv(p: P): number {
  const n = propNum(p, "slidesNarrow", 0)
  return Number.isFinite(n) && n > 0 ? Math.max(1, Math.min(4, n)) : 0
}

export function shopTrackClass(p: P): string {
  const c: string[] = []
  if (shopNarrowSpv(p)) c.push("wpz-cq")
  if (propBool(p, "compactCards", false)) c.push("wpz-compact")
  if (propStr(p, "imageFit", "cover") === "contain") c.push("wpz-fit-contain")
  return c.join(" ")
}

export function shopNarrowStyle(p: P): CSSProperties {
  const n = shopNarrowSpv(p)
  return n ? ({ ["--wpz-spv-n" as string]: String(n) } as CSSProperties) : {}
}
