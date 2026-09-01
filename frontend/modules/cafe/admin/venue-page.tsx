import type { ResolvedAdminRoute } from "@/kernel/types"

import VenuePageClient from "./venue-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <VenuePageClient route={route} />
}
