"use client"

import Script from "next/script"

import { hasZibalSeal } from "./seal-html"

export const ZIBAL_TRUST_SRC = "https://zibal.ir/trust/scripts/zibal-trust-v4.js"

/** Load the official Zibal trust script only when a Zibal seal is already in the footer HTML. */
export function ZibalTrustScript({ html }: { html: string }) {
  if (!hasZibalSeal(html)) return null
  return <Script id="zibal-trust-v4" src={ZIBAL_TRUST_SRC} strategy="lazyOnload" />
}

export function hasZibalRoot(html: string): boolean {
  return /\bid\s*=\s*["']zibal["']/i.test(html)
}
