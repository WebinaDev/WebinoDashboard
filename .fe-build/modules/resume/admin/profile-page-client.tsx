"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"

type ResumeForm = {
  full_name: string
  headline: string
  summary: string
  photo_url: string
  email: string
  phone: string
  location: string
  skills_text: string
  experience_text: string
  education_text: string
  projects_text: string
  social_links_text: string
  published: boolean
}

const emptyForm: ResumeForm = {
  full_name: "",
  headline: "",
  summary: "",
  photo_url: "",
  email: "",
  phone: "",
  location: "",
  skills_text: "",
  experience_text: "",
  education_text: "",
  projects_text: "",
  social_links_text: "",
  published: false,
}

function linesToList(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
}

function listToLines(value: unknown): string {
  if (!Array.isArray(value)) return ""
  return value
    .map((item) => {
      if (typeof item === "string") return item
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>
        return String(obj.title ?? obj.name ?? obj.label ?? obj.url ?? JSON.stringify(item))
      }
      return String(item)
    })
    .join("\n")
}

function parseObjectLines(text: string, key: "title" | "name" | "label" | "url" = "title"): Array<Record<string, string>> {
  return linesToList(text).map((line) => {
    const parts = line.split("|").map((p) => p.trim())
    if (key === "url") {
      return { label: parts[0] ?? "", url: parts[1] ?? parts[0] ?? "" }
    }
    if (parts.length >= 2) {
      return { [key]: parts[0] ?? "", detail: parts.slice(1).join(" | ") }
    }
    return { [key]: line }
  }) as Array<Record<string, string>>
}

export default function ResumeProfilePageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("resume_admin")
  const tCommon = useTranslations("common")
  const [form, setForm] = useState<ResumeForm>(emptyForm)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<Record<string, unknown>>("/api/v1/resume/profile")
      .then((row) => {
        setForm({
          full_name: String(row.full_name ?? ""),
          headline: String(row.headline ?? ""),
          summary: String(row.summary ?? ""),
          photo_url: String(row.photo_url ?? ""),
          email: String(row.email ?? ""),
          phone: String(row.phone ?? ""),
          location: String(row.location ?? ""),
          skills_text: listToLines(row.skills),
          experience_text: listToLines(row.experience),
          education_text: listToLines(row.education),
          projects_text: listToLines(row.projects),
          social_links_text: Array.isArray(row.social_links)
            ? (row.social_links as Array<Record<string, string>>)
                .map((s) => [s.label, s.url].filter(Boolean).join(" | "))
                .join("\n")
            : "",
          published: Boolean(row.published),
        })
      })
      .catch(() => setForm(emptyForm))
  }, [])

  async function onSave(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    setMessage(null)
    try {
      await api("/api/v1/resume/profile", {
        method: "PUT",
        json: {
          full_name: form.full_name || null,
          headline: form.headline || null,
          summary: form.summary || null,
          photo_url: form.photo_url || null,
          email: form.email || null,
          phone: form.phone || null,
          location: form.location || null,
          skills: linesToList(form.skills_text),
          experience: parseObjectLines(form.experience_text, "title"),
          education: parseObjectLines(form.education_text, "title"),
          projects: parseObjectLines(form.projects_text, "title"),
          social_links: parseObjectLines(form.social_links_text, "url"),
          published: form.published,
        },
      })
      setMessage(t("saved"))
    } catch (err) {
      setError(err instanceof Error ? err.message : tCommon("error_generic"))
    } finally {
      setPending(false)
    }
  }

  function field(
    key: keyof ResumeForm,
    label: string,
    opts?: { textarea?: boolean; hint?: string; type?: string },
  ) {
    const id = String(key)
    const value = form[key]
    return (
      <div key={id} className="space-y-1">
        <Label htmlFor={id}>{label}</Label>
        {opts?.textarea ? (
          <textarea
            id={id}
            className="border-input bg-background min-h-24 w-full rounded-md border px-3 py-2 text-sm"
            value={String(value ?? "")}
            onChange={(e) => setForm((s) => ({ ...s, [key]: e.target.value }))}
            placeholder={opts.hint}
          />
        ) : (
          <Input
            id={id}
            type={opts?.type ?? "text"}
            value={String(value ?? "")}
            onChange={(e) => setForm((s) => ({ ...s, [key]: e.target.value }))}
            placeholder={opts?.hint}
          />
        )}
        {opts?.hint && !opts.textarea ? (
          <p className="text-muted-foreground text-xs">{opts.hint}</p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("subtitle")}</p>
      </div>

      <form onSubmit={(e) => void onSave(e)} className="grid max-w-2xl gap-4 rounded-lg border p-4">
        {field("full_name", t("full_name"))}
        {field("headline", t("headline"))}
        {field("summary", t("summary"), { textarea: true })}
        {field("photo_url", t("photo_url"))}
        {field("email", t("email"), { type: "email" })}
        {field("phone", t("phone"))}
        {field("location", t("location"))}
        {field("skills_text", t("skills"), { textarea: true, hint: t("skills_hint") })}
        {field("experience_text", t("experience"), { textarea: true, hint: t("lines_hint") })}
        {field("education_text", t("education"), { textarea: true, hint: t("lines_hint") })}
        {field("projects_text", t("projects"), { textarea: true, hint: t("lines_hint") })}
        {field("social_links_text", t("social_links"), { textarea: true, hint: t("social_hint") })}

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.published}
            onChange={(e) => setForm((s) => ({ ...s, published: e.target.checked }))}
          />
          {t("published")}
        </label>

        <Button type="submit" disabled={pending}>
          {tCommon("save")}
        </Button>
      </form>

      {message ? <p className="text-sm text-green-600">{message}</p> : null}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </div>
  )
}
