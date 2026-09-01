import type { ResolvedAdminRoute } from "@/kernel/types"

import CatalogPageClient from "./catalog-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <CatalogPageClient route={route} />
}
