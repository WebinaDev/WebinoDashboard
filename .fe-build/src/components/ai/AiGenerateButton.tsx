"use client"

import { useMutation } from "@tanstack/react-query"
import { Loader2, Sparkles } from "lucide-react"
import { useTranslations } from "next-intl"
import { useCallback, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { useEnumLabel } from "@/lib/enum-labels"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type GenerateType = "page" | "post"

type JobRow = { id: number; status: string; error_message?: string | null }

async function pollJob(jobId: number, onStatus: (status: string) => void): Promise<JobRow> {
  const deadline = Date.now() + 5 * 60 * 1000
  while (Date.now() < deadline) {
    const row = await api<JobRow>(`/api/v1/ai-content/jobs/${jobId}`)
    onStatus(String(row.status))
    if (["completed", "done", "failed", "cancelled", "error"].includes(String(row.status))) {
      return row
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  throw new Error("timeout")
}

export function AiGenerateButton({
  type,
  id,
  disabled,
  className,
  onComplete,
}: {
  type: GenerateType
  id: number | null | undefined
  disabled?: boolean
  className?: string
  onComplete?: () => void
}) {
  const t = useTranslations("aiContent")
  const enumLabel = useEnumLabel()
  const [progress, setProgress] = useState<number | null>(null)
  const [statusLabel, setStatusLabel] = useState<string | null>(null)

  const run = useMutation({
    mutationFn: async () => {
      if (!id || id < 1) throw new Error("missing id")
      setProgress(12)
      const res = await api<{ job_id: number; queued?: boolean }>("/api/v1/ai-content/generate", {
        method: "POST",
        json: { type, id, sync: false },
      })
      setProgress(30)
      const job = await pollJob(res.job_id, (s) => {
        setStatusLabel(enumLabel("job_status", s))
        setProgress((p) => Math.min(95, (p ?? 30) + 8))
      })
      if (["failed", "cancelled", "error"].includes(String(job.status))) {
        throw new Error(job.error_message || t("error"))
      }
      return job
    },
    onSuccess: () => {
      setProgress(100)
      toast.success(t("generateDone"))
      onComplete?.()
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
    onSettled: () => {
      window.setTimeout(() => {
        setProgress(null)
        setStatusLabel(null)
      }, 1500)
    },
  })

  const onClick = useCallback(() => run.mutate(), [run])

  if (!id || id < 1) return null

  return (
    <div className={className}>
      <Button type="button" variant="secondary" size="sm" disabled={disabled || run.isPending} onClick={onClick}>
        {run.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        {t("generateContent")}
      </Button>
      {progress !== null ? (
        <div className="mt-2 space-y-1">
          <Progress value={progress} className="h-1.5" />
          {statusLabel ? <p className="text-muted-foreground text-xs">{statusLabel}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
