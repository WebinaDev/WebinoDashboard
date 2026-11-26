'use client';

import { useState } from 'react';
import { LocaleDatePicker } from "@/components/LocaleDatePicker";
import { useTranslations } from 'next-intl';
import { useLocaleNext } from '@/hooks/use-locale-next';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/features/modules/accounting/lib/api-client';
import { accountingWpAction } from '@/features/modules/accounting/lib/accounting-wp';
import { getAxiosMessage } from '@/features/modules/accounting/lib/api-helpers';
import { normalizeListPayload } from '@/lib/list-utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/**
 * The API answers with the entity's own column names (`starts_on`, `ends_on`,
 * `is_closed`). Older payloads used `start_date` / `end_date` / `is_active`, and the page
 * used to read only those - which left every date column blank and the status badge stuck
 * on "inactive". Both spellings are accepted so a cached payload still renders.
 */
type FiscalYear = {
  id: number;
  title: string;
  starts_on?: string;
  ends_on?: string;
  is_closed?: boolean;
  start_date?: string;
  end_date?: string;
  is_active?: boolean;
};

type Form = { title: string; starts_on: string; ends_on: string; is_closed: boolean };

const BLANK: Form = { title: '', starts_on: '', ends_on: '', is_closed: false };

const startsOn = (fy: FiscalYear) => fy.starts_on ?? fy.start_date ?? '';
const endsOn = (fy: FiscalYear) => fy.ends_on ?? fy.end_date ?? '';
/** `is_closed` is the stored column; `is_active` is its negation in older payloads. */
const isOpen = (fy: FiscalYear) =>
  fy.is_closed !== undefined ? !fy.is_closed : Boolean(fy.is_active);

export default function AccFiscalYear() {
  const t = useTranslations();
  const { locale } = useLocaleNext();
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FiscalYear | null>(null);
  const [form, setForm] = useState<Form>(BLANK);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FiscalYear | null>(null);

  const query = useQuery({
    queryKey: ['accounting', 'fiscal-years'],
    queryFn: async () => {
      const res = await apiClient.get('/v1/erp-accounting/fiscal-years', { params: { per_page: 100 } });
      return normalizeListPayload(res.data) as unknown as FiscalYear[];
    },
    retry: false,
  });
  const rows = query.data ?? [];
  const loading = query.isFetching;
  const error = query.isError ? getAxiosMessage(query.error) : null;

  const refresh = () => void qc.invalidateQueries({ queryKey: ['accounting', 'fiscal-years'] });

  const openCreate = () => {
    setEditing(null);
    setForm(BLANK);
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (fy: FiscalYear) => {
    setEditing(fy);
    setForm({
      title: fy.title ?? '',
      starts_on: String(startsOn(fy)).slice(0, 10),
      ends_on: String(endsOn(fy)).slice(0, 10),
      is_closed: !isOpen(fy),
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const submit = async () => {
    // The backend validates `ends_on` after `starts_on`; catching it here keeps the dialog
    // open with the reason instead of closing and showing an empty list.
    if (!form.title.trim() || !form.starts_on || !form.ends_on) {
      setFormError(t('auto.accounting_AccFiscalYear.s_3b2e1a9f'));
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      await accountingWpAction('fiscal_year_save', {
        ...(editing ? { id: editing.id } : {}),
        title: form.title.trim(),
        starts_on: form.starts_on,
        ends_on: form.ends_on,
        is_closed: form.is_closed ? 1 : 0,
      });
      setDialogOpen(false);
      refresh();
    } catch (e) {
      setFormError(getAxiosMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    try {
      await accountingWpAction('fiscal_year_delete', { id: deleteTarget.id });
      refresh();
    } catch (e) {
      setFormError(getAxiosMessage(e));
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t('auto.accounting_AccFiscalYear.s_79432b0c')}</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={loading}>
            {t('auto.accounting_AccFiscalYear.s_182b1c89')}
          </Button>
          <Button size="sm" onClick={openCreate}>
            {t('auto.accounting_AccFiscalYear.s_9c4d2e71')}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {formError && !dialogOpen && <p className="text-sm text-destructive">{formError}</p>}
      {loading && <p className="text-sm text-muted-foreground">{t('auto.accounting_AccFiscalYear.s_51617f69')}</p>}

      {!loading && rows.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-2 py-2 text-start font-medium">{t('auto.accounting_AccFiscalYear.s_acc84041')}</th>
                <th className="px-2 py-2 text-start font-medium">{t('auto.accounting_AccFiscalYear.s_1a9bdb20')}</th>
                <th className="px-2 py-2 text-start font-medium">{t('auto.accounting_AccFiscalYear.s_7f1e4c29')}</th>
                <th className="px-2 py-2 text-start font-medium">{t('auto.accounting_AccFiscalYear.s_d13a2741')}</th>
                <th className="px-2 py-2 text-start font-medium">{t('auto.accounting_AccFiscalYear.s_55518965')}</th>
                <th className="px-2 py-2 text-end font-medium">{t('common.edit')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((fy) => (
                <tr key={fy.id} className="border-b border-border/60">
                  <td className="px-2 py-1.5 tabular-nums">{fy.id}</td>
                  <td className="px-2 py-1.5">{fy.title}</td>
                  <td className="px-2 py-1.5 tabular-nums">{String(startsOn(fy)).slice(0, 10)}</td>
                  <td className="px-2 py-1.5 tabular-nums">{String(endsOn(fy)).slice(0, 10)}</td>
                  <td className="px-2 py-1.5">
                    <Badge variant={isOpen(fy) ? 'default' : 'outline'}>
                      {isOpen(fy)
                        ? t('auto.accounting_AccFiscalYear.s_6f637966')
                        : t('auto.accounting_AccFiscalYear.s_d9ba4168')}
                    </Badge>
                  </td>
                  <td className="px-2 py-1.5 text-end">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(fy)}>
                        {t('common.edit')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => setDeleteTarget(fy)}
                      >
                        {t('common.delete')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('auto.accounting_AccFiscalYear.s_83c22977')}</p>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing
                ? t('auto.accounting_AccFiscalYear.s_4a1b8c03')
                : t('auto.accounting_AccFiscalYear.s_9c4d2e71')}
            </DialogTitle>
            <DialogDescription>{t('auto.accounting_AccFiscalYear.s_7e5f2a16')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="fy-title">{t('auto.accounting_AccFiscalYear.s_1a9bdb20')}</Label>
              <Input
                id="fy-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="fy-start">{t('auto.accounting_AccFiscalYear.s_7f1e4c29')}</Label>
                <LocaleDatePicker
                  locale={locale}
                  id="fy-start"
                  value={form.starts_on}
                  onChange={(v) => setForm({ ...form, starts_on: v ?? "" })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fy-end">{t('auto.accounting_AccFiscalYear.s_d13a2741')}</Label>
                <LocaleDatePicker
                  locale={locale}
                  id="fy-end"
                  value={form.ends_on}
                  onChange={(v) => setForm({ ...form, ends_on: v ?? "" })}
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="fy-closed">{t('auto.accounting_AccFiscalYear.s_2c8e4d51')}</Label>
              <Switch
                id="fy-closed"
                checked={form.is_closed}
                onCheckedChange={(v) => setForm({ ...form, is_closed: Boolean(v) })}
              />
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void submit()} disabled={saving}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('auto.accounting_AccFiscalYear.s_5d6f3a28')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.title}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void remove()}>{t('common.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
