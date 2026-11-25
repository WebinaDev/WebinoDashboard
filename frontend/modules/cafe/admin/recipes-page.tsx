import type { ResolvedAdminRoute } from "@/kernel/types"

import RecipesPageClient from "./recipes-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <RecipesPageClient route={route} />
}
