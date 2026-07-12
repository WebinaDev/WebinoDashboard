import { createPage } from "@/lib/create-page"

const ModulesPage = createPage(() => import("@/pages/ModulesPage"))

export default function Page() {
  return <ModulesPage />
}
