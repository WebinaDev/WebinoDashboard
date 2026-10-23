'use client';

/* شعر و ادبیات — admin: poems (beyt-by-beyt stanza editor), taxonomies, Telegram paste importer. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ResolvedAdminRoute } from '@/kernel/types';
import { api } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/api-helpers';

/** Thin adapter over the dashboard's session-cookie `api()` so the ERP page logic ports unchanged. */
type Envelope = { data: { data: any } };
const unwrap = (v: unknown) => (v && typeof v === 'object' && 'meta' in v && 'data' in v ? (v as { data: unknown }).data : v);
const call = async (method: string, path: string, json?: unknown, params?: Record<string, unknown>): Promise<Envelope> => {
  const qs = params ? new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString() : '';
  const out = await api<unknown>(`/api${path}${qs ? `?${qs}` : ''}`, { method, ...(json !== undefined ? { json } : {}) });
  return { data: { data: unwrap(out) } };
};
const apiClient = {
  get: (p: string, o?: { params?: Record<string, unknown> }) => call('GET', p, undefined, o?.params),
  post: (p: string, b?: unknown) => call('POST', p, b ?? {}),
  put: (p: string, b?: unknown) => call('PUT', p, b ?? {}),
  delete: (p: string) => call('DELETE', p),
};
const getAxiosMessage = (e: unknown) => getApiErrorMessage(e);

type Term = { id: number; kind: 'occasion' | 'figure' | 'style' | 'meter'; slug: string; name: string; description?: string | null; sort?: number };
type Stanza = { type: 'title' | 'stanza' | 'refrain'; layout: 'couplet' | 'single'; repeat: number; note?: string | null; lines: string[] };
type Flags = { is_new?: boolean; not_performed?: boolean; rewritten?: boolean };
type Link = { label?: string; url: string };
type PoemForm = {
  id?: number; title: string; slug?: string; excerpt?: string; status: 'draft' | 'published'; occasion_id?: number | null; meter_id?: number | null;
  style_label?: string; pen_name?: string; composed_label?: string; melody_credit?: string; flags: Flags; refrain_after_each: boolean;
  term_ids: number[]; media_ids: number[]; external_links: Link[]; stanzas: Stanza[];
};
type Row = { id: number; slug: string; title: string; status: string; view_count: number; occasion?: Term | null };

const KIND_FA: Record<Term['kind'], string> = { occasion: 'مناسبت', figure: 'شخصیت', style: 'سبک', meter: 'وزن' };
const TYPE_FA: Record<Stanza['type'], string> = { title: 'تیتر', stanza: 'بند', refrain: 'برگردان' };
const empty = (): PoemForm => ({ title: '', status: 'draft', flags: {}, refrain_after_each: true, term_ids: [], media_ids: [], external_links: [], stanzas: [{ type: 'stanza', layout: 'couplet', repeat: 1, lines: [] }] });

const box = 'rounded-lg border border-border bg-card p-4';
const inp = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm';
const btn = 'rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50';
const primary = 'rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50';

