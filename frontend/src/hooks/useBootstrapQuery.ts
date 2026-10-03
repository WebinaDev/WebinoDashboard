"use client"

import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"

export type BootstrapPayload = {
  user: {
    id: number
    name: string
    email: string
    phone?: string | null
    role?: string | null
    ui_preferences?: { locale?: string | null; theme?: string | null; accent?: string | null } | null
    capabilities?: string[]
  }
  tenant: {
    id: number
    name: string
    slug: string
    domain?: string | null
    branding?: Record<string, unknown> | null
    default_currency?: string | null
    site_type_slug?: string | null
    setup_completed?: boolean
  } | null
  license: {
    status: string
    active: boolean
    demo: boolean
    checked_at?: string | null
    unreachable?: boolean
  }
  activations: Array<{
    module_slug: string
    submodule_slug: string
    enabled: boolean
    licensed: boolean
  }>
  otp_auth: {
    login_enabled: boolean
    register_enabled: boolean
    length: number
  }
  menu_acl?: Array<{ menu_key: string; allowed: boolean }>
}

export function useBootstrapQuery(enabled = true) {
  return useQuery({
    queryKey: ["bootstrap"],
    enabled,
    staleTime: 60_000,
    retry: 1,
    queryFn: () => api<BootstrapPayload>("/api/v1/bootstrap"),
  })
}

export function hasCapability(caps: string[] | undefined, capability: string): boolean {
  if (!caps?.length) return false
  if (caps.includes("*")) return true
  return caps.some((granted) => {
    if (granted === capability) return true
    if (granted.endsWith(".*")) {
      const prefix = granted.slice(0, -2)
      return capability === prefix || capability.startsWith(`${prefix}.`)
    }
    return false
  })
}
