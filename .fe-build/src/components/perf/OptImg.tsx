/* eslint-disable @next/next/no-img-element */
import type { ImgHTMLAttributes } from "react"

import { optImg } from "@/lib/image-url"

type Props = ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }

/**
 * Theme <img> replacement: routes through the central optimizer (WebP via /_next/image or imgproxy,
 * responsive srcSet/sizes) and defaults to lazy + async decoding. `priority` = eager + high fetch priority.
 */
export function OptImg({ priority, loading, decoding, alt, src, srcSet, sizes, ...rest }: Props) {
  const opt = typeof src === "string" && !srcSet ? optImg(src, sizes, priority) : { src, srcSet, sizes }
  return (
    <img
      {...rest}
      {...opt}
      alt={alt ?? ""}
      loading={priority ? "eager" : loading ?? "lazy"}
      decoding={decoding ?? "async"}
      {...(priority ? { fetchPriority: "high" as const } : {})}
    />
  )
}
