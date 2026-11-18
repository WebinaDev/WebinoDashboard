"use client"

import { useQuery } from "@tanstack/react-query"
import { useTranslations } from "next-intl"

import { Badge } from "@/components/ui/badge"
import { MoneyDisplay } from "@/components/currency/MoneyDisplay"
import { api } from "@/lib/api"

type Profile = {
  customer: Record<string, unknown> & { kyc_status?: string | null; created_at?: string }
  stats: {
    orders_count: number
    paid_orders_count: number
    total_spent_minor: number
    avg_order_minor: number
    last_order_at: string | null
    open_tickets: number
    tickets_count: number
    notes_count: number
    wallet_balance_minor: number
    loyalty_points: number
  }
  recent_orders: Array<{ id: number; number: string; status: string; total_minor: number; created_at: string }>
  recent_tickets: Array<{ id: number; subject: string; status: string; created_at: string }>
  erp?: { account_id: number; hub_url: string } | null
}

const fmtDate = (v?: string | null) => (v ? new Date(v).toLocaleDateString("fa-IR") : "—")

/** Staff-facing customer profile overview (KPIs, KYC, bank, recent orders/tickets). */
export function CustomerProfileSummary({ customerId }: { customerId: number }) {
  const t = useTranslations("customers_admin")
  const { data, isLoading } = useQuery({
    queryKey: ["admin-customer-profile", customerId],
    queryFn: () => api<{ data: Profile } | Profile>(`/api/v1/customers/${customerId}/profile`),
  })
  const p: Profile | undefined = data ? ("data" in data ? (data as { data: Profile }).data : (data as Profile)) : undefined
  if (isLoading) return <p className="text-muted-foreground text-sm md:col-span-2">{t("profile_loading")}</p>
  if (!p) return null
  const s = p.stats
  const c = p.customer
  const kyc = (c.kyc_status as string) || "none"
  const kpis: Array<[string, React.ReactNode]> = [
    [t("profile_orders"), `${s.paid_orders_count} / ${s.orders_count}`],
    [t("profile_spent"), <MoneyDisplay key="s" amount={s.total_spent_minor} />],
    [t("profile_avg"), <MoneyDisplay key="a" amount={s.avg_order_minor} />],
    [t("profile_wallet"), <MoneyDisplay key="w" amount={s.wallet_balance_minor} />],
    [t("profile_tickets"), `${s.open_tickets} / ${s.tickets_count}`],
    [t("profile_points"), String(s.loyalty_points)],
    [t("profile_last_order"), fmtDate(s.last_order_at)],
    [t("profile_since"), fmtDate(c.created_at)],
  ]
  const info: Array<[string, unknown]> = [
    [t("phone"), c.phone],
    [t("national_id"), c.national_id],
    [t("bank_name"), c.bank_name],
    [t("bank_card"), c.bank_card],
  ]
  return (
    <div className="space-y-3 rounded-md border p-3 md:col-span-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t("profile_title")}</h3>
        {p.erp?.hub_url ? (
          <a href={p.erp.hub_url} target="_blank" rel="noopener noreferrer" className="text-primary text-xs underline" data-testid="erp-hub-link">
            {t("profile_open_erp_hub")}
          </a>
        ) : null}
        <Badge variant={kyc === "verified" ? "default" : kyc === "rejected" ? "destructive" : "secondary"}>
          {t("kyc_label")}: {t(`kyc_${kyc}` as never)}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {kpis.map(([k, v]) => (
          <div key={k} className="rounded border bg-background p-2">
            <div className="text-muted-foreground text-xs">{k}</div>
            <div className="text-sm font-medium">{v}</div>
          </div>
        ))}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        {info.map(([k, v]) => (
          <div key={k}>
            <dt className="text-muted-foreground text-xs">{k}</dt>
            <dd dir="ltr" className="text-start">{(v as string) || "—"}</dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <div className="mb-1 text-xs font-medium">{t("profile_recent_orders")}</div>
          {p.recent_orders.length === 0 ? <p className="text-muted-foreground text-xs">{t("profile_empty")}</p> : (
            <ul className="space-y-1 text-sm">
              {p.recent_orders.map((o) => (
                <li key={o.id} className="flex justify-between gap-2 rounded border px-2 py-1">
                  <span dir="ltr">#{o.number}</span>
                  <Badge variant="outline">{o.status}</Badge>
                  <MoneyDisplay amount={o.total_minor} />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div className="mb-1 text-xs font-medium">{t("profile_recent_tickets")}</div>
          {p.recent_tickets.length === 0 ? <p className="text-muted-foreground text-xs">{t("profile_empty")}</p> : (
            <ul className="space-y-1 text-sm">
              {p.recent_tickets.map((x) => (
                <li key={x.id} className="flex justify-between gap-2 rounded border px-2 py-1">
                  <span className="truncate">{x.subject}</span>
                  <Badge variant="outline">{x.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
