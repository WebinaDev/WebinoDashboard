/** Shared upload rule for builder form `file` fields (ERP rule, Dashboard adopts it): 10 MB, docs/images/zip. */
export const FORM_UPLOAD_MAX_BYTES = 10 * 1024 * 1024
export const FORM_UPLOAD_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "pdf", "doc", "docx", "zip"] as const
export const FORM_UPLOAD_ACCEPT = FORM_UPLOAD_EXTENSIONS.map((ext) => `.${ext}`).join(",")

/** null when the file is acceptable, otherwise the reason. */
export function checkFormUpload(file: { name: string; size: number }): "size" | "type" | null {
  if (file.size > FORM_UPLOAD_MAX_BYTES) return "size"
  const ext = file.name.toLowerCase().split(".").pop() ?? ""
  return (FORM_UPLOAD_EXTENSIONS as readonly string[]).includes(ext) ? null : "type"
}
