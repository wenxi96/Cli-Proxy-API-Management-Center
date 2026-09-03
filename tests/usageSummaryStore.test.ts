import { describe, expect, test } from 'bun:test';
import { usageApi, type UsageSummaryResponse } from '../src/services/api/usage';
import { useUsageStatsStore } from '../src/stores/useUsageStatsStore';
import { useAuthStore } from '../src/stores/useAuthStore';

const storage = new Map<string, string>();
Object.assign(globalThis, {
  window: { location: { host: 'usage-summary.test' } },
  navigator: { userAgent: 'bun-test' },
  localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  },
});

const summaryResponse = (
  overrides: Partial<UsageSummaryResponse> = {}
): UsageSummaryResponse => ({
  status: 200,
  data: {
    schema_version: 1,
    range: {
      kind: 'rolling',
      window: '24h',
      from: '2026-08-13T00:00:00Z',
      to: '2026-08-14T00:00:00Z',
      window_anchor: 'anchor-1',
      complete: true,
    },
    totals: { requests: 4 },
  },
  headers: {
    etag: 'W/"summary-1"',
    'cache-control': 'no-store',
    'x-usage-revision': '7',
  },
  ...overrides,
});

const resetStore = () => {
  useUsageStatsStore.getState().clearUsageStats();
  useAuthStore.setState({ apiBase: 'http://one.test', managementKey: 'key-one' });
};

