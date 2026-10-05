"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { MoneyDisplay } from "@/components/currency/MoneyDisplay"
import { PageShell } from "@/components/PageShell"
import {
  TicketReplyAttachments,
  TicketReplyComposer,
  buildTicketReplyFormData,
} from "@/components/tickets/TicketReplyComposer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { ResolvedAdminRoute } from "@/kernel/types"
import {
  fetchGeoCities,
  fetchGeoStates,
  type GeoState,
} from "../lib/pos-commerce"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { useEnumLabel } from "@/lib/enum-labels"
import { formatNumber, normalizeUiLocale, toLocaleDigits } from "@/lib/locale"

type AddressRow = {
  label?: string
  name?: string
  phone?: string
  address?: string
  city?: string
  province_code?: string
  plaque?: string
  unit?: string
  postcode?: string
  lat?: number | null
  lng?: number | null
  is_default?: boolean
}

type OverviewData = {
  orders_count: number
  tickets_open_count: number
  notifications_unread: number
  wishlist_count?: number
  wallet_balance_minor?: number
  wallet_enabled?: boolean
  currency?: string
  recent_orders?: Array<{
    id: number
    number?: string
    status: string
    total_minor: number
    currency?: string
  }>
  order_groups?: Array<{ key: string; href: string; count: number }>
}

