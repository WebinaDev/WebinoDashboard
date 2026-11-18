"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Pencil, Plus, Search, Trash2 } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { useConfirm } from "@/components/ConfirmDialog"
import { PageShell } from "@/components/PageShell"
import { QueryErrorState } from "@/components/QueryErrorState"
import { TableListSkeleton } from "@/components/TableListSkeleton"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { useEnumLabel } from "@/lib/enum-labels"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { slugFromName } from "@/lib/taxonomy-helpers"

type Attribute = {
  id: number
  name: string
  slug: string
  type: string
  terms_count?: number
}

type AttributeGroup = {
  id: number
  name: string
  attribute_ids?: number[] | null
}

const selectClass = "border-input bg-background h-9 w-full rounded-md border px-3 text-sm"

export default function AttributesPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const enumLabel = useEnumLabel()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const t = useTranslations("store")
  const tCommon = useTranslations("common")
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [createName, setCreateName] = useState("")
  const [createSlug, setCreateSlug] = useState("")
  const [createSlugAuto, setCreateSlugAuto] = useState(true)
  const [createType, setCreateType] = useState("select")
  const [groupName, setGroupName] = useState("")
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null)
  const [editingGroupName, setEditingGroupName] = useState("")
  const [editingGroupIds, setEditingGroupIds] = useState<number[]>([])

  const { data: attributes = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-attributes"],
    queryFn: () => api<Attribute[]>("/api/v1/attributes"),
  })

  const { data: groups = [] } = useQuery({
    queryKey: ["attribute-groups"],
    queryFn: () => api<AttributeGroup[]>("/api/v1/attribute-groups"),
  })

  const filtered = useMemo(() => {
    if (!search.trim()) return attributes
    const q = search.trim().toLowerCase()
    return attributes.filter(
      (a) => a.name.toLowerCase().includes(q) || a.slug.toLowerCase().includes(q),
    )
  }, [attributes, search])

  const groupedSections = useMemo(() => {
    const claimed = new Set<number>()
    const sections: Array<{ key: string; title: string; items: Attribute[] }> = []
    for (const group of groups) {
      const ids = group.attribute_ids ?? []
      const items = filtered.filter((a) => ids.includes(a.id))
      items.forEach((a) => claimed.add(a.id))
      sections.push({ key: `g-${group.id}`, title: group.name, items })
    }
    const ungrouped = filtered.filter((a) => !claimed.has(a.id))
    if (ungrouped.length) {
      sections.push({ key: "ungrouped", title: t("ungrouped_attributes"), items: ungrouped })
    } else if (!sections.length) {
      sections.push({ key: "ungrouped", title: t("ungrouped_attributes"), items: [] })
    }
    return sections
  }, [filtered, groups, t])

  const createAttr = useMutation({
    mutationFn: () => {
      const name = createName.trim()
      return api<Attribute>("/api/v1/attributes", {
        method: "POST",
        json: {
          name,
          slug: createSlug.trim() || slugFromName(name) || undefined,
          type: createType,
        },
      })
    },
    onSuccess: async (row) => {
      toast.success(tCommon("saved"))
      setCreateName("")
      setCreateSlug("")
      setCreateSlugAuto(true)
      setCreateType("select")
      await queryClient.invalidateQueries({ queryKey: ["admin-attributes"] })
      if (row?.id) window.location.assign(`/dashboard/attributes/${row.id}`)
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const remove = useMutation({
    mutationFn: (id: number) => api(`/api/v1/attributes/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-attributes"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const createGroup = useMutation({
    mutationFn: () =>
      api<AttributeGroup>("/api/v1/attribute-groups", {
        method: "POST",
        json: { name: groupName.trim(), attribute_ids: [] },
      }),
    onSuccess: async () => {
      toast.success(tCommon("saved"))
      setGroupName("")
      await queryClient.invalidateQueries({ queryKey: ["attribute-groups"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const updateGroup = useMutation({
    mutationFn: () =>
      api(`/api/v1/attribute-groups/${editingGroupId}`, {
        method: "PATCH",
        json: { name: editingGroupName.trim(), attribute_ids: editingGroupIds },
      }),
    onSuccess: async () => {
      toast.success(tCommon("saved"))
      setEditingGroupId(null)
      await queryClient.invalidateQueries({ queryKey: ["attribute-groups"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const deleteGroup = useMutation({
    mutationFn: (id: number) => api(`/api/v1/attribute-groups/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["attribute-groups"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const startEditGroup = (group: AttributeGroup) => {
    setEditingGroupId(group.id)
    setEditingGroupName(group.name)
    setEditingGroupIds([...(group.attribute_ids ?? [])])
  }

  return (
    <PageShell
      title={t("attributes_title")}
      actions={
        <Button asChild>
          <Link href="/dashboard/attributes/new">
            <Plus className="size-4" />
            {t("add_attribute")}
          </Link>
        </Button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
        <div className="space-y-4">
          <form
            className="space-y-3 rounded-xl border p-4"
            onSubmit={(e) => {
              e.preventDefault()
              void createAttr.mutateAsync()
            }}
          >
            <p className="font-medium">{t("add_attribute")}</p>
            <div className="space-y-1">
              <Label>{t("name")}</Label>
              <Input
                value={createName}
                onChange={(e) => {
                  const next = e.target.value
                  setCreateName(next)
                  if (createSlugAuto) setCreateSlug(slugFromName(next))
                }}
                required
              />
            </div>
            <div className="space-y-1">
              <Label>{t("slug")}</Label>
              <Input
                value={createSlug}
                dir="ltr"
                onChange={(e) => {
                  setCreateSlugAuto(false)
                  setCreateSlug(e.target.value)
                }}
                placeholder={t("slug_from_name_hint")}
              />
            </div>
            <div className="space-y-1">
              <Label>{t("attribute_type")}</Label>
              <select className={selectClass} value={createType} onChange={(e) => setCreateType(e.target.value)}>
                {(["select", "color", "image", "button", "text"] as const).map((type) => (
                  <option key={type} value={type}>
                    {enumLabel("attribute_type", type)}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={!createName.trim() || createAttr.isPending}>
              {t("add_attribute")}
            </Button>
          </form>

          <div className="space-y-3 rounded-xl border p-4">
            <p className="font-medium">{t("attribute_groups")}</p>
            <p className="text-muted-foreground text-xs">{t("attribute_groups_hint")}</p>
            <div className="flex gap-2">
              <Input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder={t("attribute_group_name_ph")}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!groupName.trim() || createGroup.isPending}
                onClick={() => createGroup.mutate()}
              >
                {t("attribute_group_create")}
              </Button>
            </div>
            <ul className="space-y-2">
              {groups.map((group) => (
                <li key={group.id} className="rounded-lg border p-3">
                  {editingGroupId === group.id ? (
                    <div className="space-y-3">
                      <Input value={editingGroupName} onChange={(e) => setEditingGroupName(e.target.value)} />
                      <div className="max-h-40 space-y-1 overflow-y-auto">
                        {attributes.map((attr) => (
                          <label key={attr.id} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={editingGroupIds.includes(attr.id)}
                              onCheckedChange={() =>
                                setEditingGroupIds((ids) =>
                                  ids.includes(attr.id)
                                    ? ids.filter((id) => id !== attr.id)
                                    : [...ids, attr.id],
                                )
                              }
                            />
                            {attr.name}
                          </label>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={!editingGroupName.trim() || updateGroup.isPending}
                          onClick={() => updateGroup.mutate()}
                        >
                          {tCommon("save")}
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setEditingGroupId(null)}>
                          {tCommon("cancel")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{group.name}</p>
                        <p className="text-muted-foreground text-xs">
                          {(group.attribute_ids ?? []).length} {t("attributes_heading").toLowerCase()}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button type="button" size="sm" variant="outline" onClick={() => startEditGroup(group)}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            confirm({
                              description: t("confirm_delete"),
                              onConfirm: () => deleteGroup.mutateAsync(group.id),
                            })
                          }
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
              {groups.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t("empty_attribute_groups")}</p>
              ) : null}
            </ul>
          </div>
        </div>

        <div className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <Label>{t("search")}</Label>
              <div className="relative mt-1 max-w-md">
                <Search className="text-muted-foreground absolute start-2 top-2.5 size-4" />
                <Input className="ps-8" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("attributes_heading")}</CardTitle>
            </CardHeader>
            <CardContent>
              {isError ? (
                <QueryErrorState onRetry={() => refetch()} />
              ) : isLoading ? (
                <TableListSkeleton rows={5} columns={3} />
              ) : filtered.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t("empty_attributes")}</p>
              ) : (
                <div className="space-y-5">
                  {groupedSections.map((section) => (
                      <div key={section.key} className="space-y-2">
                        {groups.length > 0 || section.key !== "ungrouped" ? (
                          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                            {section.title}
                          </p>
                        ) : null}
                        <ul className="space-y-2">
                          {section.items.map((a) => (
                            <li
                              key={a.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium">{a.name}</p>
                                <Badge variant="outline">{enumLabel("attribute_type", a.type)}</Badge>
                                <span className="text-muted-foreground text-xs">
                                  {a.slug}
                                  {typeof a.terms_count === "number" ? ` · ${a.terms_count}` : ""}
                                </span>
                              </div>
                              <div className="flex gap-2">
                                <Button size="sm" variant="outline" asChild>
                                  <Link href={`/dashboard/attributes/${a.id}`}>
                                    <Pencil className="size-4" />
                                  </Link>
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    confirm({
                                      description: t("confirm_delete"),
                                      onConfirm: () => remove.mutateAsync(a.id),
                                    })
                                  }}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </div>
                            </li>
                          ))}
                          {section.items.length === 0 ? (
                            <p className="text-muted-foreground text-xs">{t("empty_attributes")}</p>
                          ) : null}
                        </ul>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      {confirmDialog}
    </PageShell>
  )
}
