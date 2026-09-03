import { describe, expect, test } from 'bun:test';
import { usageApi, type UsageEventsResponse } from '../src/services/api/usage';
import { useUsageStatsStore } from '../src/stores/useUsageStatsStore';
import { useAuthStore } from '../src/stores/useAuthStore';

const storage = new Map<string, string>();
Object.assign(globalThis, {
  window: { location: { host: 'usage-events.test' } },
  navigator: { userAgent: 'bun-test' },
  localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  },
});

const page = (overrides: Partial<UsageEventsResponse> = {}): UsageEventsResponse => ({
  status: 200,
  data: {
    schema_version: 1,
    items: [
      { request_id: 'req-1', timestamp: '2026-08-13T01:00:00Z' },
      { request_id: 'req-2', timestamp: '2026-08-13T00:59:00Z' },
    ],
    next_cursor: 'cursor-2',
    has_more: true,
    snapshot: { dataset_epoch: 'epoch-1', max_sequence: 2, rewrite_revision: 1 },
  },
  headers: { etag: 'W/"events-1"', 'x-usage-revision': '2' },
  ...overrides,
});

const reset = () => {
  useUsageStatsStore.getState().clearUsageStats();
  useAuthStore.setState({ apiBase: 'http://events.test', managementKey: 'events-key' });
};