export function AccountHomePageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("account_portal")
  const locale = normalizeUiLocale(useLocale())
  const enumLabel = useEnumLabel()
  const q = useQuery({
    queryKey: ["account", "overview"],
    queryFn: () => api<OverviewData>("/api/v1/account/overview"),
  })
  const d = q.data
  const cards = [
    { href: "/dashboard/account/orders", label: t("orders_count"), value: d?.orders_count },
    { href: "/dashboard/account/tickets", label: t("tickets_open"), value: d?.tickets_open_count },
    {
      href: "/dashboard/account/notifications",
      label: t("notifications_unread"),
      value: d?.notifications_unread,
    },
    { href: "/dashboard/account/favorites", label: t("favorites_title"), value: d?.wishlist_count },
  ]
  return (
    <PageShell title={t("overview_title")}>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.href} href={c.href}>
            <Card className="transition-colors hover:bg-muted/40">
              <CardContent className="pt-6">
                <p className="text-muted-foreground text-sm">{c.label}</p>
                <p className="text-2xl font-semibold">{c.value == null ? "—" : formatNumber(c.value, locale)}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      {d?.wallet_enabled ? (
        <Card className="mb-6">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
            <div>
              <p className="text-muted-foreground text-sm">{t("wallet_title")}</p>
              <MoneyDisplay amount={d.wallet_balance_minor ?? 0} currency={d.currency} className="text-2xl font-semibold" />
            </div>
            <Button type="button" variant="outline" size="sm" asChild>
              <Link href="/dashboard/account/wallet">{t("open_wallet")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
      <div>
        <h2 className="mb-2 text-sm font-medium">{t("recent_orders")}</h2>
        <div className="space-y-2">
          {(d?.recent_orders ?? []).map((o) => (
            <Link
              key={o.id}
              href={`/dashboard/account/orders/${o.id}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm hover:bg-muted/40"
            >
              <span>
                #{toLocaleDigits(o.number || o.id, locale)} · {enumLabel("order_status", o.status)}
              </span>
              <MoneyDisplay amount={o.total_minor} currency={o.currency} />
            </Link>
          ))}
          {(d?.recent_orders ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("no_orders")}</p>
          ) : null}
        </div>
      </div>
    </PageShell>
  )
}

export function AccountOrdersPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("account_portal")
  const locale = normalizeUiLocale(useLocale())
  const enumLabel = useEnumLabel()
  const tCommon = useTranslations("common")
  const [status, setStatus] = useState("")
  const q = useQuery({
    queryKey: ["account", "orders", status],
    queryFn: () => {
      const p = status ? `?status=${encodeURIComponent(status)}` : ""
      return api<{
        data: Array<{ id: number; number?: string; status: string; total_minor: number; currency?: string }>
        meta: { current_page: number; last_page: number; per_page: number; total: number }
      }>(`/api/v1/account/orders${p}`)
    },
  })
  const orders = q.data?.data ?? []
  return (
    <PageShell title={t("orders_title")}>
      <select
        className="border-input bg-background mb-4 h-9 rounded-md border px-2 text-sm"
        value={status}
        onChange={(e) => setStatus(e.target.value)}
      >
        <option value="">{t("filter_all")}</option>
        {["pending_payment", "paid", "processing", "shipped", "completed", "cancelled"].map((s) => (
          <option key={s} value={s}>
            {enumLabel("order_status", s)}
          </option>
        ))}
      </select>
      <div className="space-y-2">
        {orders.map((o) => (
          <Link
            key={o.id}
            href={`/dashboard/account/orders/${o.id}`}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm hover:bg-muted/40"
          >
            <span>
              #{toLocaleDigits(o.number || o.id, locale)} · {enumLabel("order_status", o.status)}
            </span>
            <MoneyDisplay amount={o.total_minor} currency={o.currency} />
          </Link>
        ))}
        {orders.length === 0 ? <p className="text-muted-foreground text-sm">{t("no_orders")}</p> : null}
      </div>
    </PageShell>
  )
}

export function AccountOrderDetailPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("account_portal")
  const locale = normalizeUiLocale(useLocale())
  const enumLabel = useEnumLabel()
  const orderId = route.params?.orderId
  const q = useQuery({
    queryKey: ["account", "order", orderId],
    enabled: Boolean(orderId),
    queryFn: () =>
      api<{
        id: number
        number?: string
        status: string
        total_minor: number
        currency?: string
        items?: Array<{ quantity: number; product?: { name?: string } }>
      }>(`/api/v1/account/orders/${orderId}`),
  })
  const o = q.data
  return (
    <PageShell title={`${t("order_detail")} ${toLocaleDigits(o?.number || orderId || "", locale)}`}>
      {o ? (
        <div className="space-y-2 text-sm">
          <p>
            {enumLabel("order_status", o.status)} ·{" "}
            <MoneyDisplay amount={o.total_minor} currency={o.currency} />
          </p>
          <ul className="list-disc ps-5">
            {(o.items ?? []).map((it, i) => (
              <li key={i}>
                {it.product?.name ?? "—"} × {formatNumber(it.quantity, locale)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </PageShell>
  )
}

function emptyAddress(): AddressRow {
  return { label: "", name: "", phone: "", province_code: "", city: "", address: "", plaque: "", unit: "", postcode: "" }
}

export function AccountAddressesPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("account_portal")
  const tCommon = useTranslations("common")
  const qc = useQueryClient()
  const [states, setStates] = useState<GeoState[]>([])
  const [cities, setCities] = useState<Record<number, string[]>>({})
  const q = useQuery({
    queryKey: ["account", "addresses"],
    queryFn: () => api<{ addresses: AddressRow[] }>("/api/v1/account/addresses"),
  })
  const [rows, setRows] = useState<AddressRow[]>([emptyAddress()])
  useEffect(() => {
    void fetchGeoStates().then(setStates).catch(() => setStates([]))
  }, [])
  useEffect(() => {
    if (q.data?.addresses?.length) {
      setRows(q.data.addresses)
    }
  }, [q.data])
  const loadCities = async (index: number, code: string) => {
    if (!code) return
    const list = await fetchGeoCities(code).catch(() => [])
    setCities((prev) => ({ ...prev, [index]: list }))
  }
  const save = useMutation({
    mutationFn: () => api("/api/v1/account/addresses", { method: "PATCH", json: { addresses: rows } }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      void qc.invalidateQueries({ queryKey: ["account", "addresses"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })
  return (
    <PageShell title={t("addresses_title")} description={t("addresses_hint")}>
      <div className="space-y-6">
        {rows.map((row, index) => (
          <Card key={index}>
            <CardContent className="grid gap-3 pt-6 sm:grid-cols-2">
              <div><Label>{t("addr_label")}</Label><Input value={row.label ?? ""} onChange={(e) => setRows((r) => r.map((x, i) => i === index ? { ...x, label: e.target.value } : x))} /></div>
              <div><Label>{t("addr_name")}</Label><Input value={row.name ?? ""} onChange={(e) => setRows((r) => r.map((x, i) => i === index ? { ...x, name: e.target.value } : x))} /></div>
              <div><Label>{t("addr_phone")}</Label><Input dir="ltr" value={row.phone ?? ""} onChange={(e) => setRows((r) => r.map((x, i) => i === index ? { ...x, phone: e.target.value } : x))} /></div>
              <div>
                <Label>{t("addr_province")}</Label>
                <select
                  className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                  value={row.province_code ?? ""}
                  onChange={(e) => {
                    const code = e.target.value
                    setRows((r) => r.map((x, i) => i === index ? { ...x, province_code: code, city: "" } : x))
                    void loadCities(index, code)
                  }}
                >
                  <option value="">{t("addr_select_province")}</option>
                  {states.map((s) => (
                    <option key={s.code} value={s.code}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>{t("addr_city")}</Label>
                <select
                  className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                  value={row.city ?? ""}
                  disabled={!row.province_code}
                  onFocus={() => void loadCities(index, row.province_code ?? "")}
                  onChange={(e) => setRows((r) => r.map((x, i) => i === index ? { ...x, city: e.target.value } : x))}
                >
                  <option value="">{t("addr_select_city")}</option>
                  {(cities[index] ?? []).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div><Label>{t("addr_plaque")}</Label><Input value={row.plaque ?? ""} onChange={(e) => setRows((r) => r.map((x, i) => i === index ? { ...x, plaque: e.target.value } : x))} /></div>
              <div><Label>{t("addr_unit")}</Label><Input value={row.unit ?? ""} onChange={(e) => setRows((r) => r.map((x, i) => i === index ? { ...x, unit: e.target.value } : x))} /></div>
              <div><Label>{t("addr_postcode")}</Label><Input dir="ltr" value={row.postcode ?? ""} onChange={(e) => setRows((r) => r.map((x, i) => i === index ? { ...x, postcode: e.target.value } : x))} /></div>
              <div className="sm:col-span-2"><Label>{t("addr_street")}</Label><Textarea value={row.address ?? ""} onChange={(e) => setRows((r) => r.map((x, i) => i === index ? { ...x, address: e.target.value } : x))} /></div>
              <div><Label>{t("addr_lat")}</Label><Input dir="ltr" type="number" step="any" value={row.lat ?? ""} onChange={(e) => setRows((r) => r.map((x, i) => i === index ? { ...x, lat: e.target.value === "" ? null : Number(e.target.value) } : x))} /></div>
              <div><Label>{t("addr_lng")}</Label><Input dir="ltr" type="number" step="any" value={row.lng ?? ""} onChange={(e) => setRows((r) => r.map((x, i) => i === index ? { ...x, lng: e.target.value === "" ? null : Number(e.target.value) } : x))} /></div>
              {rows.length > 1 ? (
                <div className="sm:col-span-2 flex justify-end">
                  <Button type="button" size="sm" variant="ghost" onClick={() => setRows((r) => r.filter((_, i) => i !== index))}>
                    {t("addr_remove")}
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => setRows((r) => [...r, emptyAddress()])}>{t("addr_add")}</Button>
        <Button type="button" disabled={save.isPending} onClick={() => void save.mutateAsync()}>{t("save_addresses")}</Button>
      </div>
    </PageShell>
  )
}

export function AccountNotificationsPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("account_portal")
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ["account", "notifications"],
    queryFn: () =>
      api<{ items: Array<{ id: number; title: string; body: string; read: boolean; link?: string }> }>(
        "/api/v1/account/notifications",
      ),
  })
  const markRead = useMutation({
    mutationFn: (id: number) => api(`/api/v1/account/notifications/${id}/read`, { method: "POST" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["account", "notifications"] }),
  })
  return (
    <PageShell title={t("notifications_title")}>
      <div className="space-y-2">
        {(q.data?.items ?? []).map((n) => (
          <div key={n.id} className={`rounded-lg border p-3 text-sm ${n.read ? "" : "bg-muted/40"}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium">{n.title}</p>
                <p className="text-muted-foreground">{n.body}</p>
              </div>
              {!n.read ? (
                <Button type="button" size="sm" variant="outline" onClick={() => void markRead.mutateAsync(n.id)}>
                  {t("mark_read")}
                </Button>
              ) : null}
            </div>
            {n.link ? (
              <Link href={n.link} className="text-primary mt-2 inline-block text-xs underline">
                {t("open_link")}
              </Link>
            ) : null}
          </div>
        ))}
      </div>
    </PageShell>
  )
}

export function AccountFavoritesPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("account_portal")
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ["account", "favorites"],
    queryFn: () => api<{ products: Array<{ id: number; name: string; slug?: string }> }>("/api/v1/account/favorites"),
  })
  const remove = useMutation({
    mutationFn: (productId: number) => api(`/api/v1/account/favorites/${productId}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["account", "favorites"] }),
  })
  const items = q.data?.products ?? []
  return (
    <PageShell title={t("favorites_title")}>
      {items.length === 0 ? <p className="text-muted-foreground text-sm">{t("no_favorites")}</p> : null}
      <ul className="space-y-2 text-sm">
        {items.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
            <Link href={p.slug ? `/shop/${p.slug}` : "#"} className="text-primary hover:underline">
              {p.name}
            </Link>
            <Button type="button" size="sm" variant="ghost" onClick={() => void remove.mutateAsync(p.id)}>
              {t("remove_favorite")}
            </Button>
          </li>
        ))}
      </ul>
    </PageShell>
  )
}

type PortalReviewRow = {
  id?: number
  rating?: number
  body?: string
  answer?: string | null
  admin_reply?: string | null
  status?: string
  product?: { id?: number; name?: string; slug?: string } | null
}

function AccountQuestionForm() {
  const t = useTranslations("account_portal")
  const qc = useQueryClient()
  const [productId, setProductId] = useState("")
  const [body, setBody] = useState("")
  const products = useQuery({
    queryKey: ["account", "question-products"],
    queryFn: () => api<Array<{ id: number; name: string }>>("/api/v1/account/questions/products"),
  })
  const submit = useMutation({
    mutationFn: () =>
      api("/api/v1/account/questions", { method: "POST", json: { product_id: Number(productId), body } }),
    onSuccess: () => {
      toast.success(t("question_sent"))
      setBody("")
      void qc.invalidateQueries({ queryKey: ["account", "reviews", "questions"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })
  return (
    <Card className="mb-4">
      <CardContent className="grid gap-3 pt-6">
        <p className="font-medium">{t("question_new")}</p>
        <div>
          <Label>{t("question_product")}</Label>
          <select
            className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            <option value="">{t("question_select_product")}</option>
            {(products.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <Label>{t("question_body")}</Label>
          <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        <div>
          <Button
            type="button"
            disabled={!productId || body.trim().length < 3 || submit.isPending}
            onClick={() => void submit.mutateAsync()}
          >
            {t("question_submit")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function AccountReviewsPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("account_portal")
  const enumLabel = useEnumLabel()
  const [tab, setTab] = useState<"pending" | "mine" | "questions">("mine")
  const q = useQuery({
    queryKey: ["account", "reviews", tab],
    queryFn: () => api<PortalReviewRow[]>(`/api/v1/account/reviews?tab=${tab}`),
  })
  const items = q.data ?? []
  const tabs = [
    { id: "pending" as const, label: t("reviews_tab_pending") },
    { id: "mine" as const, label: t("reviews_tab_mine") },
    { id: "questions" as const, label: t("reviews_tab_questions") },
  ]
  const productLink = (r: PortalReviewRow) => (
    <Link href={r.product?.slug ? `/shop/${r.product.slug}` : "#"} className="font-medium text-primary hover:underline">
      {r.product?.name ?? "—"}
    </Link>
  )
  return (
    <PageShell title={t("reviews_title")}>
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((tb) => (
          <Button key={tb.id} type="button" size="sm" variant={tab === tb.id ? "default" : "outline"} onClick={() => setTab(tb.id)}>
            {tb.label}
          </Button>
        ))}
      </div>
      {tab === "questions" ? <AccountQuestionForm /> : null}
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{tab === "questions" ? t("no_questions") : t("no_reviews")}</p>
      ) : null}
      <ul className="space-y-2 text-sm">
        {items.map((r, i) => (
          <li key={r.id ?? i} className="space-y-1 rounded-lg border p-3">
            {tab === "pending" ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                {productLink(r)}
                {r.product?.slug ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/shop/${r.product.slug}#reviews`}>{t("question_write_review")}</Link>
                  </Button>
                ) : null}
              </div>
            ) : tab === "questions" ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {productLink(r)}
                  <Badge variant="outline">{enumLabel("question_status", r.status)}</Badge>
                </div>
                <p className="whitespace-pre-wrap">{r.body}</p>
                {r.answer ? (
                  <p className="bg-muted/50 rounded-md p-2 whitespace-pre-wrap">
                    <span className="font-medium">{t("question_answer")}: </span>
                    {r.answer}
                  </p>
                ) : (
                  <p className="text-muted-foreground text-xs">{t("question_awaiting")}</p>
                )}
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {productLink(r)}
                  <span className="text-muted-foreground text-xs">
                    {r.rating}/5 · {enumLabel("review_status", r.status)}
                  </span>
                </div>
                {r.body ? <p className="whitespace-pre-wrap">{r.body}</p> : null}
                {r.admin_reply ? <p className="bg-muted/50 rounded-md p-2 whitespace-pre-wrap">{r.admin_reply}</p> : null}
              </>
            )}
          </li>
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
    queryFn: () => api<{ name: string; email: string; phone?: string; bank_sheba?: string }>("/api/v1/account/profile"),
  })
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [sheba, setSheba] = useState("")
  useEffect(() => {
    if (q.data) {
      setName(q.data.name ?? "")
      setEmail(q.data.email ?? "")
      setPhone(q.data.phone ?? "")
      setSheba(q.data.bank_sheba ?? "")
    }
  }, [q.data])
  const save = useMutation({
    mutationFn: () => api("/api/v1/account/profile", { method: "PATCH", json: { name, email, phone, bank_sheba: sheba } }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      void qc.invalidateQueries({ queryKey: ["account", "profile"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })
  return (
    <PageShell title={t("profile_title")}>
      <div className="max-w-md space-y-3">
        <div><Label>{t("field_name")}</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><Label>{t("field_email")}</Label><Input dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><Label>{t("field_phone")}</Label><Input dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        <div><Label>{t("field_sheba")}</Label><Input dir="ltr" value={sheba} onChange={(e) => setSheba(e.target.value)} /></div>
        <Button type="button" disabled={save.isPending} onClick={() => void save.mutateAsync()}>{tCommon("save")}</Button>
      </div>
    </PageShell>
  )
}

export function AccountWalletPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("account_portal")
  const tCommon = useTranslations("common")
  const qc = useQueryClient()
  const [withdrawAmount, setWithdrawAmount] = useState("")
  const q = useQuery({
    queryKey: ["account", "wallet"],
    queryFn: () =>
      api<{
        balance_minor: number
        currency: string
        enabled?: boolean
        min_topup_minor?: number
        min_withdraw_minor?: number
        bank_sheba?: string
      }>("/api/v1/account/wallet"),
  })
  const ledgerQ = useQuery({
    queryKey: ["account", "wallet", "ledger"],
    queryFn: () => api<{ items: Array<{ id: number; direction: string; amount_minor: number; note?: string; created_at?: string }> }>(
      "/api/v1/account/wallet/ledger",
    ),
    enabled: Boolean(q.data?.enabled),
  })
  const withdraw = useMutation({
    mutationFn: () =>
      api("/api/v1/account/wallet/withdraw", {
        method: "POST",
        json: { amount_minor: Number(withdrawAmount), sheba: q.data?.bank_sheba },
      }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      setWithdrawAmount("")
      void qc.invalidateQueries({ queryKey: ["account", "wallet"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })
  const w = q.data
  return (
    <PageShell title={t("wallet_title")}>
      <p className="mb-4 text-2xl font-semibold">
        {t("balance")}: <MoneyDisplay amount={w?.balance_minor ?? 0} currency={w?.currency} />
      </p>
      {w?.enabled ? (
        <div className="grid max-w-lg gap-4">
          <Card>
            <CardContent className="space-y-2 pt-6">
              <p className="text-sm">{t("wallet_topup_note")}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-2 pt-6">
              <Label>{t("wallet_withdraw")}</Label>
              <Input dir="ltr" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} placeholder={String(w.min_withdraw_minor ?? "")} />
              <Button type="button" size="sm" disabled={withdraw.isPending || !withdrawAmount} onClick={() => void withdraw.mutateAsync()}>{t("wallet_withdraw_submit")}</Button>
            </CardContent>
          </Card>
          <div>
            <h2 className="mb-2 text-sm font-medium">{t("wallet_ledger")}</h2>
            <ul className="space-y-1 text-sm">
              {(ledgerQ.data?.items ?? []).map((e) => (
                <li key={e.id} className="flex justify-between gap-2 border-b py-1">
                  <span>{e.direction} · {e.note}</span>
                  <MoneyDisplay amount={e.amount_minor} currency={w.currency} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">{t("wallet_disabled")}</p>
      )}
    </PageShell>
  )
}

export function AccountTicketsPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("account_portal")
  const tTickets = useTranslations("tickets")
  const tCommon = useTranslations("common")
  const qc = useQueryClient()
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const q = useQuery({
    queryKey: ["account", "tickets"],
    queryFn: () => api<{ items: Array<{ id: number; subject: string; status: string }> }>("/api/v1/account/tickets"),
  })
  const create = useMutation({
    mutationFn: () => api("/api/v1/account/tickets", { method: "POST", json: { subject, body } }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      setSubject("")
      setBody("")
      void qc.invalidateQueries({ queryKey: ["account", "tickets"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })
  const items = q.data?.items ?? []
  const statusLabel = (s: string) => {
    try {
      return tTickets(`status_${s}` as "status_open")
    } catch {
      return s
    }
  }
  return (
    <PageShell title={t("tickets_title")} description={t("tickets_hint")}>
      <Card className="mb-6">
        <CardContent className="space-y-3 pt-6">
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t("ticket_subject_ph")} />
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("ticket_body_ph")} rows={3} />
          <Button type="button" disabled={!subject.trim() || !body.trim() || create.isPending} onClick={() => void create.mutateAsync()}>
            {t("ticket_create")}
          </Button>
        </CardContent>
      </Card>
      <ul className="space-y-2 text-sm">
        {items.map((tk) => (
          <li key={tk.id}>
            <Link href={`/dashboard/account/tickets/${tk.id}`} className="flex items-center justify-between rounded-lg border px-3 py-2 hover:bg-muted/40">
              <span>{tk.subject}</span>
              <Badge variant="outline">{statusLabel(tk.status)}</Badge>
            </Link>
          </li>
        ))}
      </ul>
    </PageShell>
  )
}

export function AccountTicketDetailPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("tickets")
  const tPortal = useTranslations("account_portal")
  const tCommon = useTranslations("common")
  const qc = useQueryClient()
  const id = Number(route.params?.ticketId ?? 0)
  const [body, setBody] = useState("")
  const [csat, setCsat] = useState(0)
  const q = useQuery({
    queryKey: ["account", "ticket", id],
    enabled: id > 0,
    queryFn: () =>
      api<{
        id: number
        subject: string
        status: string
        csat_rating?: number | null
        replies: Array<{
          id: number
          author: string
          is_staff: boolean
          body: string
          created_at?: string
          attachments?: Array<{ name: string; mime?: string; kind?: string; url?: string | null }>
        }>
      }>(`/api/v1/account/tickets/${id}`),
  })
  const reply = useMutation({
    mutationFn: (payload: { body: string; files: File[]; voice: File | null }) =>
      api(`/api/v1/account/tickets/${id}/replies`, {
        method: "POST",
        body: buildTicketReplyFormData(payload),
      }),
    onSuccess: () => {
      setBody("")
      void qc.invalidateQueries({ queryKey: ["account", "ticket", id] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })
  const rate = useMutation({
    mutationFn: () => api(`/api/v1/account/tickets/${id}`, { method: "PATCH", json: { csat_rating: csat } }),
    onSuccess: () => {
      toast.success(tCommon("saved"))
      void qc.invalidateQueries({ queryKey: ["account", "ticket", id] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })
  const ticket = q.data
  const closed = ticket?.status === "closed"
  const canRate = ticket && (ticket.status === "answered" || ticket.status === "closed") && !ticket.csat_rating
  return (
    <PageShell title={ticket?.subject ?? t("detail_title")}>
      <div className="mb-4 space-y-3">
        {(ticket?.replies ?? []).map((r) => (
          <Card key={r.id} className={r.is_staff ? "border-primary/30" : undefined}>
            <CardContent className="p-4 text-sm">
              <p className="mb-1 font-medium">{r.author}{r.is_staff ? ` · ${t("staff_badge")}` : ""}</p>
              <p className="whitespace-pre-wrap">{r.body}</p>
              <TicketReplyAttachments attachments={r.attachments} />
            </CardContent>
          </Card>
        ))}
      </div>
      {!closed ? (
        <TicketReplyComposer
          body={body}
          onBodyChange={setBody}
          pending={reply.isPending}
          onSubmit={(payload) => reply.mutateAsync(payload)}
        />
      ) : (
        <p className="text-muted-foreground text-sm">{t("closed_hint")}</p>
      )}
      {canRate ? (
        <div className="mt-6 space-y-2 rounded-lg border p-4">
          <p className="text-sm font-medium">{tPortal("csat_title")}</p>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <Button key={n} type="button" size="sm" variant={csat >= n ? "default" : "outline"} onClick={() => setCsat(n)}>
                {n}
              </Button>
            ))}
          </div>
          <Button type="button" size="sm" disabled={csat < 1 || rate.isPending} onClick={() => void rate.mutateAsync()}>
            {tPortal("csat_submit")}
          </Button>
        </div>
      ) : null}
    </PageShell>
  )
}
