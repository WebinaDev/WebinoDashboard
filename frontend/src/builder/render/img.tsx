"use client"

import type { ImgHTMLAttributes } from "react"

import { optImg } from "@/lib/image-url"

import { useBuilderGlobals } from "./runtime"

type Props = ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }

/** Shared builder image: lazy + async decoding by default (globals.images.lazy), eager when `priority`. */
export function Img({ priority, loading, decoding, alt, src, srcSet, sizes, ...rest }: Props) {
  const opt = typeof src === "string" && !srcSet ? optImg(src, sizes, priority) : { src, srcSet, sizes }
  const globals = useBuilderGlobals()
  const lazy = globals.images?.lazy !== false
  const mode = priority ? "eager" : loading ?? (lazy ? "lazy" : "eager")
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...rest}
      {...opt}
      alt={alt ?? ""}
      loading={mode}
      decoding={decoding ?? "async"}
      {...(priority ? { fetchPriority: "high" as const } : {})}
    />
  )
}
