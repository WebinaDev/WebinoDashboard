"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"

import { LocaleDatePicker } from "@/components/LocaleDatePicker"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"

type SiteStatus = {
  status: "active" | "coming_soon" | "suspended"
  launch_at?: string | null
  expires_at?: string | null
  reason?: string | null
}

const faDate = (iso?: string | null) =>
  iso ? new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "long" }).format(new Date(iso)) : "—"

/** Site admin toggle: active <-> coming soon (suspension is platform-controlled). */
export function SiteStatusCard() {
  const [s, setS] = useState<SiteStatus | null>(null)
  const [launch, setLaunch] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<SiteStatus>("/api/v1/site-status")
      .then((d) => {
        setS(d)
        setLaunch(d.launch_at ? d.launch_at.slice(0, 16) : null)
      })
      .catch(() => setS(null))
  }, [])

  async function save(status: "active" | "coming_soon") {
    setBusy(true)
    try {
      const d = await api<SiteStatus>("/api/v1/site-status", {
        method: "PUT",
        json: { status, launch_at: status === "coming_soon" ? launch : null },
      })
      setS(d)
      toast.success(status === "active" ? "سایت فعال شد" : "سایت در حالت «به‌زودی» قرار گرفت")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در ذخیره")
    } finally {
      setBusy(false)
    }
  }

  if (!s) return null
  const label = { active: "فعال", coming_soon: "به‌زودی", suspended: "معلق (توسط پلتفرم)" }[s.status]

  return (
    <Card dir="rtl">
      <CardHeader>
        <CardTitle className="text-base">وضعیت سایت</CardTitle>
        <CardDescription>
          در حالت «به‌زودی» بازدیدکننده‌ها صفحهٔ به‌زودی را می‌بینند؛ شما بعد از ورود همچنان سایت واقعی را می‌بینید.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid max-w-lg gap-3">
        <p className="text-sm">
          وضعیت فعلی: <b>{label}</b>
        </p>
        {s.status === "suspended" ? (
          <p className="text-destructive text-sm">
            سایت به دلیل پایان اعتبار سرویس ({faDate(s.expires_at)}) معلق شده و با تمدید لایسنس دوباره فعال می‌شود.
          </p>
        ) : (
          <>
            <div className="grid gap-1">
              <Label>تاریخ راه‌اندازی (اختیاری، برای شمارش معکوس)</Label>
              <LocaleDatePicker locale="fa" withTime value={launch} onChange={setLaunch} aria-label="تاریخ راه‌اندازی" />
            </div>
            <div className="flex gap-2">
              <Button disabled={busy || s.status === "active"} onClick={() => save("active")}>
                فعال کردن سایت
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => save("coming_soon")}>
                {s.status === "coming_soon" ? "ذخیرهٔ تاریخ" : "رفتن به حالت به‌زودی"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
