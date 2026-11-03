"use client"

import { useCallback, useEffect, useState } from "react"

/** Persist a boolean open/collapsed preference in localStorage. */
export function usePersistedOpen(storageKey: string, defaultOpen = true): [boolean, (next: boolean) => void] {
  const [open, setOpenState] = useState(defaultOpen)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (raw === "1") setOpenState(true)
      else if (raw === "0") setOpenState(false)
    } catch {
      /* ignore */
    }
  }, [storageKey])

  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next)
      try {
        window.localStorage.setItem(storageKey, next ? "1" : "0")
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  )

  return [open, setOpen]
}
