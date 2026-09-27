"use client"

import type { ResolvedAdminRoute } from "@/kernel/types"

import PageClient from "./users-comments-page-client"

export default function UsersCommentsPage({ route }: { route: ResolvedAdminRoute }) {
  return <PageClient route={route} />
}
