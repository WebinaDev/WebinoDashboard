"use client"

import { Columns3 } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function useListColumnVisibility<T extends string>(
  storageKey: string,
  defaults: Record<T, boolean>,
): [Record<T, boolean>, (id: T, visible: boolean) => void] {
  const [columns, setColumns] = useState(defaults)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return
      const parsed = JSON.parse(raw) as Partial<Record<T, boolean>>
      setColumns({ ...defaults, ...parsed })
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per storage key
  }, [storageKey])

  const toggle = useCallback(
    (id: T, checked: boolean) => {
      setColumns((prev) => {
        const next = { ...prev, [id]: checked }
        try {
          localStorage.setItem(storageKey, JSON.stringify(next))
        } catch {
          /* ignore */
        }
        return next
      })
    },
    [storageKey],
  )

  return [columns, toggle]
}

export function ListColumnPicker<T extends string>({
  label,
  columns,
  columnLabels,
  onToggle,
}: {
  label: string
  columns: Record<T, boolean>
  columnLabels: Record<T, string>
  onToggle: (id: T, checked: boolean) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Columns3 className="size-4" />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {(Object.keys(columns) as T[]).map((id) => (
          <DropdownMenuCheckboxItem
            key={id}
            checked={columns[id]}
            onCheckedChange={(v) => onToggle(id, v === true)}
          >
            {columnLabels[id]}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
