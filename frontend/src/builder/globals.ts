export type TypeStyle = {
  fontSize: string
  fontWeight: string
  lineHeight: string
  color?: string
}

export type ButtonVariant = {
  background: string
  color: string
  hoverBackground: string
  hoverColor: string
  border: string
}

export type BuilderGlobals = {
  colors: {
    primary: string
    secondary: string
    text: string
    accent: string
    background: string
    surface: string
    border: string
    muted: string
    success: string
    danger: string
  }
  palette: { id: string; name: string; value: string }[]
  fonts: { body: string; heading: string; accent: string }
  typography: Record<"h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "body" | "small" | "link", TypeStyle>
  buttons: {
    radius: string
    paddingX: string
    paddingY: string
    fontSize: string
    fontWeight: string
    variants: Record<"primary" | "secondary" | "outline" | "ghost", ButtonVariant>
  }
  images: { radius: string; objectFit: "cover" | "contain"; lazy: boolean; lightbox: boolean }
  forms: {
    radius: string
    labelColor: string
    fieldBackground: string
    borderColor: string
    focusColor: string
    errorColor: string
    padding: string
  }
  layout: {
    containerWidth: string
    sectionGap: string
    columnGap: string
    background: string
    contentPadding: string
  }
  lightbox: { enabled: boolean; background: string }
  cssVariables: string
}

const type = (fontSize: string, fontWeight: string, lineHeight: string, color?: string): TypeStyle => ({
  fontSize,
  fontWeight,
  lineHeight,
  ...(color ? { color } : {}),
})

const variant = (
  background: string,
  color: string,
  hoverBackground: string,
  hoverColor: string,
  border = "transparent",
): ButtonVariant => ({ background, color, hoverBackground, hoverColor, border })

export const DEFAULT_GLOBALS: BuilderGlobals = {
  colors: {
    primary: "#E16BA6",
    secondary: "#0C2D63",
    text: "#0C2D63",
    accent: "#E16BA6",
    background: "#F5F8FB",
    surface: "#FFFFFF",
    border: "#E6EEF6",
    muted: "#5C6B82",
    success: "#1F8A70",
    danger: "#C2414A",
  },
  palette: [
    { id: "blush", name: "سرخابی", value: "#E16BA6" },
    { id: "navy", name: "سرمه‌ای", value: "#0C2D63" },
    { id: "mist", name: "مه", value: "#F5F8FB" },
    { id: "ink", name: "مرکب", value: "#101820" },
  ],
  fonts: {
    body: "Yekan Bakh, Vazirmatn, Tahoma, sans-serif",
    heading: "Yekan Bakh, Vazirmatn, Tahoma, sans-serif",
    accent: "Yekan Bakh, Vazirmatn, Tahoma, sans-serif",
  },
  typography: {
    h1: type("2.25rem", "800", "1.2"),
    h2: type("1.875rem", "700", "1.25"),
    h3: type("1.5rem", "700", "1.3"),
    h4: type("1.25rem", "700", "1.35"),
    h5: type("1.125rem", "600", "1.4"),
    h6: type("1rem", "600", "1.45"),
    body: type("0.95rem", "400", "1.75"),
    small: type("0.8rem", "400", "1.5"),
    link: type("0.95rem", "600", "1.5", "#E16BA6"),
  },
  buttons: {
    radius: "999px",
    paddingX: "1.25rem",
    paddingY: "0.625rem",
    fontSize: "0.875rem",
    fontWeight: "600",
    variants: {
      primary: variant("#E16BA6", "#FFFFFF", "#d45b98", "#FFFFFF"),
      secondary: variant("#0C2D63", "#FFFFFF", "#16386f", "#FFFFFF"),
      outline: variant("transparent", "#0C2D63", "#F5F8FB", "#0C2D63", "#E6EEF6"),
      ghost: variant("transparent", "#0C2D63", "#F5F8FB", "#E16BA6", "transparent"),
    },
  },
  images: { radius: "16px", objectFit: "cover", lazy: true, lightbox: true },
  forms: {
    radius: "12px",
    labelColor: "#0C2D63",
    fieldBackground: "#FFFFFF",
    borderColor: "#E6EEF6",
    focusColor: "#E16BA6",
    errorColor: "#C2414A",
    padding: "0.65rem 0.75rem",
  },
  layout: {
    containerWidth: "72rem",
    sectionGap: "1.5rem",
    columnGap: "1rem",
    background: "#F5F8FB",
    contentPadding: "1rem",
  },
  lightbox: { enabled: true, background: "rgba(16,24,32,0.72)" },
  cssVariables: "",
}

