/** Shared motion/theme helpers for builder widgets (schemas + CSS class names).
 * Platforms attach entrance animations via AdvancedProps; these helpers keep labels/classes in sync. */
import { SHARED_ENTRANCE_ANIMATIONS, type SharedEntranceAnimation, type SharedOption } from "./types"

export const ENTRANCE_ANIMATION_OPTIONS: SharedOption[] = SHARED_ENTRANCE_ANIMATIONS.map((value) => ({
  value,
  label:
    value === "none"
      ? "بدون انیمیشن"
      : value === "fade"
        ? "محو شدن"
        : value === "slide-up"
          ? "از پایین"
          : value === "slide-down"
            ? "از بالا"
            : value === "slide-start"
              ? "از شروع (راست در RTL)"
              : value === "slide-end"
                ? "از پایان (چپ در RTL)"
                : value === "zoom"
                  ? "بزرگ‌نمایی"
                  : value === "flip"
                    ? "چرخش"
                    : "پرش",
}))

export const HOVER_ANIMATION_OPTIONS: SharedOption[] = [
  { value: "none", label: "بدون" },
  { value: "grow", label: "بزرگ شدن" },
  { value: "shrink", label: "کوچک شدن" },
  { value: "float", label: "شناور" },
  { value: "pulse", label: "نبض" },
  { value: "rotate", label: "چرخش" },
]

/** CSS class for an entrance animation (platforms pair with `.wb-anim` + IntersectionObserver). */
export function entranceAnimClass(name: string | null | undefined): string {
  const n = (name ?? "none") as SharedEntranceAnimation
  if (!n || n === "none" || !(SHARED_ENTRANCE_ANIMATIONS as readonly string[]).includes(n)) return ""
  return `wb-anim wb-anim-${n}`
}

/** Editor fields platforms can append for per-widget motion shortcuts (optional). */
export function sharedMotionFields() {
  return [
    { kind: "select" as const, key: "entrance", label: "انیمیشن ورود", options: ENTRANCE_ANIMATION_OPTIONS },
    { kind: "select" as const, key: "hoverAnim", label: "انیمیشن هاور", options: HOVER_ANIMATION_OPTIONS },
  ]
}

/** Defaults for section/column background video (store under advanced.background on the platform). */
export function defaultBackgroundVideo(): { video: string; poster: string; overlay: string; overlayOpacity: number } {
  return { video: "", poster: "", overlay: "#000000", overlayOpacity: 0.35 }
}
