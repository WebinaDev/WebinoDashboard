"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

export function Switch({
  checked,
  onCheckedChange,
  className,
  id,
  disabled,
}: {
  checked?: boolean
  onCheckedChange?: (v: boolean) => void
  className?: string
  id?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={cn(
        "focus-visible:ring-ring peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-input",
        className,
      )}
      onClick={() => onCheckedChange?.(!checked)}
    >
      <span
        className={cn(
          "bg-background pointer-events-none block size-4 rounded-full shadow-lg ring-0 transition-transform",
          checked ? "translate-x-4 rtl:-translate-x-4" : "translate-x-0",
        )}
      />
    </button>
  )
}
