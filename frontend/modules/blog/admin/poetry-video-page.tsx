"use client"

import type { ResolvedAdminRoute } from "@/kernel/types"

import { PoetryMediaAdmin } from "./poetry-media-admin"

export default function PoetryVideoPage(_props: { route: ResolvedAdminRoute }) {
  return <PoetryMediaAdmin kind="video" />
}
