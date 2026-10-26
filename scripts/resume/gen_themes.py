"""Resume theme catalog (tokens + layout preset). Emits backend/resources/resume/themes.json and the frontend copy."""
import json, sys
ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
def W(t, **p): return {"type": t, "props": p}
THEMES = {
 "code-noir": {
  "key": "code-noir", "name_fa": "کد نوآر", "name_en": "Code Noir", "audience": "developer",
  "description_fa": "تیره و برنامه‌نویسی، حس ترمینال با نور نارنجی و زرد", "description_en": "Dark, terminal-inspired, for developers",
  "tokens": {
   "light": {"--bg": "#f7f6f3", "--surface": "#ffffff", "--text": "#14151d", "--muted": "#5c6078", "--border": "#e2e2ea", "--accent": "#c8401c", "--accent-fg": "#ffffff", "--accent-2": "#b38600"},
   "dark":  {"--bg": "#0a0b10", "--surface": "#11121a", "--text": "#e6e7ee", "--muted": "#8b8fa8", "--border": "#23253a", "--accent": "#e8502a", "--accent-fg": "#ffffff", "--accent-2": "#ffd23f"},
   "font_fa": "\"Yekan Bakh\", Vazirmatn, sans-serif", "font_en": "Inter, \"Yekan Bakh\", sans-serif", "font_mono": "ui-monospace, \"JetBrains Mono\", monospace",
   "radius": "16px", "shadow": "0 0 80px color-mix(in srgb, var(--accent) 40%, transparent)", "motion": "reveal-up", "default_mode": "dark"},
  "layout": [W("resume.hero", variant="terminal", show_avatar=True, show_stats=True, show_cta=True), W("resume.about", variant="plain", show_highlights=True),
    W("resume.contacts", variant="cards"), W("resume.experience", variant="timeline", show_skills=True, show_duration=True),
    W("resume.education", variant="cards"), W("resume.honors", variant="grid"), W("resume.publications", variant="list", show_cover=False),
    W("resume.certifications", variant="badges"), W("resume.skills", variant="chips", group_by_category=False), W("resume.languages", variant="chips"),
    W("resume.portfolio", variant="grid", columns=3), W("resume.testimonials", variant="grid"), W("resume.contact_cta", variant="banner")]},
 "atelier-editorial": {
  "key": "atelier-editorial", "name_fa": "آتلیه ادیتوریال", "name_en": "Atelier Editorial", "audience": "academic",
  "description_fa": "مجله‌ای روی کرم گرم با تأکید آجری؛ آکادمیک و مشاوره", "description_en": "Magazine look on warm cream, for academics and consultants",
  "tokens": {
   "light": {"--bg": "#f6f1e8", "--surface": "#fffaf1", "--text": "#1d1a16", "--muted": "#6b6157", "--border": "#e0d6c5", "--accent": "#a0522d", "--accent-fg": "#ffffff", "--accent-2": "#7a3e22"},
   "dark":  {"--bg": "#16130f", "--surface": "#201b16", "--text": "#f3ebdd", "--muted": "#b5a893", "--border": "#3a3128", "--accent": "#d9825a", "--accent-fg": "#16130f", "--accent-2": "#e9b48f"},
   "font_fa": "\"Yekan Bakh\", Vazirmatn, sans-serif", "font_en": "Georgia, \"Times New Roman\", serif", "font_mono": "ui-monospace, monospace",
   "radius": "2px", "shadow": "4px 4px 0 var(--text)", "motion": "fade", "default_mode": "light"},
  "layout": [W("resume.hero", variant="editorial", show_avatar=True, show_stats=True, show_cta=True), W("resume.about", variant="columns", show_highlights=True),
    W("resume.experience", variant="timeline", show_skills=False, show_duration=True), W("resume.education", variant="timeline"),
    W("resume.publications", variant="shelf", show_cover=True), W("resume.honors", variant="list"), W("resume.certifications", variant="list"),
    W("resume.skills", variant="grouped", group_by_category=True), W("resume.languages", variant="meter"), W("resume.portfolio", variant="grid", columns=2),
    W("resume.testimonials", variant="slider"), W("resume.contacts", variant="list"), W("resume.contact_cta", variant="banner")]},
 "aurora-glass": {
  "key": "aurora-glass", "name_fa": "شفق شیشه‌ای", "name_en": "Aurora Glass", "audience": "creative",
  "description_fa": "گرادیان شفق با کارت‌های شیشه‌ای؛ خلاق و استارتاپی", "description_en": "Aurora gradients with glass cards, for creatives and startups",
  "tokens": {
   "light": {"--bg": "#eef1ff", "--surface": "rgba(255,255,255,.65)", "--text": "#14172e", "--muted": "#545a7e", "--border": "rgba(20,23,46,.12)", "--accent": "#c2389c", "--accent-fg": "#ffffff", "--accent-2": "#2377a8"},
   "dark":  {"--bg": "#0b1a3a", "--surface": "rgba(255,255,255,.08)", "--text": "#ffffff", "--muted": "rgba(255,255,255,.72)", "--border": "rgba(255,255,255,.18)", "--accent": "#ff7ad9", "--accent-fg": "#10142a", "--accent-2": "#7ae0ff"},
   "font_fa": "\"Yekan Bakh\", Vazirmatn, sans-serif", "font_en": "Inter, \"Yekan Bakh\", sans-serif", "font_mono": "ui-monospace, monospace",
   "radius": "24px", "shadow": "0 20px 50px rgba(0,0,0,.25)", "motion": "float", "default_mode": "dark"},
  "layout": [W("resume.hero", variant="centered", show_avatar=True, show_stats=True, show_cta=True), W("resume.stats", variant="counter"),
    W("resume.about", variant="card", show_highlights=True), W("resume.portfolio", variant="masonry", columns=3, featured_only=False),
    W("resume.experience", variant="cards", show_skills=True, show_duration=True), W("resume.skills", variant="bars", show_level=True),
    W("resume.education", variant="cards"), W("resume.honors", variant="grid"), W("resume.publications", variant="list"),
    W("resume.certifications", variant="badges"), W("resume.languages", variant="meter"), W("resume.testimonials", variant="slider"),
    W("resume.contacts", variant="icons"), W("resume.contact_cta", variant="glass")]},
  "story": {
  "key": "story", "name_fa": "داستان (Story)", "name_en": "Story", "audience": "personal-brand", "full_page": True,
  "description_fa": "صفحه کامل روایی: نام بزرگ روی پرتره، پارالاکس، هر سابقه یک فصل و مطالعه موردی نمونه‌کارها", "description_en": "Full-page narrative: giant name over a portrait cut-out, parallax, chapters and case studies",
  "tokens": {
   "light": {"--bg": "#0d0a09", "--surface": "#1f1a17", "--text": "#f4ede6", "--muted": "#8b7f78", "--border": "#2a221e", "--accent": "#e8502a", "--accent-fg": "#0d0a09", "--accent-2": "#ff7a4d"},
   "dark":  {"--bg": "#0d0a09", "--surface": "#1f1a17", "--text": "#f4ede6", "--muted": "#8b7f78", "--border": "#2a221e", "--accent": "#e8502a", "--accent-fg": "#0d0a09", "--accent-2": "#ff7a4d"},
   "font_fa": "\"Yekan Bakh\", Vazirmatn, sans-serif", "font_en": "Inter, \"Yekan Bakh\", sans-serif", "font_mono": "ui-monospace, monospace",
   "radius": "28px", "shadow": "0 60px 120px rgba(0,0,0,.55)", "motion": "parallax", "default_mode": "dark"},
  "layout": [W("resume.page_story", variant="default")]},
 "webina-os": {
  "key": "webina-os", "name_fa": "وبینا OS", "name_en": "Webina OS", "audience": "developer", "full_page": True,
  "description_fa": "صفحه کامل به شکل دسکتاپ: ترمینال، گیت‌لاگ سوابق، package.json مهارت‌ها، لانچر پروژه‌ها و جستجوی ⌘K", "description_en": "Full-page desktop OS: terminal, career git log, skills package.json, project launcher and ⌘K search",
  "tokens": {
   "light": {"--bg": "#07080d", "--surface": "#0f1119", "--text": "#e9eaf2", "--muted": "#8a8fa8", "--border": "#232740", "--accent": "#e8502a", "--accent-fg": "#ffffff", "--accent-2": "#ffd23f"},
   "dark":  {"--bg": "#07080d", "--surface": "#0f1119", "--text": "#e9eaf2", "--muted": "#8a8fa8", "--border": "#232740", "--accent": "#e8502a", "--accent-fg": "#ffffff", "--accent-2": "#ffd23f"},
   "font_fa": "\"Yekan Bakh\", Vazirmatn, sans-serif", "font_en": "Inter, \"Yekan Bakh\", sans-serif", "font_mono": "\"JetBrains Mono\", ui-monospace, monospace",
   "radius": "14px", "shadow": "0 30px 80px rgba(0,0,0,.5)", "motion": "os", "default_mode": "dark"},
  "layout": [W("resume.page_os", variant="default")]},
 "vitality": {
  "key": "vitality", "name_fa": "سرزندگی (Vitality)", "name_en": "Vitality", "audience": "health", "full_page": True,
  "description_fa": "صفحه کامل روشن و شیک برای حوزه سلامت: پرتره در قاب قوسی، خط ضربان قلب، تایم‌لاین نبض‌دار و کارت‌های مولکولی", "description_en": "Full-page light, chic health theme: arch portrait, ECG line, pulse timeline and molecule focus cards",
  "tokens": {
   "light": {"--bg": "#fbf4f1", "--surface": "#ffffff", "--text": "#3a2330", "--muted": "#8a6f7a", "--border": "#ead6d2", "--accent": "#c2577a", "--accent-fg": "#ffffff", "--accent-2": "#7d9c8a"},
   "dark":  {"--bg": "#fbf4f1", "--surface": "#ffffff", "--text": "#3a2330", "--muted": "#8a6f7a", "--border": "#ead6d2", "--accent": "#c2577a", "--accent-fg": "#ffffff", "--accent-2": "#7d9c8a"},
   "font_fa": "\"Yekan Bakh\", Vazirmatn, sans-serif", "font_en": "Fraunces, Inter, serif", "font_mono": "\"JetBrains Mono\", ui-monospace, monospace",
   "radius": "26px", "shadow": "0 30px 60px -30px rgba(194,87,122,.35)", "motion": "pulse", "default_mode": "light"},
  "layout": [W("resume.page_vitality", variant="default")]},
 "clinical-journal": {
  "key": "clinical-journal", "name_fa": "ژورنال بالینی", "name_en": "Clinical Journal", "audience": "academic", "full_page": True,
  "description_fa": "صفحه کامل به سبک مقاله علمی: چکیده، بخش‌های شماره‌دار، پرتره در پتری‌دیش و مارپیچ DNA متحرک", "description_en": "Full-page scientific-paper layout: abstract, numbered sections, petri-dish portrait and animated DNA helix",
  "tokens": {
   "light": {"--bg": "#f5f1ea", "--surface": "#fffdf9", "--text": "#1d2a29", "--muted": "#6b7774", "--border": "#ddd6cb", "--accent": "#e1846b", "--accent-fg": "#ffffff", "--accent-2": "#143f3c"},
   "dark":  {"--bg": "#f5f1ea", "--surface": "#fffdf9", "--text": "#1d2a29", "--muted": "#6b7774", "--border": "#ddd6cb", "--accent": "#e1846b", "--accent-fg": "#ffffff", "--accent-2": "#143f3c"},
   "font_fa": "\"Yekan Bakh\", Vazirmatn, sans-serif", "font_en": "Fraunces, Inter, serif", "font_mono": "\"JetBrains Mono\", ui-monospace, monospace",
   "radius": "18px", "shadow": "0 10px 30px -15px rgba(20,63,60,.35)", "motion": "helix", "default_mode": "light"},
  "layout": [W("resume.page_journal", variant="default")]},
 "tide": {
  "key": "tide", "name_fa": "موج و نور (Tide)", "name_en": "Tide", "audience": "health", "full_page": True,
  "description_fa": "صفحه کامل سینمایی با حس شیرجه: از سطح آفتابی آب تا عمق، نور موج‌دار، پرتره در عدسی، سوابق به شکل خط شنا، حوزه‌های تمرکز به شکل سلول و کتابخانه با جلد بازتابی", "description_en": "Full-page cinematic dive: from a sunlit water surface to the deep, caustic light, lens portrait, swim-lane career, cell focus cards and a reflective book library",
  "tokens": {
   "light": {"--bg": "#f6f4ee", "--surface": "#ffffff", "--text": "#10262d", "--muted": "#5d7479", "--border": "#d5e2df", "--accent": "#2a7f86", "--accent-fg": "#ffffff", "--accent-2": "#c2a36b"},
   "dark":  {"--bg": "#f6f4ee", "--surface": "#ffffff", "--text": "#10262d", "--muted": "#5d7479", "--border": "#d5e2df", "--accent": "#2a7f86", "--accent-fg": "#ffffff", "--accent-2": "#c2a36b"},
   "font_fa": "\"Yekan Bakh\", Vazirmatn, sans-serif", "font_en": "Fraunces, Inter, serif", "font_mono": "\"JetBrains Mono\", ui-monospace, monospace",
   "radius": "22px", "shadow": "0 30px 60px -30px rgba(12,44,55,.45)", "motion": "tide", "default_mode": "light"},
  "layout": [W("resume.page_tide", variant="default")]},
}
for p in ["backend/resources/resume/themes.json", "frontend/modules/resume/lib/themes.json"]:
    json.dump(THEMES, open(f"{ROOT}/{p}", "w"), ensure_ascii=False, indent=1)
print("ok")
