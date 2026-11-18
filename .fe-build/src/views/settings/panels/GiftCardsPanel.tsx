"use client"

/* Gift cards: issue, list with balance, adjust, disable. API: /api/v1/marketing/gift-cards. */

import { useCallback, useEffect, useState } from "react"
import { useLocale } from "next-intl"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BuilderPrice } from "@/builder/money"
import { api } from "@/lib/api"

type GiftCard = {
  id: number
  code: string
  initial_minor: number
  balance_minor: number
  status: string
  recipient_name?: string | null
  expires_at?: string | null
  created_at?: string
}

export function GiftCardsPanel() {
  const fa = useLocale() !== "en"
  const tx = (f: string, e: string) => (fa ? f : e)
  const [rows, setRows] = useState<GiftCard[]>([])
  const [q, setQ] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ amount: "", code: "", recipient_name: "", recipient_phone: "", expires_at: "", message: "" })
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api<GiftCard[] | { data?: GiftCard[] }>(`/api/v1/marketing/gift-cards?per_page=50${q ? `&search=${encodeURIComponent(q)}` : ""}`)
      .then((r) => setRows(Array.isArray(r) ? r : (r.data ?? [])))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "error"))
  }, [q])

  useEffect(() => {
    load()
  }, [load])

  async function issue() {
    setBusy(true)
    setError(null)
    try {
      await api("/api/v1/marketing/gift-cards", {
        method: "POST",
        json: {
          amount_minor: Number(form.amount.replace(/[^\d]/g, "")) || 0,
          code: form.code || undefined,
          recipient_name: form.recipient_name || undefined,
          recipient_phone: form.recipient_phone || undefined,
          expires_at: form.expires_at || undefined,
          message: form.message || undefined,
        },
      })
      setForm({ amount: "", code: "", recipient_name: "", recipient_phone: "", expires_at: "", message: "" })
      load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "error")
    } finally {
      setBusy(false)
    }
  }

  async function adjust(card: GiftCard, direction: "credit" | "debit") {
    const raw = window.prompt(tx("مبلغ", "Amount"))
    const amount = Number(String(raw ?? "").replace(/[^\d]/g, ""))
    if (!amount) return
    try {
      await api(`/api/v1/marketing/gift-cards/${card.id}/adjust`, { method: "POST", json: { direction, amount_minor: amount } })
      load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "error")
    }
  }

  async function toggle(card: GiftCard) {
    try {
      await api(`/api/v1/marketing/gift-cards/${card.id}`, { method: "PUT", json: { status: card.status === "active" ? "disabled" : "active" } })
      load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "error")
    }
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{tx("صدور کارت هدیه", "Issue a gift card")}</CardTitle>
          <CardDescription>{tx("کد خالی بماند تا خودکار ساخته شود. مبلغ به واحد پول فروشگاه است.", "Leave the code empty to generate one. Amount is in the store currency.")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="grid gap-1"><Label>{tx("مبلغ", "Amount")}</Label><Input dir="ltr" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          <div className="grid gap-1"><Label>{tx("کد", "Code")}</Label><Input dir="ltr" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
          <div className="grid gap-1"><Label>{tx("تاریخ انقضا", "Expires at")}</Label><Input type="date" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} /></div>
          <div className="grid gap-1"><Label>{tx("نام گیرنده", "Recipient name")}</Label><Input value={form.recipient_name} onChange={(e) => setForm({ ...form, recipient_name: e.target.value })} /></div>
          <div className="grid gap-1"><Label>{tx("موبایل گیرنده", "Recipient phone")}</Label><Input dir="ltr" value={form.recipient_phone} onChange={(e) => setForm({ ...form, recipient_phone: e.target.value })} /></div>
          <div className="grid gap-1"><Label>{tx("پیام", "Message")}</Label><Input value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></div>
          <div className="md:col-span-3"><Button disabled={busy || !form.amount} onClick={() => void issue()}>{tx("صدور", "Issue")}</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tx("کارت‌های هدیه", "Gift cards")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Input placeholder={tx("جستجوی کد یا گیرنده", "Search code or recipient")} value={q} onChange={(e) => setQ(e.target.value)} />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="p-2 text-start">{tx("کد", "Code")}</th>
                  <th className="p-2 text-start">{tx("گیرنده", "Recipient")}</th>
                  <th className="p-2 text-start">{tx("مبلغ اولیه", "Initial")}</th>
                  <th className="p-2 text-start">{tx("مانده", "Balance")}</th>
                  <th className="p-2 text-start">{tx("وضعیت", "Status")}</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="p-2 font-mono" dir="ltr">{c.code}</td>
                    <td className="p-2">{c.recipient_name || ""}</td>
                    <td className="p-2"><BuilderPrice amount={c.initial_minor} /></td>
                    <td className="p-2"><BuilderPrice amount={c.balance_minor} /></td>
                    <td className="p-2">{c.status === "active" ? tx("فعال", "Active") : c.status === "used" ? tx("مصرف‌شده", "Used") : tx("غیرفعال", "Disabled")}</td>
                    <td className="flex gap-1 p-2">
                      <Button size="sm" variant="outline" onClick={() => void adjust(c, "credit")}>{tx("افزایش", "Credit")}</Button>
                      <Button size="sm" variant="outline" onClick={() => void adjust(c, "debit")}>{tx("کاهش", "Debit")}</Button>
                      <Button size="sm" variant="outline" onClick={() => void toggle(c)}>{c.status === "active" ? tx("غیرفعال کن", "Disable") : tx("فعال کن", "Enable")}</Button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr><td className="p-2 text-muted-foreground" colSpan={6}>{tx("هنوز کارت هدیه‌ای صادر نشده است.", "No gift cards yet.")}</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
