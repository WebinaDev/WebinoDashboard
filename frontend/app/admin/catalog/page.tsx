import { createPage } from "@/lib/create-page"

const CatalogPage = createPage(() => import("@/pages/CatalogPage"))

export default function Page() {
  return <CatalogPage />
}
