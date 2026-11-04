/** Browser `accept` strings aligned with StoreMediaRequest allowlists (safe types only). */

export const MEDIA_IMAGE_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,image/svg+xml,.jpg,.jpeg,.png,.webp,.gif,.svg"

export const MEDIA_AUDIO_ACCEPT =
  "audio/mpeg,audio/mp4,audio/aac,audio/ogg,audio/opus,audio/wav,audio/webm,audio/x-m4a,.mp3,.m4a,.aac,.ogg,.opus,.wav,.webm,.oga"

export const MEDIA_VIDEO_ACCEPT =
  "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v"

export const MEDIA_DOC_ACCEPT = "application/pdf,.pdf"

/** Full media-library picker (images, audio, video, PDF). */
export const MEDIA_LIBRARY_ACCEPT = [
  MEDIA_IMAGE_ACCEPT,
  MEDIA_AUDIO_ACCEPT,
  MEDIA_VIDEO_ACCEPT,
  MEDIA_DOC_ACCEPT,
].join(",")

export type MediaAcceptMode = "image" | "video" | "audio" | "all"

export function mediaDropzoneAccept(mode: MediaAcceptMode): string {
  if (mode === "image") return MEDIA_IMAGE_ACCEPT
  if (mode === "video") return MEDIA_VIDEO_ACCEPT
  if (mode === "audio") return MEDIA_AUDIO_ACCEPT
  return MEDIA_LIBRARY_ACCEPT
}
