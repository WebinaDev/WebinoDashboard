"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { ShoppingCart } from "lucide-react"
import { useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { api } from "@/lib/api"

type CartLine = {
  id: number
  quantity: number
  product?: { id: number; name: string; price_minor: number; currency: string }
}

type Cart = {
  id?: number
  guest_token?: string | null
  table_number?: string | null
  items?: CartLine[]
}

const TOKEN_KEY = "cafe_guest_token"

function getGuestToken(): string {
  if (typeof window === "undefined") return ""
  let token = localStorage.getItem(TOKEN_KEY)
  if (!token) {
    token = crypto.randomUUID().replace(/-/g, "")
    localStorage.setItem(TOKEN_KEY, token)
  }
  return token
}

export function CafeCartDrawer({
  tableNumber,
  branchSlug,
}: {
  tableNumber?: string | null
  branchSlug?: string | null
}) {
  const t = useTranslations("cafe_starter.cart")
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [token, setToken] = useState("")

  useEffect(() => {
    setToken(getGuestToken())
  }, [])

  const { data: cart } = useQuery({
    queryKey: ["guest-cart", token, tableNumber, branchSlug],
    enabled: Boolean(token),
    queryFn: () =>
      api<Cart>(`/api/v1/public/cafe/cart?guest_token=${encodeURIComponent(token)}&table=${encodeURIComponent(tableNumber ?? "")}&branch=${encodeURIComponent(branchSlug ?? "")}`),
  })

  const checkout = useMutation({
    mutationFn: () =>
      api("/api/v1/public/cafe/checkout", {
        method: "POST",
        json: {
          guest_token: token,
          table_number: tableNumber ?? cart?.table_number,
          branch_slug: branchSlug ?? undefined,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["guest-cart"] })
      setOpen(false)
    },
  })

  const count = cart?.items?.reduce((sum, line) => sum + line.quantity, 0) ?? 0

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm" variant="outline" className="relative">
          <ShoppingCart className="size-4" />
          {count > 0 ? (
            <Badge className="absolute -top-2 -right-2 size-5 justify-center rounded-full p-0 text-xs">{count}</Badge>
          ) : null}
          <span className="sr-only">{t("title")}</span>
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t("title")}</SheetTitle>
          {tableNumber ? <p className="text-muted-foreground text-sm">{t("table", { number: tableNumber })}</p> : null}
        </SheetHeader>
        <div className="mt-6 space-y-3">
          {!cart?.items?.length ? (
            <p className="text-muted-foreground text-sm">{t("empty")}</p>
          ) : (
            cart.items.map((line) => (
              <div key={line.id} className="flex justify-between text-sm">
                <span>{line.product?.name}</span>
                <span>x{line.quantity}</span>
              </div>
            ))
          )}
          <Button className="w-full" disabled={!cart?.items?.length || checkout.isPending} onClick={() => checkout.mutate()}>
            {t("checkout")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