describe('usage summary store state machine', () => {
  test('does not let an older catalog response overwrite a new connection scope', async () => {
    resetStore();
    const originalCatalog = usageApi.getUsageCatalog;
    const originalUsage = usageApi.getUsage;
    let resolveCatalog: ((response: Awaited<ReturnType<typeof usageApi.getUsageCatalog>>) => void) | undefined;
    usageApi.getUsageCatalog = () =>
      new Promise((resolve) => {
        resolveCatalog = resolve;
      });
    usageApi.getUsage = async () => ({ usage: { total_requests: 0 } });

    try {
      const staleCatalog = useUsageStatsStore.getState().loadUsageCatalog();
      useAuthStore.setState({ apiBase: 'http://two.test', managementKey: 'key-two' });
      await useUsageStatsStore.getState().loadUsageStats({ force: true });
      resolveCatalog?.({
        status: 200,
        data: { sources: [{ source_id: 'stale' }] },
        headers: { etag: 'W/"stale"' },
      });
      await staleCatalog;

      const state = useUsageStatsStore.getState();
      expect(state.scopeKey).toBe('http://two.test::key-two');
      expect(state.catalog).toBeNull();
      expect(state.catalogEtag).toBeNull();
      expect(state.catalogStatus).toBe('idle');
      expect(state.catalogError).toBeNull();
      expect(state.catalogScopeKey).toBe('http://two.test::key-two');
    } finally {
      usageApi.getUsageCatalog = originalCatalog;
      usageApi.getUsage = originalUsage;
    }
  });

  test('summary-first scope changes clear the complete catalog state', async () => {
    resetStore();
    const original = usageApi.getUsageSummary;
    useUsageStatsStore.setState({
      catalog: { sources: [{ source_id: 'old-source' }] },
      catalogEtag: 'W/"old-catalog"',
      catalogScopeKey: 'http://one.test::key-one',
      catalogStatus: 'ready',
      catalogError: 'stale catalog error',
    });
    useAuthStore.setState({ apiBase: 'http://two.test', managementKey: 'key-two' });
    usageApi.getUsageSummary = async () => summaryResponse();

    try {
      await useUsageStatsStore.getState().loadUsageSummary({ window: '24h' });
      const state = useUsageStatsStore.getState();
      expect(state.catalog).toBeNull();
      expect(state.catalogEtag).toBeNull();
      expect(state.catalogStatus).toBe('idle');
      expect(state.catalogError).toBeNull();
      expect(state.catalogScopeKey).toBe('http://two.test::key-two');
    } finally {
      usageApi.getUsageSummary = original;
    }
  });

  test('catalog-first loading does not clear same-scope summary facts', async () => {
    resetStore();
    const originalSummary = usageApi.getUsageSummary;
    const originalCatalog = usageApi.getUsageCatalog;
    usageApi.getUsageSummary = async () => summaryResponse();
    usageApi.getUsageCatalog = async () => ({
      status: 200,
      data: { models: [], sources: [] },
      headers: { etag: 'W/"catalog-1"' },
    });

    try {
      await useUsageStatsStore.getState().loadUsageSummary({ window: '24h' });
      const summaryBeforeCatalog = useUsageStatsStore.getState().summary;
      await useUsageStatsStore.getState().loadUsageCatalog();
      const state = useUsageStatsStore.getState();
      expect(state.summary).toBe(summaryBeforeCatalog);
      expect(state.summaryStatus).toBe('ready');
      expect(state.catalogStatus).toBe('ready');
    } finally {
      usageApi.getUsageSummary = originalSummary;
      usageApi.getUsageCatalog = originalCatalog;
    }
  });

  test('stores summary facts and server metadata from a 200 response', async () => {
    resetStore();
    const original = usageApi.getUsageSummary;
    usageApi.getUsageSummary = async () => summaryResponse();

    try {
      await useUsageStatsStore.getState().loadUsageSummary({ window: '24h' });
      const state = useUsageStatsStore.getState();

      expect(state.summary).toEqual(summaryResponse().data);
      expect(state.summaryRange).toEqual(
        (summaryResponse().data as { range?: Record<string, unknown> }).range
      );
      expect(state.summaryAnchor).toBe('anchor-1');
      expect(state.summaryEtag).toBe('W/"summary-1"');
      expect(state.summaryRevision).toBe('7');
      expect(state.summaryStatus).toBe('ready');
    } finally {
      usageApi.getUsageSummary = original;
    }
  });

  test('keeps the previous summary facts when the server returns 304', async () => {
    resetStore();
    const original = usageApi.getUsageSummary;
    let call = 0;
    usageApi.getUsageSummary = async () => {
      call += 1;
      return call === 1 ? summaryResponse() : summaryResponse({ status: 304, data: '' });
    };

    try {
      await useUsageStatsStore.getState().loadUsageSummary({ window: '24h' });
      const previous = useUsageStatsStore.getState().summary;
      await useUsageStatsStore.getState().loadUsageSummary({ window: '24h' });
      const state = useUsageStatsStore.getState();

      expect(state.summary).toBe(previous);
      expect(state.summaryStatus).toBe('not_modified');
      expect(state.summaryAnchor).toBe('anchor-1');
    } finally {
      usageApi.getUsageSummary = original;
    }
  });

  test('does not let an older scope response overwrite the current scope', async () => {
    resetStore();
    const original = usageApi.getUsageSummary;
    let resolveFirst: ((response: UsageSummaryResponse) => void) | undefined;
    usageApi.getUsageSummary = () =>
      new Promise<UsageSummaryResponse>((resolve) => {
        resolveFirst = resolve;
      });

    try {
      const first = useUsageStatsStore.getState().loadUsageSummary({ window: '24h' });
      useAuthStore.setState({ apiBase: 'http://two.test', managementKey: 'key-two' });
      const secondResponse = summaryResponse({
        data: { schema_version: 1, range: { window: '24h', window_anchor: 'anchor-two' } },
      });
      usageApi.getUsageSummary = async () => secondResponse;
      await useUsageStatsStore.getState().loadUsageSummary({ window: '24h' });
      resolveFirst?.(summaryResponse({ data: { totals: { requests: 1 } } }));
      await first;

      const state = useUsageStatsStore.getState();
      expect(state.summaryScopeKey).toBe('http://two.test::key-two');
      expect(
        (state.summary as { range?: { window_anchor?: unknown } } | null)?.range?.window_anchor
      ).toBe('anchor-two');
      expect((state.summary as { totals?: unknown } | null)?.totals).toBeUndefined();
    } finally {
      usageApi.getUsageSummary = original;
    }
  });

  test('clears an expired rolling anchor and retries once with a newly minted anchor', async () => {
    resetStore();
    const original = usageApi.getUsageSummary;
    const calls: Array<{ anchor?: string; window?: string }> = [];
    usageApi.getUsageSummary = async (options) => {
      calls.push(options);
      if (calls.length === 1) {
        const error = new Error('anchor expired') as Error & { status?: number; apiCode?: string };
        error.status = 409;
        error.apiCode = 'window_anchor_expired';
        throw error;
      }
      return summaryResponse({
        data: { schema_version: 1, range: { window: '24h', window_anchor: 'anchor-2' } },
        headers: { etag: 'W/"summary-2"', 'x-usage-revision': '8' },
      });
    };

    try {
      await useUsageStatsStore.getState().loadUsageSummary({ window: '24h', anchor: 'expired' });
      expect(calls).toEqual([{ window: '24h', anchor: 'expired' }, { window: '24h' }]);
      expect(useUsageStatsStore.getState().summaryAnchor).toBe('anchor-2');
    } finally {
      usageApi.getUsageSummary = original;
    }
  });

  test('clears a previous summary error after the legacy usage fallback succeeds', async () => {
    resetStore();
    const original = usageApi.getUsage;
    useUsageStatsStore.setState({ summaryError: 'summary endpoint unavailable' });
    usageApi.getUsage = async () => ({
      usage: {
        total_requests: 2,
        success_count: 2,
        failure_count: 0,
      },
    });

    try {
      await useUsageStatsStore.getState().loadUsageStats({ force: true });
      const state = useUsageStatsStore.getState();
      expect(state.summaryError).toBeNull();
      expect(state.error).toBeNull();
      expect(state.usage).toEqual({
        total_requests: 2,
        success_count: 2,
        failure_count: 0,
      });
    } finally {
      usageApi.getUsage = original;
    }
  });
});
