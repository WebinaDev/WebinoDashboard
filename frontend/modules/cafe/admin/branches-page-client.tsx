"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, Building2, Check, Plus, Trash2 } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { toLocaleDigits } from "@/lib/locale"

import { CafeAdminShell, CafeEmptyState, CafeSection, cafeSelectClass } from "../../cafe/admin/cafe-admin-ui"

type Branch = { id: number; name_fa: string; name_en?: string | null; slug: string; is_active: boolean }

type Settings = {
  enabled: boolean
  pricing_mode: string
  stock_mode: string
  offline_sales: string
  require_branch_selection: boolean
  flag_oversold: boolean
  require_station_for_kds: boolean
}

type SettingsPayload = { settings: Settings; defaults: Settings; branches: Branch[] }

type StockRow = {
  id: number
  product_id: number
  product_name: string | null
  variant_name: string | null
  sku: string | null
  quantity: number
  reserved_quantity: number
  available: number
  reorder_level: number | null
  is_negative: boolean
}

type OversoldOrder = {
  id: number
  number: string | null
  branch: string | null
  total_minor: number
  stock_oversold_at: string | null
}

export default function BranchSettingsPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("cafe_admin.branches")
  const locale = useLocale()
  const queryClient = useQueryClient()

  const [selectedBranch, setSelectedBranch] = useState<number | null>(null)
  const [lowOnly, setLowOnly] = useState(false)
  const [countProduct, setCountProduct] = useState("")
  const [countQty, setCountQty] = useState("")
  const [newBranchFa, setNewBranchFa] = useState("")
  const [newBranchEn, setNewBranchEn] = useState("")

  const payload = useQuery({
    queryKey: ["cafe-branch-settings"],
    queryFn: async () => {
      // `api()` already unwraps the Webina envelope; the payload IS the controller's data.
      const res = await api<SettingsPayload>("/api/v1/cafe/branch-settings")
      return res ?? null
    },
  })

  const branches = payload.data?.branches ?? []
  const settings = payload.data?.settings ?? null
  const activeBranch = selectedBranch ?? branches[0]?.id ?? null

  const stock = useQuery({
    queryKey: ["cafe-branch-stock", activeBranch, lowOnly],
    enabled: activeBranch !== null,
    queryFn: async () => {
      const params = new URLSearchParams({ branch_id: String(activeBranch) })
      if (lowOnly) params.set("low_only", "1")
      const res = await api<StockRow[]>(`/api/v1/cafe/branch-stock?${params.toString()}`)
      return res ?? []
    },
  })

  const oversold = useQuery({
    queryKey: ["cafe-oversold-orders"],
    queryFn: async () => {
      const res = await api<OversoldOrder[]>("/api/v1/cafe/oversold-orders")
      return res ?? []
    },
  })

  const saveSettings = useMutation({
    mutationFn: (patch: Partial<Settings>) =>
      api("/api/v1/cafe/branch-settings", { method: "PUT", json: patch }),
    onSuccess: () => {
      toast.success(t("saved"))
      void queryClient.invalidateQueries({ queryKey: ["cafe-branch-settings"] })
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const createBranch = useMutation({
    mutationFn: () =>
      api("/api/v1/cafe/branches", {
        method: "POST",
        json: { name_fa: newBranchFa.trim(), name_en: newBranchEn.trim() || newBranchFa.trim() },
      }),
    onSuccess: () => {
      setNewBranchFa("")
      setNewBranchEn("")
      toast.success(t("branch_created"))
      void queryClient.invalidateQueries({ queryKey: ["cafe-branch-settings"] })
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const deleteBranch = useMutation({
    mutationFn: (id: number) => api(`/api/v1/cafe/branches/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(t("branch_deleted"))
      void queryClient.invalidateQueries({ queryKey: ["cafe-branch-settings"] })
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const setCount = useMutation({
    mutationFn: () =>
      api("/api/v1/cafe/branch-stock/count", {
        method: "POST",
        json: {
          branch_id: activeBranch,
          product_id: Number(countProduct),
          quantity: Number(countQty),
        },
      }),
    onSuccess: () => {
      setCountProduct("")
      setCountQty("")
      toast.success(t("count_saved"))
      void queryClient.invalidateQueries({ queryKey: ["cafe-branch-stock"] })
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const negativeCount = (stock.data ?? []).filter((r) => r.is_negative).length

  return (
    <CafeAdminShell title={t("title")} description={t("description")}>
      <CafeSection
        title={t("branches_title")}
        description={t("branches_description")}
        actions={
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void queryClient.invalidateQueries({ queryKey: ["cafe-branch-settings"] })}
          >
            {t("refresh")}
          </Button>
        }
      >
        {branches.length === 0 ? (
          <CafeEmptyState message={t("no_branches")} />
        ) : (
          <ul className="divide-y rounded-lg border">
            {branches.map((branch) => (
              <li key={branch.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <button
                  type="button"
                  className="flex min-w-0 items-center gap-2 text-start"
                  onClick={() => setSelectedBranch(branch.id)}
                >
                  <Building2 className="text-muted-foreground size-4 shrink-0" />
                  <span className="truncate text-sm font-medium">{branch.name_fa}</span>
                  {activeBranch === branch.id ? <Badge variant="secondary">{t("selected")}</Badge> : null}
                  {!branch.is_active ? <Badge variant="outline">{t("inactive")}</Badge> : null}
                </button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={t("delete_branch")}
                  disabled={branches.length <= 1 || deleteBranch.isPending}
                  onClick={() => deleteBranch.mutate(branch.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <div className="space-y-1">
            <Label htmlFor="branch-fa">{t("branch_name_fa")}</Label>
            <Input id="branch-fa" value={newBranchFa} onChange={(e) => setNewBranchFa(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="branch-en">{t("branch_name_en")}</Label>
            <Input id="branch-en" value={newBranchEn} onChange={(e) => setNewBranchEn(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              disabled={newBranchFa.trim() === "" || createBranch.isPending}
              onClick={() => createBranch.mutate()}
            >
              <Plus className="size-4" />
              {t("add_branch")}
            </Button>
          </div>
        </div>
      </CafeSection>

      <CafeSection title={t("mode_title")} description={t("mode_description")}>
        {settings === null ? (
          <p className="text-muted-foreground text-sm">{t("loading")}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="pricing-mode">{t("pricing_mode")}</Label>
              <select
                id="pricing-mode"
                className={cafeSelectClass}
                value={settings.pricing_mode}
                onChange={(e) => saveSettings.mutate({ pricing_mode: e.target.value })}
              >
                <option value="shared_with_overrides">{t("pricing_shared_overrides")}</option>
                <option value="shared">{t("pricing_shared")}</option>
                <option value="per_branch">{t("pricing_per_branch")}</option>
              </select>
              <p className="text-muted-foreground text-xs">{t("pricing_hint")}</p>
            </div>

            <div className="space-y-1">
              <Label htmlFor="stock-mode">{t("stock_mode")}</Label>
              <select
                id="stock-mode"
                className={cafeSelectClass}
                value={settings.stock_mode}
                onChange={(e) => saveSettings.mutate({ stock_mode: e.target.value })}
              >
                <option value="per_branch">{t("stock_per_branch")}</option>
                <option value="shared">{t("stock_shared")}</option>
              </select>
              <p className="text-muted-foreground text-xs">{t("stock_hint")}</p>
            </div>

            <div className="space-y-1">
              <Label htmlFor="offline-mode">{t("offline_mode")}</Label>
              <select
                id="offline-mode"
                className={cafeSelectClass}
                value={settings.offline_sales}
                onChange={(e) => saveSettings.mutate({ offline_sales: e.target.value })}
              >
                <option value="allow_negative">{t("offline_allow_negative")}</option>
                <option value="block">{t("offline_block")}</option>
              </select>
              <p className="text-muted-foreground text-xs">{t("offline_hint")}</p>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={settings.require_branch_selection}
                  onChange={(e) => saveSettings.mutate({ require_branch_selection: e.target.checked })}
                />
                {t("require_branch_selection")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={settings.flag_oversold}
                  onChange={(e) => saveSettings.mutate({ flag_oversold: e.target.checked })}
                />
                {t("flag_oversold")}
              </label>
            </div>
          </div>
        )}
      </CafeSection>

      <CafeSection
        title={t("stock_title")}
        description={t("stock_description")}
        actions={
          <label className="text-muted-foreground flex items-center gap-2 text-xs">
            <input type="checkbox" className="size-3.5" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
            {t("low_only")}
          </label>
        }
      >
        {branches.length === 0 ? (
          <CafeEmptyState message={t("no_branches")} />
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-40 space-y-1">
                <Label htmlFor="stock-branch">{t("branch")}</Label>
                <select
                  id="stock-branch"
                  className={cafeSelectClass}
                  value={activeBranch ?? ""}
                  onChange={(e) => setSelectedBranch(Number(e.target.value))}
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name_fa}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="count-product">{t("count_product_id")}</Label>
                <Input
                  id="count-product"
                  inputMode="numeric"
                  className="w-28"
                  value={countProduct}
                  onChange={(e) => setCountProduct(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="count-qty">{t("count_quantity")}</Label>
                <Input
                  id="count-qty"
                  inputMode="numeric"
                  className="w-28"
                  value={countQty}
                  onChange={(e) => setCountQty(e.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={countProduct === "" || countQty === "" || setCount.isPending}
                onClick={() => setCount.mutate()}
              >
                <Check className="size-4" />
                {t("save_count")}
              </Button>
            </div>

            {negativeCount > 0 ? (
              <p className="text-destructive flex items-center gap-2 text-xs">
                <AlertTriangle className="size-4" />
                {t("negative_warning", { count: negativeCount })}
              </p>
            ) : null}

            {stock.isPending ? (
              <p className="text-muted-foreground text-sm">{t("loading")}</p>
            ) : (stock.data ?? []).length === 0 ? (
              <CafeEmptyState message={t("no_stock")} />
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground text-xs">
                    <tr>
                      <th className="px-3 py-2 text-start font-medium">{t("col_product")}</th>
                      <th className="px-3 py-2 text-start font-medium">{t("col_sku")}</th>
                      <th className="px-3 py-2 text-start font-medium">{t("col_quantity")}</th>
                      <th className="px-3 py-2 text-start font-medium">{t("col_reserved")}</th>
                      <th className="px-3 py-2 text-start font-medium">{t("col_available")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(stock.data ?? []).map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="px-3 py-2">
                          {row.product_name}
                          {row.variant_name ? <span className="text-muted-foreground"> — {row.variant_name}</span> : null}
                        </td>
                        <td className="text-muted-foreground px-3 py-2 font-mono text-xs">{row.sku ?? "—"}</td>
                        <td className={row.is_negative ? "text-destructive px-3 py-2 font-mono" : "px-3 py-2 font-mono"}>
                          {toLocaleDigits(String(row.quantity ?? 0), locale)}
                        </td>
                        <td className="px-3 py-2 font-mono">{toLocaleDigits(String(row.reserved_quantity ?? 0), locale)}</td>
                        <td className="px-3 py-2 font-mono">{toLocaleDigits(String(row.available ?? 0), locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </CafeSection>

      <CafeSection title={t("oversold_title")} description={t("oversold_description")}>
        {(oversold.data ?? []).length === 0 ? (
          <CafeEmptyState message={t("oversold_empty")} />
        ) : (
          <ul className="divide-y rounded-lg border">
            {(oversold.data ?? []).map((order) => (
              <li key={order.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="font-medium">{order.number ?? `#${order.id}`}</span>
                <span className="text-muted-foreground text-xs">{order.branch ?? "—"}</span>
                <Badge variant="destructive">{t("oversold_badge")}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CafeSection>
    </CafeAdminShell>
  )
}
