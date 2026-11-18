import type { CSSProperties } from "react"

import { propStr } from "../props"
import "./glass-tone.css"

export function isGlassTone(p: Record<string, unknown>): boolean {
  return propStr(p, "tone") === "glass"
}

export function glassClass(p: Record<string, unknown>, extra = ""): string {
  return [extra, isGlassTone(p) ? "wb-tone-glass" : ""].filter(Boolean).join(" ")
}

export function glassStyle(p: Record<string, unknown>): CSSProperties | undefined {
  if (!isGlassTone(p)) return undefined
  const v: Record<string, string> = {}
  const bg = propStr(p, "glassBg")
  const border = propStr(p, "glassBorder")
  const text = propStr(p, "textColor")
  const accent = propStr(p, "accentColor")
  if (bg) v["--wb-glass-bg"] = bg
  if (border) v["--wb-glass-border"] = border
  if (text) {
    v["--wb-glass-text"] = text
    v.color = text
  }
  if (accent) v["--wb-glass-accent"] = accent
  return v
}
