import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  USAGE_STATS_STALE_TIME_MS,
  useNotificationStore,
  useAuthStore,
  isProjectionUnavailableError,
  useUsageStatsStore,
} from '@/stores';
import {
  usageApi,
  type UsageAuthSummary,
  type UsageEventItem,
  type UsageEventsRequestOptions,
  type UsageSummaryRequestOptions,
} from '@/services/api/usage';
import { downloadBlob } from '@/utils/download';
import {
  loadModelPrices,
  saveModelPrices,
  type ModelPriceOverrides,
} from '@/utils/usage';
import {
  buildSummaryDashboard,
  type SummaryDashboard,
} from '@/utils/usage/summaryAdapter';
import { buildUsageRangeQuery } from '@/utils/usage/serverRange';

export interface UsagePayload {
  total_requests?: number;
  success_count?: number;
  failure_count?: number;
  total_tokens?: number;
  apis?: Record<string, unknown>;
  auths?: Record<string, UsageAuthSummary> | UsageAuthSummary[];
  [key: string]: unknown;
}

export type UsageLoadMode = 'manual' | 'automatic';

type UsageSummaryRefreshState = {
  summaryRange: Record<string, unknown> | null;
  summaryAnchor: string | null;
  summaryEtag: string | null;
};

type UsageEventsRefreshState = {
  summaryRange: Record<string, unknown> | null;
  summaryAnchor: string | null;
};

export const buildUsageSummaryLoadOptions = (
  window: string,
  mode: UsageLoadMode,
  state: UsageSummaryRefreshState
): UsageSummaryRequestOptions => {
  const summaryWindow = typeof state.summaryRange?.window === 'string' ? state.summaryRange.window : null;
  if (mode === 'automatic' && summaryWindow === window && state.summaryAnchor) {
    return {
      window,
      anchor: state.summaryAnchor,
      etag: state.summaryEtag ?? '',
    };
  }
  // An empty ETag explicitly disables the store's implicit conditional request.
  return { window, etag: '' };
};

export const buildUsageEventsLoadOptions = (
  window: string,
  state: UsageEventsRefreshState
): UsageEventsRequestOptions | null => {
  const rangeQuery = buildUsageRangeQuery(state.summaryRange, window, state.summaryAnchor);
  if (!rangeQuery) return null;
  return {
    ...rangeQuery,
    limit: 50,
  };
};

export interface UseUsageDataReturn {
  usage: UsagePayload | null;
  summary: Record<string, unknown> | null;
  summaryDashboard: SummaryDashboard | null;
  summaryStatus: ReturnType<typeof useUsageStatsStore.getState>['summaryStatus'];
  summaryAnchor: string | null;
  summaryRange: Record<string, unknown> | null;
  summaryError: string | null;
  legacyDegraded: boolean;
  eventsLegacyDegraded: boolean;
  events: UsageEventItem[];
  eventsStatus: ReturnType<typeof useUsageStatsStore.getState>['eventsStatus'];
  eventsHasMore: boolean;
  eventsError: string | null;
  eventsFallbackError: string | null;
  loadUsageEvents: (options?: UsageEventsRequestOptions & { append?: boolean }) => Promise<void>;
  catalog: Record<string, unknown> | null;
  catalogStatus: ReturnType<typeof useUsageStatsStore.getState>['catalogStatus'];
  loading: boolean;
  error: string;
  lastRefreshedAt: Date | null;
  modelPrices: ModelPriceOverrides;
  setModelPrices: (prices: ModelPriceOverrides) => void;
  loadUsage: (window?: string, mode?: UsageLoadMode) => Promise<void>;
  handleExport: () => Promise<void>;
  handleImport: () => void;
  handleImportChange: (
    event: React.ChangeEvent<HTMLInputElement>,
    window?: string
  ) => Promise<void>;
  importInputRef: React.RefObject<HTMLInputElement | null>;
  exporting: boolean;
  importing: boolean;
}

