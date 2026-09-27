"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { PageShell } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

export function AccountHomePageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("account_portal")
  const q = useQuery({
    queryKey: ["account", "overview"],
    queryFn: () =>
      api<{ orders_count: number; tickets_open_count: number; notifications_unread: number }>("/api/v1/account/overview"),
  })
  const d = q.data
  return (
    <PageShell title={t("overview_title")}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="pt-6"><p className="text-muted-foreground text-sm">{t("orders_count")}</p><p className="text-2xl font-semibold">{d?.orders_count ?? "—"}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-muted-foreground text-sm">{t("tickets_open")}</p><p className="text-2xl font-semibold">{d?.tickets_open_count ?? "—"}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-muted-foreground text-sm">{t("notifications_unread")}</p><p className="text-2xl font-semibold">{d?.notifications_unread ?? "—"}</p></CardContent></Card>
      </div>
    </PageShell>
  )
}

export function AccountOrdersPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("account_portal")
  const q = useQuery({
    queryKey: ["account", "orders"],
    queryFn: () => api<Array<{ id: number; number?: string; status: string; total_minor: number }>>("/api/v1/account/orders"),
  })
  return (
    <PageShell title={t("orders_title")}>
      <div className="space-y-2">
        {(q.data ?? []).map((o) => (
          <Link key={o.id} href={`/dashboard/account/orders/${o.id}`} className="block rounded-lg border p-3 text-sm hover:bg-muted/40">
            #{o.number || o.id} · {o.status} · {o.total_minor}
          </Link>
        ))}
        {(q.data ?? []).length === 0 ? <p className="text-muted-foreground text-sm">{t("no_orders")}</p> : null}
      </div>
    </PageShell>
  )
}

export function AccountOrderDetailPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("account_portal")
  const orderId = route.params?.orderId
  const q = useQuery({
    queryKey: ["account", "order", orderId],
    enabled: Boolean(orderId),
    queryFn: () => api<{ id: number; number?: string; status: string; total_minor: number; items?: Array<{ quantity: number; product?: { name?: string } }> }>(`/api/v1/account/orders/${orderId}`),
  })
  const o = q.data
  return (
    <PageShell title={`${t("order_detail")} ${o?.number || orderId || ""}`}>
      {o ? (
        <div className="space-y-2 text-sm">
          <p>{o.status} · {o.total_minor}</p>
          <ul className="list-disc ps-5">
            {(o.items ?? []).map((it, i) => (
              <li key={i}>{it.product?.name ?? "—"} × {it.quantity}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </PageShell>
  )
}

export function AccountAddressesPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("account_portal")
  const tCommon = useTranslations("common")
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ["account", "addresses"],
    queryFn: () => api<{ addresses: unknown[] }>("/api/v1/account/addresses"),
  })
  const [raw, setRaw] = useState("[]")
  useEffect(() => {
    if (q.data) {
      setRaw(JSON.stringify(q.data.addresses ?? [], null, 2))
    }
  }, [q.data])
  const save = useMutation({
    mutationFn: () => api("/api/v1/account/addresses", { method: "PATCH", json: { addresses: JSON.parse(raw || "[]") } }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      void qc.invalidateQueries({ queryKey: ["account", "addresses"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })
  return (
    <PageShell title={t("addresses_title")} description={t("addresses_hint")}>
      <Textarea className="min-h-[200px] font-mono text-xs" value={raw} onChange={(e) => setRaw(e.target.value)} />
      <Button type="button" className="mt-3" disabled={save.isPending} onClick={() => void save.mutateAsync()}>{t("save_addresses")}</Button>
    </PageShell>
  )
}

export function AccountNotificationsPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("account_portal")
  const q = useQuery({
    queryKey: ["account", "notifications"],
    queryFn: () => api<{ items: Array<{ id: number; title: string; body: string; read: boolean }> }>("/api/v1/account/notifications"),
  })
  return (
    <PageShell title={t("notifications_title")}>
      <div className="space-y-2">
        {(q.data?.items ?? []).map((n) => (
          <div key={n.id} className="rounded-lg border p-3 text-sm">
            <p className="font-medium">{n.title}</p>
            <p className="text-muted-foreground">{n.body}</p>
          </div>
        ))}
      </div>
    </PageShell>
  )
}

export function AccountFavoritesPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("account_portal")
  const q = useQuery({
    queryKey: ["account", "favorites"],
    queryFn: () => api<{ products: Array<{ id: number; name: string }> }>("/api/v1/account/favorites"),
  })
  const items = q.data?.products ?? []
  return (
    <PageShell title={t("favorites_title")}>
      {items.length === 0 ? <p className="text-muted-foreground text-sm">{t("no_favorites")}</p> : null}
      <ul className="space-y-2 text-sm">
        {items.map((p) => (
          <li key={p.id} className="rounded-lg border px-3 py-2">{p.name}</li>
        ))}
      </ul>
    </PageShell>
  )
}

export function AccountReviewsPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("account_portal")
  const q = useQuery({
    queryKey: ["account", "reviews"],
    queryFn: () => api<Array<{ id: number; rating: number; body?: string; product?: { name?: string } }>>("/api/v1/account/reviews"),
  })
  const items = q.data ?? []
  return (
    <PageShell title={t("reviews_title")}>
      {items.length === 0 ? <p className="text-muted-foreground text-sm">{t("no_reviews")}</p> : null}
      <ul className="space-y-2 text-sm">
        {items.map((r) => (
          <li key={r.id} className="rounded-lg border p-3">{r.product?.name} · {r.rating}/5 — {r.body}</li>
        ))}
      </ul>
    </PageShell>
  )
}

export function AccountProfilePageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("account_portal")
  const tCommon = useTranslations("common")
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ["account", "profile"],
    queryFn: () => api<{ name: string; email: string; phone?: string }>("/api/v1/account/profile"),
  })
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  useEffect(() => {
    if (q.data) {
      setName(q.data.name ?? "")
      setEmail(q.data.email ?? "")
      setPhone(q.data.phone ?? "")
    }
  }, [q.data])
  const save = useMutation({
    mutationFn: () => api("/api/v1/account/profile", { method: "PATCH", json: { name, email, phone } }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      void qc.invalidateQueries({ queryKey: ["account", "profile"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })
  return (
    <PageShell title={t("profile_title")}>
      <div className="max-w-md space-y-3">
        <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><Label>Email</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        <Button type="button" disabled={save.isPending} onClick={() => void save.mutateAsync()}>{tCommon("save")}</Button>
      </div>
    </PageShell>
  )
}

export function AccountWalletPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("account_portal")
  const q = useQuery({
    queryKey: ["account", "wallet"],
    queryFn: () => api<{ balance_minor: number; currency: string }>("/api/v1/account/wallet"),
  })
  return (
    <PageShell title={t("wallet_title")}>
      <p className="text-2xl font-semibold">{t("balance")}: {q.data?.balance_minor ?? 0} {q.data?.currency ?? ""}</p>
    </PageShell>
  )
}

export function AccountTicketsPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("account_portal")
  const q = useQuery({
    queryKey: ["account", "tickets"],
    queryFn: () => api<{ items?: Array<{ id: number; subject: string; status: string }> }>("/api/v1/account/tickets"),
  })
  const items = q.data?.items ?? []
  return (
    <PageShell title={t("tickets_title")} description={t("tickets_hint")}>
      <ul className="space-y-2 text-sm">
        {items.map((tk: { id: number; subject: string; status: string }) => (
          <li key={tk.id} className="rounded-lg border px-3 py-2">{tk.subject} · {tk.status}</li>
        ))}
      </ul>
    </PageShell>
  )
}
