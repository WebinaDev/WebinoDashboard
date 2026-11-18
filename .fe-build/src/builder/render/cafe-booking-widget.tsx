"use client"

import { useEffect, useId, useMemo, useState } from "react"

import { LocaleDatePicker } from "@/components/LocaleDatePicker"

import { checkBookingSlot, DAY_LABELS_FA, SLOT_MESSAGES, slotToIso, type CafeHours } from "../cafe-booking"
import { parseFilterOptions } from "../loop-query"
import { propBool, propNum, propStr } from "../props"
import { quietApi } from "../storefront/session"
import type { WidgetNode } from "../types"

const DAY_ORDER = ["saturday", "sunday", "monday", "tuesday", "wednesday", "thursday", "friday"]

/** Cafe table booking (رزرو میز): posts to the public cafe reservations API; validates against the cafe opening hours. */
export function CafeTableBookingWidget({ widget, editing }: { widget: WidgetNode; editing: boolean }) {
  const p = widget.props
  const id = useId()
  const title = propStr(p, "title", "رزرو میز")
  const intro = propStr(p, "intro", "")
  const cta = propStr(p, "cta", "ثبت رزرو")
  const success = propStr(p, "successText", "رزرو شما ثبت شد و پس از تأیید با شما تماس می‌گیریم.")
  const maxParty = Math.max(1, Math.min(50, propNum(p, "maxParty", 12)))
  const showHours = propBool(p, "showHours", true)
  const showNotes = propBool(p, "showNotes", true)
  const fixedBranch = propNum(p, "branchId", 0)
  const branches = useMemo(() => parseFilterOptions(propStr(p, "branches", "")).filter((b) => /^\d+$/.test(b.value)), [p])

  const [hours, setHours] = useState<CafeHours | null>(null)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [party, setParty] = useState(Math.max(1, Math.min(maxParty, propNum(p, "defaultParty", 2))))
  const [slot, setSlot] = useState<string | null>(null)
  const [branch, setBranch] = useState(fixedBranch ? String(fixedBranch) : branches[0]?.value ?? "")
  const [notes, setNotes] = useState("")
  const [state, setState] = useState<"idle" | "sending" | "done">("idle")
  const [error, setError] = useState("")

  useEffect(() => {
    let cancel = false
    const base = process.env.NEXT_PUBLIC_API_URL ?? ""
    void fetch(`${base}/api/v1/public/cafe/venue`, { credentials: "include", headers: { "X-Tenant-Domain": window.location.host } })
      .then((res) => {
        if (!cancel) setAvailable(res.ok)
        return res.ok ? res.json() : null
      })
      .then((json) => {
        if (!cancel && json?.data?.hours) setHours(json.data.hours as CafeHours)
      })
      .catch(() => {
        if (!cancel) setAvailable(false)
      })
    return () => {
      cancel = true
    }
  }, [])

  const status = checkBookingSlot(hours, slot ?? "")
  const days = [...(hours?.days ?? [])].sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day))

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (editing) return
    setError("")
    if (!name.trim() || !phone.trim()) return setError("نام و شماره تماس را وارد کنید.")
    if (status !== "ok") return setError(SLOT_MESSAGES[status])
    setState("sending")
    const res = await quietApi("/api/v1/public/cafe/reservations", {
      method: "POST",
      json: {
        guest_name: name.trim(),
        guest_phone: phone.trim(),
        party_size: party,
        reserved_at: slotToIso(slot ?? "", hours?.timezone),
        branch_id: branch ? Number(branch) : null,
        notes: notes.trim() || null,
      },
    })
    if (res.ok) setState("done")
    else {
      setState("idle")
      setError(res.status === 404 ? "رزرو آنلاین برای این فروشگاه فعال نیست." : res.message || "ثبت رزرو ناموفق بود. دوباره تلاش کنید.")
    }
  }

  return (
    <section dir="rtl" className="mx-auto grid max-w-3xl gap-4 rounded-2xl border border-border bg-card p-5" aria-labelledby={`${id}-t`}>
      <header className="grid gap-1">
        <h2 id={`${id}-t`} className="text-lg font-bold">{title}</h2>
        {intro ? <p className="text-sm text-foreground/70">{intro}</p> : null}
      </header>
      {showHours ? (
        <div className="rounded-xl bg-muted/50 p-3 text-sm">
          <strong className="mb-1 block">ساعت کاری</strong>
          {days.length ? (
            <ul className="grid gap-1 sm:grid-cols-2">
              {days.map((d) => (
                <li key={d.day} className="flex justify-between gap-2">
                  <span>{DAY_LABELS_FA[d.day] ?? d.day}</span>
                  <span className={d.closed ? "text-destructive" : ""}>{d.closed ? "تعطیل" : d.open && d.close ? `${d.open} تا ${d.close}` : "ندارد"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-foreground/60">ندارد</p>
          )}
        </div>
      ) : null}
      {available === false && !editing ? (
        <p role="status" className="rounded-xl border border-dashed p-4 text-center text-sm text-foreground/70">رزرو آنلاین در حال حاضر در دسترس نیست.</p>
      ) : state === "done" ? (
        <p role="status" className="rounded-xl bg-primary/10 p-4 text-center text-sm font-bold text-primary">{success}</p>
      ) : (
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit} noValidate>
          <label className="grid gap-1 text-sm">
            نام و نام خانوادگی
            <input className="h-10 rounded-xl border border-border bg-background px-3" value={name} onChange={(e) => setName(e.target.value)} required maxLength={255} autoComplete="name" />
          </label>
          <label className="grid gap-1 text-sm">
            شماره تماس
            <input className="h-10 rounded-xl border border-border bg-background px-3" dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required maxLength={32} autoComplete="tel" />
          </label>
          {!fixedBranch && branches.length ? (
            <label className="grid gap-1 text-sm">
              شعبه
              <select className="h-10 rounded-xl border border-border bg-background px-3" value={branch} onChange={(e) => setBranch(e.target.value)}>
                {branches.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
            </label>
          ) : null}
          <label className="grid gap-1 text-sm">
            تعداد نفرات
            <select className="h-10 rounded-xl border border-border bg-background px-3" value={party} onChange={(e) => setParty(Number(e.target.value))}>
              {Array.from({ length: maxParty }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n.toLocaleString("fa-IR")} نفر</option>)}
            </select>
          </label>
          <div className="grid gap-1 text-sm sm:col-span-2">
            <span>تاریخ و ساعت</span>
            <LocaleDatePicker locale="fa" withTime value={slot} onChange={setSlot} aria-label="تاریخ و ساعت رزرو" />
            {slot && status !== "ok" ? <span role="alert" className="text-xs text-destructive">{SLOT_MESSAGES[status]}</span> : null}
          </div>
          {showNotes ? (
            <label className="grid gap-1 text-sm sm:col-span-2">
              توضیحات
              <textarea className="min-h-20 rounded-xl border border-border bg-background p-3" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder={propStr(p, "notesPlaceholder", "مثلاً میز کنار پنجره یا جشن تولد")} />
            </label>
          ) : null}
          {error ? <p role="alert" className="text-sm text-destructive sm:col-span-2">{error}</p> : null}
          <button type="submit" disabled={state === "sending"} className="h-11 rounded-xl bg-primary px-5 font-bold text-primary-foreground disabled:opacity-60 sm:col-span-2">
            {state === "sending" ? "در حال ثبت…" : cta}
          </button>
        </form>
      )}
    </section>
  )
}
