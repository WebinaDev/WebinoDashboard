import { cache } from "react"

import { unwrapApiData } from "@webina/ui"

import { apiServerData, apiServerStrict } from "@/lib/api-server"

import type { TenantActivation } from "./types"

export const getTenantActivations = cache(async (): Promise<TenantActivation[]> => {
  const data = await apiServerData<TenantActivation[]>("/api/v1/kernel/activations")
  return data ?? []
})

export const getPublicActivations = cache(async (): Promise<TenantActivation[]> => {
  // Strict: a backend hiccup must not resolve module routes as missing (cached 404); see apiServerStrict.
  const raw = await apiServerStrict<unknown>("/api/v1/public/kernel/activations")
  const data = raw == null ? null : unwrapApiData<{ activations?: TenantActivation[] }>(raw)
  return data?.activations ?? []
})

export const getKernelRegistry = cache(async () => {
  return apiServerData<{
    modules: unknown[]
    site_types: unknown[]
  }>("/api/v1/kernel/registry")
})
