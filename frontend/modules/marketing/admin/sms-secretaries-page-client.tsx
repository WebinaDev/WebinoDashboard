"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { isSmsUnavailable, SmsServiceBanner } from "@/components/marketing/SmsServiceBanner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { getApiErrorMessage } from "@/lib/api-helpers"
import {
  deleteSmsSecretary,
  fetchSmsSecretaries,
  processSmsSecretaries,
  saveSmsSecretary,
  smsQueryOptions,
} from "../lib/modirpayamak-api"
import { SmsPanelShell } from "../lib/sms-panel-shell"

type SecretaryType = "auto_reply" | "inbox_forward" | "code_reader" | "membership"
type FilterType = SecretaryType | "all"

const SECRETARY_TYPES: SecretaryType[] = [
  "auto_reply",
  "inbox_forward",
  "code_reader",
  "membership",
]

function typeLabel(t: (key: string) => string, type: string): string {
  try {
    const typed = t(`secretaryTypes.${type}`)
    if (typed && typed !== `secretaryTypes.${type}`) return typed
  } catch {
    /* fall through */
  }
  try {
    const legacy = t(`secretary_${type}` as "secretary_auto_reply")
    if (legacy && !legacy.startsWith("secretary_")) return legacy
  } catch {
    /* fall through */
  }
  return type
}

