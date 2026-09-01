import { cache } from "react"

import { apiServerData } from "@/lib/api-server"

import type { TenantActivation } from "./types"

export const getTenantActivations = cache(async (): Promise<TenantActivation[]> => {
  const data = await apiServerData<TenantActivation[]>("/api/v1/kernel/activations")
  return data ?? []
})

export const getPublicActivations = cache(async (): Promise<TenantActivation[]> => {
  const data = await apiServerData<{ activations: TenantActivation[] }>(
    "/api/v1/public/kernel/activations",
  )
  return data?.activations ?? []
})

export const getKernelRegistry = cache(async () => {
  return apiServerData<{
    modules: unknown[]
    site_types: unknown[]
  }>("/api/v1/kernel/registry")
})
