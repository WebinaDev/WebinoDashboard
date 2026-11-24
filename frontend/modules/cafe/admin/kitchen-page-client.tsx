"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toLocaleDigits } from "@/lib/locale"
import { useLocale, useTranslations } from "next-intl"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api, type ApiListPayload } from "@/lib/api"
import { asArray } from "@/lib/list-utils"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { formatDisplayDateTime } from "@/lib/format-date"
import { useOnlineStatus } from "@/hooks/use-online-status"

import { CafeAdminShell, CafeEmptyState, cafeSelectClass } from "./cafe-admin-ui"

  type KitchenOrder = {
  id: number
  number: string | number
  kitchen_status: string
  fulfillment: string
  table_number?: string | null
  customer_phone?: string | null
  status?: string
  customer_name?: string | null
  shipping_address?: string | null
  delivery?: { lat?: number | null; lng?: number | null } | null
  pickup_at?: string | null
  payment_method?: string | null
  customer_note?: string | null
  paid?: boolean
  custom_status?: Partial<OrderCustomStatus> | null
  total_minor: number
  created_at: string
  /** Derived over every line: what the ticket as a whole is doing. */
  prep_state?: "new" | "preparing" | "ready"
  /** Server-computed age of the ticket, against the tenant's KDS thresholds. */
  timing?: {
    elapsed_minutes: number
    state: "ok" | "warn" | "late" | "finished"
    warn_after_minutes: number
    late_after_minutes: number
    overdue_minutes: number
  }
  items: {
    id: number
    name?: string | null
    quantity: number
    selections?: { name_fa?: string; name_en?: string }[]
    /** `new` until someone ticks the line. Per-line, not per-ticket. */
    prep_status?: "new" | "preparing" | "ready" | "served"
  }[]
}

const FLOW = ["new", "preparing", "ready", "served", "out_for_delivery", "done"] as const

type OrderCustomStatus = {
  label_fa: string
  label_en?: string | null
  emoji?: string | null
  color?: string | null
  show_to_guest?: boolean
}

/** Emoji + colour presets keep custom statuses readable at a glance on a busy board. */
const EMOJI_PRESETS = ["⏳", "🔥", "🍳", "🧊", "🚀", "🚴", "✅", "🎉"] as const
const COLOR_PRESETS = ["#0ea5e9", "#f97316", "#22c55e", "#a855f7", "#ef4444", "#eab308"] as const

function nextStatus(current: string): string | null {
  const idx = FLOW.indexOf(current as (typeof FLOW)[number])
  if (idx < 0 || idx >= FLOW.length - 1) return null
  return FLOW[idx + 1]
}

function beep() {
  const ctx = new AudioContext()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.frequency.value = 880
  gain.gain.value = 0.05
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + 0.18)
}

const KITCHEN_CACHE_KEY = "webino.cafe.kitchen.board.v1"

