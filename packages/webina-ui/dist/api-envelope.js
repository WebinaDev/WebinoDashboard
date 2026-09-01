export function isApiEnvelope(value) {
    if (!value || typeof value !== "object")
        return false;
    return "success" in value && ("data" in value || "errors" in value);
}
export function unwrapApiData(payload) {
    if (isApiEnvelope(payload)) {
        return payload.data;
    }
    if (payload && typeof payload === "object" && "data" in payload) {
        return payload.data;
    }
    return payload;
}
export function unwrapApiResponse(payload) {
    if (isApiEnvelope(payload)) {
        return {
            data: payload.data,
            message: payload.message,
            meta: payload.meta ?? undefined,
        };
    }
    if (payload && typeof payload === "object" && "data" in payload) {
        const obj = payload;
        return { data: obj.data, message: obj.message, meta: obj.meta };
    }
    return { data: payload };
}
