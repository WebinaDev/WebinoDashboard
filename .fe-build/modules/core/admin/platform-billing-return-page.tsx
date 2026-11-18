"use client"

import PageClient from "./platform-billing-return-page-client"

import type { ResolvedAdminRoute } from "@/kernel/types"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <PageClient route={route} />
}
