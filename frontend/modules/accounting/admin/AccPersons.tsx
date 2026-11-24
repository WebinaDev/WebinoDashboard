'use client';

import { useTranslations } from 'next-intl';

import { useState, useCallback, useEffect } from 'react';
import apiClient from '@/features/modules/accounting/lib/api-client';
import { normalizeListPayload } from '@/lib/list-utils';
import { getAxiosMessage } from '@/features/modules/accounting/lib/api-helpers';
import { accountingWpAction } from '@/features/modules/accounting/lib/accounting-wp';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Pagination } from '@/components/ui/pagination';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

type Person = {
  id: number;
  name: string;
  type: string;
  national_id: string;
  economic_code: string;
  mobile: string;
  address: string;
  category_id: number | null;
};

type Category = { id: number; name: string };

const BLANK = {
  name: '',
  type: 'individual',
  national_id: '',
  economic_code: '',
  mobile: '',
  address: '',
  category_id: '',
};

export default function AccPersons() {
  const t = useTranslations();

  const [rows, setRows] = useState<Person[]>([]);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');

  const [categories, setCategories] = useState<Category[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Person | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({ ...BLANK });

  const [deleteTarget, setDeleteTarget] = useState<Person | null>(null);

  const fetchRows = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = { page: p, per_page: 25 };
      if (query) params.q = query;
      const res = await apiClient.get('/v1/erp-accounting/persons', { params });
      const raw = res.data as Record<string, unknown>;
      const pg = (raw.current_page != null ? raw : (raw.data as Record<string, unknown>) ?? raw);
      setRows(normalizeListPayload(pg) as unknown as Person[]);
      setPageCount(Number(pg.last_page) || 1);
      setTotal(Number(pg.total) || 0);
      setPage(Number(pg.current_page) || p);
    } catch (e) {
      setError(getAxiosMessage(e));
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { void fetchRows(1); }, [fetchRows]);

  useEffect(() => {
    accountingWpAction<Category[]>('person_categories').then(setCategories).catch(() => {});
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...BLANK });
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (row: Person) => {
    setEditing(row);
    setForm({
      name: row.name ?? '',
      type: row.type ?? 'individual',
      national_id: row.national_id ?? '',
      economic_code: row.economic_code ?? '',
      mobile: row.mobile ?? '',
      address: row.address ?? '',
      category_id: row.category_id ? String(row.category_id) : '',
    });
    setFormError(null);
    setFormOpen(true);
  };

  const save = useCallback(async () => {
    setSaving(true);
    setFormError(null);
    try {
      const body: Record<string, unknown> = {
        name: form.name,
        type: form.type,
        national_id: form.national_id,
        economic_code: form.economic_code,
        mobile: form.mobile,
        address: form.address,
        category_id: form.category_id ? Number(form.category_id) : null,
      };
      if (editing?.id) body.id = editing.id;
      await accountingWpAction('person_save', body);
      setFormOpen(false);
      void fetchRows(page);
    } catch (e) {
      setFormError(getAxiosMessage(e));
    } finally {
      setSaving(false);
    }
  }, [editing, form, page, fetchRows]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await accountingWpAction('person_delete', { id: deleteTarget.id });
      setDeleteTarget(null);
      void fetchRows(page);
    } catch (e) {
      setError(getAxiosMessage(e));
      setDeleteTarget(null);
    }
  }, [deleteTarget, page, fetchRows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="max-w-xs"
          placeholder={t('auto.accounting_AccPersons.s_36ac1eb8')}
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && setQuery(searchInput)}
        />
        <Button variant="outline" size="sm" onClick={() => setQuery(searchInput)}>{t('auto.accounting_AccPersons.s_1fc039e0')}</Button>
        <div className="flex-1" />
        <Button size="sm" onClick={openCreate}>{t('auto.accounting_AccPersons.s_e34fff4e')}</Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && <p className="text-sm text-muted-foreground">{t('auto.accounting_AccPersons.s_51617f69')}</p>}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-3 py-2 text-start font-medium">{t('auto.accounting_AccPersons.s_acc84041')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('auto.accounting_AccPersons.s_45dd06ba')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('auto.accounting_AccPersons.s_d2e35a1f')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('auto.accounting_AccPersons.s_20ebbb2c')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('auto.accounting_AccPersons.s_f41bba2f')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('auto.accounting_AccPersons.s_8d1cc546')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id} className="border-b">
                <td className="px-3 py-2">{row.id}</td>
                <td className="px-3 py-2">{row.name}</td>
                <td className="px-3 py-2">
                  <Badge variant="outline">{row.type === 'company' ? t('auto.accounting_AccPersons.s_6cee60b1') : t('auto.accounting_AccPersons.s_2d3bcc90')}</Badge>
                </td>
                <td className="px-3 py-2">{row.national_id}</td>
                <td className="px-3 py-2">{row.mobile}</td>
                <td className="px-3 py-2 gap-x-1 rtl:gap-x-reverse">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>{t('auto.accounting_AccPersons.s_ac60ae7a')}</Button>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteTarget(row)}>{t('auto.accounting_AccPersons.s_2d2bbdc2')}</Button>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">{t('auto.accounting_AccPersons.s_35e7797d')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <Pagination page={page} pageCount={pageCount} total={total} onPageChange={p => fetchRows(p)} />
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? t('auto.accounting_AccPersons.s_ceb7228d') : t('auto.accounting_AccPersons.s_8c09348e')}</DialogTitle>
            <DialogDescription>{editing ? t('auto.accounting_AccPersons.s_5f836c4b') : t('auto.accounting_AccPersons.s_e9501255')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">{t('auto.accounting_AccPersons.s_45dd06ba')}</label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('auto.accounting_AccPersons.s_d2e35a1f')}</label>
              <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">{t('auto.accounting_AccPersons.s_2d3bcc90')}</SelectItem>
                  <SelectItem value="company">{t('auto.accounting_AccPersons.s_6cee60b1')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('auto.accounting_AccPersons.s_20ebbb2c')}</label>
              <Input value={form.national_id} onChange={e => setForm({ ...form, national_id: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('auto.accounting_AccPersons.s_d0dc2d70')}</label>
              <Input value={form.economic_code} onChange={e => setForm({ ...form, economic_code: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('auto.accounting_AccPersons.s_f41bba2f')}</label>
              <Input value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('auto.accounting_AccPersons.s_10fa5ce9')}</label>
              <Textarea value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} rows={2} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('auto.accounting_AccPersons.s_a4dfaeb7')}</label>
              <Select value={form.category_id || undefined} onValueChange={v => setForm({ ...form, category_id: v })}>
                <SelectTrigger><SelectValue placeholder={t('auto.accounting_AccPersons.s_315c72ae')} /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>{t('auto.accounting_AccPersons.s_106dfb4e')}</Button>
            <Button onClick={save} disabled={saving}>{saving ? t('auto.accounting_AccPersons.s_4b7554d6') : t('auto.accounting_AccPersons.s_08545fb6')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('auto.accounting_AccPersons.s_d3594711')}</AlertDialogTitle>
            <AlertDialogDescription>{t('common.confirmDeleteNamedIrreversible', { name: deleteTarget?.name ?? '' })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('auto.accounting_AccPersons.s_106dfb4e')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>{t('auto.accounting_AccPersons.s_2d2bbdc2')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
