import { getPublicActivations as getActivations } from "@/kernel/server-data"
import type { TenantActivation } from "@/kernel/types"

export { getActivations as getPublicActivations }

export function isSubmoduleEnabled(
  activations: TenantActivation[],
  moduleSlug: string,
  submoduleSlug: string,
): boolean {
  if (moduleSlug === "core") return true
  return activations.some(
    (a) =>
      a.module_slug === moduleSlug &&
      a.submodule_slug === submoduleSlug &&
      a.enabled,
  )
}
