"use client"

import { useTranslations } from "next-intl"
import { useQuery } from "@tanstack/react-query"

import { isSmsUnavailable, SmsServiceBanner } from "@/components/marketing/SmsServiceBanner"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { fetchSmsNumbers, smsQueryOptions } from "../lib/modirpayamak-api"
import { normalizeSmsLines } from "../lib/sms-report"
import { SmsPanelShell } from "../lib/sms-panel-shell"
import { SmsSection } from "../lib/sms-admin-ui"

export default function PageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("sms")

  const numbersQ = useQuery({
    queryKey: ["sms-numbers"],
    queryFn: fetchSmsNumbers,
    ...smsQueryOptions,
  })

  const unavailable = numbersQ.data ? isSmsUnavailable(numbersQ.data) : false
  const numbers = unavailable ? [] : normalizeSmsLines(numbersQ.data)
  const loading = numbersQ.isPending

  return (
    <SmsPanelShell title={t("linesTitle")} description={t("linesHint")}>
      {numbersQ.isError ? (
        <SmsServiceBanner
          message={getApiErrorMessage(numbersQ.error)}
          onRetry={() => void numbersQ.refetch()}
        />
      ) : null}
      {unavailable ? (
        <SmsServiceBanner
          message={String((numbersQ.data as { message?: string })?.message ?? "")}
          onRetry={() => void numbersQ.refetch()}
        />
      ) : null}

      <SmsSection title={t("linesTitle")} description={t("linesHint")}>
<div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("lineNumber")}</TableHead>
                  <TableHead>{t("lineRole")}</TableHead>
                  <TableHead>{t("lineLabel")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading
                  ? Array.from({ length: 3 }, (_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={3}>
                          <Skeleton className="h-6 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  : numbers.length === 0
                    ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-muted-foreground text-sm">
                            {t("noLines")}
                          </TableCell>
                        </TableRow>
                      )
                    : numbers.map((n) => {
                        const roleKey =
                          n.role === "service"
                            ? "roleService"
                            : n.role === "personal" || n.role === "marketing"
                              ? "rolePersonal"
                              : ""
                        return (
                          <TableRow key={`${n.role}-${n.number}`}>
                            <TableCell className="font-mono" dir="ltr">
                              {n.number}
                            </TableCell>
                            <TableCell>{roleKey ? t(roleKey) : n.role}</TableCell>
                            <TableCell>{n.label ?? "—"}</TableCell>
                          </TableRow>
                        )
                      })}
              </TableBody>
            </Table>
          </div>
        </SmsSection>
    </SmsPanelShell>
  )
}
