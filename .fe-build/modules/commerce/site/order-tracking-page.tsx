"use client"

import { ClassicOrderTrack } from "@/themes/ecommerce-classic/components/ClassicPages"
import { useIsClassicSkin } from "@/builder/render/runtime"

function FallbackTrack() {
  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <h1 className="text-2xl font-bold">پیگیری سفارش</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        برای پیگیری سفارش وارد حساب کاربری شوید یا از صفحه حساب، سفارش‌ها را باز کنید.
      </p>
    </div>
  )
}

export default function OrderTrackingPage() {
  const classic = useIsClassicSkin()
  return classic ? <ClassicOrderTrack /> : <FallbackTrack />
}
