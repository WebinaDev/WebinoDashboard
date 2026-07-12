import { Suspense } from "react"

import { PageSkeleton } from "@/components/PageSkeleton"
import { createPage } from "@/lib/create-page"

const CheckoutPage = createPage(() => import("@/pages/CheckoutPage"))

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CheckoutPage />
    </Suspense>
  )
}
