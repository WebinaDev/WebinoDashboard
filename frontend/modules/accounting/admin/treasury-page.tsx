import type { ResolvedAdminRoute } from "@/kernel/types"

import PageClient from "./treasury-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <PageClient route={route} />
}
