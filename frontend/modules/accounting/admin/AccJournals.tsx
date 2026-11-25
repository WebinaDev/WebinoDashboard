'use client';

import { useTranslations } from 'next-intl';

import { useCallback, useEffect, useMemo, useState } from 'react';
import apiClient from '@/features/modules/accounting/lib/api-client';
import { getAxiosMessage } from '@/features/modules/accounting/lib/api-helpers';
import { normalizeListPayload, readListMeta } from '@/lib/list-utils';
import { accountingWpAction } from '@/features/modules/accounting/lib/accounting-wp';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { LocaleDatePicker } from '@/components/ui/locale-date-picker';
import { useLocale } from '@/hooks/use-locale-next';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Trash2 } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { ListStatsStrip } from '@/components/ListStatsStrip';
import { Card } from '@/components/ui/card';

type Journal = {
  id: number;
  document_no: string;
  document_date: string;
  description: string;
  status: string;
};

type FiscalYear = { id: number; title: string };

type ChartAccount = { id: number; code?: string; title?: string; name?: string };

type LineRow = {
  key: string;
  account_id: string;
  debit: string;
  credit: string;
  description: string;
};

const emptyLine = (): LineRow => ({
  key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  account_id: '',
  debit: '',
  credit: '',
  description: '',
});

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function AccJournals() {
  const t = useTranslations();
  const tj = useTranslations('finance.journals');
  const { formatNumber, formatDate } = useLocale();

  const [journals, setJournals] = useState<Journal[]>([]);
  const [fys, setFys] = useState<FiscalYear[]>([]);
  const [fyId, setFyId] = useState('all');
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [postingId, setPostingId] = useState<number | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formFyId, setFormFyId] = useState('');
  const [formDate, setFormDate] = useState(todayIso());
  const [formDescription, setFormDescription] = useState('');
  const [lines, setLines] = useState<LineRow[]>([emptyLine(), emptyLine()]);
  const [accounts, setAccounts] = useState<ChartAccount[]>([]);

  useEffect(() => {
    apiClient
      .get('/v1/erp-accounting/fiscal-years', { params: { per_page: 100 } })
      .then((r) => setFys(normalizeListPayload(r.data) as unknown as FiscalYear[]))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!dialogOpen) return;
    accountingWpAction<{ items?: ChartAccount[] }>('chart_list')
      .then((data) => {
        const items = Array.isArray(data) ? data : (data?.items ?? []);
        setAccounts(items as ChartAccount[]);
      })
      .catch(() => setAccounts([]));
  }, [dialogOpen]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, unknown> = { page, per_page: 20 };
      if (fyId !== 'all') params.fiscal_year_id = fyId;
      const res = await apiClient.get('/v1/erp-accounting/journals', { params });
      setJournals(normalizeListPayload(res.data) as Journal[]);
      // The client preserves envelope meta on `res.meta`; fall back to reading it
      // off the payload for non-enveloped responses.
      setLastPage(Number(res.meta?.last_page ?? readListMeta(res.data).last_page ?? 1));
    } catch (e) {
      setError(getAxiosMessage(e));
    } finally {
      setLoading(false);
    }
  }, [fyId, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const debitTotal = useMemo(
    () => lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0),
    [lines],
  );
  const creditTotal = useMemo(
    () => lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0),
    [lines],
  );
  const balanced = Math.abs(debitTotal - creditTotal) < 0.01 && debitTotal > 0;

  const openCreate = () => {
    setFormFyId(fyId !== 'all' ? fyId : (fys[0] ? String(fys[0].id) : ''));
    setFormDate(todayIso());
    setFormDescription('');
    setLines([emptyLine(), emptyLine()]);
    setFormError(null);
    setDialogOpen(true);
  };

  const updateLine = (idx: number, field: keyof LineRow, value: string) => {
    setLines((prev) => prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row)));
  };

  const handleSave = async () => {
    setFormError(null);
    const payload = lines
      .filter((l) => l.account_id && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0))
      .map((l) => ({
        account_id: Number(l.account_id),
        debit: parseFloat(l.debit) || 0,
        credit: parseFloat(l.credit) || 0,
        description: l.description || null,
      }));
    if (payload.length < 2) {
      setFormError(tj('minLines'));
      return;
    }
    if (!balanced) {
      setFormError(tj('notBalanced'));
      return;
    }
    if (!formDate) {
      setFormError(tj('dateRequired'));
      return;
    }
    setSaving(true);
    try {
      await accountingWpAction('journal_save', {
        fiscal_year_id: formFyId ? Number(formFyId) : null,
        document_date: formDate,
        description: formDescription || null,
        lines: payload,
      });
      setDialogOpen(false);
      await load();
    } catch (e) {
      setFormError(getAxiosMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handlePost = async (id: number) => {
    setPostingId(id);
    try {
      await accountingWpAction('journal_post', { id });
      await load();
    } catch (e) {
      setError(getAxiosMessage(e));
    } finally {
      setPostingId(null);
    }
  };

  return (
    <PageShell
      title={t('auto.accounting_AccJournals.s_d7bbadb3')}
      actions={
        <div className="flex items-center gap-2">
          <Select
            value={fyId}
            onValueChange={(v) => { setFyId(v); setPage(1); }}
          >
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder={t('auto.accounting_AccJournals.s_79432b0c')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('auto.accounting_AccJournals.s_55bf7b08')}</SelectItem>
              {fys.map((f) => (
                <SelectItem key={f.id} value={String(f.id)}>{f.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {t('auto.accounting_AccJournals.s_182b1c89')}
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="ms-1 h-4 w-4" />
            {tj('new')}
          </Button>
        </div>
      }
    >
      <ListStatsStrip
        items={[
          { id: 'total', label: t('auto.accounting_AccJournals.s_d7bbadb3'), value: journals.length },
        ]}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && <p className="text-sm text-muted-foreground">{t('auto.accounting_AccJournals.s_51617f69')}</p>}

      {!loading && journals.length > 0 && (
        <>
          <Card variant="glass" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-2 py-2 text-start font-medium">{t('auto.accounting_AccJournals.s_acc84041')}</th>
                  <th className="px-2 py-2 text-start font-medium">{t('auto.accounting_AccJournals.s_2a97e3c5')}</th>
                  <th className="px-2 py-2 text-start font-medium">{t('auto.accounting_AccJournals.s_217c8491')}</th>
                  <th className="px-2 py-2 text-start font-medium">{t('auto.accounting_AccJournals.s_b11813ac')}</th>
                  <th className="px-2 py-2 text-start font-medium">{t('auto.accounting_AccJournals.s_55518965')}</th>
                  <th className="px-2 py-2 text-start font-medium">{t('auto.accounting_AccJournals.s_8d1cc546')}</th>
                </tr>
              </thead>
              <tbody>
                {journals.map((j) => (
                  <tr key={j.id} className="border-b border-border/60">
                    <td className="px-2 py-1.5 tabular-nums">{j.id}</td>
                    <td className="px-2 py-1.5 tabular-nums">{j.document_no}</td>
                    <td className="px-2 py-1.5">{formatDate(String(j.document_date)) || j.document_date}</td>
                    <td className="max-w-[260px] truncate px-2 py-1.5">{j.description}</td>
                    <td className="px-2 py-1.5">
                      <Badge variant={j.status === 'posted' ? 'default' : 'outline'}>
                        {j.status === 'posted' ? t('auto.accounting_AccJournals.s_1223f269') : t('auto.accounting_AccJournals.s_7d739ea1')}
                      </Badge>
                    </td>
                    <td className="px-2 py-1.5">
                      {j.status === 'draft' && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={postingId === j.id}
                          onClick={() => void handlePost(j.id)}
                        >
                          {postingId === j.id ? t('auto.accounting_AccJournals.s_03e4d57d') : t('auto.accounting_AccJournals.s_f14ef897')}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </Card>

          <div className="flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              {t('auto.accounting_AccJournals.s_1a592f6b')}
            </Button>
            <span className="text-sm tabular-nums text-muted-foreground">
              {t('common.pageOf', { page, pageCount: lastPage })}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= lastPage}
              onClick={() => setPage((p) => p + 1)}
            >
              {t('auto.accounting_AccJournals.s_54ee927e')}
            </Button>
          </div>
        </>
      )}

      {!loading && !error && journals.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('auto.accounting_AccJournals.s_7eaf94a8')}</p>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tj('new')}</DialogTitle>
            <DialogDescription>{tj('newHint')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('auto.accounting_AccJournals.s_79432b0c')}</label>
                <Select value={formFyId || undefined} onValueChange={setFormFyId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('auto.accounting_AccJournals.s_79432b0c')} />
                  </SelectTrigger>
                  <SelectContent>
                    {fys.map((f) => (
                      <SelectItem key={f.id} value={String(f.id)}>{f.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('auto.accounting_AccJournals.s_217c8491')}</label>
                <LocaleDatePicker value={formDate} onChange={(v) => setFormDate(v || '')} />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">{t('auto.accounting_AccJournals.s_b11813ac')}</label>
              <Input value={formDescription} onChange={(e) => setFormDescription(e.target.value)} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">{tj('lines')}</label>
                <Button type="button" variant="outline" size="sm" onClick={() => setLines((p) => [...p, emptyLine()])}>
                  <Plus className="ms-1 h-3.5 w-3.5" />
                  {tj('addLine')}
                </Button>
              </div>

              <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="px-2 py-2 text-start font-medium">{tj('account')}</th>
                      <th className="px-2 py-2 text-start font-medium">{tj('debit')}</th>
                      <th className="px-2 py-2 text-start font-medium">{tj('credit')}</th>
                      <th className="px-2 py-2 text-start font-medium">{t('auto.accounting_AccJournals.s_b11813ac')}</th>
                      <th className="w-10 px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, idx) => (
                      <tr key={line.key} className="border-b border-border/60">
                        <td className="px-2 py-1.5">
                          <Select
                            value={line.account_id || undefined}
                            onValueChange={(v) => updateLine(idx, 'account_id', v)}
                          >
                            <SelectTrigger className="min-w-[160px]">
                              <SelectValue placeholder={tj('selectAccount')} />
                            </SelectTrigger>
                            <SelectContent>
                              {accounts.map((a) => (
                                <SelectItem key={a.id} value={String(a.id)}>
                                  {[a.code, a.title ?? a.name].filter(Boolean).join(' — ') || String(a.id)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={line.debit}
                            onChange={(e) => updateLine(idx, 'debit', e.target.value)}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={line.credit}
                            onChange={(e) => updateLine(idx, 'credit', e.target.value)}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            value={line.description}
                            onChange={(e) => updateLine(idx, 'description', e.target.value)}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            disabled={lines.length <= 2}
                            onClick={() => setLines((prev) => (prev.length <= 2 ? prev : prev.filter((_, i) => i !== idx)))}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className={`text-sm ${balanced ? 'text-muted-foreground' : 'text-destructive'}`}>
                {tj('totals', {
                  debit: formatNumber(debitTotal),
                  credit: formatNumber(creditTotal),
                })}
              </p>
            </div>

            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving || !balanced}>
              {saving ? tj('saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
