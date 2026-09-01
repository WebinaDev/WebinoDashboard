export type ApiEnvelope<T = unknown> = {
    success: boolean;
    data: T;
    message?: string | null;
    meta?: Record<string, unknown> | null;
    errors?: Record<string, unknown> | null;
};
export declare function isApiEnvelope(value: unknown): value is ApiEnvelope;
export declare function unwrapApiData<T>(payload: unknown): T;
export declare function unwrapApiResponse<T>(payload: unknown): {
    data: T;
    message?: string | null;
    meta?: Record<string, unknown> | null;
};
