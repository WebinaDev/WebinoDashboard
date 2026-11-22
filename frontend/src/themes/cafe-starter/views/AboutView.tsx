"use client"

import Image from "next/image"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { AtSign, Clock, MapPin, Navigation, Phone, UtensilsCrossed } from "lucide-react"

import { MapPinPicker } from "@/components/MapPinPickerLazy"

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

export function AboutView({ venue: rawVenue }: Props) {
  const t = useTranslations("cafe_starter")
  const locale = useLocale()
  // The venue payload is assembled from several module settings, so any one of them can be
  // absent. Default every sub-object once here instead of guarding each dereference below —
  // a missing `tenant` used to throw and blank the whole About page.
  const tenant = rawVenue?.tenant ?? { name: "", active_theme_slug: null }
  const settings = rawVenue?.venue ?? ({} as NonNullable<CafeVenuePayload["venue"]>)
  const gallery = rawVenue?.gallery ?? ({} as NonNullable<CafeVenuePayload["gallery"]>)
  const hours = rawVenue?.hours ?? ({} as NonNullable<CafeVenuePayload["hours"]>)
  const venue = { ...rawVenue, tenant, venue: settings, gallery, hours }

  const skin = resolveCafeSkin(tenant.active_theme_slug)
  const layout = cafeSkinLayout(skin)
  const scheme = useSkinScheme(skin)

  const about = localized(locale, settings.about_fa, settings.about_en)
  const address = localized(locale, settings.address_fa, settings.address_en)
  const tagline = localized(locale, settings.tagline_fa, settings.tagline_en)
  const images = [...(gallery.images ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const cover = images[0]?.url ?? null
  const days = [...(hours.days ?? [])].sort(
    (a, b) => DAY_KEYS.indexOf(a.day as (typeof DAY_KEYS)[number]) - DAY_KEYS.indexOf(b.day as (typeof DAY_KEYS)[number]),
  )
  const dayLabel = (day: string) =>
    (DAY_KEYS as readonly string[]).includes(day) ? t(`days.${day as (typeof DAY_KEYS)[number]}`) : day
  const location = rawVenue?.ordering?.cafe_location ?? null
  // Exact pin from settings (cafe_lat/cafe_lng) beats a text search link.
  const mapHref = location
    ? `https://neshan.org/maps/@${location.lat},${location.lng},17z`
    : settings.map_url || null
  const instagram = settings.instagram
    ? settings.instagram.startsWith("http")
      ? settings.instagram
      : `https://instagram.com/${settings.instagram.replace(/^@/, "")}`
    : null

  return (
    <div className="cafe-shell cafe-about" data-skin={skin} data-layout={layout} data-scheme={scheme}>
      <section className="cafe-about-hero" style={cover ? undefined : { background: placeholderFor(tenant.name) }}>
        {cover ? <Image src={cover} alt="" fill priority className="cafe-about-hero-img" unoptimized /> : null}
        <div className="cafe-about-hero-copy">
          <h1>{tenant.name}</h1>
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
                {days.map((day) => {
                  // Zero-length range (00:00–00:00) is a closed day, same as the order gate.
                  const closed = Boolean(day.closed) || Boolean(day.open && day.open === day.close)
                  return (
                  <li key={day.day}>
                    <span>{dayLabel(day.day)}</span>
                    <span data-closed={closed ? "true" : "false"}>
                      {closed
                        ? t("closed")
                        : day.open && day.close
                          ? t("hours_range", { open: digits(day.open, locale), close: digits(day.close, locale) })
                          : t("hours_not_set")}
                    </span>
                  </li>
                  )
                })}
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
              {location ? <MapPinPicker value={location} readOnly height={180} labels={{ failed: t("map_cta") }} /> : null}
              {mapHref ? (
                <a href={mapHref} target="_blank" rel="noreferrer" className="cafe-ghost-btn">
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
