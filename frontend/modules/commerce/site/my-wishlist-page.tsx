"use client"

import Link from "next/link"

import { ClassicWishlist } from "@/themes/ecommerce-classic/components/ClassicPages"
import { useIsClassicSkin } from "@/builder/render/runtime"

function FallbackWishlist() {
  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <h1 className="text-2xl font-bold">علاقه‌مندی‌ها</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        علاقه‌مندی‌ها در حساب کاربری شما نگه‌داری می‌شوند.
      </p>
      <Link href="/dashboard/account/favorites" className="mt-4 inline-block text-sm font-semibold text-primary">
        مشاهده علاقه‌مندی‌ها
      </Link>
    </div>
  )
}

export default function MyWishlistPage() {
  const classic = useIsClassicSkin()
  return classic ? <ClassicWishlist /> : <FallbackWishlist />
}
