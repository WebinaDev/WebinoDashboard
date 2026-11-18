"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useId } from "react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatNumber, normalizeUiLocale } from "@/lib/locale"
import { cn } from "@/lib/utils"

export const PER_PAGE_OPTIONS = [10, 20, 50, 100] as const
export const MEDIA_PER_PAGE_OPTIONS = [20, 40, 60] as const

type PostsPaginationProps = {
  page: number
  perPage: number
  /** Total matching rows. */
  found: number
  onPageChange: (page: number) => void
  onPerPageChange?: (perPage: number) => void
  showPerPageSelector?: boolean
  perPageOptions?: readonly number[]
  className?: string
}

/** Shared list pagination: per-page selector, "page X of Y", previous / next. */
export function PostsPagination({
  page,
  perPage,
  found,
  onPageChange,
  onPerPageChange,
  showPerPageSelector = true,
  perPageOptions = PER_PAGE_OPTIONS,
  className,
}: PostsPaginationProps) {
  const t = useTranslations("ui")
  const locale = normalizeUiLocale(useLocale())
  const selectId = useId()
  const totalPages = Math.max(1, Math.ceil(found / Math.max(1, perPage)))
  const current = Math.min(Math.max(1, page), totalPages)

  if (found <= 0) return null

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-border px-2 pt-3 sm:px-4",
        className
      )}
    >
      <div className="flex items-center gap-2">
        {showPerPageSelector && onPerPageChange ? (
          <>
            <Label htmlFor={selectId} className="text-muted-foreground text-sm">
              {t("per_page")}
            </Label>
            <Select value={String(perPage)} onValueChange={(v) => onPerPageChange(parseInt(v, 10) || 20)}>
              <SelectTrigger id={selectId} className="h-8 w-[5.5rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {perPageOptions.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {formatNumber(n, locale)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        ) : null}
      </div>

      <p className="text-muted-foreground text-sm">
        {t("page_of", {
          page: formatNumber(current, locale),
          total: formatNumber(totalPages, locale),
          count: formatNumber(found, locale),
        })}
      </p>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={current <= 1}
          onClick={() => onPageChange(current - 1)}
        >
          <ChevronRight className="size-4 ltr:rotate-180" />
          {t("prev_page")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={current >= totalPages}
          onClick={() => onPageChange(current + 1)}
        >
          {t("next_page")}
          <ChevronLeft className="size-4 ltr:rotate-180" />
        </Button>
      </div>
    </div>
  )
}
