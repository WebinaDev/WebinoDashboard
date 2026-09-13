"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type WalletSettings = {
  enabled?: boolean
  title?: string
  min_topup_minor?: number
  min_withdraw_minor?: number
}

type CustomerHit = {
  id: number
  name?: string | null
  email?: string | null
  wallet_balance_minor?: number
}

const selectClass =
  "border-input bg-background h-9 w-full rounded-md border px-3 text-sm"

export default function WalletSettingsPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("wallet_admin")
  const tCommon = useTranslations("common")
  const queryClient = useQueryClient()

  const [enabled, setEnabled] = useState(true)
  const [title, setTitle] = useState("")
  const [minTopup, setMinTopup] = useState(10000)
  const [minWithdraw, setMinWithdraw] = useState(50000)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [userQ, setUserQ] = useState("")
  const [userHits, setUserHits] = useState<CustomerHit[]>([])
  const [userId, setUserId] = useState("")
  const [adjustAmount, setAdjustAmount] = useState(0)
  const [adjustDirection, setAdjustDirection] = useState<"credit" | "debit">("credit")
  const [topupAmount, setTopupAmount] = useState(0)

  const { data, isLoading } = useQuery({
    queryKey: ["wallet-settings"],
    queryFn: () => api<WalletSettings>("/api/v1/wallet/settings"),
  })

  useEffect(() => {
    if (!data) return
    setEnabled(Boolean(data.enabled))
    setTitle(data.title || "")
    setMinTopup(data.min_topup_minor ?? 10000)
    setMinWithdraw(data.min_withdraw_minor ?? 50000)
  }, [data])

  const save = useMutation({
    mutationFn: () =>
      api("/api/v1/wallet/settings", {
        method: "PUT",
        json: {
          payload: {
            enabled,
            title,
            min_topup_minor: minTopup,
            min_withdraw_minor: minWithdraw,
          },
        },
      }),
    onSuccess: async () => {
      setSaved(true)
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ["wallet-settings"] })
    },
    onError: (e: Error) => {
      setSaved(false)
      setError(getApiErrorMessage(e))
    },
  })

  const adjust = useMutation({
    mutationFn: () =>
      api(`/api/v1/wallet/users/${userId}/adjust`, {
        method: "POST",
        json: { direction: adjustDirection, amount_minor: adjustAmount },
      }),
    onSuccess: () => setError(null),
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const topup = useMutation({
    mutationFn: () =>
      api("/api/v1/wallet/topup", {
        method: "POST",
        json: { user_id: Number(userId), amount_minor: topupAmount },
      }),
    onSuccess: () => setError(null),
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  async function searchUsers() {
    if (!userQ.trim()) {
      setUserHits([])
      return
    }
    try {
      setUserHits(await api<CustomerHit[]>(`/api/v1/pos/customers?q=${encodeURIComponent(userQ.trim())}`))
    } catch {
      setUserHits([])
    }
  }

  return (
    <div className="space-y-6 p-6" dir="auto">
      <div>
        <h1 className="text-2xl font-bold">{t("settings_title")}</h1>
        <p className="text-muted-foreground text-sm">{route.fullPath}</p>
      </div>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {saved ? <p className="text-sm text-green-700 dark:text-green-400">{t("saved")}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("settings_heading")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
          ) : (
            <>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={enabled} onCheckedChange={(v) => setEnabled(v === true)} />
                {t("enabled")}
              </label>
              <div>
                <Label>{t("title_field")}</Label>
                <Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>{t("min_topup")}</Label>
                  <Input
                    className="mt-1"
                    type="number"
                    value={minTopup}
                    onChange={(e) => setMinTopup(Number(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label>{t("min_withdraw")}</Label>
                  <Input
                    className="mt-1"
                    type="number"
                    value={minWithdraw}
                    onChange={(e) => setMinWithdraw(Number(e.target.value) || 0)}
                  />
                </div>
              </div>
              <Button disabled={save.isPending} onClick={() => save.mutate()}>
                {tCommon("save")}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("user_ops")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Input
              className="min-w-[200px] flex-1"
              value={userQ}
              onChange={(e) => setUserQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void searchUsers()}
              placeholder={t("search_user_ph")}
            />
            <Button variant="secondary" onClick={() => void searchUsers()}>
              {t("search")}
            </Button>
          </div>
          {userHits.length > 0 ? (
            <ul className="max-h-36 space-y-1 overflow-y-auto rounded-md border p-2 text-sm">
              {userHits.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    className="w-full rounded px-2 py-1 text-start hover:bg-muted"
                    onClick={() => {
                      setUserId(String(u.id))
                      setUserHits([])
                    }}
                  >
                    #{u.id} {u.name || u.email} · {(u.wallet_balance_minor ?? 0).toLocaleString()}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <div>
            <Label>{t("user_id")}</Label>
            <Input className="mt-1" value={userId} onChange={(e) => setUserId(e.target.value)} />
          </div>

          <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-3">
            <div>
              <Label>{t("adjust_amount")}</Label>
              <Input
                className="mt-1"
                type="number"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label>{t("direction")}</Label>
              <select
                className={`${selectClass} mt-1`}
                value={adjustDirection}
                onChange={(e) => setAdjustDirection(e.target.value as "credit" | "debit")}
              >
                <option value="credit">{t("credit")}</option>
                <option value="debit">{t("debit")}</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button
                className="w-full"
                disabled={!userId || adjustAmount < 1 || adjust.isPending}
                onClick={() => adjust.mutate()}
              >
                {t("adjust")}
              </Button>
            </div>
          </div>

          <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Label>{t("topup_amount")}</Label>
              <Input
                className="mt-1"
                type="number"
                value={topupAmount}
                onChange={(e) => setTopupAmount(Number(e.target.value) || 0)}
              />
            </div>
            <div className="flex items-end">
              <Button
                className="w-full"
                disabled={!userId || topupAmount < 1 || topup.isPending}
                onClick={() => topup.mutate()}
              >
                {t("topup")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
