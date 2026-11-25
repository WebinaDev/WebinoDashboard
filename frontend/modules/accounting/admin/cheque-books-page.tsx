import type { ResolvedAdminRoute } from "@/kernel/types"

import PageClient from "./cheque-books-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <PageClient route={route} />
}