export default function PageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("sms")
  const qc = useQueryClient()
  const [filter, setFilter] = useState<FilterType>("all")
  const [formType, setFormType] = useState<SecretaryType>("auto_reply")
  const [keywords, setKeywords] = useState("")
  const [replyBody, setReplyBody] = useState("")
  const [forwardTo, setForwardTo] = useState("")
  const [saving, setSaving] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const secretariesQ = useQuery({
    queryKey: ["sms", "secretaries"],
    queryFn: fetchSmsSecretaries,
    ...smsQueryOptions,
  })

  const unavailable = secretariesQ.data ? isSmsUnavailable(secretariesQ.data) : false
  const allSecretaries = unavailable ? [] : (secretariesQ.data?.secretaries ?? [])
  const secretaries =
    filter === "all" ? allSecretaries : allSecretaries.filter((s) => s.type === filter)
  const loading = secretariesQ.isPending

  const save = async () => {
    if (!keywords.trim()) return
    setSaving(true)
    try {
      await saveSmsSecretary({
        type: formType,
        keywords: keywords.trim(),
        keyword: keywords.trim(),
        reply_body: replyBody.trim() || undefined,
        response: replyBody.trim() || undefined,
        forward_to: forwardTo.trim() || undefined,
        forwardTo: forwardTo.trim() || undefined,
        enabled: true,
      })
      toast.success(t("secretarySaved"))
      setKeywords("")
      setReplyBody("")
      setForwardTo("")
      void qc.invalidateQueries({ queryKey: ["sms", "secretaries"] })
    } catch (e) {
      toast.error(getApiErrorMessage(e as Error))
    }
    setSaving(false)
  }

  const remove = async (id: number) => {
    setDeletingId(id)
    try {
      await deleteSmsSecretary(id)
      toast.success(t("secretaryDeleted"))
      void qc.invalidateQueries({ queryKey: ["sms", "secretaries"] })
    } catch (e) {
      toast.error(getApiErrorMessage(e as Error))
    }
    setDeletingId(null)
  }

  const processInbox = async () => {
    setProcessing(true)
    try {
      const res = await processSmsSecretaries()
      toast.success(
        t("secretaryProcessed", {
          processed: String(res.processed ?? 0),
          matched: String(res.matched ?? 0),
        }),
      )
      void qc.invalidateQueries({ queryKey: ["sms", "secretaries"] })
      void qc.invalidateQueries({ queryKey: ["sms", "inbox"] })
    } catch (e) {
      toast.error(getApiErrorMessage(e as Error))
    }
    setProcessing(false)
  }

  return (
    <SmsPanelShell title={t("secretariesTitle")} description={t("secretariesHint")}>
      {secretariesQ.isError ? (
        <SmsServiceBanner
          message={getApiErrorMessage(secretariesQ.error)}
          onRetry={() => void secretariesQ.refetch()}
        />
      ) : null}
      {unavailable ? (
        <SmsServiceBanner
          message={String((secretariesQ.data as { message?: string })?.message ?? "")}
          onRetry={() => void secretariesQ.refetch()}
        />
      ) : null}

      <div className="mb-3 flex justify-end">
        <Button
          type="button"
          variant="outline"
          disabled={processing || unavailable}
          onClick={() => void processInbox()}
        >
          {processing ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
          {t("processInbox")}
        </Button>
      </div>

      <Card className="shadow-soft mb-4 max-w-lg">
        <CardHeader>
          <CardTitle className="text-base">{t("addSecretary")}</CardTitle>
          <CardDescription>{t("secretariesHint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <fieldset disabled={unavailable} className="space-y-3">
            <div>
              <Label>{t("secretaryType")}</Label>
              <Select value={formType} onValueChange={(v) => setFormType(v as SecretaryType)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SECRETARY_TYPES.map((tp) => (
                    <SelectItem key={tp} value={tp}>
                      {typeLabel(t, tp)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("keywords")}</Label>
              <Input
                className="mt-1"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="*, سلام, کد"
              />
            </div>
            <div>
              <Label>{t("replyBody")}</Label>
              <Textarea
                className="mt-1"
                rows={3}
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder={t("secretaryResponseHint")}
              />
            </div>
            {formType === "inbox_forward" ? (
              <div>
                <Label>{t("forwardTo")}</Label>
                <Input
                  className="mt-1"
                  dir="ltr"
                  value={forwardTo}
                  onChange={(e) => setForwardTo(e.target.value)}
                  placeholder="09..."
                />
              </div>
            ) : null}
            <Button type="button" disabled={saving || !keywords.trim()} onClick={() => void save()}>
              {saving ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Plus className="me-2 h-4 w-4" />}
              {t("addSecretary")}
            </Button>
          </fieldset>
        </CardContent>
      </Card>

      <Card className="shadow-soft">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">{t("secretariesTitle")}</CardTitle>
          <Select value={filter} onValueChange={(v) => setFilter(v as FilterType)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("secretaryAll")}</SelectItem>
              {SECRETARY_TYPES.map((tp) => (
                <SelectItem key={tp} value={tp}>
                  {typeLabel(t, tp)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>{t("secretaryType")}</TableHead>
                  <TableHead>{t("keywords")}</TableHead>
                  <TableHead>{t("replyBody")}</TableHead>
                  <TableHead>{t("forwardTo")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading
                  ? Array.from({ length: 4 }, (_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={6}>
                          <Skeleton className="h-6 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  : secretaries.length === 0
                    ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-muted-foreground text-sm">
                            {t("noSecretaries")}
                          </TableCell>
                        </TableRow>
                      )
                    : secretaries.map((s, i) => {
                        const id = typeof s.id === "number" ? s.id : Number(s.id)
                        const type = String(s.type ?? "—")
                        return (
                          <TableRow key={String(s.id ?? i)}>
                            <TableCell>{String(s.id ?? i + 1)}</TableCell>
                            <TableCell>{typeLabel(t, type)}</TableCell>
                            <TableCell>{String(s.keywords ?? s.keyword ?? s.trigger ?? "—")}</TableCell>
                            <TableCell className="max-w-xs truncate">
                              {String(s.reply_body ?? s.response ?? s.reply ?? "—")}
                            </TableCell>
                            <TableCell className="font-mono text-xs" dir="ltr">
                              {String(s.forward_to ?? s.forwardTo ?? "—")}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={deletingId === id || unavailable}
                                onClick={() => void remove(id)}
                              >
                                {deletingId === id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="text-destructive h-4 w-4" />
                                )}
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </SmsPanelShell>
  )
}
