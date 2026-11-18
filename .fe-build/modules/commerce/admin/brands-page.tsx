import type { ResolvedAdminRoute } from "@/kernel/types"

import BrandsPageClient from "./brands-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <BrandsPageClient route={route} />
}
