"use client"

import Link from "next/link"

import { RESUME_SECTIONS } from "../lib/schema"

/** Horizontal section switcher (scrolls on mobile); the sidebar group lists the same pages. */
export function ResumeSubnav({ active }: { active: string }) {
  return (
    <nav aria-label="بخش‌های رزومه" className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
      <Link href="/dashboard/resume" className={`shrink-0 rounded-full border px-3 py-1 text-sm ${active === "overview" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted"}`}>نمای کلی</Link>
      {RESUME_SECTIONS.map((s) => (
        <Link key={s.slug} href={`/dashboard/resume/${s.slug}`} aria-current={active === s.slug ? "page" : undefined}
          className={`shrink-0 rounded-full border px-3 py-1 text-sm ${active === s.slug ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted"}`}>
          {s.label_fa}
        </Link>
      ))}
    </nav>
  )
}
