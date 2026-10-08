"use client"

import Image from "next/image"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { AtSign, Clock, MapPin, Navigation, Phone, UtensilsCrossed } from "lucide-react"

import { digits, placeholderFor } from "../lib/helpers"
import { useSkinScheme } from "../lib/useSkinScheme"
import { cafeSkinLayout, resolveCafeSkin } from "../skin"
import "../menu.css"
import "../skins/item-page.css"
import type { CafeVenuePayload } from "../types"

type Props = {
  venue: CafeVenuePayload
}

const DAY_KEYS = ["saturday", "sunday", "monday", "tuesday", "wednesday", "thursday", "friday"] as const

function localized(locale: string, fa?: string | null, en?: string | null) {
  const value = locale === "fa" ? fa ?? en : en ?? fa
  return value?.trim() ? value : null
}

export function AboutView({ venue }: Props) {
  const t = useTranslations("cafe_starter")
  const locale = useLocale()
  const skin = resolveCafeSkin(venue.tenant.active_theme_slug)
  const layout = cafeSkinLayout(skin)
  const scheme = useSkinScheme(skin)

  const about = localized(locale, venue.venue.about_fa, venue.venue.about_en)
  const address = localized(locale, venue.venue.address_fa, venue.venue.address_en)
  const tagline = localized(locale, venue.venue.tagline_fa, venue.venue.tagline_en)
  const images = [...(venue.gallery.images ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const cover = images[0]?.url ?? null
  const days = [...(venue.hours.days ?? [])].sort(
    (a, b) => DAY_KEYS.indexOf(a.day as (typeof DAY_KEYS)[number]) - DAY_KEYS.indexOf(b.day as (typeof DAY_KEYS)[number]),
  )
  const dayLabel = (day: string) =>
    (DAY_KEYS as readonly string[]).includes(day) ? t(`days.${day as (typeof DAY_KEYS)[number]}`) : day
  const instagram = venue.venue.instagram
    ? venue.venue.instagram.startsWith("http")
      ? venue.venue.instagram
      : `https://instagram.com/${venue.venue.instagram.replace(/^@/, "")}`
    : null

  return (
    <div className="cafe-shell cafe-about" data-skin={skin} data-layout={layout} data-scheme={scheme}>
      <section className="cafe-about-hero" style={cover ? undefined : { background: placeholderFor(venue.tenant.name) }}>
        {cover ? <Image src={cover} alt="" fill priority className="cafe-about-hero-img" unoptimized /> : null}
        <div className="cafe-about-hero-copy">
          <h1>{venue.tenant.name}</h1>
          {tagline ? <p>{tagline}</p> : null}
          <Link href="/catalogue" className="cafe-primary-btn">
            <UtensilsCrossed className="size-4" />
            {t("back_to_menu")}
          </Link>
        </div>
      </section>

      <div className="cafe-about-body">
        {about ? (
          <section className="cafe-about-card cafe-about-story">
            <h2>{t("about_heading")}</h2>
            <p>{about}</p>
          </section>
        ) : null}

        <div className="cafe-about-grid">
          {days.length ? (
            <section className="cafe-about-card">
              <h2>
                <Clock className="size-5" />
                {t("hours_heading")}
              </h2>
              <ul className="cafe-about-hours">
                {days.map((day) => (
                  <li key={day.day}>
                    <span>{dayLabel(day.day)}</span>
                    <span data-closed={day.closed ? "true" : "false"}>
                      {day.closed
                        ? t("closed")
                        : day.open && day.close
                          ? t("hours_range", { open: digits(day.open, locale), close: digits(day.close, locale) })
                          : t("hours_not_set")}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="cafe-about-card">
            <h2>{t("contact_heading")}</h2>
            <div className="cafe-about-contact">
              {venue.venue.phone ? (
                <a href={`tel:${venue.venue.phone}`}>
                  <Phone className="size-4" />
                  <span dir="ltr">{digits(venue.venue.phone, locale)}</span>
                </a>
              ) : null}
              {instagram ? (
                <a href={instagram} target="_blank" rel="noreferrer">
                  <AtSign className="size-4" />
                  <span dir="ltr">{venue.venue.instagram}</span>
                </a>
              ) : null}
              {address ? (
                <p>
                  <MapPin className="size-4 shrink-0" />
                  <span>{address}</span>
                </p>
              ) : null}
              {venue.venue.map_url ? (
                <a href={venue.venue.map_url} target="_blank" rel="noreferrer" className="cafe-ghost-btn">
                  <Navigation className="size-4" />
                  {t("map_cta")}
                </a>
              ) : null}
            </div>
          </section>
        </div>

        {images.length > 0 ? (
          <section className="cafe-about-gallery-wrap">
            <h2>{t("gallery_heading")}</h2>
            <div className="cafe-about-gallery">
              {images.map((img, idx) => {
                const caption = localized(locale, img.caption_fa, img.caption_en)
                return (
                  <figure key={`${img.url}-${idx}`}>
                    <div className="cafe-about-gallery-media">
                      <Image src={img.url} alt={caption ?? ""} fill className="object-cover" unoptimized />
                    </div>
                    {caption ? <figcaption>{caption}</figcaption> : null}
                  </figure>
                )
              })}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}
