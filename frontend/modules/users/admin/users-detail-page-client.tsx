"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Mail, Phone, Save } from "lucide-react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { MoneyDisplay } from "@/components/currency/MoneyDisplay"
import { PageShell } from "@/components/PageShell"
import { QueryErrorState } from "@/components/QueryErrorState"
import { ScrollTable } from "@/components/ScrollTable"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { dashboardPath } from "@/kernel/paths"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { useEnumLabel } from "@/lib/enum-labels"
import { formatDisplayDateTime } from "@/lib/format-date"
import { parseStructuredAddress } from "../../commerce/lib/pos-commerce"

type UserDetailPayload = {
  user: {
    id: number
    name: string
    username?: string | null
    first_name?: string | null
    last_name?: string | null
    email?: string | null
    phone?: string | null
    landline?: string | null
    role?: string | null
    is_active?: boolean
    national_id?: string | null
    job?: string | null
    birth_date?: string | null
    bank_sheba?: string | null
    bank_name?: string | null
    bank_account?: string | null
    bank_card?: string | null
    wallet_balance_minor?: number
    loyalty_points?: number
    bot_providers?: string[]
    created_at?: string
  }
  recent_orders: Array<{
    id: number
    number?: string | null
    status: string
    total_minor: number
    created_at?: string
  }>
  reviews: Array<{
    id: number
    rating?: number
    body?: string | null
    status?: string
    product?: { id: number; name?: string } | null
  }>
  wishlist: Array<{ id: number; name: string; slug?: string | null; price_minor?: number }>
  bot_sessions: Array<{ id: number; provider: string; chat_id?: string | null; last_seen_at?: string | null }>
  addresses: unknown[]
}

const selectClass = "border-input bg-background h-9 w-full rounded-md border px-3 text-sm"

