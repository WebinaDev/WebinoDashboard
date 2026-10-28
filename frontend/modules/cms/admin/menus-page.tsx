import type { ResolvedAdminRoute } from "@/kernel/types"

import MenusPageClient from "./menus-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <MenusPageClient route={route} />
}
