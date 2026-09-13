"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { isSmsUnavailable, SmsServiceBanner } from "@/components/marketing/SmsServiceBanner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
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
  createSmsPattern,
  detachSmsPattern,
  fetchSmsPatternRegistry,
  fetchSmsPatterns,
  syncSmsPattern,
  type SmsPatternRegistryRow,
} from "../lib/modirpayamak-api"
import { SmsPanelShell } from "../lib/sms-panel-shell"

type VarRow = { name: string; type: "string" | "integer" }

type IppanelPattern = {
  id?: string
  title?: string
  pattern_code?: string
  pattern_message?: string
  pattern_description?: string
  pattern_status?: string
  pattern_status_fa?: string
  website?: string
  type?: string
  variable?: Array<{ name?: string; type?: string; len?: number }> | null
}

function extractPatterns(raw: unknown): IppanelPattern[] {
  if (Array.isArray(raw)) return raw as IppanelPattern[]
  if (!raw || typeof raw !== "object") return []
  const obj = raw as Record<string, unknown>
  if (Array.isArray(obj.data)) return obj.data as IppanelPattern[]
  if (Array.isArray(obj.patterns)) return obj.patterns as IppanelPattern[]
  if (obj.data && typeof obj.data === "object") {
    const nested = obj.data as Record<string, unknown>
    if (Array.isArray(nested.data)) return nested.data as IppanelPattern[]
    if (Array.isArray(nested.patterns)) return nested.patterns as IppanelPattern[]
    if (Array.isArray(nested.items)) return nested.items as IppanelPattern[]
  }
  if (Array.isArray(obj.items)) return obj.items as IppanelPattern[]
  return []
}

function varsFromPattern(p: IppanelPattern | undefined): string[] {
  if (!p) return []
  const fromVars = (p.variable ?? [])
    .map((v) => (v.name ?? "").replace(/%/g, "").trim())
    .filter(Boolean)
  if (fromVars.length) return [...new Set(fromVars)]
  const found = (p.pattern_message ?? "").match(/%([a-zA-Z0-9_]+)%/g) ?? []
  return [...new Set(found.map((m) => m.slice(1, -1)))]
}

function SyncBadge({ status }: { status?: string }) {
  const t = useTranslations("sms")
  if (status === "synced") return <Badge>{t("patternStatusSynced")}</Badge>
  if (status === "pending") return <Badge variant="secondary">{t("patternStatusPending")}</Badge>
  if (status === "failed") return <Badge variant="destructive">{t("patternStatusFailed")}</Badge>
  return <Badge variant="outline">{t("patternStatusNone")}</Badge>
}

