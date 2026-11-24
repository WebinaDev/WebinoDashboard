'use client';

import { useTranslations } from 'next-intl';

import { useCallback, useEffect, useState } from 'react';
import apiClient from '@/features/modules/accounting/lib/api-client';
import { unwrapData, getAxiosMessage } from '@/features/modules/accounting/lib/api-helpers';
import { normalizeListPayload } from '@/lib/list-utils';
import { accountingWpAction } from '@/features/modules/accounting/lib/accounting-wp';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { CurrencySettingsFields } from '@/components/CurrencySettingsFields';
import {
  DEFAULT_CURRENCY_SYMBOL,
  DEFAULT_STORE_CURRENCY,
  normalizeCurrencySymbol,
  normalizeStoreCurrency,
  type CurrencySymbolId,
  type StoreCurrencyCode,
} from '@/lib/currencies';

type Settings = {
  currency: string;
  currency_symbol?: string;
  fiscal_year_id: number | null;
};
type FiscalYear = { id: number; title: string };

export default function AccSettings() {
  const t = useTranslations();

  const [currency, setCurrency] = useState<StoreCurrencyCode>(DEFAULT_STORE_CURRENCY);
  const [currencySymbol, setCurrencySymbol] = useState<CurrencySymbolId>(DEFAULT_CURRENCY_SYMBOL);
  const [fyId, setFyId] = useState('');
  const [fys, setFys] = useState<FiscalYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [settingsRes, fysRes] = await Promise.all([
        apiClient.get('/v1/erp-accounting/settings'),
        apiClient.get('/v1/erp-accounting/fiscal-years', { params: { per_page: 100 } }),
      ]);
      const s = unwrapData<Settings>(settingsRes);
      const code = normalizeStoreCurrency(s.currency);
      setCurrency(code);
      setCurrencySymbol(normalizeCurrencySymbol(code, s.currency_symbol));
      setFyId(s.fiscal_year_id ? String(s.fiscal_year_id) : '');
      setFys(normalizeListPayload(fysRes.data) as unknown as FiscalYear[]);
    } catch (e) {
      setError(getAxiosMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await accountingWpAction('settings_save', {
        currency,
        currency_symbol: currencySymbol,
        fiscal_year_id: fyId ? Number(fyId) : null,
      });
      setMessage(t('auto.accounting_AccSettings.s_60a1c115'));
    } catch (e) {
      setError(getAxiosMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    setError(null);
    setMessage(null);
    try {
      await accountingWpAction('seed_chart');
      setMessage(t('auto.accounting_AccSettings.s_666b5c29'));
    } catch (e) {
      setError(getAxiosMessage(e));
    } finally {
      setSeeding(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-semibold">{t('auto.accounting_AccSettings.s_f6b960d1')}</h2>
        <p className="text-sm text-muted-foreground">{t('auto.accounting_AccSettings.s_51617f69')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">{t('auto.accounting_AccSettings.s_f6b960d1')}</h2>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {message && <p className="text-sm text-green-600">{message}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('auto.accounting_AccSettings.s_ba2d3e64')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <CurrencySettingsFields
            currency={currency}
            symbol={currencySymbol}
            onCurrencyChange={setCurrency}
            onSymbolChange={setCurrencySymbol}
            currencyLabel={t('auto.accounting_AccSettings.s_f2c4117d')}
            symbolLabel="نماد واحد پول"
          />
          <div>
            <label className="mb-1 block text-sm font-medium">{t('auto.accounting_AccSettings.s_432be630')}</label>
            <Select value={fyId} onValueChange={setFyId}>
              <SelectTrigger className="w-full sm:max-w-xs">
                <SelectValue placeholder={t('auto.accounting_AccSettings.s_3edc0e6d')} />
              </SelectTrigger>
              <SelectContent>
                {fys.map((f) => (
                  <SelectItem key={f.id} value={String(f.id)}>{f.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? t('auto.accounting_AccSettings.s_4b7554d6') : t('auto.accounting_AccSettings.s_5613d348')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('auto.accounting_AccSettings.s_77ef7b9f')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            {t('auto.accounting_AccSettings.s_1c800a91')}
          </p>
          <Button variant="outline" onClick={() => void handleSeed()} disabled={seeding}>
            {seeding ? t('auto.accounting_AccSettings.s_043809bf') : t('auto.accounting_AccSettings.s_77ef7b9f')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
