"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ListTodo, Plus, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"

import { LocaleDatePicker } from "@/components/LocaleDatePicker"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { formatDate, type UiLocale as Locale } from "@/lib/locale"
import { cn } from "@/lib/utils"

export type DashboardTodo = {
  id: string
  title: string
  done: boolean
  priority?: "low" | "normal" | "high"
  due_date?: string | null
}

const KEY = ["dashboard-todos"]

/** Personal to-do list on the dashboard home (stored per user on the server). */
export function HomeTodoList({ locale }: { locale: Locale }) {
  const t = useTranslations("home.todos")
  const queryClient = useQueryClient()
  const [title, setTitle] = useState("")
  const [due, setDue] = useState<string | null>(null)
  const [priority, setPriority] = useState<"low" | "normal" | "high">("normal")
  const [showDone, setShowDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: items = [], isLoading } = useQuery({
    queryKey: KEY,
    queryFn: () => api<DashboardTodo[]>("/api/v1/dashboard/todos"),
  })

  const save = useMutation({
    mutationFn: (next: DashboardTodo[]) =>
      api<DashboardTodo[]>("/api/v1/dashboard/todos", { method: "PUT", json: { items: next } }),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: KEY })
      const prev = queryClient.getQueryData<DashboardTodo[]>(KEY)
      queryClient.setQueryData(KEY, next)
      return { prev }
    },
    onError: (e, _next, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(KEY, ctx.prev)
      setError(getApiErrorMessage(e))
    },
    onSuccess: (data) => {
      setError(null)
      queryClient.setQueryData(KEY, data)
    },
  })

  function add() {
    const value = title.trim()
    if (!value) return
    save.mutate([{ id: "", title: value, done: false, priority, due_date: due }, ...items])
    setTitle("")
    setDue(null)
    setPriority("normal")
  }

  const today = new Date().toISOString().slice(0, 10)
  const open = items.filter((i) => !i.done)
  const done = items.filter((i) => i.done)
  const sorted = [...open].sort((a, b) => {
    const rank = { high: 0, normal: 1, low: 2 }
    const p = rank[a.priority ?? "normal"] - rank[b.priority ?? "normal"]
    if (p !== 0) return p
    return (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999")
  })
  const visible = showDone ? [...sorted, ...done] : sorted

  return (
    <Card className="rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <ListTodo className="size-4" />
          {t("title")}
          <span className="text-muted-foreground text-xs font-normal">
            {t("open_count", { count: open.length })}
          </span>
        </h2>
        {done.length > 0 ? (
          <button type="button" className="text-muted-foreground text-xs underline" onClick={() => setShowDone((v) => !v)}>
            {showDone ? t("hide_done") : t("show_done", { count: done.length })}
          </button>
        ) : null}
      </div>

      <form
        className="mb-3 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <Input className="min-w-[12rem] flex-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("placeholder")} aria-label={t("placeholder")} maxLength={300} />
        <select
          className="border-input bg-background text-foreground h-9 rounded-md border [color-scheme:light] dark:[color-scheme:dark] px-2 text-sm"
          value={priority}
          onChange={(e) => setPriority(e.target.value as "low" | "normal" | "high")}
          aria-label={t("priority")}
        >
          <option value="high">{t("priority_high")}</option>
          <option value="normal">{t("priority_normal")}</option>
          <option value="low">{t("priority_low")}</option>
        </select>
        <div className="w-40">
          <LocaleDatePicker locale={locale} value={due} onChange={setDue} aria-label={t("due")} />
        </div>
        <Button type="submit" size="sm" disabled={!title.trim() || save.isPending}>
          <Plus className="size-4" />
          {t("add")}
        </Button>
      </form>

      {error ? <p className="text-destructive mb-2 text-xs">{error}</p> : null}

      {isLoading ? (
        <p className="text-muted-foreground text-sm">…</p>
      ) : visible.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : (
        <ul className="divide-y">
          {visible.map((item) => {
            const overdue = !item.done && item.due_date && item.due_date < today
            return (
              <li key={item.id} className="flex items-center gap-3 py-2">
                <Checkbox
                  checked={item.done}
                  onCheckedChange={(v) => save.mutate(items.map((row) => (row.id === item.id ? { ...row, done: Boolean(v) } : row)))}
                  aria-label={item.title}
                />
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-sm", item.done && "text-muted-foreground line-through")}>{item.title}</p>
                  <p className={cn("text-muted-foreground text-xs", overdue && "text-destructive")}>
                    {item.due_date ? formatDate(item.due_date, locale, { dateStyle: "medium" }) : t("no_due")}
                    {item.priority === "high" ? ` · ${t("priority_high")}` : item.priority === "low" ? ` · ${t("priority_low")}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={t("delete")}
                  onClick={() => save.mutate(items.filter((row) => row.id !== item.id))}
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
