"use client"

import { keepPreviousData, useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"

import { analyticsRangeQuery, type AnalyticsRange } from "./AnalyticsPeriodFilter"

export function useAnalyticsQuery<T>(
  section: string,
  range: Pick<AnalyticsRange, "from" | "to">,
  extra?: Record<string, string | number | undefined>,
  opts?: { refetchInterval?: number }
) {
  const qs = analyticsRangeQuery(range, extra)
  return useQuery({
    queryKey: ["analytics", section, qs],
    queryFn: () => api<T>(`/api/v1/analytics/${section}?${qs}`),
    placeholderData: keepPreviousData,
    refetchInterval: opts?.refetchInterval,
    retry: false,
  })
}
