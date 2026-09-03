import { describe, expect, test } from 'bun:test';
import { usageApi } from '../src/services/api/usage';
import { useUsageStatsStore } from '../src/stores/useUsageStatsStore';
import { useAuthStore } from '../src/stores/useAuthStore';
import {
  buildUsageEventsLoadOptions,
  buildUsageSummaryLoadOptions,
} from '../src/components/usage/hooks/useUsageData';
import { normalizeUsageDetail } from '../src/utils/usage';

const storage = new Map<string, string>();
Object.assign(globalThis, {
  window: { location: { host: 'usage-data.test' } },
  navigator: { userAgent: 'bun-test' },
  localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  },
});

describe('usage data v2 adapter', () => {
  test('manual refresh always mints without a stale anchor or ETag', () => {
    expect(
      buildUsageSummaryLoadOptions('7d', 'manual', {
        summaryRange: { window: '7d' },
        summaryAnchor: 'anchor-7d-old',
        summaryEtag: 'W/"summary-7d-old"',
      })
    ).toEqual({ window: '7d', etag: '' });
  });

  test('automatic refresh reuses the pinned anchor and ETag for the same window', () => {
    expect(
      buildUsageSummaryLoadOptions('24h', 'automatic', {
        summaryRange: { window: '24h' },
        summaryAnchor: 'anchor-24h',
        summaryEtag: 'W/"summary-24h"',
      })
    ).toEqual({ window: '24h', anchor: 'anchor-24h', etag: 'W/"summary-24h"' });
  });

  test('automatic refresh mints a new anchor after the selected window changes', () => {
    expect(
      buildUsageSummaryLoadOptions('7d', 'automatic', {
        summaryRange: { window: '24h' },
        summaryAnchor: 'anchor-24h',
        summaryEtag: 'W/"summary-24h"',
      })
    ).toEqual({ window: '7d', etag: '' });
  });

  test('does not combine a superseded selected window with the current summary anchor', () => {
    expect(
      buildUsageEventsLoadOptions('24h', {
        summaryRange: { window: '7d' },
        summaryAnchor: 'anchor-7d',
      })
    ).toBeNull();
  });

  test('builds events options only when the summary range matches the selected window', () => {
    expect(
      buildUsageEventsLoadOptions('24h', {
        summaryRange: { window: '24h' },
        summaryAnchor: 'anchor-24h',
      })
    ).toEqual({ window: '24h', anchor: 'anchor-24h', limit: 50 });
  });

  test('normalizes string latency values from summary event DTOs', () => {
    expect(normalizeUsageDetail({ latency_ms: '42.5' }).latencyMs).toBe(42.5);
  });

  test('exposes summary and current event page state without removing legacy usage', async () => {
    useUsageStatsStore.getState().clearUsageStats();
    useAuthStore.setState({ apiBase: 'http://data.test', managementKey: 'data-key' });
    const originalSummary = usageApi.getUsageSummary;
    const originalEvents = usageApi.getUsageEvents;
    usageApi.getUsageSummary = async () => ({
      status: 200,
      data: {
        schema_version: 1,
        range: { from: '2026-08-13T00:00:00Z', to: '2026-08-14T00:00:00Z', window_anchor: 'anchor' },
        totals: { requests: 3 },
      },
      headers: { etag: 'W/"summary"', 'x-usage-revision': '1' },
    });
    usageApi.getUsageEvents = async () => ({
      status: 200,
      data: {
        schema_version: 1,
        items: [{ request_id: 'event-1', timestamp: '2026-08-13T01:00:00Z' }],
        next_cursor: '',
        has_more: false,
        snapshot: { dataset_epoch: 'epoch', max_sequence: 1, rewrite_revision: 0 },
      },
      headers: { etag: 'W/"events"', 'x-usage-revision': '1' },
    });

    try {
      await useUsageStatsStore.getState().loadUsageSummary({ window: '24h' });
      await useUsageStatsStore.getState().loadUsageEvents({ window: '24h' });
      const state = useUsageStatsStore.getState();

      expect(state.usage).toBeNull();
      expect((state.summary as { totals?: { requests?: number } }).totals?.requests).toBe(3);
      expect(state.events[0]?.request_id).toBe('event-1');
      expect(state.eventsHasMore).toBe(false);
    } finally {
      usageApi.getUsageSummary = originalSummary;
      usageApi.getUsageEvents = originalEvents;
    }
  });

  test('loads legacy usage after an events capability miss without changing summary status', async () => {
    useUsageStatsStore.getState().clearUsageStats();
    useAuthStore.setState({ apiBase: 'http://fallback.test', managementKey: 'fallback-key' });
    const originalSummary = usageApi.getUsageSummary;
    const originalEvents = usageApi.getUsageEvents;
    const originalUsage = usageApi.getUsage;
    usageApi.getUsageSummary = async () => ({
      status: 200,
      data: {
        schema_version: 1,
        range: { window: '24h', window_anchor: 'anchor' },
        totals: { requests: 1 },
      },
      headers: { etag: 'W/"summary"' },
    });
    usageApi.getUsageEvents = async () => {
      const error = new Error('events endpoint missing') as Error & { status?: number };
      error.status = 404;
      throw error;
    };
    usageApi.getUsage = async () => ({
      usage: {
        auths: [{ auth_index: 'legacy-1', requests: [{ timestamp: '2026-08-13T01:00:00Z' }] }],
      },
    });

    try {
      await useUsageStatsStore.getState().loadUsageSummary({ window: '24h' });
      await useUsageStatsStore.getState().loadUsageEvents({ window: '24h' }).catch(async () => {
        await useUsageStatsStore.getState().loadUsageStats({ force: true });
      });
      const state = useUsageStatsStore.getState();
      expect(state.summaryStatus).toBe('ready');
      expect(state.eventsStatus).toBe('legacy_degraded');
      expect(state.usage).not.toBeNull();
    } finally {
      usageApi.getUsageSummary = originalSummary;
      usageApi.getUsageEvents = originalEvents;
      usageApi.getUsage = originalUsage;
    }
  });
});
