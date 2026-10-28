"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLocale } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"

import { LocaleDatePicker } from "@/components/LocaleDatePicker"
import { PageShell } from "@/components/PageShell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { formatNumber } from "@/lib/locale"
import { PopupCard, type PopupContent } from "@webina/ui"

type Popup = {
  id?: number
  name: string
  status: "draft" | "active" | "paused"
  priority: number
  content: PopupContent
  trigger: "load" | "delay" | "scroll" | "exit" | "idle"
  trigger_value: number
  targeting: { include: string[]; exclude: string[]; devices: ("desktop" | "mobile")[]; audience: "all" | "guest" | "logged_in"; new_visitors_only: boolean }
  display: { frequency: "always" | "session" | "once" | "days"; days: number; max_views: number }
  starts_at: string | null
  ends_at: string | null
  views?: number
  clicks?: number
  closes?: number
  leads?: number
}

const EMPTY: Popup = {
  name: "",
  status: "draft",
  priority: 0,
  content: { title: "", body: "", image_url: "", cta_label: "", cta_url: "", coupon_code: "", collect: "none", position: "center" },
  trigger: "delay",
  trigger_value: 5,
  targeting: { include: [], exclude: [], devices: ["desktop", "mobile"], audience: "all", new_visitors_only: false },
  display: { frequency: "session", days: 7, max_views: 0 },
  starts_at: null,
  ends_at: null,
}

const TRIGGERS: Record<Popup["trigger"], string> = {
  load: "بلافاصله پس از باز شدن صفحه",
  delay: "پس از چند ثانیه",
  scroll: "پس از اسکرول درصدی از صفحه",
  exit: "هنگام قصد خروج (موس به بالای صفحه)",
  idle: "پس از چند ثانیه بی‌فعالیتی",
}
const STATUS: Record<Popup["status"], string> = { draft: "پیش‌نویس", active: "فعال", paused: "متوقف" }
const FREQ: Record<Popup["display"]["frequency"], string> = { always: "هر بار بازدید صفحه", session: "یک بار در هر نشست", once: "فقط یک بار برای هر بازدیدکننده", days: "هر چند روز یک بار" }
const sel = "h-9 w-full rounded-md border bg-background px-2 text-sm"
const lines = (v: string) => v.split("\n").map((x) => x.trim()).filter(Boolean)
const toLocal = (v: string | null) => (v ? v.slice(0, 16) : null)