export default function KitchenPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("cafe_admin.kitchen")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const queryClient = useQueryClient()
  const seen = useRef<Set<number>>(new Set())
  const primed = useRef(false)
  const online = useOnlineStatus()

  /**
   * The board on a screen that lost its connection.
   *
   * A kitchen display is a wall-mounted tablet on shop Wi-Fi; when the router reboots the board
   * used to go blank, which reads to a cook as "no orders" — the worst possible message. Every
   * successful poll is mirrored to localStorage, and a failed poll restores it so the tickets
   * already on the wall stay on the wall, visibly marked as stale.
   */
  const restoreCachedBoard = (): KitchenOrder[] => {
    try {
      const raw = window.localStorage.getItem(KITCHEN_CACHE_KEY)
      if (!raw) return []
      const parsed: unknown = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as KitchenOrder[]) : []
    } catch {
      return []
    }
  }

  // The board's clock. Ages are computed on the server, but they have to keep moving between
  // polls — a ticket must go red while the cook is looking at it, not at the next refresh.
  const [nowMs, setNowMs] = useState(() => Date.now())
  const fetchedAtRef = useRef(Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 15_000)
    return () => window.clearInterval(id)
  }, [])

  // Live board: poll the cheap delta endpoint and merge rows into the cache, so a busy
  // shift never re-downloads every open ticket on each tick.
  const sinceRef = useRef<string>("")
  const { data: orders = [] } = useQuery({
    queryKey: ["cafe-kitchen"],
    // Polling must keep trying: a screen that gives up after one failure shows an empty board
    // for the rest of the shift even after the Wi-Fi comes back.
    refetchOnReconnect: true,
    queryFn: async () => {
      const since = sinceRef.current
      const query = since ? `?since=${encodeURIComponent(since)}` : ""
      // The live endpoint answers the list envelope (`{data, meta}`) because it reports
      // `server_time` for clock-skew correction — so unwrap before iterating.
      const payload = await api<ApiListPayload<KitchenOrder[]>>(
        `/api/v1/cafe/kitchen-orders/live${query}`,
      )
      fetchedAtRef.current = Date.now()
      const rows = asArray<KitchenOrder>(payload)
      try {
        window.localStorage.setItem(KITCHEN_CACHE_KEY, JSON.stringify(rows))
      } catch {
        // Quota or private mode: the board still works, it just will not survive a reload offline.
      }
      // One tick of overlap absorbs clock skew between browser and API without duplicates.
      sinceRef.current = new Date(Date.now() - 15_000).toISOString()
      if (!since) return rows
      const merged = new Map<number, KitchenOrder>(
        (queryClient.getQueryData<KitchenOrder[]>(["cafe-kitchen"]) ?? []).map((row) => [row.id, row]),
      )
      for (const row of rows) merged.set(row.id, row)
      // Finished tickets leave the board so the grid stays a to-do list, not a history.
      // Most overdue first, then oldest: the top-left ticket is the one that needs a cook
      // now, not the one that happens to have the highest id.
      return [...merged.values()]
        .filter((row) => !["served", "done", "cancelled"].includes(row.kitchen_status))
        .sort((a, b) => (b.timing?.overdue_minutes ?? 0) - (a.timing?.overdue_minutes ?? 0) || b.id - a.id)
    },
    refetchInterval: 8000,
    // Polling that fails must not throw the board away: a cook looking at five tickets should
    // still see five tickets when the Wi-Fi drops.
    retry: 1,
    placeholderData: (previous) => previous,
    throwOnError: false,
  })

  // A failed poll falls back to the mirrored board rather than an empty grid.
  const board = orders.length > 0 ? orders : restoreCachedBoard()

  /**
   * The board is showing something it could not refresh.
   *
   * The connection being down is only half the story: a poll can fail with the network up. Both
   * cases must say the same thing to the cook, because in both the tickets on the wall may be
   * stale — and "stale but complete" only works if it is labelled.
   */
  const boardIsStale = !online || (orders.length === 0 && board.length > 0)

  // Column labels are per tenant (and optionally per station), so the board must not hard-code
  // the four words it shows next to each status.
  const columnsQ = useQuery({
    queryKey: ["cafe-kitchen-columns"],
    queryFn: () =>
      api<{ columns: { key: string; label_fa: string; label_en: string | null; is_active: boolean }[] }>(
        "/api/v1/cafe/kitchen-columns",
      ),
    // A board that cannot read its columns is still usable with the built-in wording, so a
    // failure here must not blank the kitchen screen.
    retry: false,
    staleTime: 5 * 60_000,
  })

  const columnLabel = (key: string): string | null => {
    const col = (columnsQ.data?.columns ?? []).find((c) => c.key === key && c.is_active !== false)
    if (!col) return null
    const label = locale === "en" ? col.label_en || col.label_fa : col.label_fa
    return label || null
  }

  /**
   * Minutes this ticket has been on the board, ticked locally.
   *
   * The server sends a snapshot age; between polls the local clock keeps it honest. The state
   * (ok/warn/late) is re-derived from the live age so a ticket turns red on screen instead of
   * waiting up to eight seconds for the next refresh.
   */
  const ticketAge = (order: KitchenOrder): { minutes: number; state: string } => {
    const serverMinutes = order.timing?.elapsed_minutes ?? 0
    const elapsedSinceFetch = Math.floor((nowMs - fetchedAtRef.current) / 60_000)
    const minutes = Math.max(0, serverMinutes + elapsedSinceFetch)
    const warn = order.timing?.warn_after_minutes ?? 10
    const late = Math.max(warn + 1, order.timing?.late_after_minutes ?? 20)
    const state =
      order.timing?.state === "finished" ? "finished" : minutes >= late ? "late" : minutes >= warn ? "warn" : "ok"
    return { minutes, state }
  }

  useEffect(() => {
    const ids = new Set(orders.map((o) => o.id))
    if (primed.current) {
      for (const order of orders) {
        if (!seen.current.has(order.id) && order.kitchen_status === "new") beep()
      }
    }
    seen.current = ids
    primed.current = true
  }, [orders])

  const update = useMutation({
    mutationFn: (payload: {
      id: number
      kitchen_status: string
      custom_status?: OrderCustomStatus | null
    }) =>
      api(`/api/v1/cafe/kitchen-orders/${payload.id}`, {
        method: "PATCH",
        json: { kitchen_status: payload.kitchen_status, custom_status: payload.custom_status ?? null },
      }),
    onSuccess: async (_data, variables) => {
      toast.success(t("status_updated", { status: t(`status.${variables.kitchen_status}`) }))
      await queryClient.invalidateQueries({ queryKey: ["cafe-kitchen"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  // Tick one dish without moving the whole ticket. A cook taps the line; the ticket's
  // `kitchen_status` is left alone so a mixed ticket stays readable.
  const prep = useMutation({
    mutationFn: (payload: { orderId: number; itemId: number; status: "new" | "preparing" | "ready" }) =>
      api(`/api/v1/cafe/orders/${payload.orderId}/prep`, {
        method: "POST",
        json: { order_item_id: payload.itemId, status: payload.status },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["cafe-kitchen"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  /** A ready line becomes "in progress" and back again; anything unticked starts preparing. */
  const nextPrep = (current?: string): "preparing" | "ready" =>
    current === "ready" || current === "served" ? "preparing" : "ready"

  return (
    <CafeAdminShell title={t("title")} description={t("description")}>
      {boardIsStale ? (
        <p
          className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
          data-testid="kds-stale-banner"
          role="status"
        >
          {t("offline_banner")}
        </p>
      ) : null}

      {board.length === 0 ? (
        <CafeEmptyState message={`${t("empty")} — ${t("empty_hint")}`} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {board.map((order) => {
            const advanceTo = nextStatus(order.kitchen_status)
            const age = ticketAge(order)
            // An overdue ticket is louder than a new one: the border is the first thing a
            // cook scanning the wall sees, and being late outranks being unstarted.
            const ageClass =
              age.state === "late"
                ? "border-rose-500 bg-rose-50/60 dark:bg-rose-950/20"
                : age.state === "warn"
                  ? "border-amber-400"
                  : order.kitchen_status === "new"
                    ? "border-primary"
                    : ""
            return (
              <article
                key={order.id}
                className={`rounded-xl border p-4 ${ageClass}`}
                data-testid="kds-ticket"
                data-order-id={order.id}
                data-kitchen-status={order.kitchen_status}
              >
                <header className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-base font-semibold">#{toLocaleDigits(String(order.number), locale)}</p>
                    <p className="text-muted-foreground text-xs">
                      {t(`fulfillment.${order.fulfillment}`)}
                      {order.fulfillment === "dine_in"
                        ? ` · ${t("table")}: ${order.table_number ? toLocaleDigits(order.table_number, locale) : t("none")}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant={order.kitchen_status === "new" ? "default" : "secondary"}>
                      {t(`status.${order.kitchen_status}`)}
                    </Badge>
                    {/* Elapsed time, always visible. Green is not used: "fine" should not
                        compete for attention with "late". */}
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                        age.state === "late"
                          ? "bg-rose-600 text-white"
                          : age.state === "warn"
                            ? "bg-amber-500 text-white"
                            : "bg-muted text-muted-foreground"
                      }`}
                      title={t("age_hint", {
                        warn: toLocaleDigits(String(order.timing?.warn_after_minutes ?? 10), locale),
                        late: toLocaleDigits(String(order.timing?.late_after_minutes ?? 20), locale),
                      })}
                    >
                      {t("age_minutes", { minutes: toLocaleDigits(String(age.minutes), locale) })}
                    </span>
                    {order.custom_status?.label_fa ? (
                      <span
                        className="inline-flex max-w-[12rem] items-center gap-1 truncate rounded-full px-2 py-0.5 text-xs font-medium text-white"
                        style={{ backgroundColor: order.custom_status.color || "#0ea5e9" }}
                        title={locale === "fa" ? order.custom_status.label_fa : order.custom_status.label_en || order.custom_status.label_fa}
                      >
                        {order.custom_status.emoji ? <span aria-hidden="true">{order.custom_status.emoji}</span> : null}
                        {locale === "fa" ? order.custom_status.label_fa : order.custom_status.label_en || order.custom_status.label_fa}
                      </span>
                    ) : null}
                  </div>
                </header>

                <div className="space-y-1.5 text-sm">
                  <p className="text-muted-foreground text-xs">
                    {t(order.paid || order.status === "paid" ? "paid_online" : "pay_on_site")}
                  </p>
                  {order.customer_name || order.customer_phone ? (
                    <p>
                      {order.customer_name ?? ""}{" "}
                      {order.customer_phone ? (
                        <a dir="ltr" href={`tel:${order.customer_phone}`}>
                          {toLocaleDigits(order.customer_phone, locale)}
                        </a>
                      ) : null}
                    </p>
                  ) : null}
                  {order.pickup_at ? (
                    <p>
                      {t("pickup_at")}: {formatDisplayDateTime(order.pickup_at, locale)}
                    </p>
                  ) : null}
                  {order.fulfillment === "delivery" ? (
                    <p>
                      {order.shipping_address || t("none")}
                      {order.delivery?.lat != null && order.delivery?.lng != null ? (
                        <>
                          {" "}
                          <a
                            className="text-primary underline"
                            target="_blank"
                            rel="noreferrer"
                            href={`https://www.openstreetmap.org/?mlat=${order.delivery.lat}&mlon=${order.delivery.lng}#map=18/${order.delivery.lat}/${order.delivery.lng}`}
                          >
                            {t("open_map")}
                          </a>
                        </>
                      ) : null}
                    </p>
                  ) : null}
                  <p className="text-muted-foreground text-xs">{formatDisplayDateTime(order.created_at, locale)}</p>
                  {order.customer_note ? <p className="rounded-md bg-muted/40 px-2 py-1 text-xs">{order.customer_note}</p> : null}
                  <ul className="space-y-1 border-t pt-2">
                    {order.items.map((item) => {
                      const done = item.prep_status === "ready" || item.prep_status === "served"
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            // Tapping the line is the whole interaction: no dialog, no modal.
                            // A cook has one hand free and gloves on.
                            className={`flex w-full items-start gap-2 rounded-md px-1 py-1 text-start transition-colors hover:bg-muted/60 ${
                              done ? "text-muted-foreground line-through" : ""
                            }`}
                            disabled={prep.isPending}
                            aria-pressed={done}
                            data-testid="kds-item"
                            aria-label={`${t("mark_ready")}: ${item.name}`}
                            onClick={() =>
                              prep.mutate({
                                orderId: order.id,
                                itemId: item.id,
                                status: nextPrep(item.prep_status),
                              })
                            }
                          >
                            <span
                              aria-hidden
                              className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border ${
                                done ? "border-primary bg-primary text-primary-foreground" : "border-input"
                              }`}
                            >
                              {done ? "✓" : ""}
                            </span>
                            <span>
                              {toLocaleDigits(String(item.quantity), locale)}× {item.name}
                              {item.selections?.length
                                ? ` (${item.selections.map((s) => (locale === "fa" ? s.name_fa : s.name_en || s.name_fa)).join("، ")})`
                                : ""}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
                  {advanceTo ? (
                    // A KDS is tapped with a thumb, often wet, never looked at closely. The
                    // advance button is the one control a cook presses all shift, so it gets a
                    // real target instead of the small default.
                    <Button
                      size="sm"
                      className="min-h-11 px-4"
                      data-testid="kds-advance"
                      disabled={update.isPending}
                      onClick={() => update.mutate({ id: order.id, kitchen_status: advanceTo })}
                    >
                      {t("advance")}: {t(`status.${advanceTo}`)}
                    </Button>
                  ) : null}
                  <select
                    className={`${cafeSelectClass} h-11 w-auto min-w-[8rem]`}
                    aria-label={t("set_status")}
                    value={order.kitchen_status}
                    disabled={update.isPending}
                    onChange={(e) => update.mutate({ id: order.id, kitchen_status: e.target.value })}
                  >
                    {FLOW.map((status) => (
                      <option key={status} value={status}>
                        {/* A configured column label wins over the built-in wording, so a
                            bakery that calls «ready» «آماده تحویل» sees its own word here
                            too, not only on the settings screen. */}
                        {columnLabel(status) ?? t(`status.${status}`)}
                      </option>
                    ))}
                  </select>
                  <CustomStatusEditor
                    value={
                      order.custom_status?.label_fa
                        ? {
                            label_fa: order.custom_status.label_fa,
                            label_en: order.custom_status.label_en ?? null,
                            emoji: order.custom_status.emoji ?? null,
                            color: order.custom_status.color ?? null,
                            show_to_guest: order.custom_status.show_to_guest !== false,
                          }
                        : null
                    }
                    busy={update.isPending}
                    labels={{
                      open: t("custom_open"),
                      title: t("custom_title"),
                      hint: t("custom_hint"),
                      label: t("custom_label"),
                      emoji: t("custom_emoji"),
                      color: t("custom_color"),
                      guest: t("custom_guest"),
                      save: t("custom_save"),
                      clear: t("custom_clear"),
                      cancel: tCommon("cancel"),
                    }}
                    onSave={(custom) => update.mutate({ id: order.id, kitchen_status: order.kitchen_status, custom_status: custom })}
                  />
                </div>
              </article>
            )
          })}
        </div>
      )}
    </CafeAdminShell>
  )
}

/**
 * «وضعیت اختصاصی»: name the current step in the kitchen's own words («در فر», «در راه»)
 * with an emoji and colour. The guest tracker shows it when staff leave guest visibility on.
 */
function CustomStatusEditor({
  value,
  busy,
  labels,
  onSave,
}: {
  value: OrderCustomStatus | null
  busy: boolean
  labels: {
    open: string
    title: string
    hint: string
    label: string
    emoji: string
    color: string
    guest: string
    save: string
    clear: string
    cancel: string
  }
  onSave: (value: OrderCustomStatus | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState(value?.label_fa ?? "")
  const [emoji, setEmoji] = useState(value?.emoji ?? "")
  const [color, setColor] = useState(value?.color ?? COLOR_PRESETS[0])
  const [showToGuest, setShowToGuest] = useState(value?.show_to_guest !== false)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setLabel(value?.label_fa ?? "")
          setEmoji(value?.emoji ?? "")
          setColor(value?.color ?? COLOR_PRESETS[0])
          setShowToGuest(value?.show_to_guest !== false)
        }
        setOpen(next)
      }}
    >
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" disabled={busy}>
          {labels.open}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3">
        <div className="space-y-0.5">
          <p className="text-sm font-semibold">{labels.title}</p>
          <p className="text-muted-foreground text-xs">{labels.hint}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cafe-custom-label">{labels.label}</Label>
          <Input
            id="cafe-custom-label"
            value={label}
            maxLength={40}
            placeholder={labels.label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{labels.emoji}</Label>
          <div className="flex flex-wrap gap-1">
            {EMOJI_PRESETS.map((row) => (
              <button
                key={row}
                type="button"
                aria-label={row}
                aria-pressed={emoji === row}
                className={`rounded-md border px-1.5 py-0.5 text-base ${emoji === row ? "border-primary bg-primary/10" : ""}`}
                onClick={() => setEmoji(emoji === row ? "" : row)}
              >
                {row}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>{labels.color}</Label>
          <div className="flex flex-wrap gap-1.5">
            {COLOR_PRESETS.map((row) => (
              <button
                key={row}
                type="button"
                aria-label={row}
                aria-pressed={color === row}
                className={`size-6 rounded-full ring-offset-2 ${color === row ? "ring-2 ring-primary" : ""}`}
                style={{ backgroundColor: row }}
                onClick={() => setColor(row)}
              />
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={showToGuest} onCheckedChange={(v) => setShowToGuest(Boolean(v))} />
          {labels.guest}
        </label>
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          {value ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                onSave(null)
                setOpen(false)
              }}
            >
              {labels.clear}
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
            {labels.cancel}
          </Button>
          <Button
            size="sm"
            disabled={busy || label.trim() === ""}
            onClick={() => {
              onSave({ label_fa: label.trim(), emoji: emoji || null, color, show_to_guest: showToGuest })
              setOpen(false)
            }}
          >
            {labels.save}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
