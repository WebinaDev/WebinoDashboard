import type { ResolvedAdminRoute } from "@/kernel/types"

import PageClient from "./sms-send-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <PageClient route={route} />
}
