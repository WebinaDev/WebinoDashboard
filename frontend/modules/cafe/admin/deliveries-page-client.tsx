"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { toLocaleDigits } from "@/lib/locale"
import { MoneyText } from "@/components/currency/MoneyDisplay"

import { CafeAdminShell, CafeEmptyState, CafeSection, cafeSelectClass } from "./cafe-admin-ui"

type DeliveryItem = { id: number; name?: string | null; quantity: number }

type Delivery = {
  id: number
  number: string
  status: string
  delivery_status: string
  delivery_driver_id?: number | null
  customer_name?: string | null
  customer_phone?: string | null
  customer_note?: string | null
  address?: string | null
  area?: string | null
  total_minor: number
  shipping_minor: number
  currency?: string | null
  payment_method?: string | null
  collect_cash: boolean
  collect_minor: number
  ready: boolean
  delivery_at?: string | null
  failure_reason?: string | null
  items: DeliveryItem[]
}

const STATUS_TONE: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  queued: "outline",
  claimed: "default",
  picked_up: "default",
  delivered: "secondary",
  failed: "destructive",
}

export default function DeliveriesPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("cafe_admin.deliveries")
  const locale = useLocale()
  const queryClient = useQueryClient()

  const [filter, setFilter] = useState<"all" | "queued" | "mine">("all")
  const [failTarget, setFailTarget] = useState<Delivery | null>(null)
  const [failReason, setFailReason] = useState("")

  const queue = useQuery({
    queryKey: ["cafe-deliveries"],
    queryFn: async () => {
      const res = await api<{ data: Delivery[] }>("/api/v1/cafe/deliveries")
      return res?.data ?? []
    },
    // The board is worked on a phone, often on a bad connection: poll gently and cheaply.
    refetchInterval: 20_000,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["cafe-deliveries"] })

  const act = useMutation({
    mutationFn: ({ id, action, json }: { id: number; action: string; json?: Record<string, unknown> }) =>
      api(`/api/v1/cafe/deliveries/${id}/${action}`, { method: "POST", json: json ?? {} }),
    onSuccess: async (_data, variables) => {
      const okKey: Record<string, string> = {
        claim: "claimed_ok",
        "pick-up": "picked_ok",
        deliver: "delivered_ok",
        fail: "failed_ok",
        release: "released_ok",
      }
      toast.success(t(okKey[variables.action] ?? "claimed_ok"))
      setFailTarget(null)
      setFailReason("")
      await invalidate()
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const rows = useMemo(() => {
    const all = queue.data ?? []
    if (filter === "queued") return all.filter((d) => d.delivery_status === "queued")
    return all
  }, [queue.data, filter])

  const money = (v?: number | null) => (
    <MoneyText amount={v} currency={"IRT"} fallback="-" />
  )

  function submitFail() {
    if (!failTarget) return
    if (!failReason.trim()) {
      toast.error(t("reason_required"))
      return
    }
    act.mutate({ id: failTarget.id, action: "fail", json: { reason: failReason.trim() } })
  }

  if (queue.isError) {
    return (
      <CafeAdminShell title={t("title")} description={t("description")}>
        <CafeEmptyState message={t("no_access")} />
      </CafeAdminShell>
    )
  }

  return (
    <CafeAdminShell
      title={t("title")}
      description={t("description")}
      actions={
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
            {t("live_badge")}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => void queue.refetch()} disabled={queue.isFetching}>
            {t("refresh")}
          </Button>
        </div>
      }
    >
      <CafeSection
        title={t("title")}
        actions={
          <select
            className={cafeSelectClass}
            value={filter}
            onChange={(e) => setFilter(e.target.value as "all" | "queued" | "mine")}
            aria-label={t("filter_all")}
          >
            <option value="all">{t("filter_all")}</option>
            <option value="queued">{t("filter_queued")}</option>
          </select>
        }
      >
        {queue.isLoading ? (
          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-muted h-44 animate-pulse rounded-xl" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <CafeEmptyState message={t("queue_empty")} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {rows.map((d) => {
              const status = d.delivery_status
              const terminal = status === "delivered" || status === "failed"
              return (
                <div key={d.id} className="flex flex-col gap-2 rounded-xl border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">
                        {t("order")} {d.number}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">{d.customer_name || "-"}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge variant={STATUS_TONE[status] ?? "outline"} className="text-[10px]">
                        {t(`status_${status}`)}
                      </Badge>
                      <Badge variant={d.ready ? "default" : "secondary"} className="text-[10px]">
                        {d.ready ? t("ready") : t("not_ready")}
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-1 text-xs">
                    <p className="flex gap-1">
                      <span className="text-muted-foreground shrink-0">{t("address")}:</span>
                      <span className="min-w-0 break-words">{d.address || "-"}</span>
                    </p>
                    {d.customer_phone ? (
                      <p className="flex gap-1">
                        <span className="text-muted-foreground shrink-0">{t("phone")}:</span>
                        <a href={`tel:${d.customer_phone}`} className="font-medium underline" dir="ltr">
                          {d.customer_phone}
                        </a>
                      </p>
                    ) : null}
                    <p className="flex gap-1">
                      <span className="text-muted-foreground shrink-0">{t("total")}:</span>
                      <span className="font-semibold">{money(d.total_minor)}</span>
                    </p>
                    {d.collect_cash ? (
                      <p className="rounded-md bg-amber-50 px-2 py-1 font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                        {t("cash_due")}: {money(d.collect_minor)}
                      </p>
                    ) : null}
                    {d.customer_note ? (
                      <p className="text-muted-foreground italic">
                        {t("note")}: {d.customer_note}
                      </p>
                    ) : null}
                    {d.failure_reason ? (
                      <p className="text-rose-600">
                        {t("fail_reason")}: {d.failure_reason}
                      </p>
                    ) : null}
                  </div>

                  {d.items.length > 0 ? (
                    <ul className="text-muted-foreground space-y-0.5 text-xs">
                      {d.items.map((item) => (
                        <li key={item.id}>
                          {toLocaleDigits(item.quantity, locale)} × {item.name || "-"}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {!terminal ? (
                    <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                      {status === "queued" ? (
                        <Button
                          size="sm"
                          className="h-8"
                          disabled={act.isPending}
                          onClick={() => act.mutate({ id: d.id, action: "claim" })}
                        >
                          {t("claim")}
                        </Button>
                      ) : null}
                      {status === "claimed" ? (
                        <Button
                          size="sm"
                          className="h-8"
                          disabled={act.isPending}
                          onClick={() => act.mutate({ id: d.id, action: "pick-up" })}
                        >
                          {t("pick_up")}
                        </Button>
                      ) : null}
                      {status === "picked_up" ? (
                        <Button
                          size="sm"
                          className="h-8"
                          disabled={act.isPending}
                          onClick={() => act.mutate({ id: d.id, action: "deliver" })}
                        >
                          {t("deliver")}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        disabled={act.isPending}
                        onClick={() => {
                          setFailTarget(d)
                          setFailReason("")
                        }}
                      >
                        {t("fail")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8"
                        disabled={act.isPending}
                        onClick={() => act.mutate({ id: d.id, action: "release" })}
                      >
                        {t("release")}
                      </Button>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </CafeSection>

      {failTarget ? (
        <CafeSection title={t("fail_title")} description={`${t("order")} ${failTarget.number}`}>
          <div className="max-w-md space-y-1.5">
            <Label htmlFor="fail-reason">{t("fail_reason")}</Label>
            <Input
              id="fail-reason"
              value={failReason}
              onChange={(e) => setFailReason(e.target.value)}
              placeholder={t("fail_reason_ph")}
            />
          </div>
          <div className="flex gap-2">
            <Button variant="destructive" onClick={submitFail} disabled={act.isPending}>
              {t("fail_confirm")}
            </Button>
            <Button variant="ghost" onClick={() => setFailTarget(null)}>
              {t("cancel")}
            </Button>
          </div>
        </CafeSection>
      ) : null}
    </CafeAdminShell>
  )
}
