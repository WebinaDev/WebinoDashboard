import Link from "next/link"

import { Button } from "@/components/ui/button"

const NAV = [
  { href: "/", label: "خانه" },
  { href: "/blog", label: "وبلاگ" },
  { href: "/academy", label: "آکادمی" },
  { href: "/portfolio", label: "نمونه‌کارها" },
  { href: "/team", label: "تیم" },
  { href: "/announcements", label: "اطلاعیه‌ها" },
  { href: "/consultation", label: "مشاوره" },
]

export function SiteHeader({ siteName }: { siteName: string }) {
  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container mx-auto flex h-16 items-center justify-between gap-4 px-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          {siteName}
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Button key={item.href} variant="ghost" size="sm" asChild>
              <Link href={item.href}>{item.label}</Link>
            </Button>
          ))}
        </nav>
        <Button size="sm" variant="outline" asChild className="hidden sm:inline-flex">
          <Link href="/admin">پنل مدیریت</Link>
        </Button>
      </div>
    </header>
  )
}
