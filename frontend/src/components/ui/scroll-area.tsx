"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

export function ScrollArea({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("overflow-auto", className)}>{children}</div>
}

export function ScrollBar() {
  return null
}
