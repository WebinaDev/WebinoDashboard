export type ApiEnvelope<T = unknown> = {
    success: boolean;
    data: T;
    message?: string | null;
    meta?: Record<string, unknown> | null;
    errors?: Record<string, unknown> | null;
};
/**
 * True only for the Webina Laravel envelope (`success` + `data`|`errors`).
 * Does NOT match CRM-style `{ ok, data }` or bare `{ data }` payloads.
 */
export declare function isApiEnvelope(value: unknown): value is ApiEnvelope;
/**
 * Unwrap envelope `data` only when `success` is present.
 * Leaves `{ ok, data }` and other shapes untouched so callers keep siblings.
 */
export declare function unwrapApiData<T>(payload: unknown): T;
/**
 * Unwrap envelope while preserving `meta` / `message`.
 * Non-envelope payloads (including `{ ok, data }`) are returned as `{ data: payload }`.
 */
export declare function unwrapApiResponse<T>(payload: unknown): {
    data: T;
    message?: string | null;
    meta?: Record<string, unknown> | null;
};
//# sourceMappingURL=api-envelope.d.ts.map