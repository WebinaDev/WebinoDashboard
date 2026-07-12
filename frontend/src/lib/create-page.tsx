import dynamic from "next/dynamic"
import type { ComponentType } from "react"

import { PageSkeleton } from "@/components/PageSkeleton"

export function createPage(
  importer: () => Promise<{ default: ComponentType }>,
) {
  return dynamic(importer, {
    loading: () => <PageSkeleton />,
  })
}
