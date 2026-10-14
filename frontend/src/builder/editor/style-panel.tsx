"use client"

import { Palette, Paintbrush, Settings2 } from "lucide-react"
import { useTranslations } from "next-intl"

import { COLOR_TOKENS, variableOptions } from "../globals"
import { useDesign } from "./design-context"
import type { AdvancedProps, BoxEdges, DeviceMode, ShapeName, StyleProps } from "../types"
import { ConditionsFields } from "./ConditionsFields"

export function Edges({ label, value, onChange }: { label: string; value?: BoxEdges; onChange: (edges: BoxEdges) => void }) {
  const sides = ["top", "right", "bottom", "left"] as const
  return (
    <div className="grid gap-1">
      <span className="flex items-center gap-1.5"><Settings2 className="size-3.5" aria-hidden />{label}</span>
      <div className="grid grid-cols-4 gap-1" dir="ltr">
        {sides.map((side) => (
          <input
            key={side}
            className="h-8 min-w-0 rounded-md border px-1 text-center"
            value={value?.[side] ?? ""}
            placeholder={side[0].toUpperCase()}
            aria-label={`${label} ${side}`}
            onChange={(event) => onChange({ ...(value ?? {}), [side]: event.target.value })}
          />
        ))}
      </div>
    </div>
  )
}

export function TextIn({ label, value, placeholder, onChange, suggest }: { label: string; value?: string; placeholder?: string; onChange: (v: string) => void; suggest?: "size" | "font" }) {
  const { globals } = useDesign()
  const options = suggest ? variableOptions(globals, suggest) : []
  const listId = options.length ? `wb-vars-${suggest}` : undefined
  return (
    <label className="grid gap-1">
      <span>{label}</span>
      <input className="h-9 rounded-md border px-2" dir="ltr" list={listId} value={value ?? ""} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      {listId ? (
        <datalist id={listId}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </datalist>
      ) : null}
    </label>
  )
}

