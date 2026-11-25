import type { ResolvedAdminRoute } from "@/kernel/types"

import MenuImportPageClient from "./menu-import-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <MenuImportPageClient route={route} />
}
