"use client"

import Link from "next/link"
import { useLocale } from "next-intl"
import type { ReactNode } from "react"

import { CurrencyMark } from "@/components/CurrencyMark"
import { formatNumber, normalizeUiLocale, toLocaleDigits } from "@/lib/locale"

import { IconChevronLeft } from "./icons"

/** Persian-digit number formatter bound to the active UI locale. */
export function useDigits() {
  const locale = useLocale()
  return (value: number) => formatNumber(Math.max(0, Math.round(value)), normalizeUiLocale(locale))
}

/** Toman amount + glyph (currentColor mask) — classic price atom. */
export function ClassicAmount({ value, className }: { value: number; className?: string }) {
  const digits = useDigits()
  return (
    <span className={`sfc-amount ${className ?? ""}`}>
      <bdi>{digits(value)}</bdi>
      <CurrencyMark symbol="toman-1" className="sfc-amount__glyph" alt="تومان" />
    </span>
  )
}

export function ClassicPrice({ price, compare, size = "md" }: { price: number; compare?: number; size?: "md" | "lg" }) {
  const digits = useDigits()
  const off = compare && compare > price ? Math.round((1 - price / compare) * 100) : 0
  return (
    <div className={`sfc-price sfc-price--${size}`}>
      {off > 0 ? (
        <div className="sfc-price__old">
          <del>{digits(compare ?? 0)}</del>
          <span className="sfc-price__off">{digits(off)}٪</span>
        </div>
      ) : null}
      <ClassicAmount value={price} className="sfc-price__now" />
    </div>
  )
}

/** Section header: title | hairline | «مشاهده همه» + pink chevron chip. */
export function ClassicSectionHead({
  title,
  href,
  more = "مشاهده همه",
  icon,
  tone = "light",
}: {
  title: string
  href?: string
  more?: string
  icon?: ReactNode
  tone?: "light" | "muted"
}) {
  return (
    <div className={`sfc-head ${tone === "muted" ? "sfc-head--muted" : ""}`}>
      <h2 className="sfc-head__title">
        {icon ? <span className="sfc-head__icon">{icon}</span> : null}
        <span>{title}</span>
      </h2>
      {href ? (
        <Link href={href} className="sfc-head__more">
          <span>{more}</span>
          <i className="sfc-chip-arrow" aria-hidden="true">
            <IconChevronLeft size={14} />
          </i>
        </Link>
      ) : null}
    </div>
  )
}

export function ClassicRating({ value }: { value?: number }) {
  const locale = useLocale()
  const rating = typeof value === "number" && value > 0 ? value : 0
  const label = toLocaleDigits(rating.toFixed(1), locale)
  return (
    <span className="sfc-rating">
      <span>{label}</span>
      <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#f9bc00" d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9L12 2.8Z" />
      </svg>
    </span>
  )
}

export function ClassicContainer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`sfc-container ${className ?? ""}`}>{children}</div>
}

/** Push a product slug onto the shared recently-viewed list (localStorage). */
export function rememberViewedProduct(slug: string) {
  if (typeof window === "undefined" || !slug) return
  try {
    const raw = window.localStorage.getItem("wb_recently_viewed")
    const prev = raw ? (JSON.parse(raw) as unknown) : []
    const list = Array.isArray(prev) ? prev.filter((s): s is string => typeof s === "string" && s !== slug) : []
    window.localStorage.setItem("wb_recently_viewed", JSON.stringify([slug, ...list].slice(0, 12)))
  } catch {
    /* storage unavailable */
  }
}
