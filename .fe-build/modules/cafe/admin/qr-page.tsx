import type { ResolvedAdminRoute } from "@/kernel/types"

import QrPageClient from "./qr-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <QrPageClient route={route} />
}
