"use client"

import type { ResolvedAdminRoute } from "@/kernel/types"
import { BuilderEditor } from "@/builder/editor/BuilderEditor"

export default function BuilderEditorPage({ route }: { route: ResolvedAdminRoute }) {
  if (route.path === "theme-builder/:kind/:templateId") {
    const templateKind = route.params?.kind || "header"
    const raw = route.params?.templateId
    const id = raw && raw !== "new" && Number.isFinite(Number(raw)) ? Number(raw) : "new"
    return <BuilderEditor mode={{ kind: "theme", templateKind, id }} />
  }
  if (route.path === "builder/chrome/:kind") {
    const chrome = route.params?.kind === "footer" ? "footer" : "header"
    return <BuilderEditor mode={{ kind: "chrome", chrome }} />
  }
  if (route.path === "builder/product/:productId") {
    const id = Number(route.params?.productId)
    return <BuilderEditor mode={{ kind: "product", id: Number.isFinite(id) ? id : 0 }} />
  }
  if (route.path === "builder/post/:postId") {
    const id = Number(route.params?.postId)
    return <BuilderEditor mode={{ kind: "post", id: Number.isFinite(id) ? id : 0 }} />
  }
  if (route.path === "builder/article/:articleId") {
    const id = Number(route.params?.articleId)
    return <BuilderEditor mode={{ kind: "article", id: Number.isFinite(id) ? id : 0 }} />
  }
  if (route.path === "builder/new" || route.params?.pageId === "new") {
    return <BuilderEditor mode={{ kind: "page", id: "new" }} />
  }
  const id = Number(route.params?.pageId)
  return <BuilderEditor mode={{ kind: "page", id: Number.isFinite(id) ? id : "new" }} />
}
