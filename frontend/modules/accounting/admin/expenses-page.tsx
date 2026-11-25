import type { ResolvedAdminRoute } from "@/kernel/types"

import PageClient from "./expenses-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <PageClient route={route} />
}
