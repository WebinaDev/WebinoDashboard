import type { SimpleSeo } from "@/components/seo/SimpleSeoFields"

/** Lightweight SEO completeness score for admin list columns (0–100). */
export function simpleSeoScore(seo?: SimpleSeo | null): number {
  if (!seo) return 0
  let score = 0
  if (seo.focus_keyword?.trim()) score += 30
  if (seo.title?.trim()) score += 35
  if (seo.description?.trim()) score += 35
  return score
}
