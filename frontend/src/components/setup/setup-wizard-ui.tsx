"use client"

import { Check } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type StepMeta = { id: string; label: string }

export function SetupWizardProgress({
  steps,
  current,
  onSelect,
}: {
  steps: StepMeta[]
  current: string
  onSelect?: (id: string) => void
}) {
  const idx = steps.findIndex((s) => s.id === current)
  return (
    <ol className="flex flex-wrap justify-center gap-2" dir="rtl">
      {steps.map((step, i) => {
        const done = i < idx
        const active = step.id === current
        const clickable = Boolean(onSelect) && i <= idx
        return (
          <li key={step.id}>
            <button
              type="button"
              disabled={!clickable}
              onClick={() => onSelect?.(step.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors",
                active && "border-primary bg-primary text-primary-foreground",
                done && !active && "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
                !active && !done && "bg-muted/40 text-muted-foreground",
                clickable && "cursor-pointer",
                !clickable && "cursor-default",
              )}
            >
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full text-[10px] font-semibold",
                  active ? "bg-primary-foreground/20" : "bg-background/80",
                )}
              >
                {done ? <Check className="size-3" /> : i + 1}
              </span>
              {step.label}
            </button>
          </li>
        )
      })}
    </ol>
  )
}

export function SetupChoiceCard({
  selected,
  title,
  description,
  badge,
  onClick,
  disabled,
}: {
  selected?: boolean
  title: string
  description?: string
  badge?: string
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "w-full rounded-2xl border p-4 text-start transition-all",
        selected
          ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/30"
          : "hover:border-primary/40 hover:bg-muted/30",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="font-medium leading-6">{title}</div>
          {description ? (
            <p className="text-muted-foreground text-sm leading-6">{description}</p>
          ) : null}
        </div>
        {badge ? <Badge variant="secondary">{badge}</Badge> : null}
      </div>
    </button>
  )
}
