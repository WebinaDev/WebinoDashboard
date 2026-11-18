"use client"

import { useCallback, useEffect, useState } from "react"
import { useLocale } from "next-intl"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { api } from "@/lib/api"
import { formatDate } from "@/lib/locale"

type Subscriber = { id: number; email: string | null; phone: string | null; source: string | null; status: string; created_at: string | null }
type Meta = { total: number; page: number; last_page: number }

const L = {
  fa: {
    title: "مشترکان خبرنامه",
    description: "ایمیل‌ها و شماره‌هایی که از ویجت خبرنامه فروشگاه ثبت شده‌اند.",
    search: "جستجوی ایمیل یا موبایل",
    empty: "هنوز مشترکی ثبت نشده است.",
    contact: "ایمیل / موبایل",
    source: "منبع",
    date: "تاریخ عضویت",
    remove: "حذف",
    confirm: "این مشترک حذف شود؟",
    prev: "قبلی",
    next: "بعدی",
    total: "مجموع",
    loading: "در حال بارگذاری…",
  },
  en: {
    title: "Newsletter subscribers",
    description: "Emails and phone numbers collected by the storefront newsletter widget.",
    search: "Search email or phone",
    empty: "No subscribers yet.",
    contact: "Email / phone",
    source: "Source",
    date: "Joined",
    remove: "Remove",
    confirm: "Remove this subscriber?",
    prev: "Previous",
    next: "Next",
    total: "Total",
    loading: "Loading…",
  },
}

export function NewsletterSubscribersPanel() {
  const locale = useLocale()
  const t = locale.startsWith("en") ? L.en : L.fa
  const [q, setQ] = useState("")
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<Subscriber[] | null>(null)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), per_page: "25" })
    if (q.trim()) params.set("q", q.trim())
    api<unknown>(`/api/v1/shop/newsletter-subscribers?${params}`)
      .then((res) => {
        const body = res as { data?: Subscriber[]; meta?: Meta } | Subscriber[]
        if (Array.isArray(body)) {
          setRows(body)
          setMeta(null)
        } else {
          setRows(Array.isArray(body.data) ? body.data : [])
          setMeta(body.meta ?? null)
        }
        setError(null)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "error"))
  }, [page, q])

  useEffect(() => {
    const timer = window.setTimeout(load, 250)
    return () => window.clearTimeout(timer)
  }, [load])

  async function remove(id: number) {
    if (!window.confirm(t.confirm)) return
    try {
      await api(`/api/v1/shop/newsletter-subscribers/${id}`, { method: "DELETE" })
      load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "error")
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t.title}</CardTitle>
        <CardDescription>{t.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          value={q}
          placeholder={t.search}
          onChange={(e) => {
            setQ(e.target.value)
            setPage(1)
          }}
          className="max-w-sm"
        />
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        {rows === null ? (
          <p className="text-muted-foreground text-sm">{t.loading}</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t.empty}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-start">
                <tr>
                  <th className="p-2 text-start font-medium">{t.contact}</th>
                  <th className="p-2 text-start font-medium">{t.source}</th>
                  <th className="p-2 text-start font-medium">{t.date}</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="p-2" dir="ltr">
                      {row.email || row.phone}
                    </td>
                    <td className="p-2">{row.source || "—"}</td>
                    <td className="p-2">{row.created_at ? formatDate(row.created_at, locale) : "—"}</td>
                    <td className="p-2 text-end">
                      <Button type="button" size="sm" variant="ghost" onClick={() => void remove(row.id)}>
                        {t.remove}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {meta && meta.last_page > 1 ? (
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              {t.prev}
            </Button>
            <span className="text-muted-foreground text-xs">
              {meta.page} / {meta.last_page} · {t.total}: {meta.total}
            </span>
            <Button type="button" size="sm" variant="outline" disabled={page >= meta.last_page} onClick={() => setPage((p) => p + 1)}>
              {t.next}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
