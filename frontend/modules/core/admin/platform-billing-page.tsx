"use client"

import PageClient from "./platform-billing-page-client"

import type { ResolvedAdminRoute } from "@/kernel/types"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <PageClient route={route} />
}
