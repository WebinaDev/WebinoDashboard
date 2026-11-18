import { api } from "@/lib/api"

export type BuildPipelineStep = {
  id: string
  label: string
  done?: boolean
}

export type BuildPipelineStatus = {
  enabled: boolean
  status: string
  current_step?: string
  error?: string
  log_tail?: string
  steps?: BuildPipelineStep[]
  locked?: boolean
}

export async function fetchBuildPipelineStatus(): Promise<BuildPipelineStatus> {
  return api<BuildPipelineStatus>("/api/v1/build-pipeline/status")
}

export async function startBuildPipeline(): Promise<BuildPipelineStatus> {
  return api<BuildPipelineStatus>("/api/v1/build-pipeline/start", { method: "POST" })
}

export async function cancelBuildPipeline(): Promise<BuildPipelineStatus> {
  return api<BuildPipelineStatus>("/api/v1/build-pipeline/cancel", { method: "POST" })
}
