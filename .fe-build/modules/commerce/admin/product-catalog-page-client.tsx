"use client"

import { useMutation, useQuery } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { MoneyDisplay } from "@/components/currency/MoneyDisplay"
import { PageShell } from "@/components/PageShell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type CatalogSourceMeta = {
  key: string
  status: "ready" | "stub" | "needs_credentials" | string
  label: string
  hint: string
  settings_path?: string | null
}

type CatalogItem = {
  id: string
  source: string
  title: string
  brand?: string
  description?: string
  sku?: string
  image_url?: string
  url?: string
  price_minor?: number
  currency?: string
}

type SearchResult = {
  items: CatalogItem[]
  page: number
  has_more: boolean
  status: string
  message?: string | null
  source: string
  query: string
}

/**
 * External product database browser + importer (`/dashboard/product-catalog`).
 * Searches Digikala / Torob / Technolife (and extensible sources) and imports into local products.
 * Local product management stays on `/dashboard/products`.
 */
export default function ProductCatalogPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("store")
  const tNav = useTranslations("nav")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const router = useRouter()

  const [source, setSource] = useState("digikala")
  const [q, setQ] = useState("")
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<CatalogItem[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [searched, setSearched] = useState(false)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [importingId, setImportingId] = useState<string | null>(null)

  const sourcesQ = useQuery({
    queryKey: ["product-catalog-sources", locale],
    queryFn: () => api<CatalogSourceMeta[]>(`/api/v1/product-catalog/sources?locale=${encodeURIComponent(locale)}`),
  })

  const sources = sourcesQ.data ?? []
  const activeMeta = useMemo(() => sources.find((s) => s.key === source) ?? null, [sources, source])

  const searchMut = useMutation({
    mutationFn: (opts: { page: number; append: boolean; source: string; q: string }) =>
      api<SearchResult>(
        `/api/v1/product-catalog/search?source=${encodeURIComponent(opts.source)}&q=${encodeURIComponent(opts.q)}&page=${opts.page}`,
      ),
    onSuccess: (res, vars) => {
      setSearched(true)
      setHasMore(Boolean(res.has_more))
      setPage(res.page)
      setItems((prev) => (vars.append ? [...prev, ...(res.items ?? [])] : (res.items ?? [])))
      setStatusMsg(res.message ?? null)
      if (
        !(res.items ?? []).length &&
        !vars.append &&
        (res.status === "stub" || res.status === "needs_credentials")
      ) {
        toast.message(res.message || t("catalog_ext_stub"))
      }
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const importMut = useMutation({
    mutationFn: (item: CatalogItem) => {
      setImportingId(item.id)
      return api<{ id: number }>(
        "/api/v1/product-catalog/import",
        {
          method: "POST",
          json: {
            source: item.source || source,
            id: item.id,
            name: item.title,
            title: item.title,
            sku: item.sku || null,
            price_minor: item.price_minor ?? 0,
            image_url: item.image_url || null,
            url: item.url || null,
            brand: item.brand || null,
            description: item.description || null,
          },
        },
      )
    },
    onSuccess: (product) => {
      toast.success(t("catalog_import_success"))
      setImportingId(null)
      router.push(`/dashboard/products/${product.id}`)
    },
    onError: (e: Error) => {
      setImportingId(null)
      toast.error(getApiErrorMessage(e))
    },
  })

  function runSearch() {
    const term = q.trim()
    if (!term) {
      toast.message(t("catalog_ext_empty_query"))
      return
    }
    setPage(1)
    searchMut.mutate({ page: 1, append: false, source, q: term })
  }

  return (
    <PageShell
      title={tNav("product_catalog")}
      description={t("catalog_ext_subtitle")}
      actions={
        <div className="flex flex-wrap gap-2">
          {activeMeta?.settings_path &&
          (activeMeta.status === "needs_credentials" || activeMeta.status === "stub") ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/dashboard/${activeMeta.settings_path}`}>{t("catalog_ext_settings")}</Link>
            </Button>
          ) : null}
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/products">{t("catalog_ext_local_link")}</Link>
          </Button>
        </div>
      }
    >
      <div className="flex flex-wrap gap-2">
        {(sources.length
          ? sources
          : [{ key: "digikala", label: "Digikala", status: "ready", hint: "", settings_path: null }]
        ).map((s) => (
          <Button
            key={s.key}
            type="button"
            size="sm"
            variant={source === s.key ? "default" : "outline"}
            onClick={() => {
              setSource(s.key)
              setItems([])
              setSearched(false)
              setStatusMsg(null)
              setPage(1)
            }}
          >
            {s.label}
            {s.status === "stub" || s.status === "needs_credentials" ? (
              <Badge variant="secondary" className="ms-2">
                {s.status === "needs_credentials" ? t("catalog_ext_creds_badge") : t("catalog_ext_stub_badge")}
              </Badge>
            ) : null}
          </Button>
        ))}
      </div>

      {activeMeta?.hint ? <p className="text-muted-foreground text-sm leading-relaxed">{activeMeta.hint}</p> : null}
      {activeMeta?.settings_path && activeMeta.status === "needs_credentials" ? (
        <p className="text-sm">
          <Link className="text-primary underline-offset-4 hover:underline" href={`/dashboard/${activeMeta.settings_path}`}>
            {t("catalog_ext_settings")}
          </Link>
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <div className="space-y-1.5">
          <Label htmlFor="ext-catalog-q">{t("catalog_ext_search_label")}</Label>
          <Input
            id="ext-catalog-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("catalog_ext_search_ph")}
            onKeyDown={(e) => {
              if (e.key === "Enter") runSearch()
            }}
          />
        </div>
        <div className="flex items-end">
          <Button type="button" className="w-full md:w-auto" disabled={searchMut.isPending || !q.trim()} onClick={runSearch}>
            {searchMut.isPending ? tCommon("loading") : t("catalog_ext_search")}
          </Button>
        </div>
      </div>

      {statusMsg ? <p className="text-muted-foreground text-sm">{statusMsg}</p> : null}

      {searchMut.isPending && !items.length ? (
        <p className="text-muted-foreground text-sm">{t("catalog_ext_searching")}</p>
      ) : null}

      {searched && !searchMut.isPending && !items.length ? (
        <p className="text-muted-foreground text-sm">{t("catalog_ext_empty")}</p>
      ) : null}

      {searchMut.isError ? (
        <p className="text-destructive text-sm">{getApiErrorMessage(searchMut.error)}</p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <Card key={`${item.source}-${item.id}`} className="overflow-hidden">
            <CardContent className="flex gap-3 p-3">
              <div className="bg-muted size-20 shrink-0 overflow-hidden rounded-md">
                {item.image_url ? (
                  // Remote marketplace thumbnails — URL import is intentional (not MediaPicker).
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.image_url} alt="" className="size-full object-cover" loading="lazy" />
                ) : (
                  <div className="text-muted-foreground flex size-full items-center justify-center text-xs">—</div>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="line-clamp-2 text-sm font-medium leading-snug">{item.title}</p>
                {item.brand ? <p className="text-muted-foreground truncate text-xs">{item.brand}</p> : null}
                {item.price_minor != null && item.price_minor > 0 ? (
                  <p className="text-sm font-medium">
                    <MoneyDisplay amount={item.price_minor} currency={item.currency || "IRT"} />
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    size="sm"
                    disabled={importMut.isPending && importingId === item.id}
                    onClick={() => importMut.mutate(item)}
                  >
                    {importingId === item.id ? tCommon("loading") : t("catalog_ext_import")}
                  </Button>
                  {item.url ? (
                    <Button asChild size="sm" variant="ghost">
                      <a href={item.url} target="_blank" rel="noreferrer">
                        {t("catalog_ext_open_source")}
                      </a>
                    </Button>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {hasMore ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            disabled={searchMut.isPending}
            onClick={() => searchMut.mutate({ page: page + 1, append: true, source, q: q.trim() })}
          >
            {t("catalog_ext_load_more")}
          </Button>
        </div>
      ) : null}
    </PageShell>
  )
}