export default function UsersDetailPageClient({ route }: { route: ResolvedAdminRoute }) {
  const userId = route.params?.userId
  const t = useTranslations("users_admin")
  const tRoles = useTranslations("rbac.roles")
  const tCommon = useTranslations("common")
  const enumLabel = useEnumLabel()
  const locale = useLocale()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [walletAmount, setWalletAmount] = useState(0)
  const [walletDirection, setWalletDirection] = useState<"credit" | "debit">("credit")
  const [walletNote, setWalletNote] = useState("")

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-user", userId],
    enabled: Boolean(userId),
    queryFn: () => api<UserDetailPayload>(`/api/v1/users/${userId}`),
  })

  const [account, setAccount] = useState<Record<string, string | boolean>>({})
  const [profile, setProfile] = useState<Record<string, string>>({})
  const [bank, setBank] = useState<Record<string, string>>({})

  const user = data?.user

  useEffect(() => {
    if (!user) return
    setAccount({
      email: user.email ?? "",
      phone: user.phone ?? "",
      is_active: user.is_active !== false,
      role: user.role ?? "customer",
    })
    setProfile({
      username: user.username ?? "",
      first_name: user.first_name ?? "",
      last_name: user.last_name ?? "",
      national_id: user.national_id ?? "",
      job: user.job ?? "",
      birth_date: user.birth_date?.slice(0, 10) ?? "",
      landline: user.landline ?? "",
    })
    setBank({
      bank_sheba: user.bank_sheba ?? "",
      bank_name: user.bank_name ?? "",
      bank_account: user.bank_account ?? "",
      bank_card: user.bank_card ?? "",
    })
  }, [user])

  const save = useMutation({
    mutationFn: () =>
      api(`/api/v1/users/${userId}`, {
        method: "PATCH",
        json: {
          email: account.email || null,
          phone: account.phone || null,
          landline: profile.landline || null,
          is_active: account.is_active,
          role: account.role,
          username: profile.username || null,
          first_name: profile.first_name || null,
          last_name: profile.last_name || null,
          national_id: profile.national_id || null,
          job: profile.job || null,
          birth_date: profile.birth_date || null,
          bank_sheba: bank.bank_sheba || null,
          bank_name: bank.bank_name || null,
          bank_account: bank.bank_account || null,
          bank_card: bank.bank_card || null,
        },
      }),
    onSuccess: async () => {
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ["admin-user", userId] })
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] })
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const walletAdjust = useMutation({
    mutationFn: () =>
      api(`/api/v1/wallet/users/${userId}/adjust`, {
        method: "POST",
        json: {
          direction: walletDirection,
          amount_minor: walletAmount,
          note: walletNote || undefined,
        },
      }),
    onSuccess: async () => {
      setError(null)
      setWalletAmount(0)
      setWalletNote("")
      await queryClient.invalidateQueries({ queryKey: ["admin-user", userId] })
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const roleLabel = (role: string) => (tRoles.has(role) ? tRoles(role) : enumLabel("role", role))

  if (!userId) {
    return (
      <PageShell title={t("detail_title")}>
        <p className="text-muted-foreground text-sm">{tCommon("empty")}</p>
      </PageShell>
    )
  }

  if (isError) {
    return (
      <PageShell title={t("detail_title")}>
        <QueryErrorState onRetry={() => refetch()} />
      </PageShell>
    )
  }

  if (isLoading || !user) {
    return (
      <PageShell title={t("detail_title")}>
        <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
      </PageShell>
    )
  }

  return (
    <PageShell
      title={user.name}
      description={user.username ? `@${user.username}` : undefined}
      actions={
        <Button variant="outline" size="sm" asChild>
          <Link href={dashboardPath("users")}>{tCommon("back")}</Link>
        </Button>
      }
    >
      <div className="bg-muted/40 flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-sm">
        {user.phone ? (
          <a href={`tel:${user.phone}`} className="inline-flex items-center gap-1 hover:underline">
            <Phone className="size-4" />
            {user.phone}
          </a>
        ) : null}
        {user.email ? (
          <a href={`mailto:${user.email}`} className="inline-flex items-center gap-1 hover:underline">
            <Mail className="size-4" />
            {user.email}
          </a>
        ) : null}
        <Badge variant="outline">{roleLabel(String(account.role ?? user.role))}</Badge>
        {user.role === "partner" ? (
          <Link href={dashboardPath("account")} className="text-primary text-xs underline">
            {t("partner_portal_link")}
          </Link>
        ) : null}
      </div>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3 rounded-lg border p-4">
          <h2 className="font-semibold">{t("panel_account")}</h2>
          <div className="grid gap-2">
            <Label>{t("email")}</Label>
            <Input value={String(account.email ?? "")} onChange={(e) => setAccount({ ...account, email: e.target.value })} />
            <Label>{t("phone")}</Label>
            <Input value={String(account.phone ?? "")} onChange={(e) => setAccount({ ...account, phone: e.target.value })} />
            <Label>{t("col_role")}</Label>
            <select
              className={selectClass}
              value={String(account.role ?? "customer")}
              onChange={(e) => setAccount({ ...account, role: e.target.value })}
            >
              {["customer", "partner", "subscriber", "staff", "admin", "shop_manager", "seller", "accountant", "author", "editor"].map(
                (r) => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ),
              )}
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={account.is_active !== false}
                onChange={(e) => setAccount({ ...account, is_active: e.target.checked })}
              />
              {t("status_active")}
            </label>
          </div>
        </section>

        <section className="space-y-3 rounded-lg border p-4">
          <h2 className="font-semibold">{t("panel_profile")}</h2>
          <div className="grid gap-2">
            <Label>{t("username")}</Label>
            <Input value={profile.username} onChange={(e) => setProfile({ ...profile, username: e.target.value })} />
            <Label>{t("first_name")}</Label>
            <Input value={profile.first_name} onChange={(e) => setProfile({ ...profile, first_name: e.target.value })} />
            <Label>{t("last_name")}</Label>
            <Input value={profile.last_name} onChange={(e) => setProfile({ ...profile, last_name: e.target.value })} />
            <Label>{t("national_id")}</Label>
            <Input value={profile.national_id} onChange={(e) => setProfile({ ...profile, national_id: e.target.value })} />
            <Label>{t("job")}</Label>
            <Input value={profile.job} onChange={(e) => setProfile({ ...profile, job: e.target.value })} />
            <Label>{t("birth_date")}</Label>
            <Input type="date" value={profile.birth_date} onChange={(e) => setProfile({ ...profile, birth_date: e.target.value })} />
            <Label>{t("landline")}</Label>
            <Input value={profile.landline} onChange={(e) => setProfile({ ...profile, landline: e.target.value })} />
          </div>
        </section>

        <section className="space-y-3 rounded-lg border p-4">
          <h2 className="font-semibold">{t("panel_bank")}</h2>
          <div className="grid gap-2">
            <Label>{t("sheba")}</Label>
            <Input value={bank.bank_sheba} onChange={(e) => setBank({ ...bank, bank_sheba: e.target.value })} />
            <Label>{t("bank_name")}</Label>
            <Input value={bank.bank_name} onChange={(e) => setBank({ ...bank, bank_name: e.target.value })} />
            <Label>{t("bank_account")}</Label>
            <Input value={bank.bank_account} onChange={(e) => setBank({ ...bank, bank_account: e.target.value })} />
            <Label>{t("bank_card")}</Label>
            <Input value={bank.bank_card} onChange={(e) => setBank({ ...bank, bank_card: e.target.value })} />
          </div>
        </section>

        <section className="space-y-3 rounded-lg border p-4">
          <h2 className="font-semibold">{t("panel_wallet")}</h2>
          <p className="text-sm">
            {t("wallet_balance")}: <MoneyDisplay amount={user.wallet_balance_minor ?? 0} />
          </p>
          <p className="text-sm">
            {t("loyalty_points")}: {user.loyalty_points ?? 0}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label>{t("wallet_direction")}</Label>
              <select className={selectClass} value={walletDirection} onChange={(e) => setWalletDirection(e.target.value as "credit" | "debit")}>
                <option value="credit">{t("wallet_credit")}</option>
                <option value="debit">{t("wallet_debit")}</option>
              </select>
            </div>
            <div>
              <Label>{t("wallet_amount")}</Label>
              <Input type="number" min={1} value={walletAmount || ""} onChange={(e) => setWalletAmount(Number(e.target.value))} />
            </div>
          </div>
          <Label>{t("wallet_note")}</Label>
          <Textarea value={walletNote} onChange={(e) => setWalletNote(e.target.value)} rows={2} />
          <Button size="sm" disabled={walletAdjust.isPending || walletAmount < 1} onClick={() => walletAdjust.mutate()}>
            {t("wallet_apply")}
          </Button>
        </section>
      </div>

      <div className="flex justify-end">
        <Button disabled={save.isPending} onClick={() => save.mutate()}>
          <Save className="size-4" />
          {tCommon("save")}
        </Button>
      </div>

      <section className="space-y-2">
        <h2 className="font-semibold">{t("recent_orders")}</h2>
        {(data?.recent_orders ?? []).length === 0 ? (
          <p className="text-muted-foreground text-sm">{tCommon("empty")}</p>
        ) : (
          <ScrollTable>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-2 text-start">{t("order_number")}</th>
                  <th className="p-2 text-start">{t("order_status")}</th>
                  <th className="p-2 text-start">{t("order_total")}</th>
                  <th className="p-2 text-start">{t("order_date")}</th>
                </tr>
              </thead>
              <tbody>
                {(data?.recent_orders ?? []).map((o) => (
                  <tr key={o.id} className="border-b">
                    <td className="p-2">
                      <Link href={dashboardPath(`orders/${o.id}`)} className="text-primary hover:underline">
                        {o.number ?? `#${o.id}`}
                      </Link>
                    </td>
                    <td className="p-2">{enumLabel("order_status", o.status)}</td>
                    <td className="p-2">
                      <MoneyDisplay amount={o.total_minor} />
                    </td>
                    <td className="p-2">{formatDisplayDateTime(o.created_at, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollTable>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">{t("addresses")}</h2>
        {(data?.addresses ?? []).length === 0 ? (
          <p className="text-muted-foreground text-sm">{tCommon("empty")}</p>
        ) : (
          <ul className="space-y-2">
            {(data?.addresses ?? []).map((raw, i) => {
              const a = parseStructuredAddress(raw)
              return (
                <li key={i} className="rounded-lg border p-3 text-sm">
                  <div>{[a.city, a.province_code].filter(Boolean).join(" · ") || tCommon("em_dash")}</div>
                  <div className="text-muted-foreground">{a.address || tCommon("em_dash")}</div>
                  <div className="text-muted-foreground flex flex-wrap gap-x-3 text-xs">
                    {a.plaque ? <span>{t("plaque")}: {a.plaque}</span> : null}
                    {a.unit ? <span>{t("unit")}: {a.unit}</span> : null}
                    {a.postcode ? <span>{t("postcode")}: {a.postcode}</span> : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">{t("reviews")}</h2>
        {(data?.reviews ?? []).length === 0 ? (
          <p className="text-muted-foreground text-sm">{tCommon("empty")}</p>
        ) : (
          <ul className="space-y-2">
            {(data?.reviews ?? []).map((r) => (
              <li key={r.id} className="rounded-lg border p-3 text-sm">
                <div className="font-medium">{r.product?.name ?? tCommon("em_dash")}</div>
                <div className="text-muted-foreground text-xs">
                  {t("review_rating")}: {r.rating ?? "—"} · {enumLabel("review_status", r.status)}
                </div>
                {r.body ? <p className="mt-1">{r.body}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">{t("wishlist")}</h2>
        {(data?.wishlist ?? []).length === 0 ? (
          <p className="text-muted-foreground text-sm">{tCommon("empty")}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {(data?.wishlist ?? []).map((p) => (
              <li key={p.id}>
                <Link href={dashboardPath(`products/${p.id}`)} className="text-primary hover:underline">
                  {p.name}
                </Link>
                {p.price_minor != null ? (
                  <span className="text-muted-foreground ms-2">
                    <MoneyDisplay amount={p.price_minor} />
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">{t("bots_loyalty")}</h2>
        {(data?.bot_sessions ?? []).length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("no_bot_links")}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {(data?.bot_sessions ?? []).map((s) => (
              <li key={s.id}>
                {s.provider} · {s.chat_id ?? tCommon("em_dash")}
                {s.last_seen_at ? ` · ${formatDisplayDateTime(s.last_seen_at, locale)}` : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  )
}
