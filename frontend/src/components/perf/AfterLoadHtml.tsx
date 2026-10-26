"use client"

import { useEffect, useState } from "react"

/**
 * Third-party trust seals (trustseal.enamad.ir, samandehi, ...) are slow or unreachable from
 * outside Iran and used to hold the page "loading" (GTmetrix timeouts, TBT). Render the
 * admin-entered HTML only after window load + idle, with a reserved box to avoid CLS.
 */
export function useAfterLoad(delay = 300): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let t: number | undefined
    const go = () => {
      const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
      t = window.setTimeout(() => (idle ? idle(() => setReady(true), { timeout: 2000 }) : setReady(true)), delay)
    }
    if (document.readyState === "complete") go()
    else window.addEventListener("load", go, { once: true })
    return () => {
      window.removeEventListener("load", go)
      if (t) window.clearTimeout(t)
    }
  }, [delay])
  return ready
}

export function AfterLoadHtml({ html, className, minHeight = 80 }: { html: string; className?: string; minHeight?: number }) {
  const ready = useAfterLoad()
  if (!html) return null
  return ready ? (
    <div className={className} dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <div className={className} style={{ minHeight }} aria-hidden="true" />
  )
}
