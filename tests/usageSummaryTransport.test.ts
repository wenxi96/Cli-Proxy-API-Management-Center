import { describe, expect, test } from 'bun:test';
import { apiClient } from '../src/services/api/client';
import { usageApi } from '../src/services/api/usage';
import { isProjectionUnavailableError } from '../src/stores/useUsageStatsStore';

type RawResponse = {
  status: number;
  data: unknown;
  headers: Record<string, string>;
};

const rawUsageApi = usageApi as typeof usageApi & {
  getUsageSummary: (options?: { window?: string; etag?: string }) => Promise<RawResponse>;
};

describe('usage summary transport metadata', () => {
  test('preserves response metadata and sends a conditional ETag', async () => {
    const originalRequestRaw = apiClient.requestRaw;
    let requestConfig: Record<string, unknown> | undefined;
    apiClient.requestRaw = (async (config) => {
      requestConfig = config as Record<string, unknown>;
      return {
        status: 200,
        data: { schema_version: 1, range: { window: '24h' } },
        headers: {
          etag: 'W/"summary-next"',
          'cache-control': 'no-store',
          'x-usage-revision': '42',
        },
      } as never;
    }) as typeof apiClient.requestRaw;

    try {
      const response = await rawUsageApi.getUsageSummary({ window: '24h', etag: 'W/"summary"' });

      expect(response.status).toBe(200);
      expect(response.data).toEqual({ schema_version: 1, range: { window: '24h' } });
      expect(response.headers.etag).toBe('W/"summary-next"');
      expect(requestConfig?.url).toBe('/usage/summary');
      expect((requestConfig?.params as Record<string, unknown>)?.window).toBe('24h');
      expect((requestConfig?.headers as Record<string, unknown>)?.['If-None-Match']).toBe(
        'W/"summary"'
      );
      const validateStatus = requestConfig?.validateStatus as ((status: number) => boolean) | undefined;
      expect(validateStatus?.(200)).toBe(true);
      expect(validateStatus?.(304)).toBe(true);
      expect(validateStatus?.(303)).toBe(false);
    } finally {
      apiClient.requestRaw = originalRequestRaw;
    }
  });

  test('serializes repeated source IDs without changing the backend query key', async () => {
    const originalRequestRaw = apiClient.requestRaw;
    let requestConfig: Record<string, unknown> | undefined;
    apiClient.requestRaw = (async (config) => {
      requestConfig = config as Record<string, unknown>;
      return { status: 200, data: { items: [] }, headers: {} } as never;
    }) as typeof apiClient.requestRaw;

    try {
      await rawUsageApi.getUsageEvents({ source: ['source-b', 'source-a'] });
      const serializer = requestConfig?.paramsSerializer as {
        serialize?: (params: Record<string, unknown>) => string;
      };
      expect(serializer.serialize?.({ source: ['source-b', 'source-a'] })).toBe(
        'source=source-b&source=source-a'
      );
    } finally {
      apiClient.requestRaw = originalRequestRaw;
    }
  });

  test('treats a 304 response as a conditional success without replacing data', async () => {
    const originalRequestRaw = apiClient.requestRaw;
    apiClient.requestRaw = (async () =>
      ({
        status: 304,
        data: '',
        headers: {
          etag: 'W/"summary"',
          'cache-control': 'no-store',
          'x-usage-revision': '42',
        },
      }) as never) as typeof apiClient.requestRaw;

    try {
      const response = await rawUsageApi.getUsageSummary({ etag: 'W/"summary"' });
      expect(response.status).toBe(304);
      expect(response.data).toBe('');
      expect(response.headers['cache-control']).toBe('no-store');
    } finally {
      apiClient.requestRaw = originalRequestRaw;
    }
  });
});

describe('usage capability fallback classification', () => {
  test('only capability absence statuses activate legacy fallback', () => {
    const helpers = usageApi as typeof usageApi & {
      isCapabilityFallbackStatus: (status: number | undefined) => boolean;
    };

    expect(helpers.isCapabilityFallbackStatus(404)).toBe(true);
    expect(helpers.isCapabilityFallbackStatus(405)).toBe(true);
    expect(helpers.isCapabilityFallbackStatus(501)).toBe(true);
    expect(helpers.isCapabilityFallbackStatus(409)).toBe(false);
    expect(helpers.isCapabilityFallbackStatus(410)).toBe(false);
    expect(helpers.isCapabilityFallbackStatus(503)).toBe(false);
    expect(helpers.isCapabilityFallbackStatus(401)).toBe(false);
    expect(helpers.isCapabilityFallbackStatus(undefined)).toBe(false);
  });

  test('only a projection-unavailable 503 is eligible for legacy degradation', () => {
    const projectionError = Object.assign(new Error('projection unavailable'), {
      status: 503,
      apiCode: 'projection_unavailable',
    });
    const wrappedProjectionError = new Error('summary request failed', { cause: projectionError });
    const generic503 = Object.assign(new Error('service unavailable'), {
      status: 503,
      apiCode: 'service_unavailable',
    });
    const unclassified503 = Object.assign(new Error('service unavailable'), { status: 503 });

    expect(isProjectionUnavailableError(wrappedProjectionError)).toBe(true);
    expect(isProjectionUnavailableError(generic503)).toBe(false);
    expect(isProjectionUnavailableError(unclassified503)).toBe(false);
  });
});
