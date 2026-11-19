import type { CSSProperties } from "react"

import { propStr } from "../props"
import { luminance } from "./contrast"
import "./glass-tone.css"

export function isGlassTone(p: Record<string, unknown>): boolean {
  const t = propStr(p, "tone")
  return t === "glass" || t === "glass-dark"
}

/** Light-glass vs dark-glass: honour `tone: glass-dark`, or `tone: glass` with light ink / a dark section. */
export function isDarkGlassTone(p: Record<string, unknown>, darkSection = false): boolean {
  const t = propStr(p, "tone")
  if (t === "glass-dark") return true
  if (t !== "glass") return false
  const text = propStr(p, "textColor") || propStr(p, "ink")
  if (text) return (luminance(text) ?? 0) > 0.5
  return darkSection
}

export function glassClass(p: Record<string, unknown>, extra = ""): string {
  if (!isGlassTone(p)) return extra
  return [extra, "wb-tone-glass", isDarkGlassTone(p) ? "wb-tone-glass-dark" : ""].filter(Boolean).join(" ")
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
