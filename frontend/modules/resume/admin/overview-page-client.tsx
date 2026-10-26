"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import { PageShell } from "@/components/PageShell"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"

import { faDigits } from "../lib/jalali"
import { RESUME_SECTIONS } from "../lib/schema"
import { ResumeSubnav } from "./subnav"

type Overview = Record<string, { count: number; placeholders: number }>

export default function ResumeOverviewPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const [data, setData] = useState<Overview | null>(null)
  useEffect(() => { api<Overview>("/api/v1/resume/overview").then(setData).catch(() => setData({})) }, [])
  return (
    <PageShell eyebrow="ماژول" title="رزومه" description="هر بخش رزومه مثل لینکدین جداگانه مدیریت می‌شود؛ ویجت‌های resume.* در صفحه‌ساز همین داده را نمایش می‌دهند.">
      <ResumeSubnav active="overview" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {RESUME_SECTIONS.map((s) => {
          const c = data?.[s.slug]
          return (
            <Link key={s.slug} href={`/dashboard/resume/${s.slug}`} className="group rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm transition hover:border-primary hover:shadow-md">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{s.label_fa}</span>
                <span className="text-xs text-muted-foreground" dir="ltr">{s.label_en}</span>
              </div>
              <div className="mt-3 flex items-end justify-between">
                <span className="text-2xl font-bold text-primary">{c ? faDigits(c.count) : "…"}</span>
                {c?.placeholders ? <span className="rounded-full border border-dashed border-amber-500 px-2 py-0.5 text-[11px] text-amber-600 dark:text-amber-400">{faDigits(c.placeholders)} نمونه</span> : null}
              </div>
            </Link>
          )
        })}
      </div>
    </PageShell>
  )
}