export function useUsageData(): UseUsageDataReturn {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const connectionScopeKey = useAuthStore((state) => `${state.apiBase}::${state.managementKey}`);
  const usageSnapshot = useUsageStatsStore((state) => state.usage);
  const usageScopeKey = useUsageStatsStore((state) => state.scopeKey);
  const summarySnapshot = useUsageStatsStore((state) => state.summary);
  const summaryStatus = useUsageStatsStore((state) => state.summaryStatus);
  const summaryAnchor = useUsageStatsStore((state) => state.summaryAnchor);
  const summaryRange = useUsageStatsStore((state) => state.summaryRange);
  const summaryError = useUsageStatsStore((state) => state.summaryError);
  const events = useUsageStatsStore((state) => state.events);
  const eventsStatus = useUsageStatsStore((state) => state.eventsStatus);
  const eventsHasMore = useUsageStatsStore((state) => state.eventsHasMore);
  const eventsError = useUsageStatsStore((state) => state.eventsError);
  const loadUsageEvents = useUsageStatsStore((state) => state.loadUsageEvents);
  const catalog = useUsageStatsStore((state) => state.catalog);
  const catalogStatus = useUsageStatsStore((state) => state.catalogStatus);
  const loadUsageCatalog = useUsageStatsStore((state) => state.loadUsageCatalog);
  const legacyLoading = useUsageStatsStore((state) => state.loading);
  const summaryLoading = summaryStatus === 'loading';
  const storeError = useUsageStatsStore((state) => state.error);
  const lastRefreshedAtTs = useUsageStatsStore((state) => state.lastRefreshedAt);
  const summaryLastRefreshedAtTs = useUsageStatsStore((state) => state.summaryLastRefreshedAt);
  const loadUsageStats = useUsageStatsStore((state) => state.loadUsageStats);
  const loadUsageSummary = useUsageStatsStore((state) => state.loadUsageSummary);

  const [modelPrices, setModelPrices] = useState<ModelPriceOverrides>({});
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const loadUsage = useCallback(async (window = '24h', mode: UsageLoadMode = 'manual') => {
    try {
      const summaryState = useUsageStatsStore.getState();
      const summaryOptions = buildUsageSummaryLoadOptions(window, mode, summaryState);
      await loadUsageSummary(summaryOptions);
      const state = useUsageStatsStore.getState();
      const eventsOptions = buildUsageEventsLoadOptions(window, {
        summaryRange: state.summaryRange,
        summaryAnchor: state.summaryAnchor,
      });
      if ((state.summaryStatus === 'ready' || state.summaryStatus === 'not_modified') && eventsOptions) {
        await loadUsageEvents(eventsOptions).catch(async () => {
          const eventsState = useUsageStatsStore.getState();
          if (eventsState.eventsStatus === 'legacy_degraded') {
            await loadUsageStats({ force: true, staleTimeMs: USAGE_STATS_STALE_TIME_MS });
          }
        });
      }
      return;
    } catch (error: unknown) {
      const state = useUsageStatsStore.getState();
      const canDegrade =
        state.summaryStatus === 'legacy_degraded' || isProjectionUnavailableError(error);
      if (!canDegrade) throw error;

      // A single explicit legacy read is allowed for capability/projection degradation.
      await loadUsageStats({ force: true, staleTimeMs: USAGE_STATS_STALE_TIME_MS });
    }
  }, [loadUsageEvents, loadUsageStats, loadUsageSummary]);

  useEffect(() => {
    void loadUsageCatalog().catch(() => {});
    setModelPrices(loadModelPrices());
  }, [connectionScopeKey, loadUsageCatalog, usageScopeKey]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await usageApi.exportUsage();
      const exportedAt =
        typeof data?.exported_at === 'string' ? new Date(data.exported_at) : new Date();
      const safeTimestamp = Number.isNaN(exportedAt.getTime())
        ? new Date().toISOString()
        : exportedAt.toISOString();
      const filename = `usage-export-${safeTimestamp.replace(/[:.]/g, '-')}.json`;
      downloadBlob({
        filename,
        blob: new Blob([JSON.stringify(data ?? {}, null, 2)], { type: 'application/json' })
      });
      showNotification(t('usage_stats.export_success'), 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      showNotification(
        `${t('notification.download_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
    } finally {
      setExporting(false);
    }
  };

  const handleImport = () => {
    importInputRef.current?.click();
  };

  const handleImportChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
    window = '24h'
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setImporting(true);
    try {
      const text = await file.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        showNotification(t('usage_stats.import_invalid'), 'error');
        return;
      }

      const result = await usageApi.importUsage(payload);
      showNotification(
        t('usage_stats.import_success', {
          added: result?.added ?? 0,
          skipped: result?.skipped ?? 0,
          total: result?.total_requests ?? 0,
          failed: result?.failed_requests ?? 0
        }),
        'success'
      );
      try {
        await loadUsage(window);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : '';
        showNotification(
          `${t('notification.refresh_failed')}${message ? `: ${message}` : ''}`,
          'error'
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      showNotification(
        `${t('notification.upload_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
    } finally {
      setImporting(false);
    }
  };

  const handleSetModelPrices = useCallback((prices: ModelPriceOverrides) => {
    setModelPrices(prices);
    saveModelPrices(prices);
  }, []);

  const usage = usageSnapshot as UsagePayload | null;
  const legacyDegraded = Boolean(usage && summaryStatus !== 'ready' && summaryStatus !== 'not_modified');
  const summary = legacyDegraded ? null : summarySnapshot;
  const summaryDashboard = useMemo(
    () => (summary ? buildSummaryDashboard(summary, modelPrices) : null),
    [modelPrices, summary]
  );
  const error = storeError || '';
  const loading = summaryLoading || legacyLoading;
  const eventsLegacyDegraded = eventsStatus === 'legacy_degraded';
  const eventsFallbackError = eventsLegacyDegraded ? error || null : null;
  const renderSummaryAnchor = legacyDegraded ? null : summaryAnchor;
  const renderSummaryRange = legacyDegraded ? null : summaryRange;
  const lastRefreshedAt = summaryLastRefreshedAtTs
    ? new Date(summaryLastRefreshedAtTs)
    : lastRefreshedAtTs
      ? new Date(lastRefreshedAtTs)
      : null;

  return {
    usage,
    summary,
    summaryDashboard,
    summaryStatus,
    summaryAnchor: renderSummaryAnchor,
    summaryRange: renderSummaryRange,
    summaryError,
    legacyDegraded,
    eventsLegacyDegraded,
    events,
    eventsStatus,
    eventsHasMore,
    eventsError,
    eventsFallbackError,
    loadUsageEvents,
    catalog,
    catalogStatus,
    loading,
    error,
    lastRefreshedAt,
    modelPrices,
    setModelPrices: handleSetModelPrices,
    loadUsage,
    handleExport,
    handleImport,
    handleImportChange,
    importInputRef,
    exporting,
    importing
  };
}