export default function PopupsPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const locale = useLocale()
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ["marketing-popups"], queryFn: () => api<{ data: Popup[] }>("/api/v1/marketing/popups") })
  const [edit, setEdit] = useState<Popup | null>(null)

  const save = useMutation({
    mutationFn: (p: Popup) =>
      p.id ? api(`/api/v1/marketing/popups/${p.id}`, { method: "PUT", json: p }) : api("/api/v1/marketing/popups", { method: "POST", json: p }),
    onSuccess: async () => {
      toast.success("پاپ‌آپ ذخیره شد")
      setEdit(null)
      await qc.invalidateQueries({ queryKey: ["marketing-popups"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })
  const del = useMutation({
    mutationFn: (id: number) => api(`/api/v1/marketing/popups/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["marketing-popups"] }),
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  if (edit) {
    const set = (patch: Partial<Popup>) => setEdit({ ...edit, ...patch })
    const c = (patch: Partial<PopupContent>) => set({ content: { ...edit.content, ...patch } })
    const tg = (patch: Partial<Popup["targeting"]>) => set({ targeting: { ...edit.targeting, ...patch } })
    const dp = (patch: Partial<Popup["display"]>) => set({ display: { ...edit.display, ...patch } })
    const toggleDevice = (d: "desktop" | "mobile", on: boolean) =>
      tg({ devices: on ? Array.from(new Set([...edit.targeting.devices, d])) : edit.targeting.devices.filter((x) => x !== d) })
    return (
      <PageShell title={edit.id ? "ویرایش پاپ‌آپ" : "پاپ‌آپ جدید"} description="محتوا، زمان نمایش، هدف‌گیری و قوانین تکرار">
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">عمومی</CardTitle></CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1 sm:col-span-1"><Label>نام داخلی</Label><Input value={edit.name} onChange={(e) => set({ name: e.target.value })} /></div>
                <div className="space-y-1"><Label>وضعیت</Label>
                  <select className={sel} value={edit.status} onChange={(e) => set({ status: e.target.value as Popup["status"] })}>
                    {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="space-y-1"><Label>اولویت (بزرگ‌تر = اول)</Label><Input type="number" min={0} value={edit.priority} onChange={(e) => set({ priority: Number(e.target.value) || 0 })} /></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">محتوا</CardTitle></CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2"><Label>عنوان</Label><Input value={edit.content.title ?? ""} onChange={(e) => c({ title: e.target.value })} /></div>
                <div className="space-y-1 sm:col-span-2"><Label>متن</Label><Textarea rows={3} value={edit.content.body ?? ""} onChange={(e) => c({ body: e.target.value })} /></div>
                <div className="space-y-1 sm:col-span-2"><Label>آدرس تصویر</Label><Input dir="ltr" value={edit.content.image_url ?? ""} onChange={(e) => c({ image_url: e.target.value })} /></div>
                <div className="space-y-1"><Label>متن دکمه</Label><Input value={edit.content.cta_label ?? ""} onChange={(e) => c({ cta_label: e.target.value })} /></div>
                <div className="space-y-1"><Label>لینک دکمه</Label><Input dir="ltr" value={edit.content.cta_url ?? ""} onChange={(e) => c({ cta_url: e.target.value })} /></div>
                <div className="space-y-1"><Label>کد تخفیف (قابل کپی)</Label><Input dir="ltr" value={edit.content.coupon_code ?? ""} onChange={(e) => c({ coupon_code: e.target.value })} /></div>
                <div className="space-y-1"><Label>جمع‌آوری مخاطب (عضویت خبرنامه)</Label>
                  <select className={sel} value={edit.content.collect ?? "none"} onChange={(e) => c({ collect: e.target.value as PopupContent["collect"] })}>
                    <option value="none">ندارد</option><option value="phone">شماره موبایل</option><option value="email">ایمیل</option>
                  </select>
                </div>
                <div className="space-y-1"><Label>جایگاه</Label>
                  <select className={sel} value={edit.content.position ?? "center"} onChange={(e) => c({ position: e.target.value as PopupContent["position"] })}>
                    <option value="center">وسط صفحه</option><option value="bottom">نوار پایین</option><option value="corner">گوشه پایین</option>
                  </select>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">تریگر</CardTitle></CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label>زمان نمایش</Label>
                  <select className={sel} value={edit.trigger} onChange={(e) => set({ trigger: e.target.value as Popup["trigger"] })}>
                    {Object.entries(TRIGGERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                {edit.trigger === "delay" || edit.trigger === "idle" || edit.trigger === "scroll" ? (
                  <div className="space-y-1"><Label>{edit.trigger === "scroll" ? "درصد اسکرول" : "ثانیه"}</Label>
                    <Input type="number" min={0} max={edit.trigger === "scroll" ? 100 : 3600} value={edit.trigger_value} onChange={(e) => set({ trigger_value: Number(e.target.value) || 0 })} />
                  </div>
                ) : null}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">هدف‌گیری</CardTitle></CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label>فقط این مسیرها (هر خط یکی، * مجاز؛ خالی = همه)</Label>
                  <Textarea dir="ltr" rows={3} defaultValue={edit.targeting.include.join("\n")} onBlur={(e) => tg({ include: lines(e.target.value) })} placeholder={"/\n/shop*\n/product/*"} />
                </div>
                <div className="space-y-1"><Label>به‌جز این مسیرها</Label>
                  <Textarea dir="ltr" rows={3} defaultValue={edit.targeting.exclude.join("\n")} onBlur={(e) => tg({ exclude: lines(e.target.value) })} placeholder={"/cart\n/checkout*"} />
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <label className="flex items-center gap-2"><Switch checked={edit.targeting.devices.includes("desktop")} onCheckedChange={(v) => toggleDevice("desktop", v)} />دسکتاپ</label>
                  <label className="flex items-center gap-2"><Switch checked={edit.targeting.devices.includes("mobile")} onCheckedChange={(v) => toggleDevice("mobile", v)} />موبایل</label>
                </div>
                <div className="space-y-1"><Label>مخاطب</Label>
                  <select className={sel} value={edit.targeting.audience} onChange={(e) => tg({ audience: e.target.value as Popup["targeting"]["audience"] })}>
                    <option value="all">همه بازدیدکنندگان</option><option value="guest">فقط مهمان‌ها</option><option value="logged_in">فقط کاربران واردشده</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm"><Switch checked={edit.targeting.new_visitors_only} onCheckedChange={(v) => tg({ new_visitors_only: v })} />فقط بازدیدکنندگان جدید</label>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">قوانین نمایش</CardTitle></CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label>تکرار</Label>
                  <select className={sel} value={edit.display.frequency} onChange={(e) => dp({ frequency: e.target.value as Popup["display"]["frequency"] })}>
                    {Object.entries(FREQ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                {edit.display.frequency === "days" ? (
                  <div className="space-y-1"><Label>هر چند روز</Label><Input type="number" min={1} value={edit.display.days} onChange={(e) => dp({ days: Math.max(1, Number(e.target.value) || 1) })} /></div>
                ) : null}
                <div className="space-y-1"><Label>حداکثر دفعات نمایش به هر نفر (۰ = نامحدود)</Label><Input type="number" min={0} value={edit.display.max_views} onChange={(e) => dp({ max_views: Number(e.target.value) || 0 })} /></div>
                <div className="space-y-1"><Label>شروع نمایش</Label><LocaleDatePicker locale={locale} withTime value={toLocal(edit.starts_at)} onChange={(v) => set({ starts_at: v })} /></div>
                <div className="space-y-1"><Label>پایان نمایش</Label><LocaleDatePicker locale={locale} withTime value={toLocal(edit.ends_at)} onChange={(v) => set({ ends_at: v })} /></div>
              </CardContent>
            </Card>
            <div className="flex gap-2">
              <Button disabled={!edit.name.trim() || save.isPending} onClick={() => save.mutate(edit)}>ذخیره</Button>
              <Button variant="outline" onClick={() => setEdit(null)}>انصراف</Button>
            </div>
          </div>
          <div className="lg:sticky lg:top-4 lg:self-start">
            <Label className="mb-2 block">پیش‌نمایش</Label>
            <div className="rounded-xl border bg-muted/40 p-4"><PopupCard content={edit.content} onClose={() => undefined} /></div>
          </div>
        </div>
      </PageShell>
    )
  }

  const rows = list.data?.data ?? []
  return (
    <PageShell title="پاپ‌آپ‌ها" description="پاپ‌آپ‌های تبلیغاتی و عضویت فروشگاه" actions={<Button onClick={() => setEdit(EMPTY)}>پاپ‌آپ جدید</Button>}>
      {rows.length === 0 && !list.isLoading ? <p className="text-muted-foreground text-sm">هنوز پاپ‌آپی ساخته نشده است.</p> : null}
      <div className="grid gap-3">
        {rows.map((p) => (
          <Card key={p.id}>
            <CardContent className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-medium">{p.name}<Badge variant={p.status === "active" ? "default" : "secondary"}>{STATUS[p.status]}</Badge></div>
                <div className="text-muted-foreground text-xs">{TRIGGERS[p.trigger]} · {FREQ[p.display?.frequency ?? "session"]}</div>
              </div>
              <div className="text-muted-foreground text-xs">
                نمایش {formatNumber(p.views ?? 0, locale)} · کلیک {formatNumber(p.clicks ?? 0, locale)} · عضویت {formatNumber(p.leads ?? 0, locale)}
              </div>
              <Button size="sm" variant="outline" onClick={() => setEdit({ ...EMPTY, ...p, content: { ...EMPTY.content, ...p.content }, targeting: { ...EMPTY.targeting, ...p.targeting }, display: { ...EMPTY.display, ...p.display } })}>ویرایش</Button>
              <Button size="sm" variant="ghost" onClick={() => p.id && confirm("حذف این پاپ‌آپ؟") && del.mutate(p.id)}>حذف</Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </PageShell>
  )
}
