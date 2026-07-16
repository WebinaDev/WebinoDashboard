"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"

import { api } from "@/lib/api"

type Member = {
  id: number
  name: string
  role: string | null
  published?: boolean
}

type PageResult = {
  data: Member[]
}

export default function UsersPage() {
  const t = useTranslations("nav")
  const tCommon = useTranslations("common")
  const [rows, setRows] = useState<Member[]>([])
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    api<PageResult>("/api/v1/team/members")
      .then((r) => {
        if (!cancelled) {
          setRows(Array.isArray(r.data) ? r.data : [])
          setError(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRows([])
          setError(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t("rbac")}</h1>
      {error ? (
        <p className="text-muted-foreground text-sm">{tCommon("em_dash")}</p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{tCommon("em_dash")}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((m) => (
            <li
              key={m.id}
              className="flex justify-between rounded-lg border px-3 py-2 text-sm"
            >
              <span>{m.name}</span>
              <span className="text-muted-foreground font-mono text-xs">
                {m.role ?? tCommon("em_dash")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
