"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { formatDisplayDateTime } from "@/lib/format-date"
import { toLocaleDigits } from "@/lib/locale"
import { MoneyText } from "@/components/currency/MoneyDisplay"
import { SettleDialog } from "./settle-dialog"

import { CafeAdminShell, CafeEmptyState } from "./cafe-admin-ui"

/**
 * تابلوی همه سفارش‌ها — one wall with a column per stage.
 *
 * The workbench is a to-do list: it ranks what to do next and shows you the top of it. That is
 * the right shape for a rush and the wrong shape for the question "where is table six's food" —
 * which a manager asks by looking across the room, not by reading a ranked list. This board is
 * the same data laid out the way the room is: waiting, preparing, ready, served, waiting to pay.
 *
 * It moves nothing the workbench cannot move; it exists because the two questions are different.
 */

type BoardOrder = {
  id: number
  number: string | number
  status: string
  kitchen_status?: string | null
  fulfillment?: string | null
  table_number?: string | null
  customer_name?: string | null
  customer_phone?: string | null
  total_minor: number
  paid?: boolean
  created_at: string
  items?: { id: number; name?: string | null; product_name?: string | null; quantity: number }[]
  timing?: { elapsed_minutes?: number; overdue_minutes?: number; state?: string }
}

type WorkbenchPayload = {
  queue?: BoardOrder[]
  orders?: BoardOrder[]
  counts?: Record<string, number>
}

type Column = "waiting" | "preparing" | "ready" | "served" | "to_settle"

const COLUMNS: Column[] = ["waiting", "preparing", "ready", "served", "to_settle"]

/** Which column an order belongs in, from its status pair. Order matters: first match wins. */
function columnFor(order: BoardOrder): Column {
  if (!order.paid && ["served", "completed"].includes(String(order.status))) return "to_settle"
  if (order.paid && order.status !== "completed") return "to_settle"

  switch (String(order.kitchen_status ?? "")) {
    case "new":
    case "queued":
      return "waiting"
    case "preparing":
      return "preparing"
    case "ready":
      return "ready"
    case "served":
    case "done":
      return "served"
    default:
      break
  }

  switch (String(order.status)) {
    case "pending_payment":
    case "awaiting_gateway":
    case "on_hold":
      return "waiting"
    case "preparing":
      return "preparing"
    case "completed":
      return order.paid ? "served" : "to_settle"
    default:
      return "waiting"
  }
}

export default function OrderBoardPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("cafe_admin.order_board")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const queryClient = useQueryClient()

  const [branchId, setBranchId] = useState("")
  const [search, setSearch] = useState("")
  const [settling, setSettling] = useState<BoardOrder | null>(null)

  const board = useQuery({
    queryKey: ["cafe-order-board", branchId],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (branchId.trim() !== "") params.set("branch_id", branchId.trim())
      const res = await api<{ data: WorkbenchPayload }>(`/api/v1/cafe/workbench?${params.toString()}`)
      return res?.data ?? null
    },
    // A board on a wall is only useful if it is current; this is the cheap endpoint.
    refetchInterval: 10_000,
    retry: false,
  })

  const orders = useMemo(() => {
    const all = board.data?.queue ?? board.data?.orders ?? []
    const needle = search.trim().toLowerCase()

    return all
      .filter((order) => {
        if (needle === "") return true
        return (
          String(order.number).toLowerCase().includes(needle) ||
          String(order.table_number ?? "").toLowerCase().includes(needle) ||
          String(order.customer_name ?? "").toLowerCase().includes(needle) ||
          String(order.customer_phone ?? "").toLowerCase().includes(needle)
        )
      })
      .map((order) => ({ order, column: columnFor(order) }))
  }, [board.data, search])

  const byColumn = (column: Column) => orders.filter((row) => row.column === column)

  return (
    <CafeAdminShell title={t("title")} description={t("description")}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="board-branch">{t("branch")}</Label>
          <Input
            id="board-branch"
            className="w-28"
            inputMode="numeric"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            placeholder={t("all_branches")}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="board-search">{t("search")}</Label>
          <Input
            id="board-search"
            className="w-48"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("search_placeholder")}
          />
        </div>
        <p className="text-muted-foreground pb-2 text-xs">{t("live_hint")}</p>
      </div>

      {orders.length === 0 ? (
        <CafeEmptyState message={t("empty")} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-5">
          {COLUMNS.map((column) => {
            const rows = byColumn(column)

            return (
              <section key={column} className="rounded-xl border p-2">
                <header className="mb-2 flex items-center justify-between px-1">
                  <h2 className="text-sm font-medium">{t(`column_${column}`)}</h2>
                  <Badge variant="secondary">{toLocaleDigits(String(rows.length), locale)}</Badge>
                </header>

                <div className="space-y-2">
                  {rows.length === 0 ? (
                    <p className="text-muted-foreground px-1 text-xs">{t("column_empty")}</p>
                  ) : null}

                  {rows.map(({ order }) => {
                    const late = (order.timing?.overdue_minutes ?? 0) > 0
                    const items = (order.items ?? []).slice(0, 4)

                    return (
                      <article
                        key={order.id}
                        className={`rounded-lg border p-2 text-sm ${late ? "border-rose-500" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold">#{toLocaleDigits(String(order.number), locale)}</p>
                            <p className="text-muted-foreground text-xs">
                              {t(`fulfillment_${order.fulfillment ?? "dine_in"}`)}
                              {order.table_number ? ` · ${t("table")} ${toLocaleDigits(order.table_number, locale)}` : ""}
                            </p>
                          </div>
                          <p className="text-xs tabular-nums">
                            <MoneyText amount={Math.round(order.total_minor)} />
                          </p>
                        </div>

                        {items.length > 0 ? (
                          <ul className="text-muted-foreground mt-1 space-y-0.5 text-xs">
                            {items.map((item) => (
                              <li key={item.id}>
                                {toLocaleDigits(String(item.quantity), locale)} ×{" "}
                                {item.product_name ?? item.name ?? "—"}
                              </li>
                            ))}
                          </ul>
                        ) : null}

                        <p className="text-muted-foreground mt-1 text-[11px] tabular-nums">
                          {formatDisplayDateTime(order.created_at, locale)}
                          {late ? ` · ${t("late", { minutes: toLocaleDigits(String(order.timing?.overdue_minutes ?? 0), locale) })}` : ""}
                        </p>

                        {!order.paid && ["served", "completed"].includes(String(order.status)) ? (
                          <Button size="sm" className="mt-2 w-full" onClick={() => setSettling(order)}>
                            {t("settle")}
                          </Button>
                        ) : null}
                      </article>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}

      <SettleDialog
        open={settling !== null}
        onOpenChange={(open) => {
          if (!open) setSettling(null)
        }}
        orderId={settling?.id ?? null}
        orderLabel={settling ? `#${settling.number}` : ""}
        totalMinor={settling?.total_minor ?? 0}
        onSettled={() => void queryClient.invalidateQueries({ queryKey: ["cafe-order-board"] })}
      />

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => void board.refetch()} disabled={board.isFetching}>
          {board.isFetching ? tCommon("loading") : t("refresh")}
        </Button>
      </div>
    </CafeAdminShell>
  )
}
