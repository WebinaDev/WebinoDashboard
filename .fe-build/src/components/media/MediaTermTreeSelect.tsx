"use client"

import { useId } from "react"

import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { buildTermTreeOptions, indentTermLabel, type TermNode } from "@/lib/term-tree"

const ALL = "0"

export function MediaTermTreeSelect({
  terms,
  value,
  onValueChange,
  allLabel,
  label,
  id: idProp,
  className,
}: {
  terms: TermNode[]
  value: string
  onValueChange: (value: string) => void
  allLabel: string
  label?: string
  id?: string
  className?: string
}) {
  const autoId = useId()
  const id = idProp ?? autoId
  const options = buildTermTreeOptions(terms)

  return (
    <div className={className}>
      {label ? <Label htmlFor={id}>{label}</Label> : null}
      <Select value={value || ALL} onValueChange={onValueChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.id} value={String(o.id)}>
              {indentTermLabel(o.label, o.depth)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export { ALL as MEDIA_TERM_ALL }
