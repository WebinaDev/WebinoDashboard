"use client"

import type { ResolvedAdminRoute } from "@/kernel/types"

import { PoetryBooksAdmin } from "./poetry-collections-admin"

export default function PoetryBooksPage(_props: { route: ResolvedAdminRoute }) {
  return <PoetryBooksAdmin />
}
