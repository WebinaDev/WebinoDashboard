"use client"

import { useEffect, useState, type ReactNode } from "react"

import { pickVariant, storedVariant, type AbVariant } from "../ab"

function send(testId: number, variant: AbVariant, type: "view" | "conversion") {
  const base = process.env.NEXT_PUBLIC_API_URL ?? ""
  void fetch(`${base}/api/v1/public/builder/ab/${testId}/event`, {
    method: "POST",
    keepalive: true,
    headers: { "Content-Type": "application/json", Accept: "application/json", "X-Tenant-Domain": window.location.host },
    body: JSON.stringify({ variant, type }),
  }).catch(() => undefined)
}

/**
 * Shows the original (A) or the variant (B) page for a running A/B test. The server renders both; A is visible
 * until the visitor's sticky bucket is known. Conversions: any builder form success or a click on `.ab-goal`.
 */
export function AbSwitch({ testId, split, a, b }: { testId: number; split: number; a: ReactNode; b: ReactNode }) {
  const [variant, setVariant] = useState<AbVariant | null>(null)

  useEffect(() => {
    const key = `wb_ab_${testId}`
    let chosen: AbVariant
    try {
      chosen = storedVariant(window.localStorage.getItem(key)) ?? pickVariant(split, Math.random())
      window.localStorage.setItem(key, chosen)
    } catch {
      chosen = pickVariant(split, Math.random())
    }
    setVariant(chosen)
    try {
      if (!window.sessionStorage.getItem(`${key}_v`)) {
        window.sessionStorage.setItem(`${key}_v`, "1")
        send(testId, chosen, "view")
      }
    } catch {
      send(testId, chosen, "view")
    }
    const convert = () => {
      try {
        if (window.localStorage.getItem(`${key}_c`)) return
        window.localStorage.setItem(`${key}_c`, "1")
      } catch {
        /* count anyway */
      }
      send(testId, chosen, "conversion")
    }
    const onClick = (event: MouseEvent) => {
      if ((event.target as HTMLElement | null)?.closest?.(".ab-goal")) convert()
    }
    window.addEventListener("wb:form-success", convert)
    document.addEventListener("click", onClick, true)
    return () => {
      window.removeEventListener("wb:form-success", convert)
      document.removeEventListener("click", onClick, true)
    }
  }, [split, testId])

  return (
    <>
      <div hidden={variant === "b"}>{a}</div>
      {variant === "b" ? <div>{b}</div> : null}
    </>
  )
}
