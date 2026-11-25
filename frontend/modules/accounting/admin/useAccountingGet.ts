'use client';

import { useQuery } from '@tanstack/react-query';
import apiClient from '@/features/modules/accounting/lib/api-client';
import { unwrapData, getAxiosMessage } from '@/features/modules/accounting/lib/api-helpers';

export function useAccountingGet(path: string) {
  const query = useQuery({
    queryKey: ['accounting', 'get', path],
    queryFn: async () => {
      const res = await apiClient.get(path);
      return unwrapData<unknown>(res);
    },
    retry: false,
  });

  return {
    data: query.isError ? null : query.data ?? null,
    error: query.isError ? getAxiosMessage(query.error) : null,
    loading: query.isFetching,
    reload: query.refetch,
  };
}
