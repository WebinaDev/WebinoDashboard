"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { MoneyText } from "@/components/currency/MoneyDisplay"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api, type ApiListPayload } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { asArray } from "@/lib/list-utils"
import { toLocaleDigits } from "@/lib/locale"

import { CafeAdminShell, CafeEmptyState, CafeSection, cafeSelectClass } from "./cafe-admin-ui"

type OverviewRow = {
  id: number
  name: string
  price_minor: number
  unit_cost_minor: number
  has_recipe: boolean
  cost_is_estimated: boolean
  margin_percent: number | null
}

type RecipeLine = {
  id?: number
  component_type: string
  component_id: number
  quantity: number
  waste_percent: number
  unit?: string | null
  note?: string | null
  unit_cost_minor?: number
  line_cost_minor?: number
  cost_known?: boolean
}

type RecipeDetail = {
  product: { id: number; name: string; price_minor: number; cost_is_estimated: boolean }
  lines: RecipeLine[]
  unit_cost_minor: number
  complete: boolean
  margin: { gross_minor: number; margin_percent: number | null }
}

type StockRow = {
  subject_type: string
  subject_id: number
  name: string
  qty_on_hand: number
  unit?: string | null
  avg_cost_minor: number
  last_cost_minor: number
  reorder_point?: number | null
  needs_reorder: boolean
}

type DraftLine = { component_type: string; component_id: string; quantity: string; waste_percent: string; unit: string }

const BLANK_LINE: DraftLine = { component_type: "acc_product", component_id: "", quantity: "1", waste_percent: "0", unit: "" }

