"use client"

import type { ResolvedAdminRoute } from "@/kernel/types"

import TicketsPage from "./tickets-page"

export default function SupportInboxPage({ route }: { route: ResolvedAdminRoute }) {
  return <TicketsPage route={route} forceStatus="open" />
}
