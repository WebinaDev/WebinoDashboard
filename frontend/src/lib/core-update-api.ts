import { api } from "@/lib/api"

export type CoreUpdateStatus = {
  version: string
  latest_version: string
  update_available: boolean
  release_notes?: string
  package_available?: boolean
  license_active?: boolean
  unavailable?: boolean
  self_update_enabled?: boolean
}

export type CoreUpdateResult = {
  ok: boolean
  version: string
  previous_version?: string
  reload_required?: boolean
}

export async function fetchCoreUpdateStatus(refresh = false): Promise<CoreUpdateStatus> {
  if (refresh) {
    return api<CoreUpdateStatus>("/api/v1/updates/check", { method: "POST", json: { refresh: true } })
  }
  return api<CoreUpdateStatus>("/api/v1/updates/status")
}

export async function applyCoreUpdate(version?: string): Promise<CoreUpdateResult> {
  return api<CoreUpdateResult>("/api/v1/updates/apply", {
    method: "POST",
    json: version ? { version } : {},
  })
}
