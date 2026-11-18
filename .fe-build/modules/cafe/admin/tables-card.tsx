"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { QrCode, Trash2 } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"

import { toLocaleDigits } from "@/lib/locale"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

import { CafeEmptyState, CafeSection } from "./cafe-admin-ui"
import { QrCodeView, printTableCards } from "./qr-code"

type TableRow = { id: number; code: string; label?: string | null; seats: number; is_active: boolean }

export function TablesCard() {
  const t = useTranslations("cafe_admin.qr")
  const locale = useLocale()
  const queryClient = useQueryClient()
  const [code, setCode] = useState("")
  const [label, setLabel] = useState("")
  const [seats, setSeats] = useState(4)
  const [qr, setQr] = useState<{ code: string; url: string } | null>(null)
  const [printing, setPrinting] = useState(false)

  const { data: tables = [] } = useQuery({
    queryKey: ["cafe-tables"],
    queryFn: () => api<TableRow[]>("/api/v1/cafe/tables"),
  })

  async function printAll() {
    setPrinting(true)
    try {
      const active = tables.filter((row) => row.is_active)
      const urls = await Promise.all(active.map((row) => api<{ url: string }>(`/api/v1/cafe/qr?table_id=${row.id}`)))
      await printTableCards(
        active.map((row, i) => ({
          title: t("card_title", { table: toLocaleDigits(row.label || row.code, locale) }),
          subtitle: t("card_seats", { count: toLocaleDigits(String(row.seats), locale) }),
          url: urls[i].url,
        })),
        { heading: t("tables_heading"), hint: t("card_hint"), dir: locale === "fa" ? "rtl" : "ltr" },
      )
    } catch (e) {
      toast.error(getApiErrorMessage(e as Error))
    } finally {
      setPrinting(false)
    }
  }

  const save = useMutation({
    mutationFn: () => api("/api/v1/cafe/tables", { method: "POST", json: { code, label: label || null, seats } }),
    onSuccess: async () => {
      setCode("")
      setLabel("")
      toast.success(t("add_table"))
      await queryClient.invalidateQueries({ queryKey: ["cafe-tables"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const remove = useMutation({
    mutationFn: (id: number) => api(`/api/v1/cafe/tables/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["cafe-tables"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  return (
    <CafeSection
      title={t("tables_heading")}
      actions={
        tables.some((row) => row.is_active) ? (
          <Button type="button" size="sm" variant="outline" disabled={printing} onClick={() => void printAll()}>
            {t("print_table_cards")}
          </Button>
        ) : null
      }
    >
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_6rem_auto]">
        <div className="space-y-1.5">
          <Label>{t("table_code")}</Label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("table_label")}</Label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("seats")}</Label>
          <Input type="number" value={seats} onChange={(e) => setSeats(Number(e.target.value))} />
        </div>
        <Button className="self-end" disabled={!code || save.isPending} onClick={() => save.mutate()}>
          {t("add_table")}
        </Button>
      </div>

      {tables.length === 0 ? (
        <CafeEmptyState message={t("tables_empty")} />
      ) : (
        <ul className="space-y-2">
          {tables.map((table) => (
            <li key={table.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
              <span className="min-w-0 truncate">
                {table.label || table.code} · {toLocaleDigits(String(table.seats), locale)}
                {table.is_active ? null : <span className="text-muted-foreground"> · {t("table_inactive")}</span>}
              </span>
              <span className="flex shrink-0 gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  title={t("table_qr")}
                  aria-label={t("table_qr")}
                  onClick={async () => {
                    try {
                      const res = await api<{ url: string }>(`/api/v1/cafe/qr?table_id=${table.id}`)
                      setQr({ code: table.code, url: res.url })
                    } catch (e) {
                      toast.error(getApiErrorMessage(e as Error))
                    }
                  }}
                >
                  <QrCode className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  title={t("remove")}
                  aria-label={t("remove")}
                  onClick={() => remove.mutate(table.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {qr ? (
        <div className="rounded-lg border p-3">
          <p className="mb-2 text-sm font-medium">{qr.code}</p>
          <QrCodeView url={qr.url} name={`table-${qr.code}`} size={200} />
          <p className="text-muted-foreground mt-2 break-all text-xs" dir="ltr">
            {qr.url}
          </p>
        </div>
      ) : null}
    </CafeSection>
  )
}
