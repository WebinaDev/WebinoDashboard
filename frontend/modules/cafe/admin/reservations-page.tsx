import type { ResolvedAdminRoute } from "@/kernel/types"

import ReservationsPageClient from "./reservations-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <ReservationsPageClient route={route} />
}
