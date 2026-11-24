"use client"

import { useMutation } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { asArray } from "@/lib/list-utils"
import { toLocaleDigits } from "@/lib/locale"

import { CafeAdminShell, CafeEmptyState, CafeSection } from "./cafe-admin-ui"

type Preview = {
  columns: string[]
  map: Record<string, string>
  total: number
  valid: number
  invalid: number
  errors: { line: number; message: string }[]
  sample: Record<string, string | number | boolean | null>[]
}

type CommitResult = {
  created: number
  updated: number
  failed: { line: number; message: string }[]
}

type Sample = Record<string, string | number | boolean | null>

/** The fields a sheet can be mapped onto, in the order they matter. */
const FIELDS = ["name", "price_minor", "sku", "category", "description", "cost_minor", "is_available"] as const

function cellText(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "boolean") return value ? "✓" : "—"
  return String(value)
}

export default function MenuImportPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("cafe_admin.menu_import")
  const locale = useLocale()

  const [content, setContent] = useState("")
  const [fileName, setFileName] = useState<string | null>(null)
  const [map, setMap] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState<Preview | null>(null)
  const [result, setResult] = useState<CommitResult | null>(null)

  // The map only becomes editable once the file has been parsed: showing field selects for a
  // file with unknown headings is a form nobody can fill in.
  const columns = preview?.columns ?? []

  const parse = useMutation({
    mutationFn: () =>
      api<{ data: Preview }>("/api/v1/cafe/menu-import/preview", {
        method: "POST",
        json: { content, map: Object.keys(map).length > 0 ? map : null },
      }),
    onSuccess: (data) => {
      setResult(null)
      setPreview(data?.data ?? null)
      setMap(data?.data?.map ?? {})
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const commit = useMutation({
    mutationFn: () =>
      api<{ data: CommitResult }>("/api/v1/cafe/menu-import/commit", {
        method: "POST",
        json: { content, map },
      }),
    onSuccess: (data) => {
      setResult(data?.data ?? null)
      toast.success(t("committed"))
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  async function readFile(file: File) {
    // Read as text in the browser: the server then receives the same string whether the sheet
    // came from Excel, a Google Sheet export, or a paste.
    const text = await file.text()
    setContent(text)
    setFileName(file.name)
    setPreview(null)
    setResult(null)
    setMap({})
  }

  return (
    <CafeAdminShell title={t("title")} description={t("description")}>
      <CafeSection title={t("file_title")} description={t("file_hint")}>
        <div className="space-y-2">
          <Label htmlFor="menu-import-file">{t("choose_file")}</Label>
          <Input
            id="menu-import-file"
            type="file"
            accept=".csv,.tsv,text/csv,text/tab-separated-values,text/plain"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void readFile(file)
            }}
          />
          {fileName ? (
            <p className="text-muted-foreground text-xs">
              {fileName} — {toLocaleDigits(String(content.length), locale)} {t("chars")}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="menu-import-paste">{t("or_paste")}</Label>
          <textarea
            id="menu-import-paste"
            dir="ltr"
            className="border-input bg-background h-32 w-full rounded-md border p-2 font-mono text-xs"
            value={content}
            onChange={(e) => {
              setContent(e.target.value)
              setPreview(null)
              setResult(null)
            }}
            placeholder={"name,price\nLatte,45000"}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => parse.mutate()} disabled={parse.isPending || content.trim() === ""}>
            {parse.isPending ? t("parsing") : t("preview")}
          </Button>
        </div>
      </CafeSection>

      {preview ? (
        <>
          <CafeSection title={t("map_title")} description={t("map_hint")}>
            <div className="grid gap-3 sm:grid-cols-3">
              {FIELDS.map((field) => (
                <div key={field} className="space-y-1">
                  <Label htmlFor={`map-${field}`}>{t(`field_${field}`)}</Label>
                  <select
                    id={`map-${field}`}
                    className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                    value={map[field] ?? ""}
                    onChange={(e) => {
                      const next = { ...map }
                      if (e.target.value === "") {
                        delete next[field]
                      } else {
                        next[field] = e.target.value
                      }
                      setMap(next)
                    }}
                  >
                    <option value="">{t("not_mapped")}</option>
                    {columns.map((column) => (
                      <option key={column} value={column}>
                        {column}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Badge variant="secondary">
                {t("valid_rows")}: {toLocaleDigits(String(preview.valid), locale)}
              </Badge>
              {preview.invalid > 0 ? (
                <Badge variant="destructive">
                  {t("invalid_rows")}: {toLocaleDigits(String(preview.invalid), locale)}
                </Badge>
              ) : null}
              <Button variant="outline" onClick={() => parse.mutate()} disabled={parse.isPending}>
                {t("recheck")}
              </Button>
              <Button
                onClick={() => commit.mutate()}
                disabled={commit.isPending || preview.valid === 0}
              >
                {commit.isPending ? t("importing") : t("commit")}
              </Button>
            </div>
          </CafeSection>

          {(preview.errors?.length ?? 0) > 0 ? (
            <CafeSection title={t("errors_title")} description={t("errors_hint")}>
              <ul className="space-y-1 text-sm">
                {preview.errors.map((error) => (
                  <li key={`${error.line}-${error.message}`} className="text-destructive">
                    {t("line")} {toLocaleDigits(String(error.line), locale)}: {error.message}
                  </li>
                ))}
              </ul>
            </CafeSection>
          ) : null}

          {(preview.sample?.length ?? 0) === 0 ? (
            <CafeEmptyState message={t("no_rows")} />
          ) : (
            <CafeSection title={t("sample_title")} description={t("sample_hint")}>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {FIELDS.filter((field) => map[field]).map((field) => (
                        <TableHead key={field}>{t(`field_${field}`)}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {asArray<Sample>(preview.sample).map((row, index) => (
                      <TableRow key={index}>
                        {FIELDS.filter((field) => map[field]).map((field) => (
                          <TableCell key={field} dir="auto">
                            {cellText(row[field as keyof Sample] as Sample[string]) || "—"}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CafeSection>
          )}
        </>
      ) : null}

      {result ? (
        <CafeSection title={t("result_title")}>
          <div className="flex flex-wrap gap-3 text-sm">
            <Badge variant="secondary">
              {t("created")}: {toLocaleDigits(String(result.created), locale)}
            </Badge>
            <Badge variant="outline">
              {t("updated")}: {toLocaleDigits(String(result.updated), locale)}
            </Badge>
            {result.failed.length > 0 ? (
              <Badge variant="destructive">
                {t("failed")}: {toLocaleDigits(String(result.failed.length), locale)}
              </Badge>
            ) : null}
          </div>
          {result.failed.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {result.failed.map((failure) => (
                <li key={`${failure.line}-${failure.message}`} className="text-destructive">
                  {t("line")} {toLocaleDigits(String(failure.line), locale)}: {failure.message}
                </li>
              ))}
            </ul>
          ) : null}
        </CafeSection>
      ) : null}
    </CafeAdminShell>
  )
}
