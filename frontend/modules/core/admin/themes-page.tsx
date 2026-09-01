import type { ResolvedAdminRoute } from "@/kernel/types"

import ThemesPageClient from "./themes-page-client"

export default function ThemesPage({ route }: { route: ResolvedAdminRoute }) {
  return <ThemesPageClient route={route} />
}
