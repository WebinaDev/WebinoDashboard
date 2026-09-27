"use client"

import type { ResolvedAdminRoute } from "@/kernel/types"

import PageClient from "./account-ticket-detail-page-client"

export default function AccountTicketDetailPage({ route }: { route: ResolvedAdminRoute }) {
  return <PageClient route={route} />
}