export const COLOR_TOKENS: { value: string; label: string }[] = [
  { value: "", label: "سفارشی" },
  { value: "var(--wb-color-primary)", label: "اصلی" },
  { value: "var(--wb-color-secondary)", label: "ثانویه" },
  { value: "var(--wb-color-text)", label: "متن" },
  { value: "var(--wb-color-accent)", label: "تأکید" },
  { value: "var(--wb-color-background)", label: "پس‌زمینه" },
  { value: "var(--wb-color-surface)", label: "سطح" },
  { value: "var(--wb-color-border)", label: "حاشیه" },
  { value: "var(--wb-color-muted)", label: "کمرنگ" },
]

function safeCustomVariables(raw: string): string {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^--[a-z0-9-]{1,40}\s*:\s*[^;{}<>]{1,80};?$/i.test(line) && !/url\(|expression|@import/i.test(line))
    .slice(0, 40)
    .map((line) => (line.endsWith(";") ? line : `${line};`))
    .join("")
}

export function globalsCss(globals: BuilderGlobals): string {
  const c = globals.colors
  const t = globals.typography
  const b = globals.buttons
  const role = (name: string, style: TypeStyle) =>
    `--wb-${name}-size:${style.fontSize};--wb-${name}-weight:${style.fontWeight};--wb-${name}-leading:${style.lineHeight};`
  const button = (name: string, style: ButtonVariant) =>
    `--wb-btn-${name}-bg:${style.background};--wb-btn-${name}-fg:${style.color};--wb-btn-${name}-hover-bg:${style.hoverBackground};--wb-btn-${name}-hover-fg:${style.hoverColor};--wb-btn-${name}-border:${style.border};`
  const vars = [
    `--wb-color-primary:${c.primary}`,
    `--wb-color-secondary:${c.secondary}`,
    `--wb-color-text:${c.text}`,
    `--wb-color-accent:${c.accent}`,
    `--wb-color-background:${c.background}`,
    `--wb-color-surface:${c.surface}`,
    `--wb-color-border:${c.border}`,
    `--wb-color-muted:${c.muted}`,
    `--wb-color-success:${c.success}`,
    `--wb-color-danger:${c.danger}`,
    `--wb-font-body:${globals.fonts.body}`,
    `--wb-font-heading:${globals.fonts.heading}`,
    `--wb-font-accent:${globals.fonts.accent}`,
    role("h1", t.h1),
    role("h2", t.h2),
    role("h3", t.h3),
    role("h4", t.h4),
    role("h5", t.h5),
    role("h6", t.h6),
    role("body", t.body),
    role("small", t.small),
    role("link", t.link),
    `--wb-link-color:${t.link.color ?? c.accent}`,
    `--wb-btn-radius:${b.radius}`,
    `--wb-btn-px:${b.paddingX}`,
    `--wb-btn-py:${b.paddingY}`,
    `--wb-btn-size:${b.fontSize}`,
    `--wb-btn-weight:${b.fontWeight}`,
    button("primary", b.variants.primary),
    button("secondary", b.variants.secondary),
    button("outline", b.variants.outline),
    button("ghost", b.variants.ghost),
    `--wb-img-radius:${globals.images.radius}`,
    `--wb-img-fit:${globals.images.objectFit}`,
    `--wb-field-radius:${globals.forms.radius}`,
    `--wb-field-bg:${globals.forms.fieldBackground}`,
    `--wb-field-border:${globals.forms.borderColor}`,
    `--wb-field-focus:${globals.forms.focusColor}`,
    `--wb-field-pad:${globals.forms.padding}`,
    `--wb-label-color:${globals.forms.labelColor}`,
    `--wb-error-color:${globals.forms.errorColor}`,
    `--wb-container:${globals.layout.containerWidth}`,
    `--wb-section-gap:${globals.layout.sectionGap}`,
    `--wb-column-gap:${globals.layout.columnGap}`,
    `--wb-content-pad:${globals.layout.contentPadding}`,
    `--wb-layout-bg:${globals.layout.background}`,
    `--wb-lightbox-bg:${globals.lightbox.background}`,
    safeCustomVariables(globals.cssVariables),
  ].join(";")

  const typeRule = (tag: string) =>
    `.wb-type-${tag}{font-family:var(--wb-font-heading);font-size:var(--wb-${tag}-size);font-weight:var(--wb-${tag}-weight);line-height:var(--wb-${tag}-leading);color:var(--wb-color-text)}`

  return [
    `.wb-canvas,.wb-site{${vars}}`,
    `.wb-site{font-family:var(--wb-font-body);color:var(--wb-color-text);background:var(--wb-layout-bg)}`,
    `.wb-canvas{font-family:var(--wb-font-body);color:var(--wb-color-text);background:var(--wb-color-background)}`,
    `.wb-container{max-width:var(--wb-container);margin-inline:auto;width:100%;padding-inline:var(--wb-content-pad)}`,
    `.wb-section-stack{display:flex;flex-direction:column;gap:var(--wb-section-gap)}`,
    `.wb-columns{gap:var(--wb-column-gap)}`,
    ["h1", "h2", "h3", "h4", "h5", "h6"].map(typeRule).join(""),
    `.wb-type-body{font-size:var(--wb-body-size);font-weight:var(--wb-body-weight);line-height:var(--wb-body-leading)}`,
    `.wb-type-small{font-size:var(--wb-small-size);font-weight:var(--wb-small-weight);line-height:var(--wb-small-leading)}`,
    `.wb-type-link{color:var(--wb-link-color);font-weight:var(--wb-link-weight)}`,
    `.wb-btn{display:inline-flex;align-items:center;justify-content:center;border-radius:var(--wb-btn-radius);padding:var(--wb-btn-py) var(--wb-btn-px);font-size:var(--wb-btn-size);font-weight:var(--wb-btn-weight);border-style:solid;border-width:1px;text-decoration:none}`,
    `.wb-btn-primary{background:var(--wb-btn-primary-bg);color:var(--wb-btn-primary-fg);border-color:var(--wb-btn-primary-border)}`,
    `.wb-btn-primary:hover{background:var(--wb-btn-primary-hover-bg);color:var(--wb-btn-primary-hover-fg)}`,
    `.wb-btn-secondary{background:var(--wb-btn-secondary-bg);color:var(--wb-btn-secondary-fg);border-color:var(--wb-btn-secondary-border)}`,
    `.wb-btn-secondary:hover{background:var(--wb-btn-secondary-hover-bg);color:var(--wb-btn-secondary-hover-fg)}`,
    `.wb-btn-outline{background:var(--wb-btn-outline-bg);color:var(--wb-btn-outline-fg);border-color:var(--wb-btn-outline-border)}`,
    `.wb-btn-outline:hover{background:var(--wb-btn-outline-hover-bg);color:var(--wb-btn-outline-hover-fg)}`,
    `.wb-btn-ghost{background:var(--wb-btn-ghost-bg);color:var(--wb-btn-ghost-fg);border-color:var(--wb-btn-ghost-border)}`,
    `.wb-btn-ghost:hover{background:var(--wb-btn-ghost-hover-bg);color:var(--wb-btn-ghost-hover-fg)}`,
    `.wb-img{border-radius:var(--wb-img-radius);object-fit:var(--wb-img-fit);width:100%;height:auto}`,
    `.wb-field{width:100%;border-radius:var(--wb-field-radius);background:var(--wb-field-bg);border:1px solid var(--wb-field-border);padding:var(--wb-field-pad)}`,
    `.wb-field:focus{outline:2px solid var(--wb-field-focus);border-color:var(--wb-field-focus)}`,
    `.wb-label{color:var(--wb-label-color);font-size:var(--wb-small-size);font-weight:600}`,
    `.wb-form-error{color:var(--wb-error-color);font-size:var(--wb-small-size)}`,
  ].join("")
}

