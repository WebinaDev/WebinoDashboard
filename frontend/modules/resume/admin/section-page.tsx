import type { ResolvedAdminRoute } from "@/kernel/types"

import Client from "./section-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <Client route={route} />
}
