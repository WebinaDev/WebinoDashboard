"use client"

import { useQueries, useQuery } from "@tanstack/react-query"
import { X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export type SearchOption = { id: number; label: string; hint?: string | null }

export function SearchMultiSelect({
  label,
  value,
  onChange,
  placeholder,
  emptyText,
  removeLabel,
  queryKey,
  search,
  resolve,
}: {
  label: string
  value: number[]
  onChange: (ids: number[]) => void
  placeholder: string
  emptyText: string
  removeLabel: string
  queryKey: string
  search: (q: string) => Promise<SearchOption[]>
  resolve: (id: number) => Promise<SearchOption | null>
}) {
  const [input, setInput] = useState("")
  const [term, setTerm] = useState("")
  const [picked, setPicked] = useState<Record<number, SearchOption>>({})

  useEffect(() => {
    const id = window.setTimeout(() => setTerm(input.trim()), 300)
    return () => window.clearTimeout(id)
  }, [input])

  const hits = useQuery({
    queryKey: [queryKey, "search", term],
    enabled: term.length >= 2,
    queryFn: () => search(term),
  })

  const missing = value.filter((id) => !picked[id])
  const resolved = useQueries({
    queries: missing.map((id) => ({
      queryKey: [queryKey, "one", id],
      queryFn: () => resolve(id),
      staleTime: 5 * 60 * 1000,
    })),
  })

  const labels = useMemo(() => {
    const map: Record<number, SearchOption> = { ...picked }
    for (const r of resolved) {
      if (r.data) map[r.data.id] = r.data
    }
    return map
  }, [picked, resolved])

  const options = (hits.data ?? []).filter((o) => !value.includes(o.id))

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {value.map((id) => (
            <span key={id} className="bg-muted inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs">
              {labels[id]?.label ?? `#${id}`}
              <button
                type="button"
                aria-label={removeLabel}
                className="hover:text-destructive"
                onClick={() => onChange(value.filter((x) => x !== id))}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder={placeholder} />
      {term.length >= 2 ? (
        <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border p-1">
          {options.length === 0 ? (
            <p className="text-muted-foreground px-2 py-1 text-xs">{hits.isFetching ? "…" : emptyText}</p>
          ) : (
            options.map((o) => (
              <button
                key={o.id}
                type="button"
                className="hover:bg-muted block w-full rounded px-2 py-1 text-start text-sm"
                onClick={() => {
                  setPicked((m) => ({ ...m, [o.id]: o }))
                  onChange([...value, o.id])
                  setInput("")
                  setTerm("")
                }}
              >
                {o.label}
                {o.hint ? <span className="text-muted-foreground text-xs"> · {o.hint}</span> : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}