export default function PoetryAdminPage(_props: { route?: ResolvedAdminRoute }) {
  const [tab, setTab] = useState<'poems' | 'terms' | 'import'>('poems');
  const [terms, setTerms] = useState<Term[]>([]);
  const [editing, setEditing] = useState<PoemForm | null>(null);
  const [msg, setMsg] = useState('');
  const loadTerms = useCallback(() => apiClient.get('/v1/poetry/terms').then((r) => setTerms(r.data.data ?? [])).catch((e) => setMsg(getAxiosMessage(e))), []);
  useEffect(() => { void loadTerms(); }, [loadTerms]);

  return (
    <div dir="rtl" className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold">شعر و ادبیات</h1>
        <div className="ms-auto flex gap-1">
          {(['poems', 'terms', 'import'] as const).map((t) => (
            <button key={t} type="button" className={`${btn} ${tab === t ? 'bg-muted font-semibold' : ''}`} onClick={() => { setTab(t); setEditing(null); }}>
              {{ poems: 'اشعار', terms: 'دسته‌بندی‌ها', import: 'درون‌ریزی متن' }[t]}
            </button>
          ))}
        </div>
      </div>
      {msg ? <div className="rounded-md bg-destructive/10 p-2 text-sm text-destructive" role="alert" onClick={() => setMsg('')}>{msg}</div> : null}
      {editing ? (
        <PoemEditor initial={editing} terms={terms} onDone={() => { setEditing(null); setTab('poems'); }} onError={setMsg} />
      ) : tab === 'poems' ? (
        <PoemList onEdit={(id) => apiClient.get(`/v1/poetry/poems/${id}`).then((r) => setEditing(fromApi(r.data.data))).catch((e) => setMsg(getAxiosMessage(e)))} onNew={() => setEditing(empty())} onError={setMsg} />
      ) : tab === 'terms' ? (
        <TermManager terms={terms} reload={loadTerms} onError={setMsg} />
      ) : (
        <Importer onReview={(f) => setEditing(f)} onError={setMsg} />
      )}
    </div>
  );
}

function fromApi(d: any): PoemForm {
  return {
    id: d.id, title: d.title ?? '', slug: d.slug, excerpt: d.excerpt ?? '', status: d.status ?? 'draft', occasion_id: d.occasion?.id ?? null, meter_id: d.meter?.id ?? null,
    style_label: d.style_label ?? '', pen_name: d.pen_name ?? '', composed_label: d.composed_label ?? '', melody_credit: d.melody_credit ?? '',
    flags: Array.isArray(d.flags) ? {} : d.flags ?? {}, refrain_after_each: d.refrain_after_each ?? true, term_ids: d.term_ids ?? [], media_ids: d.media_ids ?? [],
    external_links: d.external_links ?? [], stanzas: (d.stanzas ?? []).map((s: Stanza) => ({ type: s.type, layout: s.layout ?? 'couplet', repeat: s.repeat ?? 1, note: s.note ?? '', lines: s.lines ?? [] })),
  };
}

