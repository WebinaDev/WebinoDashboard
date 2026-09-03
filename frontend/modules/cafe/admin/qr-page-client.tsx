"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import type { CafeBranch, CafeMenuListItem } from "@/themes/cafe-starter/types"

type QrSettings = {
  public_base_url?: string | null
  default_table_prefix?: string | null
}

type QrResponse = {
  url: string
  qr_svg: string
  type: "table" | "menu"
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? ""

const emptyBranch = {
  name_fa: "",
  name_en: "",
  slug: "",
  address_fa: "",
  address_en: "",
  phone: "",
  is_active: true,
  sort_order: 0,
}

export default function QrPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("cafe_admin.qr")
  const tCommon = useTranslations("common")
  const queryClient = useQueryClient()

  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tableNumber, setTableNumber] = useState("")
  const [menuSlug, setMenuSlug] = useState("")
  const [branchSlug, setBranchSlug] = useState("")
  const [qrResult, setQrResult] = useState<QrResponse | null>(null)
  const [pdfMenuId, setPdfMenuId] = useState("")

  const { data: settings, isLoading: loadingSettings } = useQuery({
    queryKey: ["cafe-qr-settings"],
    queryFn: () => api<QrSettings>("/api/v1/cafe/qr-settings"),
  })

  const [settingsForm, setSettingsForm] = useState<QrSettings | null>(null)
  const settingsValues = settingsForm ?? settings ?? { public_base_url: "", default_table_prefix: "T" }

  const saveSettings = useMutation({
    mutationFn: () =>
      api<QrSettings>("/api/v1/cafe/qr-settings", {
        method: "PATCH",
        json: settingsValues,
      }),
    onSuccess: async () => {
      setMessage(t("saved"))
      await queryClient.invalidateQueries({ queryKey: ["cafe-qr-settings"] })
    },
    onError: (e: Error) => setError(e.message),
  })

  const generateQr = useMutation({
    mutationFn: () => {
      const params = new URLSearchParams()
      if (tableNumber.trim()) params.set("table", tableNumber.trim())
      if (menuSlug.trim()) params.set("menu", menuSlug.trim())
      if (branchSlug.trim()) params.set("branch", branchSlug.trim())
      const qs = params.toString()
      return api<QrResponse>(`/api/v1/cafe/qr${qs ? `?${qs}` : ""}`)
    },
    onSuccess: (data) => {
      setQrResult(data)
      setError(null)
    },
    onError: (e: Error) => setError(e.message),
  })

  const { data: branches = [], isLoading: loadingBranches } = useQuery({
    queryKey: ["cafe-branches"],
    queryFn: () => api<CafeBranch[]>("/api/v1/cafe/branches"),
  })

  const { data: menus = [] } = useQuery({
    queryKey: ["menus"],
    queryFn: () => api<CafeMenuListItem[]>("/api/v1/menus"),
  })

  const [branchForm, setBranchForm] = useState(emptyBranch)
  const [editingBranch, setEditingBranch] = useState<CafeBranch | null>(null)

  const saveBranch = useMutation({
    mutationFn: () => {
      const payload = {
        name_fa: branchForm.name_fa,
        name_en: branchForm.name_en,
        slug: branchForm.slug || undefined,
        address_fa: branchForm.address_fa || null,
        address_en: branchForm.address_en || null,
        phone: branchForm.phone || null,
        is_active: branchForm.is_active,
        sort_order: Number(branchForm.sort_order),
      }
      if (editingBranch) {
        return api<CafeBranch>(`/api/v1/cafe/branches/${editingBranch.id}`, { method: "PATCH", json: payload })
      }
      return api<CafeBranch>("/api/v1/cafe/branches", { method: "POST", json: payload })
    },
    onSuccess: async () => {
      setEditingBranch(null)
      setBranchForm(emptyBranch)
      await queryClient.invalidateQueries({ queryKey: ["cafe-branches"] })
      setMessage(t("branch_saved"))
    },
    onError: (e: Error) => setError(e.message),
  })

  const deleteBranch = useMutation({
    mutationFn: (id: number) => api(`/api/v1/cafe/branches/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["cafe-branches"] })
    },
  })

  function startEditBranch(branch: CafeBranch) {
    setEditingBranch(branch)
    setBranchForm({
      name_fa: branch.name_fa,
      name_en: branch.name_en,
      slug: branch.slug,
      address_fa: branch.address_fa ?? "",
      address_en: branch.address_en ?? "",
      phone: branch.phone ?? "",
      is_active: branch.is_active ?? true,
      sort_order: 0,
    })
  }

  const pdfHref =
    pdfMenuId.trim() !== ""
      ? `${API_BASE}/api/v1/cafe/menu-pdf?menu_id=${encodeURIComponent(pdfMenuId)}`
      : `${API_BASE}/api/v1/cafe/menu-pdf`

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{route.fullPath}</p>
      </div>

      {loadingSettings || loadingBranches ? <p>{tCommon("loading")}</p> : null}
      {message ? <p className="text-sm text-green-600">{message}</p> : null}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("settings_heading")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>{t("public_base_url")}</Label>
            <Input
              value={settingsValues.public_base_url ?? ""}
              onChange={(e) => setSettingsForm({ ...settingsValues, public_base_url: e.target.value })}
              placeholder="https://cafe.example.com"
            />
          </div>
          <div>
            <Label>{t("default_table_prefix")}</Label>
            <Input
              value={settingsValues.default_table_prefix ?? "T"}
              onChange={(e) => setSettingsForm({ ...settingsValues, default_table_prefix: e.target.value })}
            />
          </div>
          <div className="flex items-end">
            <Button onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>
              {tCommon("save")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("generate_heading")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>{t("table_number")}</Label>
            <Input value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} placeholder="12" />
          </div>
          <div>
            <Label>{t("menu_slug")}</Label>
            <select
              className="border-input bg-background mt-1 w-full rounded-md border px-3 py-2 text-sm"
              value={menuSlug}
              onChange={(e) => setMenuSlug(e.target.value)}
            >
              <option value="">{t("menu_all")}</option>
              {menus.map((m) => (
                <option key={m.id} value={m.slug}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>{t("branch_slug")}</Label>
            <select
              className="border-input bg-background mt-1 w-full rounded-md border px-3 py-2 text-sm"
              value={branchSlug}
              onChange={(e) => setBranchSlug(e.target.value)}
            >
              <option value="">{t("branch_all")}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.slug}>
                  {b.name_fa || b.name_en}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-3">
            <Button onClick={() => generateQr.mutate()} disabled={generateQr.isPending}>
              {t("generate")}
            </Button>
          </div>
          {qrResult ? (
            <div className="space-y-3 sm:col-span-3">
              <p className="text-sm">
                <span className="font-medium">{t("qr_url")}: </span>
                <a href={qrResult.url} className="text-primary underline" target="_blank" rel="noreferrer">
                  {qrResult.url}
                </a>
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrResult.qr_svg} alt="QR" className="size-[300px] rounded-lg border" />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("pdf_heading")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div>
            <Label>{t("pdf_menu")}</Label>
            <select
              className="border-input bg-background mt-1 rounded-md border px-3 py-2 text-sm"
              value={pdfMenuId}
              onChange={(e) => setPdfMenuId(e.target.value)}
            >
              <option value="">{t("menu_all")}</option>
              {menus.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <Button asChild variant="outline">
            <a href={pdfHref} target="_blank" rel="noreferrer">
              {t("pdf_download")}
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{editingBranch ? t("edit_branch") : t("add_branch")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>{t("name_fa")}</Label>
            <Input value={branchForm.name_fa} onChange={(e) => setBranchForm((f) => ({ ...f, name_fa: e.target.value }))} />
          </div>
          <div>
            <Label>{t("name_en")}</Label>
            <Input value={branchForm.name_en} onChange={(e) => setBranchForm((f) => ({ ...f, name_en: e.target.value }))} />
          </div>
          <div>
            <Label>{t("branch_slug")}</Label>
            <Input value={branchForm.slug} onChange={(e) => setBranchForm((f) => ({ ...f, slug: e.target.value }))} />
          </div>
          <div>
            <Label>{t("phone")}</Label>
            <Input value={branchForm.phone} onChange={(e) => setBranchForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div>
            <Label>{t("address_fa")}</Label>
            <Input value={branchForm.address_fa} onChange={(e) => setBranchForm((f) => ({ ...f, address_fa: e.target.value }))} />
          </div>
          <div>
            <Label>{t("address_en")}</Label>
            <Input value={branchForm.address_en} onChange={(e) => setBranchForm((f) => ({ ...f, address_en: e.target.value }))} />
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <Checkbox
              checked={branchForm.is_active}
              onCheckedChange={(v) => setBranchForm((f) => ({ ...f, is_active: Boolean(v) }))}
            />
            {t("branch_active")}
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <Button
              onClick={() => saveBranch.mutate()}
              disabled={!branchForm.name_fa || !branchForm.name_en || saveBranch.isPending}
            >
              <Plus className="mr-2 size-4" />
              {tCommon("save")}
            </Button>
            {editingBranch ? (
              <Button variant="outline" onClick={() => { setEditingBranch(null); setBranchForm(emptyBranch) }}>
                {t("cancel_edit")}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("branches_heading")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {branches.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("branches_empty")}</p>
          ) : (
            branches.map((branch) => (
              <div key={branch.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                <div>
                  <p className="font-medium">{branch.name_fa || branch.name_en}</p>
                  <p className="text-muted-foreground text-xs">{branch.slug}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => startEditBranch(branch)}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteBranch.mutate(branch.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
