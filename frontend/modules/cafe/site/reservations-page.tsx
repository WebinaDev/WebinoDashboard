import { preferBuilderPage } from "@/kernel/prefer-builder-page"
import type { ResolvedSiteRoute } from "@/kernel/types"

import ReservationsFormClient from "./reservations-form-client"

export const dynamic = "force-dynamic"

export default async function Page(props: { route: ResolvedSiteRoute }) {
  return preferBuilderPage("reservations", <ReservationsFormClient route={props.route} />)
}
