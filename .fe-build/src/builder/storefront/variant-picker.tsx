"use client"

import { useEffect, useMemo, useState } from "react"

import type { ShopVariant } from "../catalog"
import "./stepped-checkout.css"

export type VariantAxis = {
  key: string
  label: string
  values: Array<{ value: string; swatch?: ShopVariant["swatch"] }>
}

/** Attribute axes (colour, size...) from the variants' attribute values, in first-seen order. */
export function variantAxes(variants: ShopVariant[]): VariantAxis[] {
  const axes = new Map<string, VariantAxis>()
  for (const v of variants) {
    for (const opt of v.options ?? []) {
      let axis = axes.get(opt.key)
      if (!axis) {
        axis = { key: opt.key, label: opt.label, values: [] }
        axes.set(opt.key, axis)
      }
      if (!axis.values.some((row) => row.value === opt.value)) {
        // A variant's swatch belongs to its first attribute (backend withSwatches).
        const first = v.options?.[0]?.key === opt.key
        axis.values.push({ value: opt.value, ...(first && v.swatch ? { swatch: v.swatch } : {}) })
      }
    }
  }
  const list = [...axes.values()]
  // Every variant must be addressable by its options, otherwise fall back to the flat list.
  return list.length && variants.every((v) => (v.options ?? []).length === list.length) ? list : []
}

function optionOf(v: ShopVariant, key: string): string | undefined {
  return v.options?.find((o) => o.key === key)?.value
}

/**
 * Per-attribute selection: starts on the first in-stock variant, only offers combinations
 * that exist and are in stock, and resolves the chosen variant id.
 */
export function useVariantSelection(variants: ShopVariant[], onChange?: (variant: ShopVariant | null) => void) {
  const axes = useMemo(() => variantAxes(variants), [variants])
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [flatId, setFlatId] = useState<number | null>(null)

  useEffect(() => {
    const first = variants.find((v) => v.inStock) ?? null
    if (!first) return
    if (axes.length) {
      setPicked(Object.fromEntries(axes.map((a) => [a.key, optionOf(first, a.key) ?? ""])))
    } else {
      setFlatId(first.id)
    }
  }, [variants, axes])

  const variant = useMemo(() => {
    if (!axes.length) return variants.find((v) => v.id === flatId) ?? null
    return variants.find((v) => axes.every((a) => picked[a.key] && optionOf(v, a.key) === picked[a.key])) ?? null
  }, [axes, variants, picked, flatId])

  useEffect(() => {
    onChange?.(variant)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant?.id])

  /** In stock with the other picked values kept as they are. */
  function available(axisKey: string, value: string): boolean {
    return variants.some(
      (v) =>
        v.inStock &&
        optionOf(v, axisKey) === value &&
        axes.every((a) => a.key === axisKey || !picked[a.key] || optionOf(v, a.key) === picked[a.key]),
    )
  }

  /** Exists in stock at all (with any other values): picking it re-aligns the other axes. */
  function reachable(axisKey: string, value: string): boolean {
    return variants.some((v) => v.inStock && optionOf(v, axisKey) === value)
  }

  function choose(axisKey: string, value: string) {
    const next = { ...picked, [axisKey]: value }
    const exact = variants.find((v) => v.inStock && axes.every((a) => optionOf(v, a.key) === next[a.key]))
    if (!exact) {
      // Keep the new value and move the other axes to the closest in-stock combination.
      const best = variants
        .filter((v) => v.inStock && optionOf(v, axisKey) === value)
        .sort((a, b) => axes.filter((x) => optionOf(b, x.key) === next[x.key]).length - axes.filter((x) => optionOf(a, x.key) === next[x.key]).length)[0]
      if (best) {
        setPicked(Object.fromEntries(axes.map((a) => [a.key, optionOf(best, a.key) ?? ""])))
        return
      }
    }
    setPicked(next)
  }

  return { axes, picked, variant, available, reachable, choose, flatId, setFlatId }
}

function Swatch({ swatch }: { swatch: NonNullable<ShopVariant["swatch"]> }) {
  return (
    <span
      aria-hidden
      className="wb-variant__swatch"
      style={{
        display: "inline-block",
        width: 18,
        height: 18,
        borderRadius: "50%",
        border: "1px solid rgba(0,0,0,.15)",
        verticalAlign: "middle",
        marginInlineEnd: swatch.showLabel ? 6 : 0,
        background: swatch.image ? `center / cover no-repeat url(${JSON.stringify(swatch.image)})` : (swatch.color ?? undefined),
      }}
    />
  )
}

/**
 * Variant picker: one group per attribute (out-of-stock combinations disabled), or the flat
 * model list when the variants carry no attribute values. `listClass` / `titleClass` let each
 * theme keep its own look (classic: sfc-pdp__variant-list / sfc-divider-title).
 */
export function VariantPicker({
  variants,
  selection,
  title,
  listClass = "wb-variant__list",
  titleClass = "wb-variant__title",
}: {
  variants: ShopVariant[]
  selection: ReturnType<typeof useVariantSelection>
  title: string
  listClass?: string
  titleClass?: string
}) {
  if (!variants.length) return null
  const { axes, picked, available, reachable, choose, flatId, setFlatId } = selection
  if (!axes.length) {
    return (
      <div className="wb-variant">
        <span className={titleClass}>{title}</span>
        <div className={listClass} role="radiogroup" aria-label={title}>
          {variants.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={flatId === item.id}
              disabled={!item.inStock}
              onClick={() => setFlatId(item.id)}
              className={flatId === item.id ? "is-active" : ""}
              title={item.inStock ? item.name : `${item.name} (ناموجود)`}
            >
              {item.swatch ? <Swatch swatch={item.swatch} /> : null}
              {!item.swatch || item.swatch.showLabel ? item.name : null}
            </button>
          ))}
        </div>
      </div>
    )
  }
  return (
    <div className="wb-variant">
      {axes.map((axis) => (
        <div key={axis.key} className="wb-variant__axis">
          <span className={titleClass}>
            {axis.label}
            {picked[axis.key] ? <b className="wb-variant__picked">: {picked[axis.key]}</b> : null}
          </span>
          <div className={listClass} role="radiogroup" aria-label={axis.label}>
            {axis.values.map((row) => {
              const on = picked[axis.key] === row.value
              const ok = available(axis.key, row.value)
              const can = ok || reachable(axis.key, row.value)
              return (
                <button
                  key={row.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={!can}
                  onClick={() => choose(axis.key, row.value)}
                  className={[on ? "is-active" : "", !ok ? "is-unavailable" : ""].filter(Boolean).join(" ")}
                  title={can ? row.value : `${row.value} (ناموجود)`}
                >
                  {row.swatch ? <Swatch swatch={row.swatch} /> : null}
                  {!row.swatch || row.swatch.showLabel ? row.value : null}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
