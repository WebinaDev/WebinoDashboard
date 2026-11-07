"use client"

import type { ResolvedAdminRoute } from "@/kernel/types"

import PoetryAdminPage from "./poetry-page"

export default function PoetryShortPage(props: { route?: ResolvedAdminRoute }) {
  return <PoetryAdminPage {...props} flag="is_short" />
}
