import { createPage } from "@/lib/create-page"

const CommerceCmsPage = createPage(() => import("@/pages/CommerceCmsPage"))

export default function Page() {
  return <CommerceCmsPage />
}
