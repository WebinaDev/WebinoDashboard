"use client"

import type { ResolvedAdminRoute } from "@/kernel/types"

import { PoetryHighlightsAdmin } from "./poetry-collections-admin"

export default function PoetryHighlightsPage(_props: { route: ResolvedAdminRoute }) {
  return <PoetryHighlightsAdmin />
}
