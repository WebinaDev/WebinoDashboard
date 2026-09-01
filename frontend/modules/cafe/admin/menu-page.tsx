import type { ResolvedAdminRoute } from "@/kernel/types"

import MenuPageClient from "./menu-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <MenuPageClient route={route} />
}
