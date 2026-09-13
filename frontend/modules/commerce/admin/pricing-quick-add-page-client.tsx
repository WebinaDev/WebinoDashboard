"use client"

import { useMutation } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type Product = { id: number; name: string }

export default function PricingQuickAddPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("store")
  const tCommon = useTranslations("common")
  const [name, setName] = useState("")
  const [purchase, setPurchase] = useState(0)
  const [imageUrl, setImageUrl] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: () =>
      api<Product>("/api/v1/pricing/quick-add", {
        method: "POST",
        json: {
          name,
          purchase_price_minor: Number(purchase),
          image_url: imageUrl || null,
        },
      }),
    onSuccess: (product) => {
      setMessage(t("quick_add_success", { name: product.name, id: product.id }))
      setName("")
      setPurchase(0)
      setImageUrl("")
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6" dir="auto">
      <div>
        <h1 className="text-2xl font-bold">{t("quick_add_title")}</h1>
        <p className="text-muted-foreground text-sm">{route.fullPath}</p>
      </div>

      {message ? <p className="text-sm text-green-600">{message}</p> : null}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("quick_add_heading")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>{t("name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>{t("purchase_price")}</Label>
            <Input
              type="number"
              value={purchase}
              onChange={(e) => setPurchase(Number(e.target.value))}
            />
          </div>
          <div>
            <Label>{t("image_url")}</Label>
            <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
          </div>
          <Button
            onClick={() => {
              setError(null)
              setMessage(null)
              save.mutate()
            }}
            disabled={!name || save.isPending}
          >
            {tCommon("save")}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
