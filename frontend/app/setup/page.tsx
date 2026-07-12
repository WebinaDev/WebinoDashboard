import { createPage } from "@/lib/create-page"

const SetupWizardPage = createPage(() => import("@/pages/SetupWizardPage"))

export default function SetupPage() {
  return <SetupWizardPage />
}