export function SelectIn({ label, value, options, onChange }: { label: string; value?: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <label className="grid gap-1">
      <span>{label}</span>
      <select className="h-9 rounded-md border px-2" value={value ?? ""} onChange={(event) => onChange(event.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}

export function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details open className="rounded-lg border border-[#e6eef6] p-2">
      <summary className="cursor-pointer text-[11px] font-bold text-[#0C2D63]/70">{title}</summary>
      <div className="mt-2 grid gap-2">{children}</div>
    </details>
  )
}

export const SHADOWS = [
  { value: "", label: "—" },
  { value: "0 1px 3px rgba(12,45,99,.12)", label: "S" },
  { value: "0 6px 18px rgba(12,45,99,.14)", label: "M" },
  { value: "0 18px 40px rgba(12,45,99,.18)", label: "L" },
]

export function StyleFields({ style, onChange, device, layout = false }: { style: StyleProps; onChange: (patch: StyleProps) => void; device: DeviceMode; layout?: boolean }) {
  const t = useTranslations("builder")
  const opt = (values: string[]) => [{ value: "", label: "—" }, ...values.map((v) => ({ value: v, label: v }))]
  return (
    <div className="grid gap-2 text-xs">
      <span className="flex items-center gap-1.5 text-[#0C2D63]/50"><Paintbrush className="size-3.5" aria-hidden />{t(device)}</span>
      {layout ? (
        <Group title={t("style_layout")}>
          <SelectIn label={t("layout_display")} value={style.display} options={[{ value: "", label: t("layout_default") }, { value: "flex", label: "Flexbox" }, { value: "grid", label: "Grid" }, { value: "block", label: t("layout_block") }]} onChange={(v) => onChange({ display: (v || undefined) as StyleProps["display"] })} />
          {style.display === "flex" ? (
            <>
              <SelectIn label={t("layout_direction")} value={style.flexDirection} options={opt(["row", "row-reverse", "column", "column-reverse"])} onChange={(v) => onChange({ flexDirection: (v || undefined) as StyleProps["flexDirection"] })} />
              <SelectIn label={t("layout_wrap")} value={style.flexWrap} options={opt(["nowrap", "wrap", "wrap-reverse"])} onChange={(v) => onChange({ flexWrap: (v || undefined) as StyleProps["flexWrap"] })} />
            </>
          ) : null}
          {style.display === "grid" ? (
            <>
              <TextIn label={t("layout_grid_columns")} value={style.gridColumns} placeholder="3 / 2fr 1fr" onChange={(gridColumns) => onChange({ gridColumns })} />
              <TextIn label={t("layout_grid_rows")} value={style.gridRows} placeholder="auto" onChange={(gridRows) => onChange({ gridRows })} />
            </>
          ) : null}
          {style.display === "flex" || style.display === "grid" ? (
            <>
              <SelectIn label={t("layout_justify")} value={style.justifyContent} options={opt(["start", "center", "end", "space-between", "space-around", "space-evenly", "stretch"])} onChange={(v) => onChange({ justifyContent: (v || undefined) as StyleProps["justifyContent"] })} />
              <SelectIn label={t("layout_align")} value={style.alignItems} options={opt(["start", "center", "end", "stretch", "baseline"])} onChange={(v) => onChange({ alignItems: (v || undefined) as StyleProps["alignItems"] })} />
            </>
          ) : null}
          <TextIn label={t("layout_row_gap")} value={style.rowGap} placeholder="16px" onChange={(rowGap) => onChange({ rowGap })} />
          <TextIn label={t("layout_column_gap")} value={style.columnGap} placeholder="16px" onChange={(columnGap) => onChange({ columnGap })} />
        </Group>
      ) : null}
      <Group title={t("style_typography")}>
        <TokenColor label={t("color")} value={style.color} onChange={(color) => onChange({ color })} />
        <TextIn label={t("font_size")} value={style.fontSize} placeholder="1rem" suggest="size" onChange={(fontSize) => onChange({ fontSize })} />
        <SelectIn label={t("font_weight")} value={style.fontWeight} options={[{ value: "", label: "—" }, ...["300", "400", "500", "600", "700", "800", "900"].map((w) => ({ value: w, label: w }))]} onChange={(fontWeight) => onChange({ fontWeight })} />
        <TextIn label={t("line_height")} value={style.lineHeight} placeholder="1.7" onChange={(lineHeight) => onChange({ lineHeight })} />
        <TextIn label={t("letter_spacing")} value={style.letterSpacing} placeholder="0px" suggest="size" onChange={(letterSpacing) => onChange({ letterSpacing })} />
        <SelectIn label={t("text_align")} value={style.textAlign} options={[{ value: "", label: "—" }, { value: "start", label: t("align_start") }, { value: "center", label: t("align_center") }, { value: "end", label: t("align_end") }]} onChange={(v) => onChange({ textAlign: (v || undefined) as StyleProps["textAlign"] })} />
        <TextIn label={t("font_family")} value={style.fontFamily} placeholder="Vazirmatn, sans-serif" suggest="font" onChange={(fontFamily) => onChange({ fontFamily })} />
        <div className="grid grid-cols-2 gap-1">
          <TextIn label={t("fluid_min")} value={style.fluidFont?.min} placeholder="1rem" onChange={(min) => onChange({ fluidFont: { ...style.fluidFont, min } })} />
          <TextIn label={t("fluid_max")} value={style.fluidFont?.max} placeholder="2.5rem" onChange={(max) => onChange({ fluidFont: { ...style.fluidFont, max } })} />
        </div>
        <TextIn label={t("text_shadow")} value={style.textShadow} placeholder="0 2px 4px rgba(0,0,0,.3)" onChange={(textShadow) => onChange({ textShadow })} />
        <SelectIn label={t("text_transform")} value={style.textTransform} options={[{ value: "", label: "—" }, { value: "uppercase", label: "ABC" }, { value: "lowercase", label: "abc" }, { value: "capitalize", label: "Abc" }]} onChange={(v) => onChange({ textTransform: (v || undefined) as StyleProps["textTransform"] })} />
      </Group>
      <Group title={t("style_background")}>
        <TokenColor label={t("background")} value={style.background} onChange={(background) => onChange({ background })} />
        <TextIn label={t("background_image")} value={style.backgroundImage} placeholder="https://…" onChange={(backgroundImage) => onChange({ backgroundImage })} />
        <TextIn label={t("gradient")} value={style.gradient} placeholder="linear-gradient(135deg,#E16BA6,#0C2D63)" onChange={(gradient) => onChange({ gradient })} />
        <TextIn label={t("opacity")} value={style.opacity} placeholder="1" onChange={(opacity) => onChange({ opacity })} />
      </Group>
      <Group title={t("style_position")}>
        <SelectIn label={t("position")} value={style.position} options={opt(["static", "relative", "absolute", "fixed", "sticky"])} onChange={(v) => onChange({ position: (v || undefined) as StyleProps["position"] })} />
        {style.position && style.position !== "static" ? (
          <div className="grid grid-cols-2 gap-1">
            <TextIn label={t("inset_top")} value={style.insetTop} placeholder="0" onChange={(insetTop) => onChange({ insetTop })} />
            <TextIn label={t("inset_bottom")} value={style.insetBottom} placeholder="auto" onChange={(insetBottom) => onChange({ insetBottom })} />
            <TextIn label={t("inset_start")} value={style.insetStart} placeholder="0" onChange={(insetStart) => onChange({ insetStart })} />
            <TextIn label={t("inset_end")} value={style.insetEnd} placeholder="auto" onChange={(insetEnd) => onChange({ insetEnd })} />
          </div>
        ) : null}
        <TextIn label={t("z_index")} value={style.zIndex} placeholder="1" onChange={(zIndex) => onChange({ zIndex })} />
        <SelectIn label={t("overflow")} value={style.overflow} options={opt(["visible", "hidden", "auto", "clip"])} onChange={(v) => onChange({ overflow: (v || undefined) as StyleProps["overflow"] })} />
        <TextIn label={t("grid_column_span")} value={style.gridColumnSpan} placeholder="2 / 1 / 3" onChange={(gridColumnSpan) => onChange({ gridColumnSpan })} />
        <TextIn label={t("grid_row_span")} value={style.gridRowSpan} placeholder="1" onChange={(gridRowSpan) => onChange({ gridRowSpan })} />
        <TextIn label={t("aspect_ratio")} value={style.aspectRatio} placeholder="16/9" onChange={(aspectRatio) => onChange({ aspectRatio })} />
        <SelectIn label={t("object_fit")} value={style.objectFit} options={opt(["cover", "contain", "fill", "none", "scale-down"])} onChange={(v) => onChange({ objectFit: (v || undefined) as StyleProps["objectFit"] })} />
        <TextIn label={t("object_position")} value={style.objectPosition} placeholder="center" onChange={(objectPosition) => onChange({ objectPosition })} />
      </Group>
      <Group title={t("style_effects")}>
        <TextIn label={t("transform")} value={style.transform} placeholder="rotate(-3deg) scale(1.02)" onChange={(transform) => onChange({ transform })} />
        <TextIn label={t("filter")} value={style.filter} placeholder="blur(2px) grayscale(1)" onChange={(filter) => onChange({ filter })} />
        <TextIn label={t("backdrop_filter")} value={style.backdropFilter} placeholder="blur(8px)" onChange={(backdropFilter) => onChange({ backdropFilter })} />
        <SelectIn label={t("blend_mode")} value={style.mixBlendMode} options={opt(["normal", "multiply", "screen", "overlay", "darken", "lighten", "difference", "luminosity"])} onChange={(v) => onChange({ mixBlendMode: (v || undefined) as StyleProps["mixBlendMode"] })} />
        <TextIn label={t("clip_path")} value={style.clipPath} placeholder="polygon(0 0,100% 0,100% 85%,0 100%)" onChange={(clipPath) => onChange({ clipPath })} />
      </Group>
      <Group title={t("style_spacing")}>
        <Edges label={t("padding")} value={style.padding} onChange={(padding) => onChange({ padding })} />
        <Edges label={t("margin")} value={style.margin} onChange={(margin) => onChange({ margin })} />
        <TextIn label={t("width")} value={style.width} placeholder="100%" suggest="size" onChange={(width) => onChange({ width })} />
        <TextIn label={t("max_width")} value={style.maxWidth} placeholder="1200px" suggest="size" onChange={(maxWidth) => onChange({ maxWidth })} />
        <TextIn label={t("min_height")} value={style.minHeight} placeholder="0" suggest="size" onChange={(minHeight) => onChange({ minHeight })} />
        <TextIn label={t("order")} value={style.order} placeholder="0" onChange={(order) => onChange({ order })} />
      </Group>
      <Group title={t("style_border")}>
        <TextIn label={t("border_width")} value={style.borderWidth} placeholder="1px" onChange={(borderWidth) => onChange({ borderWidth })} />
        <SelectIn label={t("border_style")} value={style.borderStyle} options={[{ value: "", label: "—" }, { value: "solid", label: "solid" }, { value: "dashed", label: "dashed" }, { value: "none", label: "none" }]} onChange={(v) => onChange({ borderStyle: (v || undefined) as StyleProps["borderStyle"] })} />
        <TokenColor label={t("border_color")} value={style.borderColor} onChange={(borderColor) => onChange({ borderColor })} />
        <TextIn label={t("radius")} value={style.radius} placeholder="16px" suggest="size" onChange={(radius) => onChange({ radius })} />
        <SelectIn label={t("shadow")} value={style.boxShadow} options={SHADOWS} onChange={(boxShadow) => onChange({ boxShadow })} />
      </Group>
      <Group title={t("style_hover")}>
        <TokenColor label={t("hover_color")} value={style.hover?.color} onChange={(color) => onChange({ hover: { ...style.hover, color } })} />
        <TokenColor label={t("hover_background")} value={style.hover?.background} onChange={(background) => onChange({ hover: { ...style.hover, background } })} />
        <TokenColor label={t("hover_border")} value={style.hover?.borderColor} onChange={(borderColor) => onChange({ hover: { ...style.hover, borderColor } })} />
        <SelectIn label={t("shadow")} value={style.hover?.boxShadow} options={SHADOWS} onChange={(boxShadow) => onChange({ hover: { ...style.hover, boxShadow } })} />
        <TextIn label={t("hover_transform")} value={style.hover?.transform} placeholder="translateY(-4px)" onChange={(transform) => onChange({ hover: { ...style.hover, transform } })} />
        <TextIn label={t("hover_transition")} value={style.hover?.transition} placeholder="300ms" onChange={(transition) => onChange({ hover: { ...style.hover, transition } })} />
      </Group>
      <label className="flex items-center justify-between">{t("hidden")}<input type="checkbox" checked={style.hidden === true} onChange={(event) => onChange({ hidden: event.target.checked })} /></label>
    </div>
  )
}

export function AdvancedFields({ value, onChange, layout }: { value: AdvancedProps; onChange: (patch: AdvancedProps) => void; layout?: boolean }) {
  const t = useTranslations("builder")
  const hide = value.hideOn ?? {}
  const sticky = value.sticky ?? {}
  const motion = value.motion ?? {}
  const bg = value.background ?? {}
  const shapes = ["none", "wave", "curve", "tilt", "triangle", "zigzag"].map((v) => ({ value: v, label: v === "none" ? "—" : t(`shape_${v}`) }))
  return (
    <div className="grid gap-2 text-xs">
      <TextIn label={t("css_class")} value={value.cssClass} placeholder="my-class" onChange={(cssClass) => onChange({ cssClass })} />
      <TextIn label={t("css_id")} value={value.cssId} placeholder="section-id" onChange={(cssId) => onChange({ cssId })} />
      <Group title={t("responsive_visibility")}>
        {(["desktop", "tablet", "mobile"] as const).map((d) => (
          <label key={d} className="flex items-center justify-between">
            {t(`hide_on_${d}`)}
            <input type="checkbox" checked={hide[d] === true} onChange={(event) => onChange({ hideOn: { ...hide, [d]: event.target.checked } })} />
          </label>
        ))}
      </Group>
      <Group title={t("motion_effects")}>
        <SelectIn
          label={t("animation")}
          value={value.animation ?? "none"}
          options={["none", "fade", "slide-up", "slide-down", "slide-start", "slide-end", "zoom", "flip", "bounce"].map((v) => ({ value: v, label: v === "none" ? "—" : t(`anim_${v.replace("-", "_")}`) }))}
          onChange={(v) => onChange({ animation: v as AdvancedProps["animation"] })}
        />
        <TextIn label={t("anim_duration")} value={value.animationDuration ? String(value.animationDuration) : ""} placeholder="600" onChange={(v) => onChange({ animationDuration: Number(v) || undefined })} />
        <TextIn label={t("anim_delay")} value={value.animationDelay ? String(value.animationDelay) : ""} placeholder="0" onChange={(v) => onChange({ animationDelay: Number(v) || undefined })} />
        <SelectIn label={t("anim_easing")} value={value.animationEasing ?? "ease-out"} options={["ease", "ease-out", "ease-in-out", "linear", "spring"].map((v) => ({ value: v, label: v }))} onChange={(v) => onChange({ animationEasing: v as AdvancedProps["animationEasing"] })} />
        <SelectIn label={t("hover_anim")} value={value.hoverAnim ?? "none"} options={["none", "grow", "shrink", "float", "pulse", "rotate"].map((v) => ({ value: v, label: v === "none" ? "—" : t(`hover_${v}`) }))} onChange={(v) => onChange({ hoverAnim: v as AdvancedProps["hoverAnim"] })} />
        <TextIn label={t("parallax")} value={motion.parallax ? String(motion.parallax) : ""} placeholder="0-10" onChange={(v) => onChange({ motion: { ...motion, parallax: Math.max(0, Math.min(10, Number(v) || 0)) || undefined } })} />
        <label className="flex items-center justify-between">{t("tilt")}<input type="checkbox" checked={motion.tilt === true} onChange={(event) => onChange({ motion: { ...motion, tilt: event.target.checked } })} /></label>
      </Group>
      <Group title={t("sticky")}>
        <SelectIn label={t("sticky_position")} value={sticky.position ?? ""} options={[{ value: "", label: "—" }, { value: "top", label: t("sticky_top") }, { value: "bottom", label: t("sticky_bottom") }]} onChange={(v) => onChange({ sticky: { ...sticky, position: (v || undefined) as "top" | "bottom" | undefined } })} />
        <TextIn label={t("sticky_offset")} value={sticky.offset} placeholder="0px" onChange={(offset) => onChange({ sticky: { ...sticky, offset } })} />
        {(["desktop", "tablet", "mobile"] as const).map((d) => (
          <label key={d} className="flex items-center justify-between">
            {t(`device_${d}`)}
            <input type="checkbox" checked={(sticky.devices ?? { desktop: true, tablet: true, mobile: true })[d] !== false} onChange={(event) => onChange({ sticky: { ...sticky, devices: { desktop: true, tablet: true, mobile: true, ...sticky.devices, [d]: event.target.checked } } })} />
          </label>
        ))}
      </Group>
      {layout ? (
        <Group title={t("background_extras")}>
          <TextIn label={t("bg_video")} value={bg.video} placeholder="https://.../video.mp4" onChange={(video) => onChange({ background: { ...bg, video } })} />
          <TextIn label={t("bg_poster")} value={bg.poster} placeholder="https://.../poster.jpg" onChange={(poster) => onChange({ background: { ...bg, poster } })} />
          <TokenColor label={t("bg_overlay")} value={bg.overlay} onChange={(overlay) => onChange({ background: { ...bg, overlay } })} />
          <TextIn label={t("bg_overlay_opacity")} value={bg.overlayOpacity != null ? String(bg.overlayOpacity) : ""} placeholder="0.5" onChange={(v) => onChange({ background: { ...bg, overlayOpacity: v === "" ? undefined : Math.max(0, Math.min(1, Number(v) || 0)) } })} />
          <SelectIn label={t("shape_top")} value={bg.shapeTop ?? "none"} options={shapes} onChange={(v) => onChange({ background: { ...bg, shapeTop: v as ShapeName } })} />
          <SelectIn label={t("shape_bottom")} value={bg.shapeBottom ?? "none"} options={shapes} onChange={(v) => onChange({ background: { ...bg, shapeBottom: v as ShapeName } })} />
          <TokenColor label={t("shape_color")} value={bg.shapeColor} onChange={(shapeColor) => onChange({ background: { ...bg, shapeColor } })} />
          <TextIn label={t("shape_height")} value={bg.shapeHeight ? String(bg.shapeHeight) : ""} placeholder="60" onChange={(v) => onChange({ background: { ...bg, shapeHeight: Number(v) || undefined } })} />
        </Group>
      ) : null}
      <Group title={t("custom_css")}>
        <textarea
          className="min-h-24 rounded-md border px-2 py-1 font-mono text-[11px]"
          dir="ltr"
          aria-label={t("custom_css")}
          placeholder={"selector { color: red }\nselector:hover { opacity: .8 }"}
          value={value.customCss ?? ""}
          onChange={(event) => onChange({ customCss: event.target.value.slice(0, 5000) })}
        />
        <p className="text-[10px] text-[#0C2D63]/50">{t("custom_css_hint")}</p>
      </Group>
      <Group title={t("custom_attributes")}>
        {(value.attributes ?? []).map((attr, index) => (
          <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-1">
            <input className="h-8 min-w-0 rounded-md border px-1" dir="ltr" aria-label={t("attr_name")} placeholder="data-id" value={attr.name} onChange={(event) => { const attributes = (value.attributes ?? []).slice(); attributes[index] = { ...attr, name: event.target.value }; onChange({ attributes }) }} />
            <input className="h-8 min-w-0 rounded-md border px-1" dir="ltr" aria-label={t("attr_value")} value={attr.value} onChange={(event) => { const attributes = (value.attributes ?? []).slice(); attributes[index] = { ...attr, value: event.target.value }; onChange({ attributes }) }} />
            <button type="button" aria-label={t("remove")} onClick={() => onChange({ attributes: (value.attributes ?? []).filter((_, i) => i !== index) })}>×</button>
          </div>
        ))}
        <button type="button" className="h-8 rounded-md border px-2" onClick={() => onChange({ attributes: [...(value.attributes ?? []), { name: "", value: "" }] })}>{t("add_attribute")}</button>
        <p className="text-[10px] text-[#0C2D63]/50">{t("attributes_hint")}</p>
      </Group>
      <Group title={t("display_conditions")}>
        <ConditionsFields value={value.conditions ?? {}} onChange={(conditions) => onChange({ conditions })} />
      </Group>
    </div>
  )
}

export function TokenColor({ label, value, onChange }: { label: string; value?: string; onChange: (value: string) => void }) {
  const { globals } = useDesign()
  const tokens = [...COLOR_TOKENS, ...variableOptions(globals, "color")]
  const token = tokens.some((item) => item.value && item.value === value) ? value : ""
  return (
    <label className="grid gap-1">
      <span className="flex items-center gap-1.5"><Palette className="size-3.5" aria-hidden />{label}</span>
      <select className="h-9 rounded-md border px-2" value={token ?? ""} onChange={(event) => onChange(event.target.value || "#0C2D63")}>
        {tokens.map((item) => <option key={`${item.label}-${item.value}`} value={item.value}>{item.label}</option>)}
      </select>
      {token ? null : (
        <input type="color" value={value && value.startsWith("#") ? value : "#0C2D63"} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  )
}
