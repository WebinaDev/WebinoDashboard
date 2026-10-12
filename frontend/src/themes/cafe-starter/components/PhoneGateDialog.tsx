"use client"

import { useMutation, useQuery } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"

import type { CafeEngagementSettings } from "../types"
import { CafeSheet } from "./CafeSheet"

const FP_KEY = "cafe_fingerprint"

function fingerprint(): string {
  if (typeof window === "undefined") return ""
  let fp = localStorage.getItem(FP_KEY)
  if (!fp) {
    fp = crypto.randomUUID().replace(/-/g, "")
    localStorage.setItem(FP_KEY, fp)
  }
  return fp
}

export function PhoneGateDialog({
  engagement,
  skin,
  scheme,
}: {
  engagement?: CafeEngagementSettings
  skin?: string
  scheme?: string
}) {
  const t = useTranslations("cafe_starter.phone_gate")
  const tMenu = useTranslations("cafe_starter")
  const [fp, setFp] = useState("")
  const [phone, setPhone] = useState("")
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setFp(fingerprint())
  }, [])

  const { data } = useQuery({
    queryKey: ["phone-gate", fp],
    enabled: Boolean(fp) && Boolean(engagement?.phone_gate_enabled),
    queryFn: () => api<{ required: boolean; registered: boolean }>(`/api/v1/public/cafe/phone-gate?fingerprint=${encodeURIComponent(fp)}`),
  })

  useEffect(() => {
    if (data?.required && !data.registered) setOpen(true)
  }, [data])

  const register = useMutation({
    mutationFn: () =>
      api("/api/v1/public/cafe/phone-register", {
        method: "POST",
        json: { phone, fingerprint: fp },
      }),
    onSuccess: () => setOpen(false),
  })

  if (!engagement?.phone_gate_enabled) return null

  return (
    <CafeSheet
      open={open}
      onOpenChange={setOpen}
      title={t("title")}
      description={t("description")}
      closeLabel={tMenu("close")}
      placement="center"
      skin={skin}
      scheme={scheme}
      className="cafe-phone-sheet"
    >
      <form
        className="cafe-phone-body"
        onSubmit={(e) => {
          e.preventDefault()
          if (phone && !register.isPending) register.mutate()
        }}
      >
        <Label htmlFor="cafe-phone">{t("phone")}</Label>
        <Input
          id="cafe-phone"
          dir="ltr"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={t("phone_placeholder")}
        />
        <Button type="submit" className="w-full" disabled={!phone || register.isPending}>
          {t("submit")}
        </Button>
      </form>
    </CafeSheet>
  )
}
