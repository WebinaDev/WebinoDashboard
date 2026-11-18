"use client"

import { useClassicText } from "./texts"

/** Editable storefront text for server components (e.g. the blog), rendered as a tiny client leaf. */
export function ClassicT({ id, vars }: { id: string; vars?: Record<string, string> }) {
  const tx = useClassicText()
  return <>{tx(id, vars)}</>
}
