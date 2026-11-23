"use client"

import { useQuery } from "@tanstack/react-query"
import { ChevronLeft, ChevronRight, History, Search } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { formatDisplayDateTime } from "@/lib/format-date"

import { CafeAdminShell, CafeEmptyState, CafeSection, cafeSelectClass } from "../../cafe/admin/cafe-admin-ui"

type ChangeRow = { field: string; before: unknown; after: unknown }

type ActivityRow = {
  id: number
  event: string
  subject_type: string
  subject_id: number
  subject_label: string | null
  actor_id: number | null
  actor_type: string
  actor_name: string | null
  branch_id: number | null
  description: string | null
  changes: ChangeRow[]
  batch_id: string | null
  ip_address: string | null
  created_at: string | null
}

type ActivityMeta = {
  current_page: number
  last_page: number
  total: number
  per_page: number
}

type ActivityResponse = {
  data: ActivityRow[]
  meta: ActivityMeta
}

const EVENTS = ["created", "updated", "deleted"] as const

/** Values arrive as JSON scalars; render `null` distinctly from the string "null". */
function renderValue(value: unknown): string {
  if (value === null || value === undefined) return "—"
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "object") {
    const json = JSON.stringify(value)
    return json.length > 80 ? `${json.slice(0, 77)}…` : json
  }
  const text = String(value)
  return text.length > 80 ? `${text.slice(0, 77)}…` : text
}

