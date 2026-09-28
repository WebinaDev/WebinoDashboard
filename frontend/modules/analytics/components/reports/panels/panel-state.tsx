"use client"

import type { ReactNode } from "react"
import type { UseQueryResult } from "@tanstack/react-query"
import { useTranslations } from "next-intl"

import { QueryErrorState } from "@/components/QueryErrorState"
import { TableListSkeleton } from "@/components/TableListSkeleton"
import { getApiErrorMessage } from "@/lib/api-helpers"

import type { ReportFilters } from "../use-report-filters"

export type ReportPanelProps = { filters: ReportFilters }

/** Renders skeleton / error for a report query, children once data is present. */
export function PanelState<T>({ q, children }: { q: UseQueryResult<T>; children: (data: T) => ReactNode }) {
  const t = useTranslations("reports")
  if (q.isLoading) return <TableListSkeleton rows={6} columns={4} />
  if (q.isError && !q.data) {
    return <QueryErrorState message={getApiErrorMessage(q.error) || t("error")} onRetry={() => q.refetch()} />
  }
  if (!q.data) return null
  return <>{children(q.data)}</>
}
