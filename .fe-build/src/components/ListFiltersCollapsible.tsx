"use client"

import { ChevronDown } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useEffect, useState, type ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useIsMobile } from "@/hooks/use-mobile"
import { formatNumber, normalizeUiLocale } from "@/lib/locale"
import { cn } from "@/lib/utils"

export function ListFiltersCollapsible({
  children,
  className,
  activeCount = 0,
  label,
  defaultOpen,
}: {
  children: ReactNode
  className?: string
  /** Number of active filters for the badge. */
  activeCount?: number
  /** Heading; defaults to the shared "Filters" label. */
  label?: string
  /** Force initial state. Defaults: closed on mobile, open on desktop, open when filters are active. */
  defaultOpen?: boolean
}) {
  const t = useTranslations("ui")
  const locale = normalizeUiLocale(useLocale())
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(() => defaultOpen ?? activeCount > 0)

  useEffect(() => {
    if (defaultOpen !== undefined) return
    setOpen(!isMobile || activeCount > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, defaultOpen])

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn("rounded-lg border border-border bg-card/60 shadow-soft", className)}
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          aria-label={open ? t("filters_hide") : t("filters_show")}
          className="hover:bg-muted/40 flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-start"
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            {label ?? t("filters")}
            {activeCount > 0 ? (
              <Badge variant="secondary" className="rounded-full px-2 py-0 text-[11px]">
                {formatNumber(activeCount, locale)}
              </Badge>
            ) : null}
          </span>
          <span className="text-muted-foreground flex items-center gap-1 text-xs">
            {open ? t("filters_hide") : t("filters_show")}
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pt-1 pb-3">{children}</CollapsibleContent>
    </Collapsible>
  )
}
