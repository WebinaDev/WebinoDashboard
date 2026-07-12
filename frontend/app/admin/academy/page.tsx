import { createPage } from "@/lib/create-page"

const AcademyAdminPage = createPage(() =>
  import("@/pages/admin/AcademyAdminPage").then((m) => ({ default: m.AcademyAdminPage })),
)

export default function Page() {
  return <AcademyAdminPage />
}