describe('usage events cursor store', () => {
  test('keeps only the current cursor page and does not reuse a later-page ETag', async () => {
    reset();
    const original = usageApi.getUsageEvents;
    const calls: Array<{ cursor?: string; limit?: number; model?: string; etag?: string }> = [];
    usageApi.getUsageEvents = async (options) => {
      calls.push(options);
      return calls.length === 1 || calls.length === 3
        ? page()
        : page({
            headers: { etag: 'W/"events-page-2"', 'x-usage-revision': '3' },
            data: {
              schema_version: 1,
              items: [
                { request_id: 'req-2', timestamp: '2026-08-13T00:59:00Z' },
                { request_id: 'req-3', timestamp: '2026-08-13T00:58:00Z' },
              ],
              next_cursor: '',
              has_more: false,
              snapshot: { dataset_epoch: 'epoch-1', max_sequence: 3, rewrite_revision: 1 },
            },
          });
    };

    try {
      await useUsageStatsStore.getState().loadUsageEvents({ limit: 2, model: 'gpt-5' });
      await useUsageStatsStore.getState().loadUsageEvents({ limit: 2, model: 'gpt-5', append: true });
      await useUsageStatsStore.getState().loadUsageEvents({ limit: 2, model: 'gpt-5' });

      expect(calls).toEqual([
        { limit: 2, model: 'gpt-5' },
        { limit: 2, model: 'gpt-5', cursor: 'cursor-2' },
        { limit: 2, model: 'gpt-5' },
      ]);
      expect(useUsageStatsStore.getState().events.map((item) => item.request_id)).toEqual(['req-1', 'req-2']);
      expect(useUsageStatsStore.getState().eventsEtag).toBe('W/"events-1"');
      expect(useUsageStatsStore.getState().eventsNextCursor).toBe('cursor-2');
    } finally {
      usageApi.getUsageEvents = original;
    }
  });

  test('preserves the first page cursor and ETag on a 304 refresh', async () => {
    reset();
    const original = usageApi.getUsageEvents;
    let call = 0;
    usageApi.getUsageEvents = async () => {
      call += 1;
      return call === 1
        ? page()
        : page({ status: 304, data: '', headers: { etag: 'W/"events-1"' } });
    };

    try {
      await useUsageStatsStore.getState().loadUsageEvents({ limit: 2 });
      await useUsageStatsStore.getState().loadUsageEvents({ limit: 2 });
      const state = useUsageStatsStore.getState();
      expect(state.events.map((item) => item.request_id)).toEqual(['req-1', 'req-2']);
      expect(state.eventsNextCursor).toBe('cursor-2');
      expect(state.eventsHasMore).toBe(true);
      expect(state.eventsEtag).toBe('W/"events-1"');
      expect(state.eventsStatus).toBe('not_modified');
    } finally {
      usageApi.getUsageEvents = original;
    }
  });

  test('changing filters starts a fresh page and clears the old cursor and rows', async () => {
    reset();
    const original = usageApi.getUsageEvents;
    const calls: Array<{ cursor?: string; model?: string }> = [];
    usageApi.getUsageEvents = async (options) => {
      calls.push(options);
      return page({
        data: {
          schema_version: 1,
          items: [{ request_id: options.model === 'new-model' ? 'new-1' : 'old-1' }],
          next_cursor: options.model === 'new-model' ? 'new-cursor' : 'old-cursor',
          has_more: true,
          snapshot: { dataset_epoch: 'epoch-1', max_sequence: 1, rewrite_revision: 1 },
        },
      });
    };

    try {
      await useUsageStatsStore.getState().loadUsageEvents({ model: 'old-model' });
      await useUsageStatsStore.getState().loadUsageEvents({ model: 'new-model' });

      expect(calls).toEqual([{ model: 'old-model' }, { model: 'new-model' }]);
      expect(useUsageStatsStore.getState().events.map((item) => item.request_id)).toEqual(['new-1']);
      expect(useUsageStatsStore.getState().eventsNextCursor).toBe('new-cursor');
    } finally {
      usageApi.getUsageEvents = original;
    }
  });

  test('keeps the current page visible while a same-scope filter request is pending', async () => {
    reset();
    const original = usageApi.getUsageEvents;
    let resolveNext: ((response: UsageEventsResponse) => void) | undefined;
    let call = 0;
    usageApi.getUsageEvents = async (_options) => {
      call += 1;
      if (call === 1) {
        return page({
          data: {
            schema_version: 1,
            items: [{ request_id: 'old-page' }],
            next_cursor: 'old-cursor',
            has_more: true,
          },
        });
      }
      return new Promise<UsageEventsResponse>((resolve) => {
        resolveNext = resolve;
      });
    };

    try {
      await useUsageStatsStore.getState().loadUsageEvents({ model: 'old-model' });
      const next = useUsageStatsStore.getState().loadUsageEvents({ model: 'new-model' });

      expect(useUsageStatsStore.getState().events.map((item) => item.request_id)).toEqual([
        'old-page',
      ]);
      expect(useUsageStatsStore.getState().eventsStatus).toBe('loading');

      resolveNext?.(page({
        data: {
          schema_version: 1,
          items: [{ request_id: 'new-page' }],
          next_cursor: '',
          has_more: false,
        },
      }));
      await next;
      expect(useUsageStatsStore.getState().events.map((item) => item.request_id)).toEqual([
        'new-page',
      ]);
    } finally {
      usageApi.getUsageEvents = original;
    }
  });

  test('keeps cursor expiry as an explicit error instead of activating legacy fallback', async () => {
    reset();
    const original = usageApi.getUsageEvents;
    usageApi.getUsageEvents = async () => {
      const error = new Error('cursor expired') as Error & { status?: number; apiCode?: string };
      error.status = 409;
      error.apiCode = 'cursor_expired';
      throw error;
    };

    try {
      await expect(useUsageStatsStore.getState().loadUsageEvents({ cursor: 'expired' })).rejects.toThrow(
        'cursor expired'
      );
      expect(useUsageStatsStore.getState().eventsStatus).toBe('error');
      expect(useUsageStatsStore.getState().eventsNextCursor).toBeNull();
    } finally {
      usageApi.getUsageEvents = original;
    }
  });

  test('resets to the first page and retries once when an appended cursor expires', async () => {
    reset();
    const original = usageApi.getUsageEvents;
    const calls: Array<{ cursor?: string; limit?: number }> = [];
    usageApi.getUsageEvents = async (options) => {
      calls.push(options);
      if (calls.length === 2) {
        const error = new Error('cursor expired') as Error & { status?: number; apiCode?: string };
        error.status = 409;
        error.apiCode = 'cursor_expired';
        throw error;
      }
      return page({
        data: {
          schema_version: 1,
          items: [{ request_id: calls.length === 1 ? 'stale-page' : 'fresh-page' }],
          next_cursor: calls.length === 1 ? 'stale-cursor' : 'fresh-cursor',
          has_more: true,
          snapshot: { dataset_epoch: 'epoch-1', max_sequence: calls.length, rewrite_revision: 1 },
        },
      });
    };

    try {
      await useUsageStatsStore.getState().loadUsageEvents({ limit: 1 });
      await useUsageStatsStore.getState().loadUsageEvents({ limit: 1, append: true });

      expect(calls).toEqual([
        { limit: 1 },
        { limit: 1, cursor: 'stale-cursor' },
        { limit: 1 },
      ]);
      expect(useUsageStatsStore.getState().events.map((item) => item.request_id)).toEqual([
        'fresh-page',
      ]);
      expect(useUsageStatsStore.getState().eventsNextCursor).toBe('fresh-cursor');
      expect(useUsageStatsStore.getState().eventsStatus).toBe('ready');
    } finally {
      usageApi.getUsageEvents = original;
    }
  });

  test('resets to the first page and retries once after the dataset epoch changes', async () => {
    reset();
    const original = usageApi.getUsageEvents;
    const calls: Array<{ cursor?: string; limit?: number }> = [];
    usageApi.getUsageEvents = async (options) => {
      calls.push(options);
      if (calls.length === 2) {
        const error = new Error('dataset epoch gone') as Error & { status?: number; apiCode?: string };
        error.status = 410;
        error.apiCode = 'dataset_epoch_gone';
        throw error;
      }
      return page({
        data: {
          schema_version: 1,
          items: [{ request_id: calls.length === 1 ? 'old-epoch-page' : 'new-epoch-page' }],
          next_cursor: calls.length === 1 ? 'old-epoch-cursor' : '',
          has_more: calls.length === 1,
          snapshot: {
            dataset_epoch: calls.length === 1 ? 'epoch-old' : 'epoch-new',
            max_sequence: calls.length,
            rewrite_revision: 1,
          },
        },
      });
    };

    try {
      await useUsageStatsStore.getState().loadUsageEvents({ limit: 1 });
      await useUsageStatsStore.getState().loadUsageEvents({ limit: 1, append: true });

      expect(calls).toEqual([
        { limit: 1 },
        { limit: 1, cursor: 'old-epoch-cursor' },
        { limit: 1 },
      ]);
      expect(useUsageStatsStore.getState().events.map((item) => item.request_id)).toEqual([
        'new-epoch-page',
      ]);
      expect(useUsageStatsStore.getState().eventsNextCursor).toBeNull();
      expect(useUsageStatsStore.getState().eventsHasMore).toBe(false);
      expect(useUsageStatsStore.getState().eventsStatus).toBe('ready');
    } finally {
      usageApi.getUsageEvents = original;
    }
  });

  test('keeps distinct detail roles and sequences within the current page', async () => {
    reset();
    const original = usageApi.getUsageEvents;
    let call = 0;
    usageApi.getUsageEvents = async () => {
      call += 1;
      return page({
        data: {
          schema_version: 1,
          items: call === 1
            ? [
                { request_id: 'req-shared', detail_role: 'primary', detail_sequence: '1' },
                { request_id: 'req-shared', detail_role: 'secondary', detail_sequence: '2' },
              ]
            : [
                { request_id: 'req-shared', detail_role: 'primary', detail_sequence: '1' },
                { request_id: 'req-shared', detail_role: 'secondary', detail_sequence: '3' },
              ],
          next_cursor: call === 1 ? 'cursor-next' : '',
          has_more: call === 1,
          snapshot: { dataset_epoch: 'epoch-1', max_sequence: 3, rewrite_revision: 1 },
        },
      });
    };

    try {
      await useUsageStatsStore.getState().loadUsageEvents({ limit: 2 });
      await useUsageStatsStore.getState().loadUsageEvents({ limit: 2, append: true });
      expect(useUsageStatsStore.getState().events.map((item) => [
        item.request_id,
        item.detail_role,
        item.detail_sequence,
      ])).toEqual([
        ['req-shared', 'primary', '1'],
        ['req-shared', 'secondary', '3'],
      ]);
    } finally {
      usageApi.getUsageEvents = original;
    }
  });

  test('deduplicates payload fallback regardless of object property order', async () => {
    reset();
    const original = usageApi.getUsageEvents;
    let call = 0;
    usageApi.getUsageEvents = async () => {
      call += 1;
      return page({
        data: {
          schema_version: 1,
          items: call === 1
            ? [{ model: 'gpt-5', timestamp: '2026-08-13T00:00:00Z', failed: false }]
            : [{ failed: false, timestamp: '2026-08-13T00:00:00Z', model: 'gpt-5' }],
          next_cursor: call === 1 ? 'cursor-next' : '',
          has_more: call === 1,
          snapshot: { dataset_epoch: 'epoch-1', max_sequence: 1, rewrite_revision: 1 },
        },
      });
    };
    try {
      await useUsageStatsStore.getState().loadUsageEvents({ limit: 1 });
      await useUsageStatsStore.getState().loadUsageEvents({ limit: 1, append: true });
      expect(useUsageStatsStore.getState().events).toHaveLength(1);
    } finally {
      usageApi.getUsageEvents = original;
    }
  });

  test('deduplicates legacy rows without an id using their stable payload instead of page index', async () => {
    reset();
    const original = usageApi.getUsageEvents;
    let call = 0;
    usageApi.getUsageEvents = async () => {
      call += 1;
      return page({
        data: {
          schema_version: 1,
          items: call === 1
            ? [{ timestamp: '2026-08-13T01:00:00Z', model: 'gpt-5' }]
            : [{ timestamp: '2026-08-13T01:00:00Z', model: 'gpt-5' }],
          next_cursor: call === 1 ? 'cursor-next' : '',
          has_more: call === 1,
        },
      });
    };

    try {
      await useUsageStatsStore.getState().loadUsageEvents({ limit: 1 });
      await useUsageStatsStore.getState().loadUsageEvents({ limit: 1, append: true });
      expect(useUsageStatsStore.getState().events).toHaveLength(1);
    } finally {
      usageApi.getUsageEvents = original;
    }
  });
});
