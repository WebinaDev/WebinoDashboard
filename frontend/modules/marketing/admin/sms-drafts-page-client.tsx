"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Send } from "lucide-react"
import { toast } from "sonner"

import { isSmsUnavailable, SmsServiceBanner } from "@/components/marketing/SmsServiceBanner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { createSmsDraft, deleteSmsDraft, fetchSmsDrafts, smsQueryOptions } from "../lib/modirpayamak-api"
import { SmsPanelShell } from "../lib/sms-panel-shell"

function asRows(data: unknown): Array<Record<string, unknown>> {
  if (!data) return []
  if (Array.isArray(data)) return data as Array<Record<string, unknown>>
  if (typeof data === "object" && data !== null) {
    const obj = data as Record<string, unknown>
    if (Array.isArray(obj.data)) return obj.data as Array<Record<string, unknown>>
    if (Array.isArray(obj.drafts)) return obj.drafts as Array<Record<string, unknown>>
    if (Array.isArray(obj.items)) return obj.items as Array<Record<string, unknown>>
  }
  return []
}

function draftMessage(row: Record<string, unknown>): string {
  return String(row.message ?? row.text ?? row.body ?? "")
}

export default function PageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("sms")
  const qc = useQueryClient()
  const [title, setTitle] = useState("")
  const [message, setMessage] = useState("")
  const [editingId, setEditingId] = useState<number | null>(null)

  const q = useQuery({
    queryKey: ["sms", "drafts"],
    queryFn: () => fetchSmsDrafts(1),
    ...smsQueryOptions,
  })
  const unavailable = q.data ? isSmsUnavailable(q.data) : false
  const rows = useMemo(() => (unavailable ? [] : asRows(q.data?.data)), [unavailable, q.data])

  const saveM = useMutation({
    mutationFn: async () => {
      const oldId = editingId
      await createSmsDraft({ title, message, text: message })
      if (oldId) await deleteSmsDraft(oldId)
    },
    onSuccess: async () => {
      toast.success(t("draftSaved"))
      setTitle("")
      setMessage("")
      setEditingId(null)
      await qc.invalidateQueries({ queryKey: ["sms", "drafts"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const deleteM = useMutation({
    mutationFn: (id: number) => deleteSmsDraft(id),
    onSuccess: async () => {
      toast.success(t("draftDeleted"))
      if (editingId) {
        setEditingId(null)
        setTitle("")
        setMessage("")
      }
      await qc.invalidateQueries({ queryKey: ["sms", "drafts"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const startEdit = (row: Record<string, unknown>) => {
    const id = Number(row.id ?? 0)
    setEditingId(id || null)
    setTitle(String(row.title ?? row.name ?? ""))
    setMessage(draftMessage(row))
  }

  const cancelEdit = () => {
    setEditingId(null)
    setTitle("")
    setMessage("")
  }

  return (
    <SmsPanelShell title={t("draftsTitle")} description={t("draftsHint")}>
      {q.isError ? (
        <SmsServiceBanner message={getApiErrorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : null}
      {unavailable ? (
        <SmsServiceBanner
          message={String((q.data as { message?: string })?.message ?? "")}
          onRetry={() => void q.refetch()}
        />
      ) : null}

      <Card className="shadow-soft mb-4 max-w-lg">
        <CardHeader>
          <CardTitle className="text-base">
            {editingId ? t("editDraft") : t("newDraft")}
          </CardTitle>
          <CardDescription>{t("draftsHint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <fieldset disabled={unavailable} className="space-y-3">
            <div>
              <Label>{t("name")}</Label>
              <Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label>{t("message")}</Label>
              <Textarea
                className="mt-1"
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={saveM.isPending || !message.trim()}
                onClick={() => saveM.mutate()}
              >
                {t("actions.save")}
              </Button>
              {editingId ? (
                <Button type="button" variant="outline" onClick={cancelEdit}>
                  {t("actions.cancel")}
                </Button>
              ) : null}
            </div>
          </fieldset>
        </CardContent>
      </Card>

      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle className="text-base">{t("draftsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("name")}</TableHead>
                  <TableHead>{t("message")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.isPending
                  ? Array.from({ length: 3 }, (_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={3}>
                          <Skeleton className="h-6 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  : rows.length === 0
                    ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-muted-foreground text-sm">
                            {t("noDrafts")}
                          </TableCell>
                        </TableRow>
                      )
                    : rows.map((r, i) => {
                        const id = Number(r.id ?? 0)
                        const body = draftMessage(r)
                        return (
                          <TableRow key={id || i}>
                            <TableCell className="font-medium">
                              {String(r.title ?? r.name ?? `#${id || i + 1}`)}
                            </TableCell>
                            <TableCell className="max-w-md whitespace-pre-wrap text-sm">{body}</TableCell>
                            <TableCell className="space-x-2 text-end">
                              <Button type="button" size="sm" variant="outline" onClick={() => startEdit(r)}>
                                {t("actions.edit")}
                              </Button>
                              <Button type="button" size="sm" variant="secondary" asChild disabled={!body.trim()}>
                                <Link href={`/admin/marketing/sms/send?message=${encodeURIComponent(body)}`}>
                                  <Send className="me-1 h-3.5 w-3.5" />
                                  {t("sendFromDraft")}
                                </Link>
                              </Button>
                              {id ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={deleteM.isPending}
                                  onClick={() => deleteM.mutate(id)}
                                >
                                  {t("deleteDraft")}
                                </Button>
                              ) : null}
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
