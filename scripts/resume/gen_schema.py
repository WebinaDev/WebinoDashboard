"""Canonical Resume schema generator. Emits:
 - backend/resources/resume/schema.json, frontend/modules/resume/lib/schema.json (identical)
 - backend migration (explicit columns)
 - backend models
Run from repo root: python3 scripts/resume/gen_schema.py
"""
import json, os, sys
ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
SKILL_CATS = ["backend","frontend","cms","devops","tools","design","soft","health","research","writing","other"]
CONTACT_TYPES = ["phone","email","website","linkedin","github","telegram","whatsapp","instagram","x","youtube","dribbble","behance","gitlab","stackoverflow","bale","eitaa","orcid","researchgate","scholar","other"]
def F(key, type, i18n=False, **kw):
    d = {"key": key, "type": type, "i18n": i18n}; d.update(kw); return d
S = [
 dict(slug="identity", table="resume_identity", model="ResumeIdentity", single=True, label_fa="هویت", label_en="Identity", icon="user", fields=[
   F("full_name","text",True,required=True,max=160), F("headline","text",True,max=255), F("location","text",True,max=160),
   F("avatar_media_id","media"), F("cover_media_id","media"), F("career_start_year","int",min=1950,max=2100),
   F("open_to_work","bool"), F("birth_date","date",private=True), F("nationality","text",True,max=80)]),
 dict(slug="about", table="resume_about", model="ResumeAbout", single=True, label_fa="درباره", label_en="About", icon="file-text", fields=[
   F("body","richtext",True), F("highlights","list",True)]),
 dict(slug="contacts", table="resume_contacts", model="ResumeContact", label_fa="راه‌های ارتباطی", label_en="Contact & links", icon="at-sign", title="value", fields=[
   F("type","select",options=CONTACT_TYPES,required=True), F("value","text",required=True,max=500), F("label","text",True,max=120), F("icon","text",max=60), F("is_primary","bool")]),
 dict(slug="experiences", table="resume_experiences", model="ResumeExperience", label_fa="سوابق کاری", label_en="Work experience", icon="briefcase", title="title", fields=[
   F("title","text",True,required=True,max=200), F("company","text",True,max=200), F("company_logo_media_id","media"), F("company_url","url"),
   F("employment_type","select",options=["full_time","part_time","freelance","self_employed","internship","contract"]),
   F("location","text",True,max=160), F("location_type","select",options=["onsite","remote","hybrid"]),
   F("period","range"), F("description","richtext",True), F("achievements","list",True), F("skill_ids","skills"), F("media_ids","media_list")]),
 dict(slug="educations", table="resume_educations", model="ResumeEducation", label_fa="تحصیلات و تجربیات آکادمیک", label_en="Education & academic", icon="graduation-cap", title="school", fields=[
   F("school","text",True,required=True,max=200), F("degree","text",True,max=160), F("field","text",True,max=200), F("grade","text",max=60),
   F("period","range"), F("activities","textarea",True), F("description","richtext",True), F("media_ids","media_list")]),
 dict(slug="honors", table="resume_honors", model="ResumeHonor", label_fa="افتخارات", label_en="Honors & awards", icon="award", title="title", fields=[
   F("title","text",True,required=True,max=200), F("issuer","text",True,max=200), F("date","date"), F("description","textarea",True),
   F("associated_experience_id","ref",ref="experiences"), F("media_ids","media_list")]),
 dict(slug="publications", table="resume_publications", model="ResumePublication", label_fa="نشرها (مقاله، کتاب...)", label_en="Publications", icon="book-open", title="title", fields=[
   F("kind","select",options=["article","book","paper","chapter","blog","talk"],required=True), F("title","text",True,required=True,max=300),
   F("publisher","text",True,max=200), F("date","date"), F("url","url"), F("isbn","text",max=40), F("doi","text",max=120),
   F("co_authors","list",True), F("description","textarea",True), F("cover_media_id","media"), F("links","json")]),
 dict(slug="certifications", table="resume_certifications", model="ResumeCertification", label_fa="گواهینامه‌ها", label_en="Certifications", icon="badge-check", title="name", fields=[
   F("name","text",True,required=True,max=200), F("issuer","text",True,max=200), F("issue_date","date"), F("expire_date","date"),
   F("credential_id","text",max=120), F("credential_url","url"), F("media_ids","media_list")]),
 dict(slug="skills", table="resume_skills", model="ResumeSkill", label_fa="مهارت‌ها", label_en="Skills", icon="sparkles", title="name", fields=[
   F("name","text",True,required=True,max=120), F("category","select",options=SKILL_CATS), F("level","int",min=1,max=5), F("years","int",min=0,max=60), F("endorsements_count","int",min=0,max=100000)]),
 dict(slug="languages", table="resume_languages", model="ResumeLanguage", label_fa="زبان‌ها", label_en="Languages", icon="languages", title="name", fields=[
   F("name","text",True,required=True,max=80), F("proficiency","select",options=["native","full","professional","limited","elementary"],required=True)]),
 dict(slug="projects", table="resume_projects", model="ResumeProject", label_fa="نمونه‌کارها", label_en="Portfolio", icon="layout-grid", title="title", fields=[
   F("title","text",True,required=True,max=200), F("role","text",True,max=160), F("summary","textarea",True), F("url","url"), F("repo_url","url"),
   F("cover_media_id","media"), F("gallery_media_ids","media_list"), F("tags","list"), F("period","range"), F("featured","bool"), F("skill_ids","skills")]),
 dict(slug="volunteering", table="resume_volunteering", model="ResumeVolunteering", label_fa="فعالیت‌های داوطلبانه", label_en="Volunteering", icon="heart-handshake", title="role", fields=[
   F("role","text",True,required=True,max=160), F("organization","text",True,max=200), F("cause","text",True,max=120), F("period","range"), F("description","textarea",True)]),
 dict(slug="courses", table="resume_courses", model="ResumeCourse", label_fa="دوره‌ها", label_en="Courses", icon="library", title="name", fields=[
   F("name","text",True,required=True,max=200), F("institution","text",True,max=200), F("date","date"), F("url","url")]),
 dict(slug="testimonials", table="resume_testimonials", model="ResumeTestimonial", label_fa="توصیه‌نامه‌ها", label_en="Recommendations", icon="quote", title="author", fields=[
   F("author","text",True,required=True,max=160), F("author_title","text",True,max=200), F("avatar_media_id","media"), F("body","textarea",True,required=True), F("relation","text",True,max=200)]),
 dict(slug="stats", table="resume_stats", model="ResumeStat", label_fa="آمار", label_en="Stats", icon="bar-chart-3", title="label", fields=[
   F("label","text",True,required=True,max=120), F("value","text",required=True,max=40), F("icon","text",max=60)]),
 dict(slug="settings", table="resume_settings", model="ResumeSetting", single=True, label_fa="تم و نمایش", label_en="Theme & display", icon="palette", fields=[
   F("theme_key","select",options=["code-noir","atelier-editorial","aurora-glass","story","webina-os","vitality","clinical-journal"]), F("accent","color"), F("accent_dark","color"),
   F("mode","select",options=["system","light","dark"]), F("date_calendar","select",options=["auto","jalali","gregorian"]),
   F("languages","list"), F("default_lang","select",options=["fa","en"]), F("section_order","list"), F("seo","json"),
   F("private_token","text",max=64), F("pdf_template","text",max=60)]),
]
schema = {"version": 1, "sections": S, "date_precision": ["year","month","day"], "visibility": ["public","hidden","private_link"]}

