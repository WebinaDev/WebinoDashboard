import { Suspense } from "react"

import ChangePasswordPage from "@/views/ChangePasswordPage"

export default function ChangePasswordRoute() {
  return (
    <Suspense fallback={null}>
      <ChangePasswordPage />
    </Suspense>
  )
}
