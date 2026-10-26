# resume.* page-builder widgets (shared contract with ERP)

Same `type` and prop names in WebinoDashboard and WebinoERP. Data source: `GET /api/v1/public/resume/full`.
Registry: `frontend/src/builder/registry-resume.ts`; renderers: `render/resume-widgets.tsx`, full pages `render/resume-pages.tsx`.

## Common props (every widget)
| prop | type | default | meaning |
|---|---|---|---|
| `variant` | string | first variant | layout variant (below) |
| `title` | string | "" | heading; empty = section default in the page language |
| `subtitle` | string | "" | |
| `limit` | number | 0 | max items (0 = all) |
| `order_by` | `order` \| `date` | `order` | dashboard order or newest first |
| `show_placeholder` | bool | false | include `is_placeholder` («نمونه») rows |
| `lang` | `auto` \| `fa` \| `en` | `auto` | auto = page language |
| `anchor_id` | string | "" | section id (defaults: contact, portfolio, experience, about) |
| `full_width` | bool | true | 1200px vs 960px container |

## Widgets
| type | variants | extra props |
|---|---|---|
| `resume.hero` | split, centered, terminal, editorial | `show_avatar`, `show_stats`, `show_cta` (bool), `cta_label`, `cta_target` |
| `resume.about` | plain, columns, card | `show_highlights` |
| `resume.contacts` | icons, list, cards | `types_filter` (comma list of contact types) |
| `resume.experience` | timeline, cards, compact | `show_skills`, `show_duration`, `collapse_description` |
| `resume.education` | timeline, cards | — |
| `resume.honors` | grid, list | — |
| `resume.publications` | shelf, list | `kinds_filter` (comma list), `show_cover` |
| `resume.certifications` | badges, list | — |
| `resume.skills` | chips, bars, grouped | `group_by_category`, `show_level`, `category` |
| `resume.languages` | chips, meter | — |
| `resume.portfolio` | grid, masonry, slider | `featured_only`, `columns` (1–4) |
| `resume.stats` | counter, inline | — |
| `resume.testimonials` | slider, grid | — |
| `resume.volunteering` | list, cards | — |
| `resume.courses` | list, grid | — |
| `resume.contact_cta` | banner, glass, minimal | `heading`, `body`, `primary_contact_type`, `show_form` (phase 2) |
| `resume.lang_switch` | pill, text | `fa_href` ("/"), `en_href` ("/en") |
| `resume.page_story` | default | `fa_href`, `en_href` — full-page «Story» theme |
| `resume.page_os` | default | `fa_href`, `en_href` — full-page «Webina OS» theme (⌘K palette) |
| `resume.download_pdf` | button | `template`, `label` — phase 2 (renders disabled) |

Theme layout presets (`themes.json → layout`) are lists of `{type, props}` using only these widgets; apply-layout wraps each in a
full-width section (`columns[0].span = 12`) and adds `lang` + `show_placeholder:false`.
