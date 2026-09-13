"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

export function RadioGroup({
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
    <div role="radiogroup" className={cn("grid gap-2", className)}>
      {React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child
        return React.cloneElement(child as React.ReactElement<{ groupValue?: string; onGroupChange?: (v: string) => void }>, {
          groupValue: value,
          onGroupChange: onValueChange,
        })
      })}
    </div>
  )
}

export function RadioGroupItem({
  value,
  id,
  className,
  groupValue,
  onGroupChange,
}: {
  value: string
  id?: string
  className?: string
  groupValue?: string
  onGroupChange?: (v: string) => void
}) {
  return (
    <input
      type="radio"
      id={id}
      value={value}
      checked={groupValue === value}
      onChange={() => onGroupChange?.(value)}
      className={cn("accent-primary size-4", className)}
    />
  )
}
