export type AiJobPhase = "queued" | "running" | "done" | "failed" | "cancelled"

export function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

export function jobPhase(job: { status?: string; result_summary?: string } | null): AiJobPhase {
  if (!job) return "queued"
  const status = job.status ?? "pending"
  if (status === "done") return "done"
  if (status === "failed") return "failed"
  if (status === "cancelled") return "cancelled"
  if (status === "running") return "running"
  return "queued"
}

export function jobPhasePercent(phase: AiJobPhase): number {
  switch (phase) {
    case "queued":
      return 15
    case "running":
      return 55
    case "done":
      return 100
    case "failed":
    case "cancelled":
      return 100
    default:
      return 10
  }
}
