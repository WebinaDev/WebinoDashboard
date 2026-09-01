import { notFound } from "next/navigation"

import { fetchAboutData } from "@/kernel/cafe-catalogue-data"
import { AboutView } from "@/themes/cafe-starter/views/AboutView"
import type { ResolvedSiteRoute } from "@/kernel/types"

export const revalidate = 60

export default async function Page(_props: { route: ResolvedSiteRoute }) {
  const venue = await fetchAboutData()

  if (!venue || venue.venue.mini_site_enabled === false) {
    notFound()
  }

  return <AboutView venue={venue} />
}
