"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { formatDisplayDateTime } from "@/lib/format-date"
import { toLocaleDigits } from "@/lib/locale"

import { CafeAdminShell, CafeEmptyState, CafeSection, cafeSelectClass } from "./cafe-admin-ui"

type Printer = {
  id: number
  name: string
  kind: string
  target: string
  purpose: string
  paper_width_mm: number
  is_active: boolean
}

type PrintRoute = {
  id: number
  printer_id: number
  printer_name: string
  station_id: number | null
  document: string
  priority: number
  is_active: boolean
}

type Layout = Record<string, string | number | boolean | null>

type QrStats = {
  days: number
  tables: { table_code: string; scans: number; visitors: number; last_scan: string | null }[]
  total_scans: number
  scanned_tables: number
  never_scanned: string[]
}

type Webhook = {
  id: number
  name: string
  url: string
  events: string[] | null
  is_active: boolean
  last_success_at: string | null
  last_failure_at: string | null
  last_error: string | null
}

type Delivery = {
  id: number
  event: string
  status: string
  response_status: number | null
  attempts: number
  error: string | null
  created_at: string
}

type ApiKey = {
  id: number
  name: string
  prefix: string
  scopes: string[]
  last_used_at: string | null
  revoked_at: string | null
}

type Tab = "printers" | "receipt" | "qr" | "webhooks" | "keys"

/** The layout switches, in display order, with the label key that names each one. */
const LAYOUT_FLAGS = [
  "show_logo",
  "show_branch_address",
  "show_branch_phone",
  "show_customer",
  "show_cashier",
  "show_table",
  "show_tax_number",
  "show_item_notes",
  "show_qr",
  "kitchen_hides_prices",
] as const

