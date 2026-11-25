'use client';

import { useTranslations } from 'next-intl';

import { useCallback, useEffect, useState } from 'react';
import apiClient from '@/features/modules/accounting/lib/api-client';
import { getAxiosMessage } from '@/features/modules/accounting/lib/api-helpers';
import { normalizeListPayload } from '@/lib/list-utils';
import { accountingWpAction } from '@/features/modules/accounting/lib/accounting-wp';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type FiscalYear = {
  id: number;
  title: string;
  // Backend stores starts_on/ends_on/is_closed and appends these aliases.
  starts_on?: string;
  ends_on?: string;
  is_closed?: boolean;
  start_date: string;
  end_date: string;
  is_active: boolean;
};

function startOf(fy: FiscalYear): string {
  return (fy.starts_on ?? fy.start_date ?? '').slice(0, 10);
}

function endOf(fy: FiscalYear): string {
  return (fy.ends_on ?? fy.end_date ?? '').slice(0, 10);
}

function isActive(fy: FiscalYear): boolean {
  if (typeof fy.is_active === 'boolean') return fy.is_active;
  return fy.is_closed !== true;
}

export default function AccFiscalYear() {
  const t = useTranslations();

  const [rows, setRows] = useState<FiscalYear[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [isClosed, setIsClosed] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FiscalYear | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/v1/erp-accounting/fiscal-years', { params: { per_page: 100 } });
      setRows(normalizeListPayload(res.data) as unknown as FiscalYear[]);
    } catch (e) {
      setError(getAxiosMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setTitle('');
    setStartsOn('');
    setEndsOn('');
    setIsClosed(false);
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (fy: FiscalYear) => {
    setEditingId(fy.id);
    setTitle(fy.title ?? '');
    setStartsOn(startOf(fy));
    setEndsOn(endOf(fy));
    setIsClosed(!isActive(fy));
    setFormError(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setFormError(null);
    try {
      await accountingWpAction('fiscal_year_save', {
        id: editingId ?? undefined,
        title,
        starts_on: startsOn,
        ends_on: endsOn,
        is_closed: isClosed,
      });
      setDialogOpen(false);
      void load();
    } catch (e) {
      setFormError(getAxiosMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    setFormError(null);
    try {
      await accountingWpAction('fiscal_year_delete', { id: deleteTarget.id });
      setDeleteTarget(null);
      void load();
    } catch (e) {
      setError(getAxiosMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t('auto.accounting_AccFiscalYear.s_79432b0c')}</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {t('auto.accounting_AccFiscalYear.s_182b1c89')}
          </Button>
          <Button size="sm" onClick={openCreate}>
            {t('auto.accounting_AccFiscalYear.s_3b2e1a9f')}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
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
                <th className="px-2 py-2 text-end font-medium">{t('auto.accounting_AccFiscalYear.s_9c4d2e71')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((fy) => (
                <tr key={fy.id} className="border-b border-border/60">
                  <td className="px-2 py-1.5 tabular-nums">{fy.id}</td>
                  <td className="px-2 py-1.5">{fy.title}</td>
                  <td className="px-2 py-1.5">{startOf(fy)}</td>
                  <td className="px-2 py-1.5">{endOf(fy)}</td>
                  <td className="px-2 py-1.5">
                    <Badge variant={isActive(fy) ? 'default' : 'outline'}>
                      {isActive(fy) ? t('auto.accounting_AccFiscalYear.s_6f637966') : t('auto.accounting_AccFiscalYear.s_d9ba4168')}
                    </Badge>
                  </td>
                  <td className="px-2 py-1.5 text-end">
                    <div className="flex justify-end gap-1">
                      <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(fy)}>
                        {t('auto.accounting_AccFiscalYear.s_4a1b8c03')}
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setDeleteTarget(fy)}>
                        {t('auto.accounting_AccFiscalYear.s_7e5f2a16')}
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
              {editingId ? t('auto.accounting_AccFiscalYear.s_4a1b8c03') : t('auto.accounting_AccFiscalYear.s_3b2e1a9f')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="fy-title">{t('auto.accounting_AccFiscalYear.s_1a9bdb20')}</Label>
              <Input id="fy-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="fy-start">{t('auto.accounting_AccFiscalYear.s_7f1e4c29')}</Label>
                <Input id="fy-start" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="fy-end">{t('auto.accounting_AccFiscalYear.s_d13a2741')}</Label>
                <Input id="fy-end" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="fy-closed" checked={isClosed} onCheckedChange={setIsClosed} />
              <Label htmlFor="fy-closed">{t('auto.accounting_AccFiscalYear.s_d9ba4168')}</Label>
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              {t('auto.accounting_AccFiscalYear.s_2c8e4d51')}
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={saving || !title || !startsOn || !endsOn}>
              {t('auto.accounting_AccFiscalYear.s_5d6f3a28')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('auto.accounting_AccFiscalYear.s_7e5f2a16')}</AlertDialogTitle>
            <AlertDialogDescription>{deleteTarget?.title}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('auto.accounting_AccFiscalYear.s_2c8e4d51')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()} disabled={saving}>
              {t('auto.accounting_AccFiscalYear.s_7e5f2a16')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
