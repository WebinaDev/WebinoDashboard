import { Suspense } from "react"

import LoginPage from "@/views/LoginPage"

export const dynamic = "force-dynamic"

export default function LoginRoute() {
  return (
    <Suspense fallback={null}>
      <LoginPage />
    </Suspense>
  )
}
