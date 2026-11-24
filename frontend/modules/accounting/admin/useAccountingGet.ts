'use client';

import { useCallback, useEffect, useState } from 'react';
import apiClient from '@/features/modules/accounting/lib/api-client';
import { unwrapData, getAxiosMessage } from '@/features/modules/accounting/lib/api-helpers';

export function useAccountingGet(path: string) {
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get(path);
      setData(unwrapData<unknown>(res));
    } catch (e) {
      setError(getAxiosMessage(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, error, loading, reload: load };
}
