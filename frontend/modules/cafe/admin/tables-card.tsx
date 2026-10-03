"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"

type TableRow = { id: number; code: string; label?: string | null; seats: number; is_active: boolean }

export function TablesCard() {
  const t = useTranslations("cafe_admin.qr")
  const queryClient = useQueryClient()
  const [code, setCode] = useState("")
  const [label, setLabel] = useState("")
  const [seats, setSeats] = useState(4)
  const [qr, setQr] = useState<{ code: string; svg: string; url: string } | null>(null)

  const { data: tables = [] } = useQuery({
    queryKey: ["cafe-tables"],
    queryFn: () => api<TableRow[]>("/api/v1/cafe/tables"),
  })

  const save = useMutation({
    mutationFn: () => api("/api/v1/cafe/tables", { method: "POST", json: { code, label: label || null, seats } }),
    onSuccess: async () => {
      setCode("")
      setLabel("")
      await queryClient.invalidateQueries({ queryKey: ["cafe-tables"] })
    },
  })

  return (
    <Card>
      <CardHeader><CardTitle>{t("tables_heading")}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-4">
          <div><Label>{t("table_code")}</Label><Input value={code} onChange={(e) => setCode(e.target.value)} /></div>
          <div><Label>{t("table_label")}</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} /></div>
          <div><Label>{t("seats")}</Label><Input type="number" value={seats} onChange={(e) => setSeats(Number(e.target.value))} /></div>
          <Button className="self-end" disabled={!code || save.isPending} onClick={() => save.mutate()}>{t("add_table")}</Button>
        </div>
        <ul className="space-y-2">
          {tables.map((table) => (
            <li key={table.id} className="flex items-center justify-between rounded-lg border p-2 text-sm">
              <span>{table.label || table.code} · {table.seats}</span>
              <span className="flex gap-2">
                <Button size="sm" variant="outline" onClick={async () => {
                  const res = await api<{ url: string; qr_svg: string }>(`/api/v1/cafe/qr?table=${encodeURIComponent(table.code)}`)
                  setQr({ code: table.code, svg: res.qr_svg, url: res.url })
                }}>{t("table_qr")}</Button>
                <Button size="sm" variant="ghost" onClick={() => api(`/api/v1/cafe/tables/${table.id}`, { method: "DELETE" }).then(() => queryClient.invalidateQueries({ queryKey: ["cafe-tables"] }))}>{t("remove")}</Button>
              </span>
            </li>
          ))}
        </ul>
        {qr ? (
          <div className="rounded-lg border p-3">
            <p className="mb-2 text-sm">{qr.code}</p>
            <div dangerouslySetInnerHTML={{ __html: qr.svg }} />
            <p className="text-muted-foreground mt-2 break-all text-xs">{qr.url}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
