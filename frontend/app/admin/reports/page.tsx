import { createPage } from "@/lib/create-page"

const CommerceReportsPage = createPage(() => import("@/pages/CommerceReportsPage"))

export default function Page() {
  return <CommerceReportsPage />
}