def cols(f):
    k, t = f["key"], f["type"]
    names = [k+"_fa", k+"_en"] if f["i18n"] else [k]
    out = []
    for n in names:
        if t in ("text","select","url","color"): out.append(f"$t->string('{n}', {f.get('max',500 if t=='url' else 255)})->nullable();")
        elif t in ("textarea","richtext"): out.append(f"$t->text('{n}')->nullable();")
        elif t in ("list","media_list","skills","json","date"): out.append(f"$t->json('{n}')->nullable();")
        elif t == "media": out.append(f"$t->unsignedBigInteger('{n}')->nullable();")
        elif t == "ref": out.append(f"$t->unsignedBigInteger('{n}')->nullable();")
        elif t == "int": out.append(f"$t->integer('{n}')->nullable();")
        elif t == "bool": out.append(f"$t->boolean('{n}')->default(false);")
        elif t == "range": out += ["$t->json('start')->nullable();","$t->json('end')->nullable();","$t->boolean('is_current')->default(false);"]
    return out

def casts(f):
    k,t=f["key"],f["type"]; names=[k+"_fa",k+"_en"] if f["i18n"] else [k]
    m={"list":"array","media_list":"array","skills":"array","json":"array","date":"array","int":"integer","bool":"boolean","media":"integer","ref":"integer"}
    if t=="range": return {"start":"array","end":"array","is_current":"boolean"}
    return {n:m[t] for n in names if t in m}

for p in ["backend/resources/resume","frontend/modules/resume/lib"]:
    os.makedirs(f"{ROOT}/{p}", exist_ok=True)
    json.dump(schema, open(f"{ROOT}/{p}/schema.json","w"), ensure_ascii=False, indent=1)

mig = ["<?php","","use Illuminate\\Database\\Migrations\\Migration;","use Illuminate\\Database\\Schema\\Blueprint;","use Illuminate\\Support\\Facades\\Schema;","",
"/** Resume module v2: one table per LinkedIn-like section (generated by scripts/resume/gen_schema.py — edit the script, then add a NEW migration for changes). */",
"return new class extends Migration","{","    public function up(): void","    {"]
for s in S:
    mig.append(f"        Schema::create('{s['table']}', function (Blueprint $t) {{")
    mig.append("            $t->id();")
    mig.append("            $t->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();")
    if not s.get("single"):
        mig += ["            $t->unsignedInteger('order')->default(0);","            $t->string('visibility', 16)->default('public');"]
    mig.append("            $t->boolean('is_placeholder')->default(false);")
    for f in s["fields"]:
        for c in cols(f): mig.append("            "+c)
    mig.append("            $t->timestamps();")
    mig.append("            $t->unique('tenant_id');" if s.get("single") else "            $t->index(['tenant_id', 'order']);")
    mig.append("        });")
mig += ["    }","","    public function down(): void","    {"]
for s in reversed(S): mig.append(f"        Schema::dropIfExists('{s['table']}');")
mig += ["    }","};",""]
open(f"{ROOT}/backend/database/migrations/2026_10_26_120000_create_resume_v2_tables.php","w").write("\n".join(mig))

os.makedirs(f"{ROOT}/backend/app/Models/Resume", exist_ok=True)
for s in S:
    c = {}
    for f in s["fields"]: c.update(casts(f))
    c["is_placeholder"]="boolean"
    if not s.get("single"): c["order"]="integer"
    cs = ", ".join(f"'{k}' => '{v}'" for k,v in c.items())
    open(f"{ROOT}/backend/app/Models/Resume/{s['model']}.php","w").write(f"""<?php

namespace App\\Models\\Resume;

/** Resume section «{s['label_fa']}» ({s['slug']}). Generated by scripts/resume/gen_schema.py. */
class {s['model']} extends ResumeEntity
{{
    public const SECTION = '{s['slug']}';

    protected $table = '{s['table']}';

    protected $casts = [{cs}];
}}
""")
print("ok")
