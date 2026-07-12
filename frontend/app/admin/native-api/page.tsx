import { createPage } from "@/lib/create-page"

const NativeContractPage = createPage(() => import("@/pages/NativeContractPage"))

export default function Page() {
  return <NativeContractPage />
}
