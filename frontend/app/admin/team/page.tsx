import { createPage } from "@/lib/create-page"

const TeamAdminPage = createPage(() =>
  import("@/pages/admin/TeamAdminPage").then((m) => ({ default: m.TeamAdminPage })),
)

export default function Page() {
  return <TeamAdminPage />
}
