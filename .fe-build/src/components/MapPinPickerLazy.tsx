"use client"

import dynamic from "next/dynamic"

/** Client-only map (Leaflet needs `window`); renders a placeholder during SSR/loading. */
export const MapPinPicker = dynamic(() => import("./MapPinPicker").then((m) => m.MapPinPicker), {
  ssr: false,
  loading: () => <div className="h-[160px] w-full animate-pulse rounded-2xl bg-black/5" />,
})
