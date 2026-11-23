"use client"

import { useQuery } from "@tanstack/react-query"
import {
  AlarmClock,
  Banknote,
  ChefHat,
  CircleDollarSign,
  Coffee,
  RefreshCw,
  Truck,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MoneyText } from "@/components/currency/MoneyDisplay"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"

import { CafeAdminShell, CafeEmptyState, CafeSection, cafeSelectClass } from "../../cafe/admin/cafe-admin-ui"

type QueueItem = {
  kind: string
  kinds: string[]
  order_id: number | null
  table_id?: number
  number: string | null
  status: string | null
  kitchen_status: string | null
  table: { id: number; code: string; label: string | null } | null
  branch: string | null
  total_minor: number
  unpaid: boolean
  age_minutes: number
  late: boolean
  fulfillment: string
  item_count: number
  created_at: string | null
}

type FloorTable = {
  id: number
  code: string
  label: string | null
  seats: number
  display_status: string
  seated_minutes: number | null
  open_orders: number
  open_total_minor: number
  overdue: boolean
  reservation_name: string | null
}

type WorkbenchPayload = {
  queue: QueueItem[]
  tables: FloorTable[]
  counts: Record<string, number>
  role: string
}

/** Colour per table state. The two new ones are the reason this page exists. */
const TABLE_TONE: Record<string, string> = {
  free: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  seated: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30",
  ordering: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30",
  served: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  reserved: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30",
  cleaning: "bg-muted text-muted-foreground border-border",
  awaiting_settle: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/40",
  overdue: "bg-destructive/15 text-destructive border-destructive/40",
}

const KIND_META: Record<string, { icon: LucideIcon; tone: string }> = {
  settle: { icon: CircleDollarSign, tone: "text-orange-600 dark:text-orange-400" },
  ready: { icon: UtensilsCrossed, tone: "text-amber-600 dark:text-amber-400" },
  cook: { icon: ChefHat, tone: "text-sky-600 dark:text-sky-400" },
  table: { icon: Coffee, tone: "text-indigo-600 dark:text-indigo-400" },
  delivery: { icon: Truck, tone: "text-violet-600 dark:text-violet-400" },
  late: { icon: AlarmClock, tone: "text-destructive" },
}

const ROLES = ["", "cashier", "waiter", "cook", "branch_manager", "owner"] as const

export default function WorkbenchPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("cafe_admin.workbench")
  const [role, setRole] = useState<string>("")

  const query = useQuery({
    queryKey: ["cafe-workbench", role],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (role) params.set("role", role)
      // This endpoint sends `meta` (poll timestamp), so `api()` hands back `{ data, meta }`
      // rather than the payload on its own. Endpoints without `meta` are unwrapped fully.
      const res = await api<{ data: WorkbenchPayload }>(`/api/v1/cafe/workbench?${params.toString()}`)
      return res?.data ?? null
    },
    refetchInterval: 15_000,
  })

  const data = query.data
  const queue = useMemo(() => data?.queue ?? [], [data])
  const tables = data?.tables ?? []
  const counts = data?.counts ?? {}

  const settleTotal = useMemo(
    () => queue.filter((row) => row.kinds.includes("settle")).reduce((sum, row) => sum + row.total_minor, 0),
    [queue],
  )

  return (
    <CafeAdminShell
      title={t("title")}
      description={t("description")}
      actions={
        <div className="flex items-center gap-2">
          <select
            className={cn(cafeSelectClass, "w-auto")}
            value={role}
            onChange={(e) => setRole(e.target.value)}
            aria-label={t("role_filter")}
          >
            {ROLES.map((value) => (
              <option key={value || "auto"} value={value}>
                {value === "" ? t("role_auto") : t(`role_${value}`)}
              </option>
            ))}
          </select>
          <Button type="button" size="sm" variant="outline" onClick={() => void query.refetch()}>
            <RefreshCw className="size-4" />
            {t("refresh")}
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label={t("kpi_queue")} value={String(queue.length)} icon={UtensilsCrossed} />
        <Kpi
          label={t("kpi_settle")}
          value={<MoneyText amount={settleTotal} />}
          icon={Banknote}
        />
        <Kpi label={t("kpi_overdue")} value={String(counts.overdue ?? 0)} icon={AlarmClock} />
      </div>

      <CafeSection title={t("queue_title")} description={t("queue_description")}>
        {query.isPending ? (
          <p className="text-muted-foreground text-sm">{t("loading")}</p>
        ) : queue.length === 0 ? (
          <CafeEmptyState message={t("queue_empty")} />
        ) : (
          <ul className="space-y-2">
            {queue.map((item) => {
              const meta = KIND_META[item.kind] ?? KIND_META.cook
              const Icon = meta.icon
              return (
                <li
                  key={`${item.kind}-${item.order_id ?? item.table_id}`}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2",
                    item.late && "border-destructive/40 bg-destructive/5",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Icon className={cn("size-4 shrink-0", meta.tone)} />
                    <span className="truncate text-sm font-medium">
                      {item.number ?? item.table?.label ?? item.table?.code ?? "—"}
                    </span>
                    {item.table ? (
                      <Badge variant="outline">
                        {t("table_label")} {item.table.code}
                      </Badge>
                    ) : null}
                    <Badge variant={item.late ? "destructive" : "secondary"}>{t(`kind_${item.kind}`)}</Badge>
                    {item.unpaid ? <Badge variant="outline">{t("unpaid")}</Badge> : null}
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    {item.total_minor > 0 ? (
                      <span className="font-mono">
                        <MoneyText amount={item.total_minor} />
                      </span>
                    ) : null}
                    <span className={item.late ? "text-destructive" : "text-muted-foreground"}>
                      {t("minutes_ago", { count: item.age_minutes })}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CafeSection>

      <CafeSection title={t("map_title")} description={t("map_description")}>
        <div className="mb-3 flex flex-wrap gap-2">
          {(["free", "seated", "ordering", "served", "reserved", "cleaning", "awaiting_settle", "overdue"] as const).map(
            (key) => (
              <span
                key={key}
                className={cn("rounded-md border px-2 py-0.5 text-[11px]", TABLE_TONE[key])}
              >
                {t(`table_${key}`)} · {counts[key] ?? 0}
              </span>
            ),
          )}
        </div>

        {tables.length === 0 ? (
          <CafeEmptyState message={t("map_empty")} />
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {tables.map((table) => (
              <div
                key={table.id}
                className={cn("rounded-lg border p-3", TABLE_TONE[table.display_status] ?? TABLE_TONE.free)}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{table.label ?? table.code}</span>
                  <span className="text-[11px] opacity-80">{t(`table_${table.display_status}`)}</span>
                </div>
                <div className="mt-1 space-y-0.5 text-[11px] opacity-80">
                  <div>{t("seats", { count: table.seats })}</div>
                  {table.seated_minutes !== null ? <div>{t("minutes_ago", { count: table.seated_minutes })}</div> : null}
                  {table.open_total_minor > 0 ? (
                    <div className="font-mono">
                      <MoneyText amount={table.open_total_minor} />
                    </div>
                  ) : null}
                  {table.reservation_name ? <div>{table.reservation_name}</div> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </CafeSection>
    </CafeAdminShell>
  )
}

function Kpi({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon: LucideIcon }) {
  return (
    <div className="rounded-xl border p-3">
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  )
}
