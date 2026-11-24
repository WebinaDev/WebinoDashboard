import apiClient from "@/features/modules/accounting/lib/api-client"
import { unwrapData } from "@/features/modules/accounting/lib/api-helpers"

/**
 * `POST /v1/erp-accounting/wp-action/{action}` — parity with the WordPress
 * `webinocrm_accounting_{action}` admin-ajax handlers.
 *
 * The backend keeps the ERP's action names verbatim, so this file does too. The path
 * moved from `/v1/accounting` to `/v1/erp-accounting` because `/v1/accounting` already
 * answers for the cafe POS ledger; see the module's service provider.
 */
export async function accountingWpAction<T = unknown>(
  action: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const res = await apiClient.post(`/v1/erp-accounting/wp-action/${encodeURIComponent(action)}`, body)

  return unwrapData<T>(res)
}
