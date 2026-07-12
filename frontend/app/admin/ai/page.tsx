import { createPage } from "@/lib/create-page"

const AiRecommendationsPage = createPage(() => import("@/pages/AiRecommendationsPage"))

export default function Page() {
  return <AiRecommendationsPage />
}
