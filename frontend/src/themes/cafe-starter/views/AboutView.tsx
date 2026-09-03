"use client"

import Image from "next/image"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { Clock, ExternalLink, MapPin, Phone } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import type { CafeVenuePayload } from "../types"

type Props = {
  venue: CafeVenuePayload
}

function localized(locale: string, fa?: string | null, en?: string | null) {
  const value = locale === "fa" ? fa ?? en : en ?? fa
  return value?.trim() ? value : null
}

export function AboutView({ venue }: Props) {
  const t = useTranslations("cafe_starter")
  const locale = useLocale()

  const about = localized(locale, venue.venue.about_fa, venue.venue.about_en)
  const address = localized(locale, venue.venue.address_fa, venue.venue.address_en)
  const tagline = localized(locale, venue.venue.tagline_fa, venue.venue.tagline_en)
  const images = [...(venue.gallery.images ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  )

  return (
    <div className="container mx-auto px-4 py-10">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-3xl font-bold">{venue.tenant.name}</h1>
        {tagline ? <p className="text-muted-foreground mt-2">{tagline}</p> : null}
      </div>

      {about ? (
        <section className="mx-auto mt-10 max-w-3xl">
          <h2 className="text-xl font-semibold">{t("about_heading")}</h2>
          <p className="text-muted-foreground mt-3 whitespace-pre-line leading-relaxed">{about}</p>
        </section>
      ) : null}

      {images.length > 0 ? (
        <section className="mt-12">
          <h2 className="mb-4 text-center text-xl font-semibold">{t("gallery_heading")}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {images.map((img, idx) => {
              const caption = localized(locale, img.caption_fa, img.caption_en)
              return (
                <figure key={`${img.url}-${idx}`} className="overflow-hidden rounded-xl">
                  <div className="bg-muted relative aspect-[4/3]">
                    <Image src={img.url} alt={caption ?? ""} fill className="object-cover" unoptimized />
                  </div>
                  {caption ? (
                    <figcaption className="text-muted-foreground mt-2 text-center text-sm">{caption}</figcaption>
                  ) : null}
                </figure>
              )
            })}
          </div>
        </section>
      ) : null}

      <div className="mt-12 grid gap-4 md:grid-cols-2">
        {venue.hours.days?.length ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock className="size-5" />
                {t("hours_heading")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {venue.hours.days.map((day) => (
                <div key={day.day} className="flex justify-between gap-4">
                  <span className="font-medium">{day.day}</span>
                  <span className="text-muted-foreground">
                    {day.closed
                      ? t("closed")
                      : day.open && day.close
                        ? `${day.open} – ${day.close}`
                        : t("hours_not_set")}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("contact_heading")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {venue.venue.phone ? (
              <a href={`tel:${venue.venue.phone}`} className="flex items-center gap-2 hover:underline">
                <Phone className="size-4" />
                {venue.venue.phone}
              </a>
            ) : null}
            {venue.venue.instagram ? (
              <a
                href={venue.venue.instagram.startsWith("http") ? venue.venue.instagram : `https://instagram.com/${venue.venue.instagram.replace(/^@/, "")}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 hover:underline"
              >
                <ExternalLink className="size-4" />
                {venue.venue.instagram}
              </a>
            ) : null}
            {address ? (
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0" />
                {address}
              </p>
            ) : null}
            {venue.venue.map_url ? (
              <Button asChild variant="outline" size="sm" className="mt-2">
                <a href={venue.venue.map_url} target="_blank" rel="noreferrer">
                  {t("map_cta")}
                </a>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="mt-10 text-center">
        <Button asChild>
          <Link href="/catalogue">{t("back_to_menu")}</Link>
        </Button>
      </div>
    </div>
  )
}
