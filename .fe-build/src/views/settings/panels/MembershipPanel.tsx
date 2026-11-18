"use client"

/* Premium membership: plans (sold through the shop), member discount, free download quota,
   comparison table rows and members. API: /api/v1/membership/*. */

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { BuilderPrice } from "@/builder/money"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"

type Unit = "day" | "month" | "year"
type Plan = {
  id: number
  name: string
  slug: string
  description?: string | null
  duration_value: number
  duration_unit: Unit
  duration_label?: string
  price_minor: number
  regular_price_minor: number
  sale_price_minor?: number | null
  badge?: string | null
  is_featured: boolean
  is_active: boolean
  sort: number
  product_id?: number | null
  members_count?: number
}
type Cell = boolean | string
type Feature = { key?: string; label: string; free: Cell; premium: Cell; sort?: number }
type Settings = {
  enabled: boolean
  discount_percent: number
  downloads: { free_audio: number; free_video: number; period: "lifetime" | "month" }
  staff_full_access: boolean
  features: Feature[]
}
type Member = { id: number; name: string; phone?: string | null; email?: string | null; is_premium: boolean; premium_until?: string | null }

const emptyPlan = { name: "", duration_value: "1", duration_unit: "month" as Unit, price: "", sale: "", badge: "", description: "", is_featured: false, is_active: true, sort: "0" }
const digits = (v: string) => Number(String(v).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[^\d]/g, "")) || 0
const list = <T,>(r: unknown): T[] => (Array.isArray(r) ? (r as T[]) : ((r as { data?: T[] })?.data ?? []))
const err = (e: unknown) => toast.error(e instanceof Error ? e.message : "error")

