import type { ResolvedAdminRoute } from "@/kernel/types"

import MediaPageClient from "./media-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <MediaPageClient route={route} />
}