export function asGlobals(value: unknown): BuilderGlobals {
  if (!value || typeof value !== "object") return DEFAULT_GLOBALS
  const incoming = value as Partial<BuilderGlobals>
  return {
    ...DEFAULT_GLOBALS,
    ...incoming,
    colors: { ...DEFAULT_GLOBALS.colors, ...(incoming.colors ?? {}) },
    fonts: { ...DEFAULT_GLOBALS.fonts, ...(incoming.fonts ?? {}) },
    typography: { ...DEFAULT_GLOBALS.typography, ...(incoming.typography ?? {}) },
    buttons: {
      ...DEFAULT_GLOBALS.buttons,
      ...(incoming.buttons ?? {}),
      variants: { ...DEFAULT_GLOBALS.buttons.variants, ...(incoming.buttons?.variants ?? {}) },
    },
    images: { ...DEFAULT_GLOBALS.images, ...(incoming.images ?? {}) },
    forms: { ...DEFAULT_GLOBALS.forms, ...(incoming.forms ?? {}) },
    layout: { ...DEFAULT_GLOBALS.layout, ...(incoming.layout ?? {}) },
    lightbox: { ...DEFAULT_GLOBALS.lightbox, ...(incoming.lightbox ?? {}) },
    palette: incoming.palette?.length ? incoming.palette : DEFAULT_GLOBALS.palette,
    cssVariables: typeof incoming.cssVariables === "string" ? incoming.cssVariables : "",
  }
}