export default function PageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("sms")
  const qc = useQueryClient()

  const patternsQ = useQuery({
    queryKey: ["sms-patterns"],
    queryFn: () => fetchSmsPatterns(1, 100),
  })
  const registryQ = useQuery({
    queryKey: ["sms-pattern-registry"],
    queryFn: fetchSmsPatternRegistry,
  })

  const unavailable =
    isSmsUnavailable(patternsQ.data) || isSmsUnavailable(registryQ.data)

  const [registry, setRegistry] = useState<SmsPatternRegistryRow[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [website, setWebsite] = useState("")
  const [message, setMessage] = useState("")
  const [brandName, setBrandName] = useState("")
  const [isShare, setIsShare] = useState(false)
  const [vars, setVars] = useState<VarRow[]>([])
  const [checkBrand, setCheckBrand] = useState(false)
  const [checkNonPromo, setCheckNonPromo] = useState(false)

  const [bindScope, setBindScope] = useState("order_customer")
  const [bindEvent, setBindEvent] = useState("")
  const [bindCode, setBindCode] = useState("")

  useEffect(() => {
    if (registryQ.data?.registry) {
      setRegistry([...(registryQ.data.registry as SmsPatternRegistryRow[])])
    }
  }, [registryQ.data])

  const patterns = useMemo(
    () => extractPatterns(patternsQ.data?.data ?? patternsQ.data),
    [patternsQ.data],
  )

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => createSmsPattern(body),
    onSuccess: async () => {
      toast.success(t("patternCreated"))
      setShowCreate(false)
      setTitle("")
      setDescription("")
      setWebsite("")
      setMessage("")
      setBrandName("")
      setVars([])
      setCheckBrand(false)
      setCheckNonPromo(false)
      setIsShare(false)
      await qc.invalidateQueries({ queryKey: ["sms-patterns"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const syncMut = useMutation({
    mutationFn: () =>
      syncSmsPattern({
        scope: bindScope,
        event_key: bindEvent.trim(),
        pattern_code: bindCode.trim() || undefined,
        bind_only: true,
      }),
    onSuccess: async () => {
      toast.success(t("patternBound"))
      setBindEvent("")
      setBindCode("")
      await qc.invalidateQueries({ queryKey: ["sms-pattern-registry"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const detachMut = useMutation({
    mutationFn: (body: { scope: string; event_key: string }) => detachSmsPattern(body),
    onSuccess: async () => {
      toast.success(t("patternDetached"))
      await qc.invalidateQueries({ queryKey: ["sms-pattern-registry"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const submitCreate = () => {
    if (!title.trim() || !description.trim() || !message.trim()) {
      toast.error(t("patternRequiredFields"))
      return
    }
    if (website.trim() && !/^https:\/\//i.test(website.trim())) {
      toast.error(t("patternWebsiteHttps"))
      return
    }
    if (brandName.trim() && !message.includes(brandName.trim())) {
      toast.error(t("patternBrandMissing"))
      return
    }
    if (!checkBrand || !checkNonPromo) {
      toast.error(t("patternChecklistRequired"))
      return
    }
    createMut.mutate({
      title: title.trim(),
      description: description.trim(),
      website: website.trim() || undefined,
      message: message.trim(),
      is_share: isShare,
      variable: vars.filter((v) => v.name.trim()).map((v) => ({ name: v.name.trim(), type: v.type })),
    })
  }

  const retry = () => {
    void patternsQ.refetch()
    void registryQ.refetch()
  }

  return (
    <SmsPanelShell title={t("patternsTitle")} description={t("patternsHint")}>
      {(patternsQ.isError || registryQ.isError) && (
        <SmsServiceBanner
          message={getApiErrorMessage(patternsQ.error ?? registryQ.error)}
          onRetry={retry}
        />
      )}
      {unavailable ? (
        <SmsServiceBanner
          message={String(
            (patternsQ.data as { message?: string })?.message ??
              (registryQ.data as { message?: string })?.message ??
              "",
          )}
          onRetry={retry}
        />
      ) : null}

      <div className="mb-4 flex flex-wrap justify-end gap-2">
        <Button type="button" onClick={() => setShowCreate((v) => !v)}>
          <Plus className="me-1 h-4 w-4" />
          {t("addPattern")}
        </Button>
      </div>

      {showCreate ? (
        <Card className="shadow-soft mb-4 max-w-lg">
          <CardHeader>
            <CardTitle className="text-base">{t("addPattern")}</CardTitle>
            <CardDescription>{t("patternRulesTitle")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="text-muted-foreground list-disc space-y-1 pe-4 text-xs">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <li key={n}>{t(`patternRule${n}` as "patternRule1")}</li>
              ))}
            </ul>
            <div>
              <Label>{t("patternTitle")}</Label>
              <Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label>{t("patternDescription")}</Label>
              <Textarea
                className="mt-1"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div>
              <Label>{t("patternWebsite")}</Label>
              <Input
                className="mt-1"
                dir="ltr"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>
            <div>
              <Label>{t("brandName")}</Label>
              <Input className="mt-1" value={brandName} onChange={(e) => setBrandName(e.target.value)} />
            </div>
            <div>
              <Label>{t("message")}</Label>
              <Textarea
                className="mt-1"
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t("patternVariables")}</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setVars((v) => [...v, { name: "", type: "string" }])}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
              {vars.map((row, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    className="font-mono"
                    dir="ltr"
                    placeholder="order_id"
                    value={row.name}
                    onChange={(e) =>
                      setVars((prev) =>
                        prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                      )
                    }
                  />
                  <Select
                    value={row.type}
                    onValueChange={(v) =>
                      setVars((prev) =>
                        prev.map((x, j) =>
                          j === i ? { ...x, type: v as "string" | "integer" } : x,
                        ),
                      )
                    }
                  >
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="string">string</SelectItem>
                      <SelectItem value="integer">integer</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setVars((v) => v.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="space-y-2 text-sm">
              <label className="flex items-center gap-2">
                <Checkbox checked={checkBrand} onCheckedChange={(v) => setCheckBrand(!!v)} />
                {t("checkBrandInMessage")}
              </label>
              <label className="flex items-center gap-2">
                <Checkbox checked={checkNonPromo} onCheckedChange={(v) => setCheckNonPromo(!!v)} />
                {t("checkNonPromotional")}
              </label>
              <label className="flex items-center gap-2">
                <Checkbox checked={isShare} onCheckedChange={(v) => setIsShare(!!v)} />
                {t("patternIsShare")}
              </label>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
                {t("actions.cancel")}
              </Button>
              <Button type="button" disabled={createMut.isPending} onClick={submitCreate}>
                {t("actions.save")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="shadow-soft mb-4">
        <CardHeader>
          <CardTitle className="text-base">{t("matrixApprovedList")}</CardTitle>
          <CardDescription>{t("matrixApprovedHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("patternCode")}</TableHead>
                  <TableHead>{t("message")}</TableHead>
                  <TableHead>{t("matrixPatternVars")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patternsQ.isPending
                  ? Array.from({ length: 3 }, (_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={4}>
                          <Skeleton className="h-6 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  : patterns.length === 0
                    ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-muted-foreground text-sm">
                            {t("noPatterns")}
                          </TableCell>
                        </TableRow>
                      )
                    : patterns.slice(0, 40).map((p, i) => {
                        const code = (p.pattern_code ?? "").trim()
                        const v = varsFromPattern(p)
                        return (
                          <TableRow key={code || i}>
                            <TableCell className="font-mono text-xs" dir="ltr">
                              {code || "—"}
                            </TableCell>
                            <TableCell className="max-w-xs truncate text-xs" dir="auto">
                              {p.title || p.pattern_message || "—"}
                            </TableCell>
                            <TableCell className="font-mono text-xs" dir="ltr">
                              {v.length ? v.map((x) => `%${x}%`).join(", ") : "—"}
                            </TableCell>
                            <TableCell>
                              {p.pattern_status_fa || p.pattern_status || "—"}
                            </TableCell>
                          </TableRow>
                        )
                      })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-soft mb-4 max-w-xl">
        <CardHeader>
          <CardTitle className="text-base">{t("bindPattern")}</CardTitle>
          <CardDescription>{t("patternsHint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <fieldset disabled={unavailable} className="space-y-3">
            <div>
              <Label>{t("scope")}</Label>
              <Select value={bindScope} onValueChange={setBindScope}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="order_customer">{t("scopeCustomer")}</SelectItem>
                  <SelectItem value="order_admin">{t("scopeAdmin")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("event")}</Label>
              <Input
                className="mt-1 font-mono"
                dir="ltr"
                value={bindEvent}
                onChange={(e) => setBindEvent(e.target.value)}
                placeholder="processing"
              />
            </div>
            <div>
              <Label>{t("patternCode")}</Label>
              <Input
                className="mt-1 font-mono"
                dir="ltr"
                value={bindCode}
                onChange={(e) => setBindCode(e.target.value)}
              />
            </div>
            <Button
              type="button"
              disabled={syncMut.isPending || !bindEvent.trim()}
              onClick={() => syncMut.mutate()}
            >
              {t("bindPattern")}
            </Button>
          </fieldset>
        </CardContent>
      </Card>

      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle className="text-base">{t("patternRegistry")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("scope")}</TableHead>
                  <TableHead>{t("event")}</TableHead>
                  <TableHead>{t("patternCode")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {registryQ.isPending
                  ? Array.from({ length: 3 }, (_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={5}>
                          <Skeleton className="h-6 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  : registry.length === 0
                    ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-muted-foreground text-sm">
                            {t("noPatterns")}
                          </TableCell>
                        </TableRow>
                      )
                    : registry.map((r, i) => (
                        <TableRow key={`${r.scope}-${r.event_key}-${i}`}>
                          <TableCell className="font-mono text-xs" dir="ltr">
                            {r.scope}
                          </TableCell>
                          <TableCell className="font-mono text-xs" dir="ltr">
                            {r.event_key}
                          </TableCell>
                          <TableCell className="font-mono text-xs" dir="ltr">
                            {r.ippanel_code || "—"}
                          </TableCell>
                          <TableCell>
                            <SyncBadge status={r.sync_status} />
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={detachMut.isPending || unavailable}
                              onClick={() =>
                                detachMut.mutate({ scope: r.scope, event_key: r.event_key })
                              }
                            >
                              {t("detachPattern")}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </SmsPanelShell>
  )
}
