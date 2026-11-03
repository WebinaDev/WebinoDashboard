"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { PageShell } from "@/components/PageShell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type FieldDef = {
  key: string
  type?: string
  secret?: boolean
  hint?: string
}

type CarrierMeta = {
  id: string
  status?: string
  category?: string
  label_fa?: string
  label_en?: string
  docs_url?: string | null
  fields?: FieldDef[]
  coming_soon?: boolean
  supports?: string[]
}

const SECRET_HINT_KEYS = ["api_token", "api_key", "password", "token", "secret_key", "client_secret"]

export function ShippingCarrierSettingsPanel({ carrier }: { carrier: string }) {
  const t = useTranslations("shipping_carrier")
  const tHub = useTranslations("shipping_hub")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const qc = useQueryClient()
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [meta, setMeta] = useState<CarrierMeta | null>(null)

  const q = useQuery({
    queryKey: ["shipping-carrier", carrier],
    queryFn: () =>
      api<{ settings: Record<string, unknown>; enabled?: boolean }>(
        `/api/v1/shipping/carriers/${carrier}`,
      ),
  })

  useEffect(() => {
    if (!q.data?.settings) return
    const s = { ...q.data.settings }
    const m = (s._meta as CarrierMeta | undefined) ?? null
    setMeta(m)
    delete s._meta
    for (const key of SECRET_HINT_KEYS) {
      if (s[`has_${key}`]) s[key] = ""
      delete s[`has_${key}`]
    }
    setDraft(s)
    if (typeof q.data.enabled === "boolean") setEnabled(q.data.enabled)
  }, [q.data, carrier])

  const fields = useMemo(() => meta?.fields ?? [], [meta])

  const save = useMutation({
    mutationFn: async () =>
      api(`/api/v1/shipping/carriers/${carrier}`, {
        method: "POST",
        json: { settings: draft ?? {}, enabled },
      }),
    onSuccess: async () => {
      toast.success(tCommon("saved"))
      await qc.invalidateQueries({ queryKey: ["shipping-carrier", carrier] })
      await qc.invalidateQueries({ queryKey: ["shipping-hub"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const test = useMutation({
    mutationFn: () =>
      api<{ data?: { ok: boolean; message: string }; ok?: boolean; message?: string }>(
        `/api/v1/shipping/carriers/${carrier}/test`,
        { method: "POST" },
      ),
    onSuccess: (res) => {
      const ok = Boolean(res.data?.ok ?? res.ok)
      const message = res.data?.message ?? res.message ?? ""
      if (ok) toast.success(message || t("test_ok"))
      else toast.error(message || t("test_fail"))
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  if (!draft && q.isLoading) {
    return <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
  }
  if (!draft) return null

  const title =
    (locale.startsWith("fa") ? meta?.label_fa : meta?.label_en) || carrier
  const soon = Boolean(meta?.coming_soon) || meta?.status === "scaffold"
  const desc = soon ? tHub("coming_soon_desc") : tHub("configure_hint")

  return (
    <PageShell
      title={title}
      description={desc}
      eyebrow={tHub("eyebrow")}
      actions={
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/settings/shop/shipping/hub">{tHub("back_to_hub")}</Link>
        </Button>
      }
    >
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              {title}
              {soon ? <Badge variant="secondary">{tHub("coming_soon")}</Badge> : null}
            </CardTitle>
            <CardDescription>{desc}</CardDescription>
            {meta?.docs_url ? (
              <a
                href={meta.docs_url}
                target="_blank"
                rel="noreferrer"
                className="text-primary text-xs underline"
              >
                {tHub("docs")}
              </a>
            ) : (
              <p className="text-muted-foreground text-xs">{tHub("scaffold_no_docs")}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor={`${carrier}-enabled`}>{t("fields.enabled")}</Label>
            <Switch id={`${carrier}-enabled`} checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {soon ? (
            <p className="bg-muted/40 rounded-lg border border-dashed px-3 py-2 text-xs">
              {meta?.docs_url ? tHub("scaffold_hint") : tHub("scaffold_no_docs")}
            </p>
          ) : null}

          {carrier === "tapin" ? (
            <p className="text-muted-foreground text-sm">
              {t("tapin_redirect")}{" "}
              <Link className="text-primary underline" href="/dashboard/settings/shop/shipping/tapin">
                {t("open_tapin")}
              </Link>
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {fields.map((field) => {
                const type = field.type ?? (field.secret ? "password" : "text")
                const label = t(`fields.${field.key}` as "fields.title")
                const value = draft[field.key]
                if (type === "switch") {
                  return (
                    <div key={field.key} className="flex items-center justify-between gap-3 sm:col-span-2">
                      <Label>{label}</Label>
                      <Switch
                        checked={Boolean(value)}
                        onCheckedChange={(v) => setDraft({ ...draft, [field.key]: v })}
                      />
                    </div>
                  )
                }
                if (type === "textarea") {
                  return (
                    <div key={field.key} className="grid gap-1 sm:col-span-2">
                      <Label>{label}</Label>
                      <Textarea
                        value={String(value ?? "")}
                        onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })}
                      />
                    </div>
                  )
                }
                return (
                  <div key={field.key} className="grid gap-1">
                    <Label>{label}</Label>
                    <Input
                      type={type === "number" ? "number" : field.secret ? "password" : "text"}
                      dir="ltr"
                      value={value === undefined || value === null ? "" : String(value)}
                      placeholder={field.secret ? "••••••••" : undefined}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          [field.key]:
                            type === "number" ? Number(e.target.value) || 0 : e.target.value,
                        })
                      }
                    />
                    {field.hint ? <p className="text-muted-foreground text-xs">{field.hint}</p> : null}
                  </div>
                )
              })}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void save.mutateAsync()} disabled={save.isPending}>
              {save.isPending ? tCommon("saving") : tCommon("save")}
            </Button>
            {carrier !== "tapin" ? (
              <Button variant="outline" onClick={() => void test.mutateAsync()} disabled={test.isPending}>
                {t("test")}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </PageShell>
  )
}
