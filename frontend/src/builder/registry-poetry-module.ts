/* Poetry module widgets: data comes from /v1/public/poetry (Poetry module). Renderers: render/poetry-module-widgets.tsx. */
import { uid } from "./ids"
import type { WidgetDef } from "./types"

export const POETRY_MODULE_WIDGET_TYPES = ["poem-detail", "poetry-figure", "poem-search"] as const

export const POETRY_MODULE_WIDGETS: WidgetDef[] = [
  {
    type: "poem-detail", label: "متن شعر (بیت‌به‌بیت)", category: "content",
    fields: [
      { kind: "text", key: "slug", label: "نامک شعر (خالی = از نشانی ?poem=)" },
      { kind: "switch", key: "showMeta", label: "نمایش مشخصات (سبک، تاریخ، تخلص)" },
      { kind: "switch", key: "showTools", label: "دکمه‌های کپی/چاپ/دانلود" },
      { kind: "switch", key: "showRelated", label: "اشعار مرتبط" },
      { kind: "link", key: "listHref", label: "صفحه فهرست اشعار" },
    ],
    create: () => ({ id: uid("w"), type: "poem-detail", props: { slug: "", showMeta: true, showTools: true, showRelated: true, listHref: "/poems" } }),
  },
  {
    type: "poetry-figure", label: "صفحه شخصیت (اشعار هر معصوم/شخصیت)", category: "content",
    fields: [
      { kind: "text", key: "slug", label: "نامک شخصیت (خالی = از نشانی ?figure=)" },
      { kind: "link", key: "detailHref", label: "صفحه متن شعر" },
      { kind: "number", key: "perPage", label: "تعداد در صفحه" },
    ],
    create: () => ({ id: uid("w"), type: "poetry-figure", props: { slug: "", detailHref: "/poem", perPage: 12 } }),
  },
  {
    type: "poem-search", label: "جستجو و فیلتر اشعار", category: "content",
    fields: [
      { kind: "text", key: "title", label: "عنوان" },
      { kind: "link", key: "detailHref", label: "صفحه متن شعر" },
      { kind: "switch", key: "showFilters", label: "فیلتر مناسبت/شخصیت/سبک" },
      { kind: "number", key: "perPage", label: "تعداد در صفحه" },
    ],
    create: () => ({ id: uid("w"), type: "poem-search", props: { title: "جستجوی اشعار", detailHref: "/poem", showFilters: true, perPage: 12 } }),
  },
]
