import { createPage } from "@/lib/create-page"

const PortfolioAdminPage = createPage(() =>
  import("@/pages/admin/PortfolioAdminPage").then((m) => ({ default: m.PortfolioAdminPage })),
)

export default function Page() {
  return <PortfolioAdminPage />
}
