"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Sparkles } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useDashboardNav } from "@/hooks/useDashboardNav"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { jobPhase, jobPhasePercent, sleep } from "@/lib/ai-job-progress"
import { isSubmoduleEnabled } from "@/kernel/route-resolver"

type AiJobRow = {
  id: number
  status: string
  result_summary?: string
  error_message?: string
}

type GenerateRes = {
  job_id: number
  job?: AiJobRow
}

const POLL_MS = 2_000
const POLL_DEADLINE_MS = 8 * 60 * 1000

function isTerminal(status: string) {
  return status === "done" || status === "failed" || status === "cancelled"
}

export function AiGenerateButton({
  type,
  id = 0,
  payload,
  onDone,
  size = "sm",
  variant = "outline",
  className,
}: {
  type: "product" | "post" | "page" | "blog" | "category"
  id?: number
  payload?: Record<string, unknown>
  onDone?: () => void
  size?: "default" | "sm" | "lg" | "icon"
  variant?: "default" | "outline" | "secondary" | "ghost"
  className?: string
}) {
  const t = useTranslations("aiContent")
  const qc = useQueryClient()
  const { activations } = useDashboardNav()
  const active = isSubmoduleEnabled(activations, "ai-content", "studio")
  const [job, setJob] = useState<AiJobRow | null>(null)
  const [busy, setBusy] = useState(false)

  const mut = useMutation({
    mutationFn: async () => {
      setBusy(true)
      const queued = await api<GenerateRes>("/api/v1/ai-content/generate", {
        method: "POST",
        json: { type, id, sync: false, payload },
      })
      if (!queued?.job_id) {
        throw new Error("AI job enqueue failed")
      }
      const jobId = queued.job_id
      setJob({ id: jobId, status: "pending", result_summary: "queued" })

      void api(`/api/v1/ai-content/jobs/${jobId}/run`, { method: "POST", json: {} }).catch(() => {
        /* worker may continue asynchronously */
      })

      const deadline = Date.now() + POLL_DEADLINE_MS
      let latest: AiJobRow = queued.job ?? { id: jobId, status: "pending" }
      while (Date.now() < deadline) {
        await sleep(POLL_MS)
        try {
          latest = await api<AiJobRow>(`/api/v1/ai-content/jobs/${jobId}`)
          setJob(latest)
          if (isTerminal(latest.status)) return latest
        } catch {
          /* keep polling */
        }
      }
      return latest
    },
    onSuccess: (res) => {
      setBusy(false)
      if (res.status === "failed") {
        toast.error(res.error_message || t("generateFailed"))
        return
      }
      if (res.status === "cancelled") {
        toast.message(t("jobCancelled"))
        return
      }
      if (res.status !== "done") {
        toast.message(t("generateStillRunning"))
        return
      }
      toast.success(t("generateDone"))
      void qc.invalidateQueries({ queryKey: ["ai-content"] })
      onDone?.()
      window.setTimeout(() => setJob(null), 800)
    },
    onError: (e: Error) => {
      setBusy(false)
      toast.error(getApiErrorMessage(e))
      setJob(null)
    },
  })

  const cancel = useMutation({
    mutationFn: async () => {
      if (!job?.id) return null
      return api<{ job: AiJobRow }>(`/api/v1/ai-content/jobs/${job.id}/cancel`, { method: "POST" })
    },
    onSuccess: (res) => {
      if (res?.job) setJob(res.job)
      toast.message(t("jobCancelRequested"))
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  if (!active) return null

  const phase = jobPhase(job)
  const pct = jobPhasePercent(phase)
  const showOverlay = Boolean(job) && busy
  const terminal = job ? isTerminal(job.status) : false

  return (
    <>
      <Button
        type="button"
        size={size}
        variant={variant}
        className={className}
        disabled={busy || (type !== "blog" && !id)}
        onClick={() => void mut.mutateAsync()}
      >
        <Sparkles className="me-1 size-4" />
        {busy ? t("generating") : t("generate")}
      </Button>
      {showOverlay ? (
        <div className="bg-background/80 fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-md space-y-4 rounded-xl border p-6 shadow-lg">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="size-4" />
              {t("generateProgress")}
            </div>
            <div className="bg-muted h-2 overflow-hidden rounded-full">
              <div className="bg-primary h-full transition-[width] duration-500" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-muted-foreground text-sm">{t(`phase.${phase}`)}</p>
            {job?.error_message && terminal ? (
              <p className="text-destructive text-sm whitespace-pre-wrap">{job.error_message}</p>
            ) : null}
            <div className="flex justify-end gap-2">
              {!terminal ? (
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={cancel.isPending}
                  onClick={() => void cancel.mutateAsync()}
                >
                  {t("cancel")}
                </Button>
              ) : (
                <Button type="button" size="sm" variant="outline" onClick={() => setJob(null)}>
                  {t("dismiss")}
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
