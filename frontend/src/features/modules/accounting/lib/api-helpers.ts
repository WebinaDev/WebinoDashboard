import { ApiError } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

/**
 * The two helpers the ported accounting pages call, expressed against this dashboard's
 * `ApiError` instead of axios.
 *
 * Why not import the ERP's file: it is written around `err.response.data` (axios shape)
 * and carries a large redirect/validation-message table that duplicates
 * `@/lib/api-helpers`. Keeping two message tables in one app is how the same failure
 * starts reading differently on two screens.
 */

/**
 * Laravel JSON envelopes usually nest the payload as `{ data: T }`.
 *
 * Returns the body unchanged when it is not enveloped, which is what the ERP helper did
 * and what some of its endpoints rely on.
 */
export function unwrapData<T>(res: { data: unknown }): T {
  const body = res.data as { data?: T }

  if (body && typeof body === "object" && "data" in body && body.data !== undefined) {
    return body.data as T
  }

  return body as T
}

/** A readable message for anything thrown by {@link apiClient}. */
export function getAxiosMessage(err: unknown): string {
  if (err instanceof ApiError) {
    return err.message
  }

  if (err instanceof Error && err.message) {
    return err.message
  }

  return getApiErrorMessage(err)
}
