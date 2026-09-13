"use client"

import { useTranslations } from "next-intl"
import { useQuery } from "@tanstack/react-query"

import { isSmsUnavailable, SmsServiceBanner } from "@/components/marketing/SmsServiceBanner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import { fetchSmsNumbers, smsQueryOptions, type SmsAttachedNumber } from "../lib/modirpayamak-api"
import { SmsPanelShell } from "../lib/sms-panel-shell"

function unwrapNumbers(
  payload: { data?: SmsAttachedNumber[]; numbers?: SmsAttachedNumber[] } | undefined,
): SmsAttachedNumber[] {
  const list = payload?.numbers ?? payload?.data
  return Array.isArray(list) ? list : []
}

export default function PageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("sms")

  const numbersQ = useQuery({
    queryKey: ["sms-numbers"],
    queryFn: fetchSmsNumbers,
    ...smsQueryOptions,
  })

  const unavailable = numbersQ.data ? isSmsUnavailable(numbersQ.data) : false
  const numbers = unavailable ? [] : unwrapNumbers(numbersQ.data)
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

      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle className="text-base">{t("linesTitle")}</CardTitle>
          <CardDescription>{t("linesHint")}</CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </SmsPanelShell>
  )
}
