"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

const selectClass =
  "border-input bg-background ring-offset-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"

type SelectCtx = {
  value?: string
  onValueChange?: (v: string) => void
  items: { value: string; label: React.ReactNode }[]
  registerItem: (value: string, label: React.ReactNode) => void
}

const Ctx = React.createContext<SelectCtx | null>(null)

/** Radix-like Select API backed by native <select> for ported WP pages. */
export function Select({
  value,
  defaultValue,
  onValueChange,
  children,
  disabled,
}: {
  value?: string
  defaultValue?: string
  onValueChange?: (v: string) => void
  children: React.ReactNode
  disabled?: boolean
}) {
  const [items, setItems] = React.useState<{ value: string; label: React.ReactNode }[]>([])
  const registerItem = React.useCallback((v: string, label: React.ReactNode) => {
    setItems((prev) => (prev.some((i) => i.value === v) ? prev : [...prev, { value: v, label }]))
  }, [])

  return (
    <Ctx.Provider value={{ value: value ?? defaultValue, onValueChange, items, registerItem }}>
      <div className="relative w-full">
        {children}
        <select
          className={cn(selectClass, "absolute inset-0 opacity-0")}
          value={value ?? defaultValue ?? ""}
          disabled={disabled}
          onChange={(e) => onValueChange?.(e.target.value)}
        >
          {items.map((i) => (
            <option key={i.value} value={i.value}>
              {typeof i.label === "string" || typeof i.label === "number" ? i.label : i.value}
            </option>
          ))}
        </select>
      </div>
    </Ctx.Provider>
  )
}

export function SelectTrigger({
  className,
  children,
  id,
}: {
  className?: string
  children?: React.ReactNode
  id?: string
}) {
  const ctx = React.useContext(Ctx)
  const label = ctx?.items.find((i) => i.value === ctx.value)?.label
  return (
    <div
      id={id}
      className={cn(selectClass, "pointer-events-none flex items-center justify-between gap-2", className)}
    >
      <span className="truncate">{label ?? children}</span>
      <span className="text-muted-foreground text-xs">▾</span>
    </div>
  )
}

export function SelectValue({ placeholder }: { placeholder?: string }) {
  const ctx = React.useContext(Ctx)
  const label = ctx?.items.find((i) => i.value === ctx.value)?.label
  return <>{label ?? placeholder ?? ""}</>
}

export function SelectContent({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

export function SelectItem({ value, children }: { value: string; children: React.ReactNode }) {
  const ctx = React.useContext(Ctx)
  React.useEffect(() => {
    ctx?.registerItem(value, children)
  }, [ctx, value, children])
  return null
}
