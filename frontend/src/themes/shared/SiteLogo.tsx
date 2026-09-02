"use client"

import Image from "next/image"
import Link from "next/link"
import { useTheme } from "next-themes"

type SiteLogoProps = {
  siteName: string
  logoUrl?: string | null
  logoDarkUrl?: string | null
  href?: string
}

export function SiteLogo({
  siteName,
  logoUrl,
  logoDarkUrl,
  href = "/",
}: SiteLogoProps) {
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme === "dark"
  const src = dark && logoDarkUrl ? logoDarkUrl : logoUrl

  if (src) {
    return (
      <Link href={href} className="inline-flex items-center">
        <Image
          src={src}
          alt={siteName}
          width={140}
          height={40}
          className="h-8 w-auto object-contain"
          unoptimized
        />
      </Link>
    )
  }

  return (
    <Link href={href} className="text-lg font-semibold tracking-tight">
      {siteName}
    </Link>
  )
}
