import { documentCss } from "./style"
import type { BuilderDocument } from "./types"

/** Bump when style.ts output changes so stale publish-time CSS is ignored. */
export const CSS_VERSION = 2

export type Breakpoints = { tablet: number; mobile: number }
export const DEFAULT_BREAKPOINTS: Breakpoints = { tablet: 1024, mobile: 767 }

export type CompiledCss = { v: number; bp: string; hash: string; css: string }

export function normalizeBreakpoints(bp: Partial<Breakpoints> | undefined): Breakpoints {
  const tablet = Math.round(Number(bp?.tablet) || DEFAULT_BREAKPOINTS.tablet)
  const mobile = Math.round(Number(bp?.mobile) || DEFAULT_BREAKPOINTS.mobile)
  const t = Math.min(1600, Math.max(600, tablet))
  const m = Math.min(t - 1, Math.max(320, mobile))
  return { tablet: t, mobile: m }
}

/** Rewrites the default 1024/1025/767/768 media boundaries to custom breakpoints. */
export function applyBreakpoints(css: string, raw?: Partial<Breakpoints>): string {
  const bp = normalizeBreakpoints(raw)
  if (bp.tablet === 1024 && bp.mobile === 767) return css
  const map: Record<string, number> = { "1024": bp.tablet, "1025": bp.tablet + 1, "767": bp.mobile, "768": bp.mobile + 1 }
  return css.replace(/@media[^{]*\{/g, (head) => head.replace(/(min|max)-width:(1024|1025|767|768)px/g, (_m, kind: string, px: string) => `${kind}-width:${map[px]}px`))
}

function hashText(text: string): string {
  let h = 5381
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

function bpKey(raw?: Partial<Breakpoints>): string {
  const bp = normalizeBreakpoints(raw)
  return `${bp.tablet}/${bp.mobile}`
}

/** Attaches node CSS compiled at save/publish so view mode does not rebuild it per request. */
export function compileDocument(document: BuilderDocument, bp?: Partial<Breakpoints>): BuilderDocument {
  const rest = { ...document }
  delete rest.compiled
  const css = applyBreakpoints(documentCss(rest), bp)
  return { ...rest, compiled: { v: CSS_VERSION, bp: bpKey(bp), hash: hashText(JSON.stringify(rest.sections)), css } }
}

/** CSS for view mode: compiled copy when it still matches, otherwise computed. */
export function viewCss(document: BuilderDocument, bp?: Partial<Breakpoints>): string {
  const compiled = document.compiled
  if (
    compiled &&
    compiled.v === CSS_VERSION &&
    compiled.bp === bpKey(bp) &&
    typeof compiled.css === "string" &&
    compiled.hash === hashText(JSON.stringify(document.sections))
  ) {
    return compiled.css
  }
  return applyBreakpoints(documentCss(document), bp)
}
