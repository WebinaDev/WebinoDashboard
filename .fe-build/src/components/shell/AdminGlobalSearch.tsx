"use client"

import { useQuery } from "@tanstack/react-query"
import {
  FileText,
  FolderTree,
  ImageIcon,
  LayoutGrid,
  Package,
  Search,
  Settings2,
  ShoppingCart,
  Tag,
  TicketPercent,
  Users,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"

import type { NavSection } from "@/hooks/useDashboardNav"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { api } from "@/lib/api"
import { htmlDir } from "@/lib/locale"
import { cn } from "@/lib/utils"

type NavHit = {
  id: string
  title: string
  url: string
  group: string
  kind: "nav" | "settings"
}

type EntityHit = {
  id: string
  title: string
  subtitle?: string
  href: string
  group: "products" | "orders" | "users" | "pages" | "posts" | "categories" | "brands" | "coupons" | "media"
}

type ListEnvelope<T> = { data: T[]; meta?: unknown }
type ItemsEnvelope<T> = { items: T[] }

function flattenNav(sections: NavSection[]): NavHit[] {
  const out: NavHit[] = []
  const walk = (items: NavSection["items"], group: string) => {
    for (const item of items) {
      if (item.items?.length) {
        walk(item.items as NavSection["items"], group)
        continue
      }
      if (!item.url || item.url === "#") continue
      const kind = item.url.includes("/settings") ? "settings" : "nav"
      out.push({ id: item.url, title: item.title, url: item.url, group, kind })
    }
  }
  for (const section of sections) {
    walk(section.items, section.groupLabel)
  }
  return out
}

function matchNav(hits: NavHit[], q: string): NavHit[] {
  const needle = q.trim().toLowerCase()
  if (!needle) return hits.slice(0, 8)
  return hits
    .filter((h) => {
      const hay = `${h.title} ${h.url} ${h.group}`.toLowerCase()
      return hay.includes(needle)
    })
    .slice(0, 12)
}

async function safeList<T>(path: string): Promise<T[]> {
  try {
    const res = await api<ListEnvelope<T> | T[]>(path)
    if (Array.isArray(res)) return res
    if (res && typeof res === "object" && Array.isArray((res as ListEnvelope<T>).data)) {
      return (res as ListEnvelope<T>).data
    }
  } catch {
    /* ignore denied / missing modules */
  }
  return []
}

async function safeItems<T>(path: string): Promise<T[]> {
  try {
    const res = await api<ItemsEnvelope<T> | ListEnvelope<T>>(path)
    if (res && typeof res === "object") {
      if (Array.isArray((res as ItemsEnvelope<T>).items)) return (res as ItemsEnvelope<T>).items
      if (Array.isArray((res as ListEnvelope<T>).data)) {
        const data = (res as ListEnvelope<T>).data as unknown
        if (Array.isArray(data)) return data as T[]
        if (data && typeof data === "object" && Array.isArray((data as ItemsEnvelope<T>).items)) {
          return (data as ItemsEnvelope<T>).items
        }
      }
    }
  } catch {
    /* ignore */
  }
  return []
}

function entityIcon(group: EntityHit["group"]) {
  switch (group) {
    case "products":
      return Package
    case "orders":
      return ShoppingCart
    case "users":
      return Users
    case "pages":
      return FileText
    case "posts":
      return FileText
    case "categories":
      return FolderTree
    case "brands":
      return Tag
    case "coupons":
      return TicketPercent
    case "media":
      return ImageIcon
    default:
      return LayoutGrid
  }
}

type Props = {
  navSections: NavSection[]
  className?: string
}

export function AdminGlobalSearch({ navSections, className }: Props) {
  const t = useTranslations("shell.search")
  const locale = useLocale()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [debounced, setDebounced] = useState("")
  const [shortcutLabel, setShortcutLabel] = useState("Ctrl+K")

  const navHits = useMemo(() => flattenNav(navSections), [navSections])
  const filteredNav = useMemo(() => matchNav(navHits, query), [navHits, query])
  const settingsHits = filteredNav.filter((h) => h.kind === "settings")
  const pageHits = filteredNav.filter((h) => h.kind === "nav")

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query.trim()), 280)
    return () => window.clearTimeout(id)
  }, [query])

  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setShortcutLabel("⌘K")
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return
      event.preventDefault()
      setOpen((v) => !v)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    if (!open) {
      setQuery("")
      setDebounced("")
    }
  }, [open])

  const entityQ = useQuery({
    queryKey: ["admin-global-search", debounced],
    enabled: open && debounced.length >= 2,
    staleTime: 15_000,
    queryFn: async (): Promise<EntityHit[]> => {
      const q = encodeURIComponent(debounced)
      const limit = 5
      const [
        products,
        orders,
        users,
        pages,
        posts,
        categories,
        brands,
        coupons,
        media,
      ] = await Promise.all([
        safeList<{ id: number; name?: string; sku?: string | null }>(
          `/api/v1/products?search=${q}&per_page=${limit}&page=1`,
        ),
        safeList<{ id: number; number?: string | null; customer_name?: string | null; status?: string }>(
          `/api/v1/orders?search=${q}&per_page=${limit}&page=1`,
        ),
        safeList<{ id: number; name?: string; email?: string | null; phone?: string | null }>(
          `/api/v1/users?search=${q}&per_page=${limit}&page=1`,
        ),
        safeItems<{ id: number; title?: string; slug?: string }>(
          `/api/v1/cms/pages?search=${q}&per_page=${limit}&page=1`,
        ),
        safeItems<{ id: number; title?: string }>(
          `/api/v1/blog/posts?search=${q}&per_page=${limit}&page=1`,
        ),
        safeList<{ id: number; name?: string }>(`/api/v1/categories?search=${q}`),
        safeList<{ id: number; name?: string }>(`/api/v1/brands?search=${q}`),
        safeList<{ id: number; code?: string; description?: string | null }>(
          `/api/v1/marketing/coupons?search=${q}&per_page=${limit}&page=1`,
        ),
        safeItems<{ id: number; title?: string | null; original_name?: string | null; alt?: string | null }>(
          `/api/v1/media?search=${q}&per_page=${limit}&page=1`,
        ),
      ])

      const hits: EntityHit[] = []
      for (const p of products.slice(0, limit)) {
        hits.push({
          id: `product-${p.id}`,
          title: p.name || `#${p.id}`,
          subtitle: p.sku || undefined,
          href: `/dashboard/products/${p.id}`,
          group: "products",
        })
      }
      for (const o of orders.slice(0, limit)) {
        hits.push({
          id: `order-${o.id}`,
          title: o.number ? String(o.number) : `#${o.id}`,
          subtitle: [o.customer_name, o.status].filter(Boolean).join(" · ") || undefined,
          href: `/dashboard/orders/${o.id}`,
          group: "orders",
        })
      }
      for (const u of users.slice(0, limit)) {
        hits.push({
          id: `user-${u.id}`,
          title: u.name || u.email || `#${u.id}`,
          subtitle: [u.email, u.phone].filter(Boolean).join(" · ") || undefined,
          href: `/dashboard/users/${u.id}`,
          group: "users",
        })
      }
      for (const p of pages.slice(0, limit)) {
        hits.push({
          id: `page-${p.id}`,
          title: p.title || `#${p.id}`,
          subtitle: p.slug || undefined,
          href: `/dashboard/pages/${p.id}`,
          group: "pages",
        })
      }
      for (const p of posts.slice(0, limit)) {
        hits.push({
          id: `post-${p.id}`,
          title: p.title || `#${p.id}`,
          href: `/dashboard/blog/posts/${p.id}`,
          group: "posts",
        })
      }
      for (const c of categories.slice(0, limit)) {
        hits.push({
          id: `category-${c.id}`,
          title: c.name || `#${c.id}`,
          href: `/dashboard/product-categories/${c.id}`,
          group: "categories",
        })
      }
      for (const b of brands.slice(0, limit)) {
        hits.push({
          id: `brand-${b.id}`,
          title: b.name || `#${b.id}`,
          href: `/dashboard/brands/${b.id}`,
          group: "brands",
        })
      }
      for (const c of coupons.slice(0, limit)) {
        hits.push({
          id: `coupon-${c.id}`,
          title: c.code || `#${c.id}`,
          subtitle: c.description || undefined,
          href: `/dashboard/marketing/coupons/${c.id}`,
          group: "coupons",
        })
      }
      for (const m of media.slice(0, limit)) {
        hits.push({
          id: `media-${m.id}`,
          title: m.title || m.original_name || m.alt || `#${m.id}`,
          href: `/dashboard/media`,
          group: "media",
        })
      }
      return hits
    },
  })

  const entityGroups = useMemo(() => {
    const map = new Map<EntityHit["group"], EntityHit[]>()
    for (const hit of entityQ.data ?? []) {
      const list = map.get(hit.group) ?? []
      list.push(hit)
      map.set(hit.group, list)
    }
    return map
  }, [entityQ.data])

  function go(href: string) {
    setOpen(false)
    router.push(href)
  }

  const showEmpty =
    query.trim().length > 0 &&
    pageHits.length === 0 &&
    settingsHits.length === 0 &&
    (debounced.length < 2 || (!entityQ.isFetching && (entityQ.data?.length ?? 0) === 0))

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "wd-desktop-search group inline-flex h-9 w-full max-w-md items-center gap-2 rounded-[10px] border border-border/80 bg-muted/40 px-3 text-start text-sm text-muted-foreground transition-colors hover:bg-muted/70",
          "hidden md:inline-flex",
          className,
        )}
        aria-label={t("aria")}
      >
        <Search className="size-4 shrink-0 opacity-70" />
        <span className="min-w-0 flex-1 truncate">{t("placeholder")}</span>
        <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-flex">
          {shortcutLabel}
        </kbd>
      </button>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex size-9 items-center justify-center rounded-md border border-input bg-background md:hidden",
          className,
        )}
        aria-label={t("aria")}
      >
        <Search className="size-4" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          dir={htmlDir(locale)}
          className="overflow-hidden p-0 sm:max-w-xl"
        >
          <DialogTitle className="sr-only">{t("title")}</DialogTitle>
          <Command
            shouldFilter={false}
            className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5"
          >
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder={t("placeholder")}
            />
            <CommandList>
              {showEmpty ? <CommandEmpty>{t("empty")}</CommandEmpty> : null}
              {!query.trim() ? (
                <CommandGroup heading={t("hint_heading")}>
                  <CommandItem disabled value="hint" className="pointer-events-none opacity-80">
                    {t("hint_body")}
                  </CommandItem>
                </CommandGroup>
              ) : null}

              {pageHits.length > 0 ? (
                <CommandGroup heading={t("group_nav")}>
                  {pageHits.map((hit) => (
                    <CommandItem
                      key={hit.id}
                      value={`nav-${hit.id}-${hit.title}`}
                      onSelect={() => go(hit.url)}
                    >
                      <LayoutGrid className="size-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-start">{hit.title}</span>
                      <span className="max-w-[40%] truncate text-xs text-muted-foreground">{hit.group}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}

              {settingsHits.length > 0 ? (
                <CommandGroup heading={t("group_settings")}>
                  {settingsHits.map((hit) => (
                    <CommandItem
                      key={hit.id}
                      value={`settings-${hit.id}-${hit.title}`}
                      onSelect={() => go(hit.url)}
                    >
                      <Settings2 className="size-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-start">{hit.title}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}

              {debounced.length >= 2 && entityQ.isFetching ? (
                <CommandGroup heading={t("searching")}>
                  <CommandItem disabled value="loading" className="pointer-events-none">
                    {t("searching")}
                  </CommandItem>
                </CommandGroup>
              ) : null}

              {Array.from(entityGroups.entries()).map(([group, hits], index) => {
                const Icon = entityIcon(group)
                return (
                  <div key={group}>
                    {(pageHits.length > 0 || settingsHits.length > 0 || index > 0) && (
                      <CommandSeparator />
                    )}
                    <CommandGroup heading={t(`group_${group}` as "group_products")}>
                      {hits.map((hit) => (
                        <CommandItem
                          key={hit.id}
                          value={`entity-${hit.id}-${hit.title}`}
                          onSelect={() => go(hit.href)}
                        >
                          <Icon className="size-4 shrink-0" />
                          <span className="min-w-0 flex-1 truncate text-start">
                            <span className="block truncate">{hit.title}</span>
                            {hit.subtitle ? (
                              <span className="block truncate text-xs text-muted-foreground">
                                {hit.subtitle}
                              </span>
                            ) : null}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </div>
                )
              })}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  )
}