function PoemList({ onEdit, onNew, onError }: { onEdit: (id: number) => void; onNew: () => void; onError: (m: string) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState('');
  const load = useCallback(() => apiClient.get('/v1/poetry/poems', { params: { q: q || undefined, per_page: 50 } }).then((r) => setRows(r.data.data ?? [])).catch((e) => onError(getAxiosMessage(e))), [q, onError]);
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);
  const del = (id: number) => { if (window.confirm('این شعر حذف شود؟')) apiClient.delete(`/v1/poetry/poems/${id}`).then(load).catch((e) => onError(getAxiosMessage(e))); };
  return (
    <div className={box}>
      <div className="mb-3 flex gap-2">
        <input className={inp} placeholder="جستجو در عنوان و مصراع‌ها…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className={primary} onClick={onNew}>شعر جدید</button>
      </div>
      {rows.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">شعری ثبت نشده است.</p> : (
        <table className="w-full text-sm">
          <thead><tr className="border-b text-right"><th className="p-2">عنوان</th><th>مناسبت</th><th>وضعیت</th><th>بازدید</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b">
                <td className="p-2">{r.title}</td><td>{r.occasion?.name ?? '—'}</td><td>{r.status === 'published' ? 'منتشرشده' : 'پیش‌نویس'}</td><td>{r.view_count.toLocaleString('fa-IR')}</td>
                <td className="space-x-1 space-x-reverse text-left"><button type="button" className={btn} onClick={() => onEdit(r.id)}>ویرایش</button><button type="button" className={btn} onClick={() => del(r.id)}>حذف</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function PoemEditor({ initial, terms, onDone, onError }: { initial: PoemForm; terms: Term[]; onDone: () => void; onError: (m: string) => void }) {
  const [f, setF] = useState<PoemForm>(initial);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof PoemForm>(k: K, v: PoemForm[K]) => setF((p) => ({ ...p, [k]: v }));
  const byKind = useMemo(() => (k: Term['kind']) => terms.filter((t) => t.kind === k), [terms]);
  const setStanza = (i: number, patch: Partial<Stanza>) => set('stanzas', f.stanzas.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: number) => { const a = [...f.stanzas]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; set('stanzas', a); };
  const toggleTerm = (id: number) => set('term_ids', f.term_ids.includes(id) ? f.term_ids.filter((x) => x !== id) : [...f.term_ids, id]);
  const save = async () => {
    setSaving(true);
    const body = { ...f, stanzas: f.stanzas.map((s) => ({ ...s, lines: s.lines.map((l) => l.trim()).filter(Boolean) })).filter((s) => s.lines.length), external_links: f.external_links.filter((l) => l.url.trim()) };
    try {
      if (f.id) await apiClient.put(`/v1/poetry/poems/${f.id}`, body); else await apiClient.post('/v1/poetry/poems', body);
      onDone();
    } catch (e) { onError(getAxiosMessage(e)); } finally { setSaving(false); }
  };
  const field = (k: 'title' | 'pen_name' | 'composed_label' | 'melody_credit' | 'style_label' | 'slug', label: string, ph = '') => (
    <label className="space-y-1 text-sm"><span>{label}</span><input className={inp} placeholder={ph} value={(f[k] as string) ?? ''} onChange={(e) => set(k, e.target.value)} /></label>
  );
  return (
    <div className="space-y-4">
      <div className={`${box} grid gap-3 md:grid-cols-2`}>
        {field('title', 'عنوان *')}
        {field('slug', 'نامک (خالی = خودکار)')}
        {field('style_label', 'سبک آزاد', 'نوحه زنجیرزنی حماسی')}
        {field('melody_credit', 'تیتر / ملودی', 'تیتر: ما ادری')}
        {field('pen_name', 'تخلص / امضا', 'طه')}
        {field('composed_label', 'تاریخ سرایش', 'خرداد ۱۳۹۸')}
        <label className="space-y-1 text-sm"><span>مناسبت</span>
          <select className={inp} value={f.occasion_id ?? ''} onChange={(e) => set('occasion_id', e.target.value ? Number(e.target.value) : null)}>
            <option value="">—</option>{byKind('occasion').map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select></label>
        <label className="space-y-1 text-sm"><span>وزن</span>
          <select className={inp} value={f.meter_id ?? ''} onChange={(e) => set('meter_id', e.target.value ? Number(e.target.value) : null)}>
            <option value="">—</option>{byKind('meter').map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select></label>
        <label className="space-y-1 text-sm md:col-span-2"><span>خلاصه</span><textarea className={inp} rows={2} value={f.excerpt ?? ''} onChange={(e) => set('excerpt', e.target.value)} /></label>
        <div className="flex flex-wrap gap-4 text-sm md:col-span-2">
          {([['is_new', 'جدید'], ['not_performed', 'خوانده نشده'], ['rewritten', 'بازنویسی']] as const).map(([k, l]) => (
            <label key={k} className="flex items-center gap-1"><input type="checkbox" checked={!!f.flags[k]} onChange={(e) => set('flags', { ...f.flags, [k]: e.target.checked })} />{l}</label>
          ))}
          <label className="flex items-center gap-1"><input type="checkbox" checked={f.refrain_after_each} onChange={(e) => set('refrain_after_each', e.target.checked)} />تکرار خودکار برگردان پس از هر بند</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={f.status === 'published'} onChange={(e) => set('status', e.target.checked ? 'published' : 'draft')} />منتشر شود</label>
        </div>
      </div>

      <div className={box}>
        <h2 className="mb-2 font-semibold">شخصیت‌ها و سبک‌ها</h2>
        {(['figure', 'style'] as const).map((k) => (
          <div key={k} className="mb-2 flex flex-wrap gap-1.5">
            <span className="text-sm text-muted-foreground">{KIND_FA[k]}:</span>
            {byKind(k).map((t) => (
              <button key={t.id} type="button" onClick={() => toggleTerm(t.id)} className={`rounded-full border px-2.5 py-0.5 text-xs ${f.term_ids.includes(t.id) ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>{t.name}</button>
            ))}
          </div>
        ))}
      </div>

      <div className={`${box} space-y-3`}>
        <h2 className="font-semibold">متن شعر (هر مصراع یک خط؛ در چیدمان بیتی هر دو خط یک بیت)</h2>
        {f.stanzas.map((s, i) => (
          <div key={i} className="space-y-2 rounded-md border border-dashed border-border p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <select className="rounded-md border px-2 py-1" value={s.type} onChange={(e) => setStanza(i, { type: e.target.value as Stanza['type'] })}>
                {(Object.keys(TYPE_FA) as Stanza['type'][]).map((t) => <option key={t} value={t}>{TYPE_FA[t]}</option>)}
              </select>
              <select className="rounded-md border px-2 py-1" value={s.layout} onChange={(e) => setStanza(i, { layout: e.target.value as Stanza['layout'] })}>
                <option value="couplet">بیتی (دو مصراع)</option><option value="single">تک‌سطری</option>
              </select>
              <label className="flex items-center gap-1">تکرار ×<input type="number" min={1} max={10} className="w-14 rounded-md border px-1 py-0.5" value={s.repeat} onChange={(e) => setStanza(i, { repeat: Math.max(1, Number(e.target.value) || 1) })} /></label>
              <span className="ms-auto flex gap-1">
                <button type="button" className={btn} onClick={() => move(i, -1)} aria-label="بالا">↑</button>
                <button type="button" className={btn} onClick={() => move(i, 1)} aria-label="پایین">↓</button>
                <button type="button" className={btn} onClick={() => set('stanzas', f.stanzas.filter((_, j) => j !== i))}>حذف</button>
              </span>
            </div>
            <textarea className={`${inp} leading-8`} rows={Math.max(3, s.lines.length + 1)} value={s.lines.join('\n')} onChange={(e) => setStanza(i, { lines: e.target.value.split('\n') })} />
          </div>
        ))}
        <div className="flex gap-2">
          <button type="button" className={btn} onClick={() => set('stanzas', [...f.stanzas, { type: 'stanza', layout: 'couplet', repeat: 1, lines: [] }])}>+ بند</button>
          <button type="button" className={btn} onClick={() => set('stanzas', [...f.stanzas, { type: 'refrain', layout: 'couplet', repeat: 2, lines: [] }])}>+ برگردان</button>
        </div>
      </div>

      <div className={`${box} space-y-2`}>
        <h2 className="font-semibold">رسانه و پیوندها</h2>
        <label className="block space-y-1 text-sm"><span>شناسه فایل‌های رسانه (صوت/ویدیو از کتابخانه رسانه، با کاما)</span>
          <input className={inp} dir="ltr" value={f.media_ids.join(',')} onChange={(e) => set('media_ids', e.target.value.split(/[,،\s]+/).map(Number).filter((n) => n > 0))} /></label>
        {f.external_links.map((l, i) => (
          <div key={i} className="flex gap-2">
            <input className={inp} placeholder="عنوان (ایتا/تلگرام)" value={l.label ?? ''} onChange={(e) => set('external_links', f.external_links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
            <input className={inp} dir="ltr" placeholder="https://eitaa.com/…" value={l.url} onChange={(e) => set('external_links', f.external_links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
            <button type="button" className={btn} onClick={() => set('external_links', f.external_links.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <button type="button" className={btn} onClick={() => set('external_links', [...f.external_links, { label: '', url: '' }])}>+ پیوند پست</button>
      </div>

      <div className="flex gap-2">
        <button type="button" className={primary} disabled={saving || !f.title.trim()} onClick={save}>{saving ? 'در حال ذخیره…' : 'ذخیره'}</button>
        <button type="button" className={btn} onClick={onDone}>انصراف</button>
      </div>
    </div>
  );
}

function TermManager({ terms, reload, onError }: { terms: Term[]; reload: () => Promise<unknown>; onError: (m: string) => void }) {
  const [kind, setKind] = useState<Term['kind']>('figure');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const add = () => apiClient.post('/v1/poetry/terms', { kind, name, slug: slug || undefined }).then(() => { setName(''); setSlug(''); return reload(); }).catch((e) => onError(getAxiosMessage(e)));
  const rename = (t: Term) => { const n = window.prompt('نام جدید', t.name); if (n && n !== t.name) apiClient.put(`/v1/poetry/terms/${t.id}`, { name: n }).then(reload).catch((e) => onError(getAxiosMessage(e))); };
  const del = (t: Term) => { if (window.confirm(`«${t.name}» حذف شود؟`)) apiClient.delete(`/v1/poetry/terms/${t.id}`).then(reload).catch((e) => onError(getAxiosMessage(e))); };
  return (
    <div className={`${box} space-y-3`}>
      <div className="flex flex-wrap gap-1">{(Object.keys(KIND_FA) as Term['kind'][]).map((k) => <button key={k} type="button" className={`${btn} ${kind === k ? 'bg-muted font-semibold' : ''}`} onClick={() => setKind(k)}>{KIND_FA[k]}</button>)}</div>
      <div className="flex gap-2">
        <input className={inp} placeholder={`نام ${KIND_FA[kind]}`} value={name} onChange={(e) => setName(e.target.value)} />
        <input className={inp} dir="ltr" placeholder="slug (اختیاری)" value={slug} onChange={(e) => setSlug(e.target.value)} />
        <button type="button" className={primary} disabled={!name.trim()} onClick={add}>افزودن</button>
      </div>
      <ul className="divide-y text-sm">
        {terms.filter((t) => t.kind === kind).map((t) => (
          <li key={t.id} className="flex items-center gap-2 py-1.5"><span>{t.name}</span><code className="text-xs text-muted-foreground" dir="ltr">{t.slug}</code>
            <span className="ms-auto flex gap-1"><button type="button" className={btn} onClick={() => rename(t)}>ویرایش</button><button type="button" className={btn} onClick={() => del(t)}>حذف</button></span></li>
        ))}
      </ul>
    </div>
  );
}

function Importer({ onReview, onError }: { onReview: (f: PoemForm) => void; onError: (m: string) => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const parse = async () => {
    setBusy(true);
    try {
      const d = (await apiClient.post('/v1/poetry/import/parse', { text })).data.data;
      setWarnings(d.warnings ?? []);
      onReview({ ...empty(), title: d.title ?? '', pen_name: d.pen_name ?? '', composed_label: d.composed_label ?? '', melody_credit: d.melody_credit ?? '', style_label: d.style_label ?? '', flags: d.flags ?? {}, stanzas: d.stanzas ?? [] });
    } catch (e) { onError(getAxiosMessage(e)); } finally { setBusy(false); }
  };
  return (
    <div className={`${box} space-y-3`}>
      <p className="text-sm text-muted-foreground">متن شعر را همان‌طور که در تلگرام/ایتا منتشر شده بچسبانید. بندها با «...» جدا می‌شوند؛ تزئینات، ایموجی و شناسه کانال حذف و امضا/تاریخ به فیلدها منتقل می‌شود. پیش از ذخیره، نتیجه در ویرایشگر برای بازبینی باز می‌شود.</p>
      <textarea className={`${inp} leading-8`} rows={14} value={text} onChange={(e) => setText(e.target.value)} />
      {warnings.length ? <ul className="list-disc ps-5 text-sm text-amber-600">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul> : null}
      <button type="button" className={primary} disabled={busy || !text.trim()} onClick={parse}>{busy ? 'در حال تجزیه…' : 'تجزیه و بازبینی'}</button>
    </div>
  );
}
