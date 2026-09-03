"use client"

import { useMutation, useQuery } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { api } from "@/lib/api"

import type { CafeEngagementSettings } from "../types"

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

export function PhoneGateDialog({ engagement }: { engagement?: CafeEngagementSettings }) {
  const t = useTranslations("cafe_starter.phone_gate")
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
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="bottom" className="mx-auto max-w-lg rounded-t-xl">
        <SheetHeader>
          <SheetTitle>{t("title")}</SheetTitle>
          <SheetDescription>{t("description")}</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-3 px-1">
          <div>
            <Label htmlFor="phone">{t("phone")}</Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <Button className="w-full" disabled={!phone || register.isPending} onClick={() => register.mutate()}>
            {t("submit")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
