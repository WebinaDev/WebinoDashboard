"use client"

import Link from "next/link"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export type CouponTableRow = {
  id: number
  code: string
  type: string
  amount: number | string
  status?: string
  usage_count?: number
  usage_limit?: number | null
  expires_at?: string | null
  description?: string | null
}

export function CouponsTable({
  items,
  selectedIds,
  onSelectedChange,
  onTrash,
  trashingId,
}: {
  items: CouponTableRow[]
  selectedIds: number[]
  onSelectedChange: (ids: number[]) => void
  onTrash: (id: number) => void
  trashingId?: number | null
}) {
  const t = useTranslations("coupons")
  const allSelected = items.length > 0 && items.every((row) => selectedIds.includes(row.id))

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <Checkbox
              checked={allSelected}
              onCheckedChange={(v) => onSelectedChange(v ? items.map((i) => i.id) : [])}
            />
          </TableHead>
          <TableHead>{t("cols.code")}</TableHead>
          <TableHead>{t("cols.type")}</TableHead>
          <TableHead>{t("cols.amount")}</TableHead>
          <TableHead>{t("cols.status")}</TableHead>
          <TableHead>{t("cols.usage")}</TableHead>
          <TableHead>{t("cols.expires")}</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.length === 0 ? (
          <TableRow>
            <TableCell colSpan={8} className="text-muted-foreground p-4">
              {t("empty")}
            </TableCell>
          </TableRow>
        ) : (
          items.map((row) => {
            const checked = selectedIds.includes(row.id)
            return (
              <TableRow key={row.id} data-state={checked ? "selected" : undefined}>
                <TableCell>
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) =>
                      onSelectedChange(v ? [...selectedIds, row.id] : selectedIds.filter((id) => id !== row.id))
                    }
                  />
                </TableCell>
                <TableCell className="font-mono">
                  <Link className="underline" href={`/admin/marketing/coupons/${row.id}`}>
                    {row.code}
                  </Link>
                </TableCell>
                <TableCell>{row.type}</TableCell>
                <TableCell>{row.amount}</TableCell>
                <TableCell>{row.status ?? "—"}</TableCell>
                <TableCell>
                  {row.usage_count ?? 0}
                  {row.usage_limit != null ? ` / ${row.usage_limit}` : ""}
                </TableCell>
                <TableCell className="text-xs">{row.expires_at ? String(row.expires_at).slice(0, 10) : "—"}</TableCell>
                <TableCell className="text-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={trashingId === row.id}
                    onClick={() => onTrash(row.id)}
                  >
                    {t("actions.trash")}
                  </Button>
                </TableCell>
              </TableRow>
            )
          })
        )}
      </TableBody>
    </Table>
  )
}
