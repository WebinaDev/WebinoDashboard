"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

export function Tabs({
  className,
  value,
  onValueChange,
  children,
}: {
  className?: string
  value: string
  onValueChange: (v: string) => void
  children: React.ReactNode
}) {
  return (
    <div className={cn("w-full", className)} data-tabs-value={value}>
      {React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child
        return React.cloneElement(child as React.ReactElement<{ tabsValue?: string; onTabsChange?: (v: string) => void }>, {
          tabsValue: value,
          onTabsChange: onValueChange,
        })
      })}
    </div>
  )
}

export function TabsList({
  className,
  children,
  tabsValue,
  onTabsChange,
}: {
  className?: string
  children: React.ReactNode
  tabsValue?: string
  onTabsChange?: (v: string) => void
}) {
  return (
    <div className={cn("bg-muted text-muted-foreground inline-flex h-9 items-center justify-center rounded-lg p-1", className)}>
      {React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child
        return React.cloneElement(child as React.ReactElement<{ tabsValue?: string; onTabsChange?: (v: string) => void }>, {
          tabsValue,
          onTabsChange,
        })
      })}
    </div>
  )
}

export function TabsTrigger({
  value,
  className,
  children,
  tabsValue,
  onTabsChange,
}: {
  value: string
  className?: string
  children: React.ReactNode
  tabsValue?: string
  onTabsChange?: (v: string) => void
}) {
  const active = tabsValue === value
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all",
        active ? "bg-background text-foreground shadow-sm" : "hover:text-foreground",
        className,
      )}
      onClick={() => onTabsChange?.(value)}
    >
      {children}
    </button>
  )
}

export function TabsContent({
  value,
  className,
  children,
  tabsValue,
}: {
  value: string
  className?: string
  children: React.ReactNode
  tabsValue?: string
  onTabsChange?: (v: string) => void
}) {
  if (tabsValue !== value) return null
  return <div className={cn("mt-3", className)}>{children}</div>
}
