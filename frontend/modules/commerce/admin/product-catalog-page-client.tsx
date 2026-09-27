"use client"

import { useMutation, useQuery } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"

import { PageShell } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

export default function ProductCatalogPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("account_portal")
  const tNav = useTranslations("nav")
  const [q, setQ] = useState("")
  const [importName, setImportName] = useState("")
  const [importSku, setImportSku] = useState("")
  const [importPrice, setImportPrice] = useState("0")

  const searchQ = useQuery({
    queryKey: ["product-catalog", q],
    queryFn: () => api<{ local: Array<{ id: number; name: string; sku?: string }>; external: unknown[] }>(`/api/v1/product-catalog/search?q=${encodeURIComponent(q)}`),
    enabled: q.length >= 1,
  })

  const importM = useMutation({
    mutationFn: () =>
      api("/api/v1/product-catalog/import", {
        method: "POST",
        json: {
          name: importName,
          sku: importSku || null,
          price_minor: Number(importPrice) || 0,
        },
      }),
    onSuccess: () => {
      toast.success(tNav("product_catalog"))
      setImportName("")
      setImportSku("")
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  return (
    <PageShell title={tNav("product_catalog")}>
      <div className="mb-6 max-w-xl space-y-2">
        <Label>{t("search_catalog")}</Label>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="SKU / name" />
        <ul className="text-sm">
          {(searchQ.data?.local ?? []).map((p) => (
            <li key={p.id} className="border-b py-1">
              {p.name} {p.sku ? `· ${p.sku}` : ""}
            </li>
          ))}
        </ul>
      </div>
      <div className="max-w-xl space-y-3 rounded-lg border p-4">
        <p className="font-medium">{t("import_product")}</p>
        <Input placeholder={t("import_name")} value={importName} onChange={(e) => setImportName(e.target.value)} />
        <Input placeholder={t("import_sku")} value={importSku} onChange={(e) => setImportSku(e.target.value)} />
        <Input placeholder={t("import_price")} value={importPrice} onChange={(e) => setImportPrice(e.target.value)} />
        <Button type="button" disabled={!importName || importM.isPending} onClick={() => void importM.mutateAsync()}>
          {t("import_product")}
        </Button>
      </div>
    </PageShell>
  )
}
