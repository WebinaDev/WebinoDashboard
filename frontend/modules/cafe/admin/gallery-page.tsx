import type { ResolvedAdminRoute } from "@/kernel/types"

import GalleryPageClient from "./gallery-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <GalleryPageClient route={route} />
}
