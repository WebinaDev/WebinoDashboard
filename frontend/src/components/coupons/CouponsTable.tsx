"use client"

import { Trash2 } from "lucide-react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"

import { MoneyDisplay } from "@/components/currency/MoneyDisplay"
import { MobileListCard, MobileListField } from "@/components/MobileListCard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { localizeNumber } from "@/lib/digits"
import { statusBadgeVariant, useEnumLabel } from "@/lib/enum-labels"
import { formatDisplayDate } from "@/lib/format-date"

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
  onTrash: (row: CouponTableRow) => void
  trashingId?: number | null
}) {
  const t = useTranslations("coupons")
  const locale = useLocale()
  const enumLabel = useEnumLabel()
  const allSelected = items.length > 0 && items.every((row) => selectedIds.includes(row.id))

  const toggle = (id: number, v: boolean) =>
    onSelectedChange(v ? [...selectedIds, id] : selectedIds.filter((x) => x !== id))

  const amount = (row: CouponTableRow) =>
    row.type === "percent" ? `${localizeNumber(row.amount, locale)}%` : <MoneyDisplay amount={row.amount} />

  const usage = (row: CouponTableRow) =>
    `${localizeNumber(row.usage_count ?? 0, locale)}${row.usage_limit != null ? ` / ${localizeNumber(row.usage_limit, locale)}` : ""}`

  const status = (row: CouponTableRow) => (
    <Badge variant={statusBadgeVariant(row.status)}>{enumLabel("product_status", row.status)}</Badge>
  )

  const trashButton = (row: CouponTableRow) => (
    <Button
      type="button"
      size="sm"
      variant="destructive"
      disabled={trashingId === row.id}
      onClick={() => onTrash(row)}
    >
      <Trash2 className="size-4" />
      {t("actions.trash")}
    </Button>
  )

  if (items.length === 0) {
    return <p className="text-muted-foreground p-4 text-sm">{t("empty")}</p>
  }

  return (
    <>
      <div className="space-y-2 p-2 md:hidden">
        {items.map((row) => (
          <MobileListCard
            key={row.id}
            leading={<Checkbox checked={selectedIds.includes(row.id)} onCheckedChange={(v) => toggle(row.id, v === true)} />}
            media={
              <div className="flex items-center justify-between gap-2">
                <Link className="font-mono underline" href={`/dashboard/marketing/coupons/${row.id}`}>
                  {row.code}
                </Link>
                {status(row)}
              </div>
            }
            actions={trashButton(row)}
          >
            <MobileListField label={t("cols.type")}>{enumLabel("coupon_type", row.type)}</MobileListField>
            <MobileListField label={t("cols.amount")}>{amount(row)}</MobileListField>
            <MobileListField label={t("cols.usage")}>{usage(row)}</MobileListField>
            <MobileListField label={t("cols.expires")}>{formatDisplayDate(row.expires_at, locale)}</MobileListField>
          </MobileListCard>
        ))}
      </div>
      <div className="hidden md:block">
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
            {items.map((row) => {
              const checked = selectedIds.includes(row.id)
              return (
                <TableRow key={row.id} data-state={checked ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox checked={checked} onCheckedChange={(v) => toggle(row.id, v === true)} />
                  </TableCell>
                  <TableCell className="font-mono">
                    <Link className="underline" href={`/dashboard/marketing/coupons/${row.id}`}>
                      {row.code}
                    </Link>
                  </TableCell>
                  <TableCell>{enumLabel("coupon_type", row.type)}</TableCell>
                  <TableCell>{amount(row)}</TableCell>
                  <TableCell>{status(row)}</TableCell>
                  <TableCell>{usage(row)}</TableCell>
                  <TableCell className="text-xs">{formatDisplayDate(row.expires_at, locale)}</TableCell>
                  <TableCell className="text-end">{trashButton(row)}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
