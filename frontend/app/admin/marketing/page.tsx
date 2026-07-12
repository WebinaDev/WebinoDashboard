import { createPage } from "@/lib/create-page"

const CommerceMarketingPage = createPage(
  () => import("@/pages/CommerceMarketingPage"),
)

export default function Page() {
  return <CommerceMarketingPage />
}