export function MembershipPanel() {
  const t = useTranslations("membership_admin")
  const [plans, setPlans] = useState<Plan[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [form, setForm] = useState(emptyPlan)
  const [editId, setEditId] = useState<number | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [q, setQ] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api<unknown>("/api/v1/membership/plans").then((r) => setPlans(list<Plan>(r))).catch(err)
    api<Settings>("/api/v1/membership/settings").then(setSettings).catch(err)
  }, [])
  const loadMembers = useCallback(() => {
    api<unknown>(`/api/v1/membership/members?per_page=50${q ? `&q=${encodeURIComponent(q)}` : ""}`).then((r) => setMembers(list<Member>(r))).catch(err)
  }, [q])
  useEffect(load, [load])
  useEffect(loadMembers, [loadMembers])

  async function savePlan() {
    setBusy(true)
    try {
      const body = {
        name: form.name,
        duration_value: digits(form.duration_value) || 1,
        duration_unit: form.duration_unit,
        price_minor: digits(form.price),
        sale_price_minor: form.sale ? digits(form.sale) : null,
        badge: form.badge || null,
        description: form.description || null,
        is_featured: form.is_featured,
        is_active: form.is_active,
        sort: digits(form.sort),
      }
      await api(editId ? `/api/v1/membership/plans/${editId}` : "/api/v1/membership/plans", { method: editId ? "PUT" : "POST", json: body })
      toast.success(t("saved"))
      setForm(emptyPlan)
      setEditId(null)
      load()
    } catch (e) {
      err(e)
    } finally {
      setBusy(false)
    }
  }

  function edit(p: Plan) {
    setEditId(p.id)
    setForm({
      name: p.name,
      duration_value: String(p.duration_value),
      duration_unit: p.duration_unit,
      price: String(p.regular_price_minor),
      sale: p.sale_price_minor ? String(p.sale_price_minor) : "",
      badge: p.badge ?? "",
      description: p.description ?? "",
      is_featured: p.is_featured,
      is_active: p.is_active,
      sort: String(p.sort ?? 0),
    })
  }

  async function removePlan(p: Plan) {
    if (!window.confirm(t("delete_confirm", { name: p.name }))) return
    try {
      await api(`/api/v1/membership/plans/${p.id}`, { method: "DELETE" })
      load()
    } catch (e) {
      err(e)
    }
  }

  async function saveSettings(next: Settings) {
    setBusy(true)
    try {
      setSettings(await api<Settings>("/api/v1/membership/settings", { method: "PUT", json: next }))
      toast.success(t("saved"))
    } catch (e) {
      err(e)
    } finally {
      setBusy(false)
    }
  }

  async function grant(m: Member) {
    const raw = window.prompt(t("grant_days_prompt"), "30")
    const days = digits(String(raw ?? ""))
    if (!days) return
    try {
      await api(`/api/v1/membership/members/${m.id}/grants`, { method: "POST", json: { duration_value: days, duration_unit: "day" } })
      loadMembers()
    } catch (e) {
      err(e)
    }
  }

  const setFeature = (i: number, patch: Partial<Feature>) =>
    settings && setSettings({ ...settings, features: settings.features.map((f, j) => (j === i ? { ...f, ...patch } : f)) })
  const cellInput = (v: Cell) => (v === true ? "✓" : v === false ? "" : v)
  const cellValue = (s: string): Cell => (s.trim() === "✓" || s.trim() === "1" ? true : s.trim() === "" ? false : s)

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{editId ? t("edit_plan") : t("new_plan")}</CardTitle>
          <CardDescription>{t("plan_hint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="grid gap-1"><Label>{t("name")}</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="grid gap-1">
            <Label>{t("duration")}</Label>
            <div className="flex gap-2">
              <Input dir="ltr" className="w-24" value={form.duration_value} onChange={(e) => setForm({ ...form, duration_value: e.target.value })} />
              <select className="rounded-md border bg-transparent px-2" value={form.duration_unit} onChange={(e) => setForm({ ...form, duration_unit: e.target.value as Unit })}>
                <option value="day">{t("unit_day")}</option>
                <option value="month">{t("unit_month")}</option>
                <option value="year">{t("unit_year")}</option>
              </select>
            </div>
          </div>
          <div className="grid gap-1"><Label>{t("badge")}</Label><Input value={form.badge} onChange={(e) => setForm({ ...form, badge: e.target.value })} /></div>
          <div className="grid gap-1"><Label>{t("price")}</Label><Input dir="ltr" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
          <div className="grid gap-1"><Label>{t("sale_price")}</Label><Input dir="ltr" value={form.sale} onChange={(e) => setForm({ ...form, sale: e.target.value })} /></div>
          <div className="grid gap-1"><Label>{t("sort")}</Label><Input dir="ltr" value={form.sort} onChange={(e) => setForm({ ...form, sort: e.target.value })} /></div>
          <div className="grid gap-1 md:col-span-3"><Label>{t("description")}</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />{t("active")}</label>
          <label className="flex items-center gap-2 text-sm"><Switch checked={form.is_featured} onCheckedChange={(v) => setForm({ ...form, is_featured: v })} />{t("featured")}</label>
          <div className="flex gap-2 md:col-span-3">
            <Button disabled={busy || !form.name || !form.price} onClick={() => void savePlan()}>{t("save")}</Button>
            {editId ? <Button variant="outline" onClick={() => { setEditId(null); setForm(emptyPlan) }}>{t("cancel")}</Button> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("plans")}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground">
                <th className="p-2 text-start">{t("name")}</th>
                <th className="p-2 text-start">{t("duration")}</th>
                <th className="p-2 text-start">{t("price")}</th>
                <th className="p-2 text-start">{t("members")}</th>
                <th className="p-2 text-start">{t("status")}</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-2">{p.name}{p.badge ? <span className="ms-2 rounded bg-muted px-1 text-xs">{p.badge}</span> : null}</td>
                  <td className="p-2">{p.duration_label}</td>
                  <td className="p-2"><BuilderPrice amount={p.price_minor} original={p.regular_price_minor > p.price_minor ? p.regular_price_minor : undefined} /></td>
                  <td className="p-2">{p.members_count ?? 0}</td>
                  <td className="p-2">{p.is_active ? t("active") : t("inactive")}</td>
                  <td className="flex gap-1 p-2">
                    <Button size="sm" variant="outline" onClick={() => edit(p)}>{t("edit")}</Button>
                    <Button size="sm" variant="outline" onClick={() => void removePlan(p)}>{t("delete")}</Button>
                  </td>
                </tr>
              ))}
              {plans.length === 0 ? <tr><td className="p-2 text-muted-foreground" colSpan={6}>{t("no_plans")}</td></tr> : null}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {settings ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("settings")}</CardTitle>
            <CardDescription>{t("settings_hint")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <label className="flex items-center gap-2 text-sm md:col-span-3"><Switch checked={settings.enabled} onCheckedChange={(v) => setSettings({ ...settings, enabled: v })} />{t("enabled")}</label>
            <div className="grid gap-1"><Label>{t("discount_percent")}</Label><Input dir="ltr" value={String(settings.discount_percent)} onChange={(e) => setSettings({ ...settings, discount_percent: digits(e.target.value) })} /></div>
            <div className="grid gap-1"><Label>{t("free_audio")}</Label><Input dir="ltr" value={String(settings.downloads.free_audio)} onChange={(e) => setSettings({ ...settings, downloads: { ...settings.downloads, free_audio: digits(e.target.value) } })} /></div>
            <div className="grid gap-1"><Label>{t("free_video")}</Label><Input dir="ltr" value={String(settings.downloads.free_video)} onChange={(e) => setSettings({ ...settings, downloads: { ...settings.downloads, free_video: digits(e.target.value) } })} /></div>
            <div className="grid gap-1">
              <Label>{t("quota_period")}</Label>
              <select className="h-9 rounded-md border bg-transparent px-2" value={settings.downloads.period} onChange={(e) => setSettings({ ...settings, downloads: { ...settings.downloads, period: e.target.value as "lifetime" | "month" } })}>
                <option value="lifetime">{t("period_lifetime")}</option>
                <option value="month">{t("period_month")}</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm md:col-span-2"><Switch checked={settings.staff_full_access} onCheckedChange={(v) => setSettings({ ...settings, staff_full_access: v })} />{t("staff_full_access")}</label>

            <div className="grid gap-2 md:col-span-3">
              <Label>{t("features")}</Label>
              <p className="text-xs text-muted-foreground">{t("features_hint")}</p>
              {settings.features.map((f, i) => (
                <div key={i} className="grid grid-cols-[1fr_8rem_8rem_auto] gap-2">
                  <Input placeholder={t("feature_label")} value={f.label} onChange={(e) => setFeature(i, { label: e.target.value })} />
                  <Input placeholder={t("free_user")} value={cellInput(f.free)} onChange={(e) => setFeature(i, { free: cellValue(e.target.value) })} />
                  <Input placeholder={t("premium_user")} value={cellInput(f.premium)} onChange={(e) => setFeature(i, { premium: cellValue(e.target.value) })} />
                  <Button size="sm" variant="outline" onClick={() => setSettings({ ...settings, features: settings.features.filter((_, j) => j !== i) })}>{t("delete")}</Button>
                </div>
              ))}
              <div>
                <Button size="sm" variant="outline" onClick={() => setSettings({ ...settings, features: [...settings.features, { label: "", free: false, premium: true }] })}>{t("add_feature")}</Button>
              </div>
            </div>
            <div className="md:col-span-3"><Button disabled={busy} onClick={() => void saveSettings(settings)}>{t("save")}</Button></div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle>{t("members")}</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <Input placeholder={t("search_members")} value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="p-2 text-start">{t("name")}</th>
                  <th className="p-2 text-start">{t("phone")}</th>
                  <th className="p-2 text-start">{t("premium_until")}</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="border-t">
                    <td className="p-2">{m.name}</td>
                    <td className="p-2" dir="ltr">{m.phone ?? ""}</td>
                    <td className="p-2">{m.is_premium && m.premium_until ? new Date(m.premium_until).toLocaleDateString("fa-IR") : t("expired")}</td>
                    <td className="p-2"><Button size="sm" variant="outline" onClick={() => void grant(m)}>{t("grant")}</Button></td>
                  </tr>
                ))}
                {members.length === 0 ? <tr><td className="p-2 text-muted-foreground" colSpan={4}>{t("no_members")}</td></tr> : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
