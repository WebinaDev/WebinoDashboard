"use client"

import { useEffect, useState } from "react"

import { readScheme } from "./helpers"
import type { CafeMenuSkin } from "../skin"

/** Light/dark preference for standalone cafe pages (about, item), shared with the catalogue via localStorage. */
export function useSkinScheme(skin: CafeMenuSkin) {
  const [scheme, setScheme] = useState<"light" | "dark">("light")

  useEffect(() => {
    const stored = readScheme()
    if (stored) setScheme(stored)
    else if (skin === "cafe-signature" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) setScheme("dark")
  }, [skin])

  useEffect(() => {
    document.documentElement.dataset.cafeScheme = scheme
  }, [scheme])

  return scheme
}
