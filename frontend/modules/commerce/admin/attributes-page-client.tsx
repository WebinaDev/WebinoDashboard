"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Pencil, Plus, Search, Trash2 } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type Attribute = {
  id: number
  name: string
  slug: string
  type: string
  terms_count?: number
}

export default function AttributesPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("store")
  const tCommon = useTranslations("common")
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [error, setError] = useState<string | null>(null)

  const { data: attributes = [], isLoading } = useQuery({
    queryKey: ["admin-attributes"],
    queryFn: () => api<Attribute[]>("/api/v1/attributes"),
  })

  const filtered = attributes.filter((a) => {
    if (!search.trim()) return true
    const q = search.trim().toLowerCase()
    return a.name.toLowerCase().includes(q) || a.slug.toLowerCase().includes(q)
  })

  const remove = useMutation({
    mutationFn: (id: number) => api(`/api/v1/attributes/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-attributes"] })
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  return (
    <div className="space-y-6 p-6" dir="auto">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("attributes_title")}</h1>
          <p className="text-muted-foreground text-sm">{route.fullPath}</p>
        </div>
        <Button asChild>
          <Link href="/admin/attributes/new">
            <Plus className="size-4" />
            {t("add_attribute")}
          </Link>
        </Button>
      </div>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

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
          {isLoading ? (
            <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("empty_attributes")}</p>
          ) : (
            <ul className="space-y-2">
              {filtered.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{a.name}</p>
                    <Badge variant="outline">{a.type}</Badge>
                    <span className="text-muted-foreground text-xs">
                      {a.slug}
                      {typeof a.terms_count === "number" ? ` · ${a.terms_count}` : ""}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/admin/attributes/${a.id}`}>
                        <Pencil className="size-4" />
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (window.confirm(t("confirm_delete"))) remove.mutate(a.id)
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
