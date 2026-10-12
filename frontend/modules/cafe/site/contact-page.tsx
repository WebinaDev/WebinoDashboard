import { notFound } from "next/navigation"

import { fetchCafeContact } from "@/kernel/cafe-catalogue-data"
import type { ResolvedSiteRoute } from "@/kernel/types"
import { getServerTranslations } from "@/lib/server-translations"
import { ContactView } from "@/themes/cafe-starter/views/ContactView"
import type { CafeContactPayload } from "@/themes/cafe-starter/types"

// Settings edits must show at once: no ISR, no data cache (the API answers no-store too).
export const dynamic = "force-dynamic"

const DAY_SCHEMA: Record<string, string> = {
  sat: "Saturday",
  sun: "Sunday",
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
}

function jsonLd(data: CafeContactPayload) {
  const c = data.contact
  const base = data.tenant.domain ? `https://${data.tenant.domain}` : undefined
  const sameAs = [c.instagram, c.telegram, c.whatsapp, c.bale, c.website, ...data.socials.map((s) => s.url)]
    .filter((u): u is string => Boolean(u && /^https?:\/\//.test(u)))
  const hours = data.hours.days
    .filter((d) => !d.closed && d.open && d.close)
    .map((d) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: `https://schema.org/${DAY_SCHEMA[d.day.slice(0, 3).toLowerCase()] ?? d.day}`,
      opens: d.open,
      closes: d.close,
    }))
  return {
    "@context": "https://schema.org",
    "@type": "CafeOrCoffeeShop",
    name: data.tenant.name,
    ...(base ? { url: base, "@id": `${base}/#cafe` } : {}),
    ...(data.tenant.logo_url ? { image: data.tenant.logo_url, logo: data.tenant.logo_url } : {}),
    ...(data.tagline_fa ? { description: data.tagline_fa } : {}),
    ...(c.phone ? { telephone: c.phone } : {}),
    ...(c.email ? { email: c.email } : {}),
    ...(c.address_fa ? { address: { "@type": "PostalAddress", streetAddress: c.address_fa, addressCountry: "IR" } } : {}),
    ...(data.location ? { geo: { "@type": "GeoCoordinates", latitude: data.location.lat, longitude: data.location.lng } } : {}),
    ...(hours.length ? { openingHoursSpecification: hours } : {}),
    ...(sameAs.length ? { sameAs } : {}),
    ...(base ? { hasMenu: `${base}/catalogue` } : {}),
  }
}

export default async function ContactPage(_props: { route: ResolvedSiteRoute }) {
  const data = await fetchCafeContact()
  if (!data) notFound()

  const t = await getServerTranslations("cafe_starter.contact")
  const title = t("meta_title", { name: data.tenant.name })
  const description = data.tagline_fa || t("meta_description", { name: data.tenant.name })
  const canonical = data.tenant.domain ? `https://${data.tenant.domain}/contact` : undefined
  // JSON-LD is serialised data, never markup: escape "<" so a field cannot close the script tag.
  const ld = JSON.stringify(jsonLd(data)).replace(/</g, "\\u003c")

  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content="website" />
      {data.tenant.logo_url ? <meta property="og:image" content={data.tenant.logo_url} /> : null}
      {canonical ? <link rel="canonical" href={canonical} /> : null}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld }} />
      <ContactView data={data} />
    </>
  )
}