export default function ActivityPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("users_admin.activity")
  const locale = useLocale()

  const [event, setEvent] = useState("")
  const [actorId, setActorId] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [query, setQuery] = useState("")
  const [submittedQuery, setSubmittedQuery] = useState("")
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState<number | null>(null)

  const filters = useMemo(() => {
    const params = new URLSearchParams()
    if (event) params.set("event", event)
    if (actorId.trim() !== "" && Number.isFinite(Number(actorId))) params.set("actor_id", actorId.trim())
    if (from) params.set("from", from)
    if (to) params.set("to", to)
    if (submittedQuery) params.set("q", submittedQuery)
    params.set("page", String(page))
    return params
  }, [event, actorId, from, to, submittedQuery, page])

  const activity = useQuery({
    queryKey: ["admin-activity", filters.toString()],
    queryFn: async () => {
      // The activity endpoint returns a paginator, so `api()` hands back `{ data, meta }`.
      const res = await api<ActivityResponse>(`/api/v1/activity?${filters.toString()}`)
      return { rows: res?.data ?? [], meta: res?.meta ?? null }
    },
    // The trail is append-heavy; a short poll keeps it current without a websocket.
    refetchInterval: 20_000,
  })

  const rows = activity.data?.rows ?? []
  const meta = activity.data?.meta ?? null

  /** Any filter change invalidates the current page number. */
  function resetTo(fn: () => void) {
    fn()
    setPage(1)
  }

  function clearFilters() {
    setEvent("")
    setActorId("")
    setFrom("")
    setTo("")
    setQuery("")
    setSubmittedQuery("")
    setPage(1)
  }

  const hasFilters = Boolean(event || actorId || from || to || submittedQuery)

  return (
    <CafeAdminShell title={t("title")} description={t("description")}>
      <CafeSection
        title={t("filters_title")}
        description={t("filters_description")}
        actions={
          hasFilters ? (
            <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
              {t("clear_filters")}
            </Button>
          ) : null
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1">
            <Label htmlFor="activity-event">{t("event")}</Label>
            <select
              id="activity-event"
              className={cafeSelectClass}
              value={event}
              onChange={(e) => resetTo(() => setEvent(e.target.value))}
            >
              <option value="">{t("all_events")}</option>
              {EVENTS.map((key) => (
                <option key={key} value={key}>
                  {t(`event_${key}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="activity-actor">{t("actor_id")}</Label>
            <Input
              id="activity-actor"
              inputMode="numeric"
              placeholder={t("actor_id_placeholder")}
              value={actorId}
              onChange={(e) => resetTo(() => setActorId(e.target.value))}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="activity-from">{t("from")}</Label>
            <Input
              id="activity-from"
              type="date"
              value={from}
              onChange={(e) => resetTo(() => setFrom(e.target.value))}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="activity-to">{t("to")}</Label>
            <Input
              id="activity-to"
              type="date"
              value={to}
              onChange={(e) => resetTo(() => setTo(e.target.value))}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="activity-q">{t("search")}</Label>
            <div className="flex gap-2">
              <Input
                id="activity-q"
                placeholder={t("search_placeholder")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") resetTo(() => setSubmittedQuery(query.trim()))
                }}
              />
              <Button
                type="button"
                size="icon"
                variant="secondary"
                aria-label={t("search")}
                onClick={() => resetTo(() => setSubmittedQuery(query.trim()))}
              >
                <Search className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </CafeSection>

      <CafeSection
        title={t("rows_title")}
        description={meta ? t("rows_count", { count: meta.total }) : undefined}
        actions={
          meta && meta.last_page > 1 ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronRight className="size-4" />
                {t("prev")}
              </Button>
              <span className="text-muted-foreground text-xs">
                {t("page_of", { page: meta.current_page, total: meta.last_page })}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= meta.last_page}
                onClick={() => setPage((p) => p + 1)}
              >
                {t("next")}
                <ChevronLeft className="size-4" />
              </Button>
            </div>
          ) : null
        }
      >
        {activity.isPending ? (
          <p className="text-muted-foreground text-sm">{t("loading")}</p>
        ) : activity.isError ? (
          <p className="text-destructive text-sm">{t("error")}</p>
        ) : rows.length === 0 ? (
          <CafeEmptyState message={t("empty")} />
        ) : (
          <ul className="divide-y">
            {rows.map((row) => {
              const open = expanded === row.id
              const changed = row.changes.length
              return (
                <li key={row.id} className="py-3">
                  <button
                    type="button"
                    className="flex w-full items-start gap-3 text-start"
                    onClick={() => setExpanded(open ? null : row.id)}
                    aria-expanded={open}
                  >
                    <History className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge variant={row.event === "deleted" ? "destructive" : "secondary"}>
                          {row.event}
                        </Badge>
                        <span className="text-sm font-medium">
                          {row.subject_label ?? `${row.subject_type} #${row.subject_id}`}
                        </span>
                        <span className="text-muted-foreground text-xs">{row.subject_type}</span>
                      </span>
                      <span className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <span>{row.actor_name ?? t("system_actor")}</span>
                        <span>{formatDisplayDateTime(row.created_at, locale)}</span>
                        {row.branch_id ? <span>{t("branch", { id: row.branch_id })}</span> : null}
                        {changed > 0 ? <span>{t("fields_changed", { count: changed })}</span> : null}
                      </span>
                    </span>
                  </button>

                  {open ? (
                    <div className="mt-3 space-y-3 ps-7">
                      {row.changes.length > 0 ? (
                        <div className="overflow-x-auto rounded-lg border">
                          <table className="w-full text-xs">
                            <thead className="bg-muted/50 text-muted-foreground">
                              <tr>
                                <th className="px-3 py-2 text-start font-medium">{t("field")}</th>
                                <th className="px-3 py-2 text-start font-medium">{t("before")}</th>
                                <th className="px-3 py-2 text-start font-medium">{t("after")}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {row.changes.map((change) => (
                                <tr key={change.field} className="border-t">
                                  <td className="px-3 py-2 font-mono">{change.field}</td>
                                  <td className="text-muted-foreground px-3 py-2 font-mono">
                                    {renderValue(change.before)}
                                  </td>
                                  <td className="px-3 py-2 font-mono">{renderValue(change.after)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-muted-foreground text-xs">{t("no_field_changes")}</p>
                      )}

                      <dl className="text-muted-foreground grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                        <div className="flex gap-1">
                          <dt>{t("record")}:</dt>
                          <dd>
                            {row.subject_type} #{row.subject_id}
                          </dd>
                        </div>
                        <div className="flex gap-1">
                          <dt>{t("actor_type")}:</dt>
                          <dd>{row.actor_type}</dd>
                        </div>
                        {row.ip_address ? (
                          <div className="flex gap-1">
                            <dt>{t("ip")}:</dt>
                            <dd className="font-mono">{row.ip_address}</dd>
                          </div>
                        ) : null}
                        {row.batch_id ? (
                          <div className="flex gap-1">
                            <dt>{t("batch")}:</dt>
                            <dd className="font-mono">{row.batch_id}</dd>
                          </div>
                        ) : null}
                      </dl>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </CafeSection>
    </CafeAdminShell>
  )
}
