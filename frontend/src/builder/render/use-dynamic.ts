"use client"

import { useEffect, useMemo, useState } from "react"

import { dynamicNeeds, resolveProps, type DynamicData } from "../dynamic"
import { propStr } from "../props"
import type { WidgetNode } from "../types"
import { useBuilderRuntime } from "./runtime"

type RawProduct = Record<string, unknown>

const rawCache = new Map<string, Promise<RawProduct | null>>()
function fetchRawProduct(slug: string): Promise<RawProduct | null> {
  const hit = rawCache.get(slug)
  if (hit) return hit
  const base = process.env.NEXT_PUBLIC_API_URL ?? ""
  const job = fetch(`${base}/api/v1/public/catalog/items/${encodeURIComponent(slug)}`, { credentials: "include" })
    .then((res) => (res.ok ? res.json() : null))
    .then((json: { data?: RawProduct } | null) => (json?.data && typeof json.data === "object" ? json.data : null))
    .catch(() => null)
  rawCache.set(slug, job)
  return job
}

let userJob: Promise<string> | null = null
function fetchUserName(): Promise<string> {
  if (!userJob) {
    const base = process.env.NEXT_PUBLIC_API_URL ?? ""
    userJob = fetch(`${base}/api/v1/auth/user`, { credentials: "include", headers: { Accept: "application/json" } })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { data?: { name?: unknown } } | null) => (typeof json?.data?.name === "string" ? json.data.name : ""))
      .catch(() => "")
  }
  return userJob
}

function str(value: unknown): string {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : ""
}

/** Resolves Dynamic Tag bindings on a widget's props (product/user are fetched only when bound). */
export function useResolvedWidget(widget: WidgetNode): WidgetNode {
  const runtime = useBuilderRuntime()
  const needs = useMemo(() => dynamicNeeds(widget.props), [widget.props])
  const slug = propStr(widget.props, "slug", "") || runtime.productSlug || ""
  const [product, setProduct] = useState<RawProduct | null>(null)
  const [userName, setUserName] = useState("")
  const [docTitle, setDocTitle] = useState("")

  useEffect(() => {
    if (!needs.product || !slug) return
    let cancel = false
    void fetchRawProduct(slug).then((row) => {
      if (!cancel) setProduct(row)
    })
    return () => {
      cancel = true
    }
  }, [needs.product, slug])

  useEffect(() => {
    if (!needs.user) return
    let cancel = false
    void fetchUserName().then((name) => {
      if (!cancel) setUserName(name)
    })
    return () => {
      cancel = true
    }
  }, [needs.user])

  useEffect(() => {
    if (!runtime.pageTitle && typeof document !== "undefined") setDocTitle(document.title)
  }, [runtime.pageTitle])

  return useMemo(() => {
    const images = Array.isArray(product?.images) ? product.images : []
    const firstImage = images.find((item) => typeof item === "string" || (item && typeof item === "object"))
    const image =
      str(product?.image) ||
      str(product?.image_url) ||
      (typeof firstImage === "string" ? firstImage : str((firstImage as Record<string, unknown> | undefined)?.url))
    const data: DynamicData = {
      siteName: runtime.siteName,
      logoUrl: runtime.logoUrl,
      pageTitle: runtime.pageTitle || docTitle,
      userName,
      product: product
        ? { name: str(product.name) || str(product.title), slug: str(product.slug) || slug, price: Number(product.price ?? product.sale_price ?? 0) || undefined, image: image || null }
        : null,
      custom: { ...(product ?? {}), ...(runtime.customFields ?? {}) },
    }
    const props = resolveProps(widget.props, data)
    return props === widget.props ? widget : { ...widget, props }
  }, [docTitle, product, runtime.customFields, runtime.logoUrl, runtime.pageTitle, runtime.siteName, slug, userName, widget])
}