export default function SettingsIntegrationsPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("cafe_admin.integrations")
  const locale = useLocale()
  const queryClient = useQueryClient()

  const [tab, setTab] = useState<Tab>("printers")
  const [printerDraft, setPrinterDraft] = useState({
    name: "",
    kind: "edge",
    target: "",
    purpose: "kitchen",
    paper_width_mm: "80",
  })
  const [routeDraft, setRouteDraft] = useState({ printer_id: "", station_id: "", document: "kitchen", priority: "100" })
  const [hookDraft, setHookDraft] = useState({ name: "", url: "", events: [] as string[] })
  const [keyDraft, setKeyDraft] = useState({ name: "", scopes: [] as string[] })
  const [issuedKey, setIssuedKey] = useState<string | null>(null)
  const [layoutDraft, setLayoutDraft] = useState<Layout | null>(null)

  const printing = useQuery({
    queryKey: ["cafe-printing"],
    queryFn: async () =>
      (await api<{ data: { printers: Printer[]; routes: PrintRoute[]; layout: Layout } }>("/api/v1/cafe/printers"))?.data ?? null,
    retry: false,
  })

  const qr = useQuery({
    queryKey: ["cafe-qr-stats"],
    enabled: tab === "qr",
    queryFn: async () => (await api<{ data: QrStats }>("/api/v1/cafe/qr/stats?days=30"))?.data ?? null,
    retry: false,
  })

  const hooks = useQuery({
    queryKey: ["cafe-webhooks"],
    enabled: tab === "webhooks",
    queryFn: async () =>
      (await api<{ data: { webhooks: Webhook[]; deliveries: Delivery[]; events: string[] } }>("/api/v1/cafe/webhooks"))?.data ?? null,
    retry: false,
  })

  const keys = useQuery({
    queryKey: ["cafe-api-keys"],
    enabled: tab === "keys",
    queryFn: async () =>
      (await api<{ data: { keys: ApiKey[]; scopes: string[] } }>("/api/v1/cafe/api-keys"))?.data ?? null,
    retry: false,
  })

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["cafe-printing"] }),
      queryClient.invalidateQueries({ queryKey: ["cafe-webhooks"] }),
      queryClient.invalidateQueries({ queryKey: ["cafe-api-keys"] }),
    ])
  }

  const savePrinter = useMutation({
    mutationFn: () =>
      api("/api/v1/cafe/printers", {
        method: "POST",
        json: {
          name: printerDraft.name,
          kind: printerDraft.kind,
          target: printerDraft.target,
          purpose: printerDraft.purpose,
          paper_width_mm: Number(printerDraft.paper_width_mm),
        },
      }),
    onSuccess: async () => {
      toast.success(t("printer_saved"))
      setPrinterDraft({ ...printerDraft, name: "", target: "" })
      await invalidate()
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const saveRoute = useMutation({
    mutationFn: () =>
      api("/api/v1/cafe/print-routes", {
        method: "POST",
        json: {
          printer_id: Number(routeDraft.printer_id),
          station_id: routeDraft.station_id ? Number(routeDraft.station_id) : null,
          document: routeDraft.document,
          priority: Number(routeDraft.priority),
        },
      }),
    onSuccess: async () => {
      toast.success(t("route_saved"))
      await invalidate()
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const removePrinter = useMutation({
    mutationFn: (id: number) => api(`/api/v1/cafe/printers/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const removeRoute = useMutation({
    mutationFn: (id: number) => api(`/api/v1/cafe/print-routes/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const saveLayout = useMutation({
    mutationFn: (payload: Layout) => api("/api/v1/cafe/receipt-layout", { method: "PUT", json: payload }),
    onSuccess: async () => {
      toast.success(t("layout_saved"))
      await invalidate()
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const saveHook = useMutation({
    mutationFn: () =>
      api<{ data: { secret?: string | null } }>("/api/v1/cafe/webhooks", {
        method: "POST",
        json: { name: hookDraft.name, url: hookDraft.url, events: hookDraft.events },
      }),
    onSuccess: async (data) => {
      toast.success(t("webhook_saved"))
      const secret = data?.data?.secret
      if (secret) {
        // Shown once: the hook's endpoint has to store it now.
        setIssuedKey(secret)
      }
      setHookDraft({ name: "", url: "", events: [] })
      await invalidate()
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const removeHook = useMutation({
    mutationFn: (id: number) => api(`/api/v1/cafe/webhooks/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const issueKey = useMutation({
    mutationFn: () =>
      api<{ data: { key: string } }>("/api/v1/cafe/api-keys", {
        method: "POST",
        json: { name: keyDraft.name, scopes: keyDraft.scopes },
      }),
    onSuccess: async (data) => {
      setIssuedKey(data?.data?.key ?? null)
      toast.success(t("key_issued"))
      setKeyDraft({ name: "", scopes: [] })
      await invalidate()
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const revokeKey = useMutation({
    mutationFn: (id: number) => api(`/api/v1/cafe/api-keys/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      toast.success(t("key_revoked"))
      await invalidate()
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  function toggleIn(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
  }

  const layout = layoutDraft ?? printing.data?.layout ?? {}

  return (
    <CafeAdminShell title={t("title")} description={t("description")}>
      <div className="flex flex-wrap gap-2">
        {(["printers", "receipt", "qr", "webhooks", "keys"] as Tab[]).map((kind) => (
          <Button key={kind} size="sm" variant={tab === kind ? "default" : "outline"} onClick={() => setTab(kind)}>
            {t(`tab_${kind}`)}
          </Button>
        ))}
      </div>

      {issuedKey !== null ? (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3">
          <p className="text-sm font-medium">{t("secret_once")}</p>
          <code className="mt-1 block break-all text-xs" dir="ltr">
            {issuedKey}
          </code>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => setIssuedKey(null)}>
            {t("secret_saved")}
          </Button>
        </div>
      ) : null}

      {tab === "printers" ? (
        <>
          <CafeSection title={t("printers_title")} description={t("printers_hint")}>
            <div className="grid gap-2 sm:grid-cols-6">
              <div className="space-y-1">
                <Label htmlFor="printer-name">{t("name")}</Label>
                <Input
                  id="printer-name"
                  value={printerDraft.name}
                  onChange={(e) => setPrinterDraft({ ...printerDraft, name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="printer-kind">{t("kind")}</Label>
                <select
                  id="printer-kind"
                  className={cafeSelectClass}
                  value={printerDraft.kind}
                  onChange={(e) => setPrinterDraft({ ...printerDraft, kind: e.target.value })}
                >
                  <option value="edge">{t("kind_edge")}</option>
                  <option value="network">{t("kind_network")}</option>
                </select>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="printer-target">{t("target")}</Label>
                <Input
                  id="printer-target"
                  dir="ltr"
                  placeholder={t("target_ph")}
                  value={printerDraft.target}
                  onChange={(e) => setPrinterDraft({ ...printerDraft, target: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="printer-purpose">{t("purpose")}</Label>
                <select
                  id="printer-purpose"
                  className={cafeSelectClass}
                  value={printerDraft.purpose}
                  onChange={(e) => setPrinterDraft({ ...printerDraft, purpose: e.target.value })}
                >
                  <option value="receipt">{t("purpose_receipt")}</option>
                  <option value="kitchen">{t("purpose_kitchen")}</option>
                  <option value="label">{t("purpose_label")}</option>
                </select>
              </div>
              <div className="flex items-end">
                <Button
                  onClick={() => savePrinter.mutate()}
                  disabled={savePrinter.isPending || printerDraft.name === "" || printerDraft.target === ""}
                >
                  {t("add_printer")}
                </Button>
              </div>
            </div>

            {(printing.data?.printers.length ?? 0) === 0 ? (
              <CafeEmptyState message={t("printers_empty")} />
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("name")}</TableHead>
                      <TableHead>{t("kind")}</TableHead>
                      <TableHead>{t("target")}</TableHead>
                      <TableHead>{t("purpose")}</TableHead>
                      <TableHead>{t("actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {printing.data!.printers.map((printer) => (
                      <TableRow key={printer.id}>
                        <TableCell>{printer.name}</TableCell>
                        <TableCell>{printer.kind === "edge" ? t("kind_edge") : t("kind_network")}</TableCell>
                        <TableCell dir="ltr" className="text-xs">
                          {printer.target}
                        </TableCell>
                        <TableCell>{t(`purpose_${printer.purpose}`)}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => removePrinter.mutate(printer.id)}
                          >
                            {t("remove")}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CafeSection>

          <CafeSection title={t("routes_title")} description={t("routes_hint")}>
            <div className="grid gap-2 sm:grid-cols-5">
              <div className="space-y-1">
                <Label htmlFor="route-printer">{t("printer")}</Label>
                <select
                  id="route-printer"
                  className={cafeSelectClass}
                  value={routeDraft.printer_id}
                  onChange={(e) => setRouteDraft({ ...routeDraft, printer_id: e.target.value })}
                >
                  <option value="">—</option>
                  {(printing.data?.printers ?? []).map((printer) => (
                    <option key={printer.id} value={printer.id}>
                      {printer.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="route-station">{t("station")}</Label>
                <Input
                  id="route-station"
                  inputMode="numeric"
                  placeholder={t("station_any")}
                  value={routeDraft.station_id}
                  onChange={(e) => setRouteDraft({ ...routeDraft, station_id: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="route-document">{t("document")}</Label>
                <select
                  id="route-document"
                  className={cafeSelectClass}
                  value={routeDraft.document}
                  onChange={(e) => setRouteDraft({ ...routeDraft, document: e.target.value })}
                >
                  <option value="receipt">{t("document_receipt")}</option>
                  <option value="kitchen">{t("document_kitchen")}</option>
                  <option value="label">{t("document_label")}</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="route-priority">{t("priority")}</Label>
                <Input
                  id="route-priority"
                  inputMode="numeric"
                  value={routeDraft.priority}
                  onChange={(e) => setRouteDraft({ ...routeDraft, priority: e.target.value })}
                />
              </div>
              <div className="flex items-end">
                <Button onClick={() => saveRoute.mutate()} disabled={saveRoute.isPending || routeDraft.printer_id === ""}>
                  {t("add_route")}
                </Button>
              </div>
            </div>

            {(printing.data?.routes.length ?? 0) === 0 ? (
              <CafeEmptyState message={t("routes_empty")} />
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("printer")}</TableHead>
                      <TableHead>{t("station")}</TableHead>
                      <TableHead>{t("document")}</TableHead>
                      <TableHead>{t("priority")}</TableHead>
                      <TableHead>{t("actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {printing.data!.routes.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.printer_name}</TableCell>
                        <TableCell>{row.station_id ?? t("station_any")}</TableCell>
                        <TableCell>{t(`document_${row.document}`)}</TableCell>
                        <TableCell className="tabular-nums">{toLocaleDigits(String(row.priority), locale)}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeRoute.mutate(row.id)}>
                            {t("remove")}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CafeSection>
        </>
      ) : null}

      {tab === "receipt" ? (
        <CafeSection title={t("receipt_title")} description={t("receipt_hint")}>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="receipt-title">{t("header_title")}</Label>
              <Input
                id="receipt-title"
                value={String(layout.header_title ?? "")}
                onChange={(e) => setLayoutDraft({ ...layout, header_title: e.target.value })}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="receipt-footer">{t("footer_note")}</Label>
              <Input
                id="receipt-footer"
                value={String(layout.footer_note ?? "")}
                onChange={(e) => setLayoutDraft({ ...layout, footer_note: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {LAYOUT_FLAGS.map((flag) => (
              <label key={flag} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(layout[flag])}
                  onChange={(e) => setLayoutDraft({ ...layout, [flag]: e.target.checked })}
                />
                {t(flag)}
              </label>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="receipt-width">{t("paper_width")}</Label>
              <select
                id="receipt-width"
                className={cafeSelectClass}
                value={String(layout.paper_width_mm ?? 80)}
                onChange={(e) => setLayoutDraft({ ...layout, paper_width_mm: Number(e.target.value) })}
              >
                {[58, 76, 80, 112].map((width) => (
                  <option key={width} value={width}>
                    {toLocaleDigits(String(width), locale)} mm
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="receipt-copies">{t("copies")}</Label>
              <Input
                id="receipt-copies"
                className="w-24"
                inputMode="numeric"
                value={String(layout.copies ?? 1)}
                onChange={(e) => setLayoutDraft({ ...layout, copies: Number(e.target.value) })}
              />
            </div>
            <Button onClick={() => saveLayout.mutate(layout)} disabled={saveLayout.isPending}>
              {t("save_layout")}
            </Button>
          </div>
        </CafeSection>
      ) : null}

      {tab === "qr" ? (
        <CafeSection title={t("qr_title")} description={t("qr_hint")}>
          {qr.data ? (
            <>
              <div className="flex flex-wrap gap-4 text-sm">
                <span>
                  {t("qr_total")}: <strong className="tabular-nums">{toLocaleDigits(String(qr.data.total_scans), locale)}</strong>
                </span>
                <span>
                  {t("qr_tables")}: <strong className="tabular-nums">{toLocaleDigits(String(qr.data.scanned_tables), locale)}</strong>
                </span>
              </div>

              {(qr.data.tables.length ?? 0) === 0 ? (
                <CafeEmptyState message={t("qr_empty")} />
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("table")}</TableHead>
                        <TableHead>{t("scans")}</TableHead>
                        <TableHead>{t("visitors")}</TableHead>
                        <TableHead>{t("last_scan")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {qr.data.tables.map((row) => (
                        <TableRow key={row.table_code}>
                          <TableCell>{row.table_code}</TableCell>
                          <TableCell className="tabular-nums">{toLocaleDigits(String(row.scans), locale)}</TableCell>
                          <TableCell className="tabular-nums">{toLocaleDigits(String(row.visitors), locale)}</TableCell>
                          <TableCell>{row.last_scan ? formatDisplayDateTime(row.last_scan, locale) : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {qr.data.never_scanned.length > 0 ? (
                <div className="rounded-lg border p-3">
                  <p className="text-sm font-medium">{t("never_scanned")}</p>
                  <p className="text-muted-foreground text-xs">{qr.data.never_scanned.join(locale === "fa" ? "، " : ", ")}</p>
                </div>
              ) : null}
            </>
          ) : (
            <CafeEmptyState message={t("qr_empty")} />
          )}
        </CafeSection>
      ) : null}

      {tab === "webhooks" ? (
        <CafeSection title={t("webhooks_title")} description={t("webhooks_hint")}>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="hook-name">{t("name")}</Label>
              <Input
                id="hook-name"
                value={hookDraft.name}
                onChange={(e) => setHookDraft({ ...hookDraft, name: e.target.value })}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="hook-url">{t("url")}</Label>
              <Input
                id="hook-url"
                dir="ltr"
                placeholder="https://"
                value={hookDraft.url}
                onChange={(e) => setHookDraft({ ...hookDraft, url: e.target.value })}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {(hooks.data?.events ?? []).map((event) => (
              <label key={event} className="flex items-center gap-1 text-xs" dir="ltr">
                <input
                  type="checkbox"
                  checked={hookDraft.events.includes(event)}
                  onChange={() => setHookDraft({ ...hookDraft, events: toggleIn(hookDraft.events, event) })}
                />
                {event}
              </label>
            ))}
          </div>
          <Button
            onClick={() => saveHook.mutate()}
            disabled={saveHook.isPending || hookDraft.name === "" || hookDraft.url === ""}
          >
            {t("add_webhook")}
          </Button>

          {(hooks.data?.webhooks.length ?? 0) === 0 ? (
            <CafeEmptyState message={t("webhooks_empty")} />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("name")}</TableHead>
                    <TableHead>{t("url")}</TableHead>
                    <TableHead>{t("events")}</TableHead>
                    <TableHead>{t("last_result")}</TableHead>
                    <TableHead>{t("actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hooks.data!.webhooks.map((hook) => (
                    <TableRow key={hook.id}>
                      <TableCell>{hook.name}</TableCell>
                      <TableCell dir="ltr" className="text-xs">
                        {hook.url}
                      </TableCell>
                      <TableCell className="text-xs" dir="ltr">
                        {hook.events === null || hook.events.length === 0 ? t("all_events") : hook.events.join(", ")}
                      </TableCell>
                      <TableCell>
                        {hook.last_success_at ? (
                          <Badge variant="secondary">{formatDisplayDateTime(hook.last_success_at, locale)}</Badge>
                        ) : hook.last_error ? (
                          <Badge variant="destructive">{hook.last_error.slice(0, 40)}</Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeHook.mutate(hook.id)}>
                          {t("remove")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {(hooks.data?.deliveries.length ?? 0) > 0 ? (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("event")}</TableHead>
                    <TableHead>{t("status")}</TableHead>
                    <TableHead>{t("attempts")}</TableHead>
                    <TableHead>{t("when")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hooks.data!.deliveries.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell dir="ltr" className="text-xs">
                        {row.event}
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.status === "delivered" ? "secondary" : row.status === "failed" ? "destructive" : "outline"}>
                          {t(`delivery_${row.status}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular-nums">{toLocaleDigits(String(row.attempts), locale)}</TableCell>
                      <TableCell>{formatDisplayDateTime(row.created_at, locale)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </CafeSection>
      ) : null}

      {tab === "keys" ? (
        <CafeSection title={t("keys_title")} description={t("keys_hint")}>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="key-name">{t("name")}</Label>
              <Input
                id="key-name"
                value={keyDraft.name}
                onChange={(e) => setKeyDraft({ ...keyDraft, name: e.target.value })}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>{t("scopes")}</Label>
              <div className="flex flex-wrap gap-2">
                {(keys.data?.scopes ?? []).map((scope) => (
                  <label key={scope} className="flex items-center gap-1 text-xs" dir="ltr">
                    <input
                      type="checkbox"
                      checked={keyDraft.scopes.includes(scope)}
                      onChange={() => setKeyDraft({ ...keyDraft, scopes: toggleIn(keyDraft.scopes, scope) })}
                    />
                    {scope}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <Button
            onClick={() => issueKey.mutate()}
            disabled={issueKey.isPending || keyDraft.name === "" || keyDraft.scopes.length === 0}
          >
            {t("issue_key")}
          </Button>

          {(keys.data?.keys.length ?? 0) === 0 ? (
            <CafeEmptyState message={t("keys_empty")} />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("name")}</TableHead>
                    <TableHead>{t("prefix")}</TableHead>
                    <TableHead>{t("scopes")}</TableHead>
                    <TableHead>{t("last_used")}</TableHead>
                    <TableHead>{t("actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keys.data!.keys.map((key) => (
                    <TableRow key={key.id}>
                      <TableCell>{key.name}</TableCell>
                      <TableCell dir="ltr" className="text-xs">
                        {key.prefix}…
                      </TableCell>
                      <TableCell dir="ltr" className="text-xs">
                        {key.scopes.join(", ")}
                      </TableCell>
                      <TableCell>{key.last_used_at ? formatDisplayDateTime(key.last_used_at, locale) : t("never")}</TableCell>
                      <TableCell>
                        {key.revoked_at ? (
                          <Badge variant="outline">{t("revoked")}</Badge>
                        ) : (
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => revokeKey.mutate(key.id)}>
                            {t("revoke")}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CafeSection>
      ) : null}
    </CafeAdminShell>
  )
}
