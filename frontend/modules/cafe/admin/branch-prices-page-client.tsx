"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

import { CafeAdminShell, CafeEmptyState, CafeSection } from "./cafe-admin-ui"

/**
 * Price overrides per branch.
 *
 * A chain charges more at the airport and less at the kiosk. `POST /cafe/branch-prices`
 * has existed since the multi-branch work, and the till applies an override when it
 * exists — but nothing in the dashboard could create one, so every branch charged the
 * catalogue price. This is the screen that makes the feature reachable.
 *
 * Scope: one branch, one product, an optional sale price. Editing an existing row is the
 * same request — the controller upserts on (branch, product, variant), so re-saving the
 * same pair replaces its price instead of failing on a duplicate.
 *
 * The list below is the branch's current overrides, so an owner can see what is overridden
 * before adding another one — and clear the stale ones without hunting for their ids.
 */

type Branch = { id: number; name: string }
type Product = { id: number; name: string; price_minor: number | null }

type Override = {
  id: number
  branch_id: number
  product_id: number
  price_minor: number | null
  sale_price_minor: number | null
  is_available: boolean
}

export default function BranchPricesPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("cafe_admin.branch_prices")
  const tCommon = useTranslations("common")
  const queryClient = useQueryClient()

  const [branchId, setBranchId] = useState("")
  const [productId, setProductId] = useState("")
  const [price, setPrice] = useState("")
  const [salePrice, setSalePrice] = useState("")

  const branches = useQuery({
    queryKey: ["cafe-branches"],
    queryFn: () => api<Branch[]>("/api/v1/cafe/branches"),
  })

  const products = useQuery({
    queryKey: ["cafe-branch-price-products"],
    queryFn: () => api<Product[]>("/api/v1/products"),
  })

  const save = useMutation({
    mutationFn: () =>
      api<Override>("/api/v1/cafe/branch-prices", {
        method: "POST",
        json: {
          branch_id: Number(branchId),
          product_id: Number(productId),
          // Both prices are minor units (the ERP-wide convention): a blank field means
          // "fall back to the catalogue", which the API expresses as null, not 0.
          price_minor: price.trim() === "" ? null : Number(price),
          sale_price_minor: salePrice.trim() === "" ? null : Number(salePrice),
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["cafe-branch-prices"] })
      setProductId("")
      setPrice("")
      setSalePrice("")
      toast.success(t("saved"))
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const remove = useMutation({
    mutationFn: (id: number) =>
      api<{ data: unknown }>(`/api/v1/cafe/branch-prices/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["cafe-branch-prices"] })
      toast.success(tCommon("deleted"))
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const canSave = branchId !== "" && productId !== "" && !save.isPending

  return (
    <CafeAdminShell title={t("title")} description={t("description")}>
      <CafeSection title={t("section_add")} description={t("section_add_hint")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("branch")}</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger>
                <SelectValue placeholder={t("choose_branch")} />
              </SelectTrigger>
              <SelectContent>
                {(branches.data ?? []).map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t("product")}</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger>
                <SelectValue placeholder={t("choose_product")} />
              </SelectTrigger>
              <SelectContent>
                {(products.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bp-price">{t("price")}</Label>
            <Input
              id="bp-price"
              type="number"
              min={0}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder={t("price_placeholder")}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bp-sale">{t("sale_price")}</Label>
            <Input
              id="bp-sale"
              type="number"
              min={0}
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
              placeholder={t("sale_price_placeholder")}
            />
          </div>
        </div>

        <Button onClick={() => save.mutate()} disabled={!canSave} className="mt-4">
          {save.isPending ? tCommon("saving") : tCommon("save")}
        </Button>
      </CafeSection>

      <CafeSection title={t("section_existing")}>
        <OverrideList
          branchId={branchId}
          products={products.data ?? []}
          onRemove={(id) => remove.mutate(id)}
        />
      </CafeSection>
    </CafeAdminShell>
  )
}

/**
 * The overrides for the selected branch.
 *
 * Its own component because the query is keyed on `branchId` — picking a branch should
 * show what that branch charges today before the owner types a new price.
 */
function OverrideList({
  branchId,
  products,
  onRemove,
}: {
  branchId: string
  products: Product[]
  onRemove: (id: number) => void
}) {
  const t = useTranslations("cafe_admin.branch_prices")
  const tCommon = useTranslations("common")

  const nameOf = (id: number) => products.find((p) => p.id === id)?.name ?? `#${id}`

  const { data, isLoading } = useQuery({
    queryKey: ["cafe-branch-prices", branchId],
    queryFn: () => api<Override[]>(`/api/v1/cafe/branch-prices?branch_id=${encodeURIComponent(branchId)}`),
    enabled: branchId !== "",
  })

  if (branchId === "") {
    return <p className="text-muted-foreground text-sm">{t("pick_branch_first")}</p>
  }

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
  }

  if (!data || data.length === 0) {
    return <CafeEmptyState message={`${t("empty")} — ${t("empty_hint")}`} />
  }

  return (
    <ul className="divide-y">
      {data.map((row) => (
        <li key={row.id} className="flex items-center justify-between gap-3 py-2 text-sm">
          <span className="tabular-nums">{row.price_minor === null ? "—" : row.price_minor}</span>
          <span className="text-muted-foreground truncate">{nameOf(row.product_id)}</span>
          <Button variant="ghost" size="sm" onClick={() => onRemove(row.id)}>
            {tCommon("delete")}
          </Button>
        </li>
      ))}
    </ul>
  )
}
