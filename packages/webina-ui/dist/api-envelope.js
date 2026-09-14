/**
 * True only for the Webina Laravel envelope (`success` + `data`|`errors`).
 * Does NOT match CRM-style `{ ok, data }` or bare `{ data }` payloads.
 */
export function isApiEnvelope(value) {
    if (!value || typeof value !== "object")
        return false;
    return "success" in value && ("data" in value || "errors" in value);
}
/**
 * Unwrap envelope `data` only when `success` is present.
 * Leaves `{ ok, data }` and other shapes untouched so callers keep siblings.
 */
export function unwrapApiData(payload) {
    if (isApiEnvelope(payload)) {
        return payload.data;
    }
    return payload;
}
/**
 * Unwrap envelope while preserving `meta` / `message`.
 * Non-envelope payloads (including `{ ok, data }`) are returned as `{ data: payload }`.
 */
export function unwrapApiResponse(payload) {
    if (isApiEnvelope(payload)) {
        return {
            data: payload.data,
            message: payload.message,
            meta: payload.meta ?? undefined,
        };
    }
    return { data: payload };
}
