import type { ResolvedAdminRoute } from "@/kernel/types"

import AttributesPageClient from "./attributes-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <AttributesPageClient route={route} />
}
