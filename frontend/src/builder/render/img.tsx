"use client"

import type { ImgHTMLAttributes } from "react"

import { useBuilderGlobals } from "./runtime"

type Props = ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }

/** Shared builder image: lazy + async decoding by default (globals.images.lazy), eager when `priority`. */
export function Img({ priority, loading, decoding, alt, ...rest }: Props) {
  const globals = useBuilderGlobals()
  const lazy = globals.images?.lazy !== false
  const mode = priority ? "eager" : loading ?? (lazy ? "lazy" : "eager")
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...rest}
      alt={alt ?? ""}
      loading={mode}
      decoding={decoding ?? "async"}
      {...(priority ? { fetchPriority: "high" as const } : {})}
    />
  )
}
