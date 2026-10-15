/** Shared upload rule for builder form `file` fields (ERP rule, Dashboard adopts it): 10 MB, docs/images/zip. */
export declare const FORM_UPLOAD_MAX_BYTES: number;
export declare const FORM_UPLOAD_EXTENSIONS: readonly ["jpg", "jpeg", "png", "webp", "pdf", "doc", "docx", "zip"];
export declare const FORM_UPLOAD_ACCEPT: string;
/** null when the file is acceptable, otherwise the reason. */
export declare function checkFormUpload(file: {
    name: string;
    size: number;
}): "size" | "type" | null;
//# sourceMappingURL=upload.d.ts.map