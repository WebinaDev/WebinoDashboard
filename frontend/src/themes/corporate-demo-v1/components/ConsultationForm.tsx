"use client"

import { useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"

export function ConsultationForm() {
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    setError(null)
    const fd = new FormData(e.currentTarget)
    try {
      await api("/api/v1/public/consultations", {
        method: "POST",
        json: {
          name: fd.get("name"),
          email: fd.get("email"),
          phone: fd.get("phone") || null,
          subject: fd.get("subject") || null,
          message: fd.get("message") || null,
        },
      })
      setDone(true)
      e.currentTarget.reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در ارسال")
    } finally {
      setPending(false)
    }
  }

  if (done) {
    return (
      <p className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-100">
        درخواست شما ثبت شد. به زودی با شما تماس می‌گیریم.
      </p>
    )
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">نام</Label>
        <Input id="name" name="name" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">ایمیل</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">تلفن</Label>
        <Input id="phone" name="phone" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="subject">موضوع</Label>
        <Input id="subject" name="subject" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="message">پیام</Label>
        <textarea
          id="message"
          name="message"
          rows={4}
          className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[80px] w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "در حال ارسال…" : "ارسال درخواست"}
      </Button>
    </form>
  )
}
