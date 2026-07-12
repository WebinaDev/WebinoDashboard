import { createPage } from "@/lib/create-page"

const UsersPage = createPage(() => import("@/pages/UsersPage"))

export default function Page() {
  return <UsersPage />
}
