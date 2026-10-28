"use client"

import { createContext, useContext, useMemo, type ReactNode } from "react"
import { useSearchParams } from "next/navigation"

/** Archive scope from a pretty URL (/{category}/, /برند/{brand}/, /برچسب/{tag}/) — merged under the query string. */
export type ArchiveScope = { category?: string; brand?: string; tag?: string; title?: string }

const ArchiveScopeContext = createContext<ArchiveScope>({})

export function ArchiveScopeProvider({ scope, children }: { scope: ArchiveScope; children: ReactNode }) {
  return <ArchiveScopeContext.Provider value={scope}>{children}</ArchiveScopeContext.Provider>
}

export function useArchiveScope(): ArchiveScope {
  return useContext(ArchiveScopeContext)
}

/** `useSearchParams()` plus the pretty-URL scope, so filters/catalog hooks work on root category/brand URLs. */
export function useArchiveParams(): URLSearchParams {
  const params = useSearchParams()
  const scope = useArchiveScope()
  return useMemo(() => {
    const merged = new URLSearchParams(params?.toString() ?? "")
    for (const key of ["category", "brand", "tag"] as const) {
      const v = scope[key]
      if (v && !merged.get(key)) merged.set(key, v)
    }
    return merged
  }, [params, scope])
}
