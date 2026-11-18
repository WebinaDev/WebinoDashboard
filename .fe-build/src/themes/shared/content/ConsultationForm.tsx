"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"

export function ConsultationForm() {
  const t = useTranslations("site")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle")

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus("loading")
    try {
      await api("/api/v1/public/consultations", {
        method: "POST",
        json: {
          name,
          email,
          phone: phone || undefined,
          subject: subject || undefined,
          message: message || undefined,
        },
      })
      setStatus("ok")
      setName("")
      setEmail("")
      setPhone("")
      setSubject("")
      setMessage("")
    } catch {
      setStatus("error")
    }
  }

  if (status === "ok") {
    return (
      <div className="border-border bg-muted/30 rounded-xl border p-8 text-center">
        <h2 className="text-xl font-semibold">{t("consultation_success_title")}</h2>
        <p className="text-muted-foreground mt-2 text-sm">{t("consultation_success_body")}</p>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto flex max-w-xl flex-col gap-4">
      <div className="grid gap-2">
        <Label htmlFor="consult-name">{t("consultation_name")}</Label>
        <Input
          id="consult-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="consult-email">{t("consultation_email")}</Label>
        <Input
          id="consult-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="consult-phone">{t("consultation_phone")}</Label>
        <Input
          id="consult-phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="tel"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="consult-subject">{t("consultation_subject")}</Label>
        <Input id="consult-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="consult-message">{t("consultation_message")}</Label>
        <Textarea
          id="consult-message"
          required
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>
      {status === "error" ? (
        <p className="text-destructive text-sm">{t("consultation_error")}</p>
      ) : null}
      <Button type="submit" disabled={status === "loading"}>
        {status === "loading" ? t("consultation_sending") : t("consultation_submit")}
      </Button>
    </form>
  )
}