export default function RecipesPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("cafe_admin.recipes")
  const locale = useLocale()
  const queryClient = useQueryClient()

  const [selected, setSelected] = useState<number | null>(null)
  const [lines, setLines] = useState<DraftLine[]>([])
  const [search, setSearch] = useState("")

  const [receiveTarget, setReceiveTarget] = useState("")
  const [receiveQty, setReceiveQty] = useState("")
  const [receiveCost, setReceiveCost] = useState("")

  const overview = useQuery({
    queryKey: ["cafe-recipes-overview"],
    queryFn: async () => {
      // `api` returns the raw envelope here (no `data` unwrapping helper for meta), so read
      // both halves and let the list helper flatten `data`.
      const res = await api<ApiListPayload<OverviewRow[]>>("/api/v1/recipes/overview")
      // `meta` carries the rolled-up counts; the rows are the per-item table.
      const meta = (res?.meta ?? {}) as Record<string, number | null | undefined>
      return { rows: asArray<OverviewRow>(res), meta }
    },
  })

  const stock = useQuery({
    queryKey: ["cafe-stock-costing"],
    queryFn: async () => {
      const res = await api<{ data: StockRow[] }>("/api/v1/stock/costing")
      return res?.data ?? []
    },
    retry: false,
  })

  const recipe = useQuery({
    queryKey: ["cafe-recipe", selected],
    enabled: selected !== null,
    queryFn: async () => {
      const res = await api<{ data: RecipeDetail }>(`/api/v1/recipes/${selected}`)
      return res?.data ?? null
    },
  })

  // Seed the editor once per product. In an effect, not during render: a setState on every
  // render would loop, and a recipe the user is halfway through editing must not be reset by
  // a background refetch.
  const [seededFor, setSeededFor] = useState<number | null>(null)
  useEffect(() => {
    const detail = recipe.data
    if (!detail || detail.product.id === seededFor) return
    setSeededFor(detail.product.id)
    setLines(
      detail.lines.map((line) => ({
        component_type: line.component_type,
        component_id: String(line.component_id),
        quantity: String(line.quantity),
        waste_percent: String(line.waste_percent ?? 0),
        unit: line.unit ?? "",
      })),
    )
  }, [recipe.data, seededFor])

  const save = useMutation({
    mutationFn: () =>
      api(`/api/v1/recipes/${selected}`, {
        method: "PUT",
        json: {
          lines: lines
            .filter((line) => line.component_id.trim() !== "" && Number(line.quantity) > 0)
            .map((line) => ({
              component_type: line.component_type,
              component_id: Number(line.component_id),
              quantity: Number(line.quantity),
              waste_percent: Number(line.waste_percent) || 0,
              unit: line.unit || null,
            })),
        },
      }),
    onSuccess: async () => {
      toast.success(t("saved"))
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["cafe-recipe", selected] }),
        queryClient.invalidateQueries({ queryKey: ["cafe-recipes-overview"] }),
      ])
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const receive = useMutation({
    mutationFn: () =>
      api("/api/v1/stock/receive", {
        method: "POST",
        json: {
          subject_type: "acc_product",
          subject_id: Number(receiveTarget),
          quantity: Number(receiveQty),
          unit_cost_minor: Number(receiveCost),
        },
      }),
    onSuccess: async () => {
      toast.success(t("received"))
      setReceiveQty("")
      setReceiveCost("")
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["cafe-stock-costing"] }),
        queryClient.invalidateQueries({ queryKey: ["cafe-recipes-overview"] }),
      ])
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const filtered = (overview.data?.rows ?? []).filter((row) =>
    search.trim() === "" ? true : row.name.toLowerCase().includes(search.trim().toLowerCase()),
  )

  const detail = recipe.data

  return (
    <CafeAdminShell title={t("title")} description={t("description")}>
      {/* Where the menu stands. A recipe nobody built is a menu priced by feel. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={t("stat_products")} value={toLocaleDigits(overview.data?.meta?.products ?? 0, locale)} />
        <Stat label={t("stat_with_recipe")} value={toLocaleDigits(overview.data?.meta?.with_recipe ?? 0, locale)} />
        <Stat
          label={t("stat_average_margin")}
          value={
            overview.data?.meta?.average_margin_percent === null || overview.data?.meta?.average_margin_percent === undefined
              ? "—"
              : `${toLocaleDigits(String(overview.data.meta.average_margin_percent), locale)}٪`
          }
        />
      </div>

      <CafeSection
        title={t("menu_title")}
        description={t("menu_hint")}
        actions={
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("search")}
            className="w-44"
            aria-label={t("search")}
          />
        }
      >
        {overview.isLoading ? (
          <p className="text-muted-foreground text-sm">{t("loading")}</p>
        ) : filtered.length === 0 ? (
          <CafeEmptyState message={t("empty_menu")} />
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("col_item")}</TableHead>
                  <TableHead>{t("col_price")}</TableHead>
                  <TableHead>{t("col_cost")}</TableHead>
                  <TableHead>{t("col_margin")}</TableHead>
                  <TableHead>{t("col_recipe")}</TableHead>
                  <TableHead>{t("col_actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>
                      <MoneyText amount={row.price_minor} />
                    </TableCell>
                    <TableCell>
                      {row.unit_cost_minor > 0 ? (
                        <MoneyText amount={row.unit_cost_minor} />
                      ) : (
                        <span className="text-muted-foreground text-xs">{t("no_cost")}</span>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {row.margin_percent === null ? "—" : `${toLocaleDigits(String(row.margin_percent), locale)}٪`}
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.has_recipe ? "secondary" : "outline"}>
                        {row.has_recipe ? t("has_recipe") : t("no_recipe")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => setSelected(row.id)}>
                        {t("edit_recipe")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CafeSection>

      {selected !== null ? (
        <CafeSection
          title={`${t("editor_title")} — ${detail?.product.name ?? ""}`}
          description={t("editor_hint")}
          actions={
            <div className="flex items-center gap-2">
              {detail ? (
                <>
                  <Badge variant="outline">
                    {t("unit_cost")}: <MoneyText amount={detail.unit_cost_minor} />
                  </Badge>
                  <Badge variant={detail.complete ? "secondary" : "destructive"}>
                    {detail.complete ? t("cost_complete") : t("cost_incomplete")}
                  </Badge>
                </>
              ) : null}
              <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
                {t("save_recipe")}
              </Button>
            </div>
          }
        >
          <div className="space-y-2">
            {lines.map((line, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-6">
                <select
                  className={cafeSelectClass}
                  value={line.component_type}
                  onChange={(e) => {
                    const next = [...lines]
                    next[index] = { ...line, component_type: e.target.value }
                    setLines(next)
                  }}
                  aria-label={t("component_type")}
                >
                  <option value="acc_product">{t("type_stock_item")}</option>
                  <option value="product">{t("type_menu_item")}</option>
                  <option value="modifier_option">{t("type_addon")}</option>
                </select>
                <Input
                  value={line.component_id}
                  inputMode="numeric"
                  placeholder={t("component_id")}
                  onChange={(e) => {
                    const next = [...lines]
                    next[index] = { ...line, component_id: e.target.value }
                    setLines(next)
                  }}
                  aria-label={t("component_id")}
                />
                <Input
                  value={line.quantity}
                  inputMode="decimal"
                  placeholder={t("quantity")}
                  onChange={(e) => {
                    const next = [...lines]
                    next[index] = { ...line, quantity: e.target.value }
                    setLines(next)
                  }}
                  aria-label={t("quantity")}
                />
                <Input
                  value={line.waste_percent}
                  inputMode="decimal"
                  placeholder={t("waste")}
                  onChange={(e) => {
                    const next = [...lines]
                    next[index] = { ...line, waste_percent: e.target.value }
                    setLines(next)
                  }}
                  aria-label={t("waste")}
                />
                <Input
                  value={line.unit}
                  placeholder={t("unit")}
                  onChange={(e) => {
                    const next = [...lines]
                    next[index] = { ...line, unit: e.target.value }
                    setLines(next)
                  }}
                  aria-label={t("unit")}
                />
                <Button
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => setLines(lines.filter((_, i) => i !== index))}
                >
                  {t("remove")}
                </Button>
              </div>
            ))}

            <Button variant="outline" size="sm" onClick={() => setLines([...lines, { ...BLANK_LINE }])}>
              {t("add_line")}
            </Button>

            {/* Which ingredients could not be costed. This is the difference between a margin
                you can trust and one that is quietly too high. */}
            {detail && detail.lines.some((line) => line.cost_known === false) ? (
              <p className="text-destructive text-xs">{t("missing_costs")}</p>
            ) : null}
          </div>
        </CafeSection>
      ) : null}

      <CafeSection title={t("stock_title")} description={t("stock_hint")}>
        <div className="mb-3 grid gap-2 sm:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="receive-target">{t("component_id")}</Label>
            <Input
              id="receive-target"
              value={receiveTarget}
              inputMode="numeric"
              onChange={(e) => setReceiveTarget(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="receive-qty">{t("quantity")}</Label>
            <Input id="receive-qty" value={receiveQty} inputMode="decimal" onChange={(e) => setReceiveQty(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="receive-cost">{t("unit_cost")}</Label>
            <Input
              id="receive-cost"
              value={receiveCost}
              inputMode="numeric"
              onChange={(e) => setReceiveCost(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button
              onClick={() => receive.mutate()}
              disabled={receive.isPending || receiveTarget.trim() === "" || Number(receiveQty) <= 0}
            >
              {t("receive_btn")}
            </Button>
          </div>
        </div>

        {(stock.data?.length ?? 0) === 0 ? (
          <CafeEmptyState message={t("stock_empty")} />
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("col_item")}</TableHead>
                  <TableHead>{t("col_on_hand")}</TableHead>
                  <TableHead>{t("col_avg_cost")}</TableHead>
                  <TableHead>{t("col_last_cost")}</TableHead>
                  <TableHead>{t("col_status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stock.data!.map((row) => (
                  <TableRow key={`${row.subject_type}:${row.subject_id}`}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell className="tabular-nums">
                      {toLocaleDigits(String(row.qty_on_hand), locale)} {row.unit ?? ""}
                    </TableCell>
                    <TableCell>
                      <MoneyText amount={row.avg_cost_minor} />
                    </TableCell>
                    <TableCell>
                      <MoneyText amount={row.last_cost_minor} />
                    </TableCell>
                    <TableCell>
                      {row.needs_reorder ? (
                        <Badge variant="destructive">{t("reorder")}</Badge>
                      ) : row.qty_on_hand <= 0 ? (
                        <Badge variant="outline">{t("out_of_stock")}</Badge>
                      ) : (
                        <Badge variant="secondary">{t("healthy")}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CafeSection>
    </CafeAdminShell>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  )
}
