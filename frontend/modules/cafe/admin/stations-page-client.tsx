"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ChefHat, Plus, Trash2, UserPlus } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

import { CafeAdminShell, CafeEmptyState, CafeSection, cafeSelectClass } from "../../cafe/admin/cafe-admin-ui"

type Station = {
  id: number
  name_fa: string
  name_en?: string | null
  kind: string
  is_active: boolean
  branch_id: number | null
  station_products_count?: number
  users_count?: number
}

const KINDS = ["kitchen", "bar", "dessert", "pass"] as const

export default function StationsPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("cafe_admin.stations")
  const queryClient = useQueryClient()

  const [nameFa, setNameFa] = useState("")
  const [kind, setKind] = useState<string>("kitchen")
  const [assignStation, setAssignStation] = useState<number | null>(null)
  const [assignKind, setAssignKind] = useState<"product" | "category" | "user">("product")
  const [assignValue, setAssignValue] = useState("")

  const stations = useQuery({
    queryKey: ["cafe-stations"],
    queryFn: async () => {
      // `api()` unwraps the envelope, so this is the station list itself.
      const res = await api<Station[]>("/api/v1/cafe/stations")
      return res ?? []
    },
  })

  const create = useMutation({
    mutationFn: () =>
      api("/api/v1/cafe/stations", {
        method: "POST",
        json: { name_fa: nameFa.trim(), name_en: nameFa.trim(), kind },
      }),
    onSuccess: () => {
      setNameFa("")
      toast.success(t("created"))
      void queryClient.invalidateQueries({ queryKey: ["cafe-stations"] })
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const remove = useMutation({
    mutationFn: (id: number) => api(`/api/v1/cafe/stations/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(t("deleted"))
      void queryClient.invalidateQueries({ queryKey: ["cafe-stations"] })
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const assign = useMutation({
    mutationFn: () => {
      const json =
        assignKind === "product"
          ? { product_id: Number(assignValue) }
          : assignKind === "category"
            ? { category_id: Number(assignValue) }
            : { user_id: Number(assignValue) }
      return api(`/api/v1/cafe/stations/${assignStation}/assign`, { method: "POST", json })
    },
    onSuccess: () => {
      setAssignValue("")
      toast.success(t("assigned"))
      void queryClient.invalidateQueries({ queryKey: ["cafe-stations"] })
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const rows = stations.data ?? []

  return (
    <CafeAdminShell title={t("title")} description={t("description")}>
      <CafeSection title={t("new_title")} description={t("new_description")}>
        <div className="grid gap-2 sm:grid-cols-[1fr_10rem_auto]">
          <div className="space-y-1">
            <Label htmlFor="station-name">{t("name")}</Label>
            <Input id="station-name" value={nameFa} onChange={(e) => setNameFa(e.target.value)} placeholder={t("name_placeholder")} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="station-kind">{t("kind")}</Label>
            <select id="station-kind" className={cafeSelectClass} value={kind} onChange={(e) => setKind(e.target.value)}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`kind_${k}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button type="button" disabled={nameFa.trim() === "" || create.isPending} onClick={() => create.mutate()}>
              <Plus className="size-4" />
              {t("add")}
            </Button>
          </div>
        </div>
      </CafeSection>

      <CafeSection title={t("list_title")} description={t("list_description")}>
        {stations.isPending ? (
          <p className="text-muted-foreground text-sm">{t("loading")}</p>
        ) : rows.length === 0 ? (
          <CafeEmptyState message={t("empty")} />
        ) : (
          <ul className="divide-y rounded-lg border">
            {rows.map((station) => (
              <li key={station.id} className="space-y-2 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <ChefHat className="text-muted-foreground size-4 shrink-0" />
                    <span className="truncate text-sm font-medium">{station.name_fa}</span>
                    <Badge variant="secondary">{t(`kind_${station.kind}`)}</Badge>
                    {!station.is_active ? <Badge variant="outline">{t("inactive")}</Badge> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAssignStation(assignStation === station.id ? null : station.id)
                        setAssignValue("")
                      }}
                    >
                      <UserPlus className="size-4" />
                      {t("assign")}
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={t("delete")}
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(station.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>

                {assignStation === station.id ? (
                  <div className="bg-muted/30 grid gap-2 rounded-md border p-2 sm:grid-cols-[10rem_1fr_auto]">
                    <select
                      className={cafeSelectClass}
                      value={assignKind}
                      onChange={(e) => setAssignKind(e.target.value as "product" | "category" | "user")}
                    >
                      <option value="product">{t("assign_product")}</option>
                      <option value="category">{t("assign_category")}</option>
                      <option value="user">{t("assign_user")}</option>
                    </select>
                    <Input
                      inputMode="numeric"
                      placeholder={t("assign_id_placeholder")}
                      value={assignValue}
                      onChange={(e) => setAssignValue(e.target.value)}
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={assignValue === "" || assign.isPending}
                      onClick={() => assign.mutate()}
                    >
                      {t("assign_save")}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CafeSection>
    </CafeAdminShell>
  )
}
