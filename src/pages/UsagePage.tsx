import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Select } from '@/components/ui/Select';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { providersApi } from '@/services/api';
import { useThemeStore, useConfigStore } from '@/stores';
import type { OpenAIProviderConfig } from '@/types';
import {
  StatCards,
  UsageChart,
  ChartLineSelector,
  ApiDetailsCard,
  ModelStatsCard,
  PriceSettingsCard,
  CredentialStatsCard,
  RequestEventsDetailsCard,
  TokenBreakdownChart,
  CostTrendChart,
  ServiceHealthCard,
  useUsageData,
  useSparklines,
  useChartData,
} from '@/components/usage';
import { buildSummaryHealthData } from '@/utils/usage/summaryAdapter';
import { buildCredentialRequestWindow } from '@/utils/usage/serverRange';
import {
  collectUsageDetails,
  getModelNamesFromUsage,
  getApiStats,
  getModelStats,
  getPriceOptionsFromUsage,
  getPriceOptionsFromCatalog,
  filterUsageByTimeRange,
  type UsageTimeRange,
} from '@/utils/usage';
import styles from './UsagePage.module.scss';

// Register Chart.js components
ChartJS.register(
  BarElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const CHART_LINES_STORAGE_KEY = 'cli-proxy-usage-chart-lines-v1';
const TIME_RANGE_STORAGE_KEY = 'cli-proxy-usage-time-range-v1';
const DEFAULT_CHART_LINES = ['all'];
const DEFAULT_TIME_RANGE: UsageTimeRange = '24h';
const MAX_CHART_LINES = 9;
const AUTO_USAGE_REFRESH_INTERVAL_MS = 60_000;
const USAGE_RECOVERY_REFRESH_THROTTLE_MS = 30_000;
const TIME_RANGE_OPTIONS: ReadonlyArray<{ value: UsageTimeRange; labelKey: string }> = [
  { value: 'all', labelKey: 'usage_stats.range_all' },
  { value: '7h', labelKey: 'usage_stats.range_7h' },
  { value: '24h', labelKey: 'usage_stats.range_24h' },
  { value: '7d', labelKey: 'usage_stats.range_7d' },
];
const HOUR_WINDOW_BY_TIME_RANGE: Record<Exclude<UsageTimeRange, 'all'>, number> = {
  '7h': 7,
  '24h': 24,
  '7d': 7 * 24,
};

const isUsageTimeRange = (value: unknown): value is UsageTimeRange =>
  value === '7h' || value === '24h' || value === '7d' || value === 'all';

const normalizeChartLines = (value: unknown, maxLines = MAX_CHART_LINES): string[] => {
  if (!Array.isArray(value)) {
    return DEFAULT_CHART_LINES;
  }

  const filtered = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxLines);

  return filtered.length ? filtered : DEFAULT_CHART_LINES;
};

const loadChartLines = (): string[] => {
  try {
    if (typeof localStorage === 'undefined') {
      return DEFAULT_CHART_LINES;
    }
    const raw = localStorage.getItem(CHART_LINES_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_CHART_LINES;
    }
    return normalizeChartLines(JSON.parse(raw));
  } catch {
    return DEFAULT_CHART_LINES;
  }
};

const loadTimeRange = (): UsageTimeRange => {
  try {
    if (typeof localStorage === 'undefined') {
      return DEFAULT_TIME_RANGE;
    }
    const raw = localStorage.getItem(TIME_RANGE_STORAGE_KEY);
    return isUsageTimeRange(raw) ? raw : DEFAULT_TIME_RANGE;
  } catch {
    return DEFAULT_TIME_RANGE;
  }
};

export function UsagePage() {
  const { t } = useTranslation();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const isDark = resolvedTheme === 'dark';
  const config = useConfigStore((state) => state.config);
  const openaiCompatibilityConfig = config?.openaiCompatibility;
  const [openaiProvidersWithAuthIndex, setOpenaiProvidersWithAuthIndex] = useState<{
    source: OpenAIProviderConfig[] | undefined;
    providers: OpenAIProviderConfig[];
  } | null>(null);

  // Data hook
  const {
    usage,
    summary,
    summaryDashboard,
    summaryStatus,
    summaryAnchor,
    summaryRange,
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
    loading,
    error,
    lastRefreshedAt,
    modelPrices,
    setModelPrices,
    loadUsage,
    handleExport,
    handleImport,
    handleImportChange,
    importInputRef,
    exporting,
    importing,
  } = useUsageData();

  // Chart lines state
  const [chartLines, setChartLines] = useState<string[]>(loadChartLines);
  const [timeRange, setTimeRange] = useState<UsageTimeRange>(loadTimeRange);
  const lastAutomaticCheckAtRef = useRef<number | null>(null);
  const refreshUsage = useCallback(() => loadUsage(timeRange, 'manual'), [loadUsage, timeRange]);

  const runAutomaticRefresh = useCallback(
    (minimumIntervalMs: number) => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      const now = Date.now();
      const lastCheckAt = lastAutomaticCheckAtRef.current;
      if (lastCheckAt !== null && now - lastCheckAt < minimumIntervalMs) return;
      lastAutomaticCheckAtRef.current = now;
      void loadUsage(timeRange, 'automatic').catch(() => {});
    },
    [loadUsage, timeRange]
  );

  useHeaderRefresh(refreshUsage);

  useEffect(() => {
    void loadUsage(timeRange).catch(() => {});
  }, [loadUsage, timeRange]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    // The range effect above performs the initial check; automatic checks start after it.
    lastAutomaticCheckAtRef.current = Date.now();
    const intervalId = window.setInterval(
      () => runAutomaticRefresh(AUTO_USAGE_REFRESH_INTERVAL_MS),
      AUTO_USAGE_REFRESH_INTERVAL_MS
    );
    const handleRecovery = () => {
      if (document.visibilityState === 'visible') {
        runAutomaticRefresh(USAGE_RECOVERY_REFRESH_THROTTLE_MS);
      }
    };
    window.addEventListener('focus', handleRecovery);
    document.addEventListener('visibilitychange', handleRecovery);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleRecovery);
      document.removeEventListener('visibilitychange', handleRecovery);
    };
  }, [runAutomaticRefresh]);

  useEffect(() => {
    let cancelled = false;
    const source = openaiCompatibilityConfig;

    providersApi
      .getOpenAIProviders()
      .then((providers) => {
        if (cancelled) return;
        setOpenaiProvidersWithAuthIndex({ source, providers: providers || [] });
      })
      .catch(() => {
        if (cancelled) return;
        setOpenaiProvidersWithAuthIndex(null);
      });

    return () => {
      cancelled = true;
    };
  }, [openaiCompatibilityConfig]);

  const openaiProviderState = openaiProvidersWithAuthIndex;
  const openaiProvidersForUsage =
    openaiProviderState && openaiProviderState.source === openaiCompatibilityConfig
      ? openaiProviderState.providers
      : (openaiCompatibilityConfig ?? []);

  const timeRangeOptions = useMemo(
    () =>
      TIME_RANGE_OPTIONS.map((opt) => ({
        value: opt.value,
        label: t(opt.labelKey),
      })),
    [t]
  );

  const filteredUsage = useMemo(
    () => (legacyDegraded && usage ? filterUsageByTimeRange(usage, timeRange) : null),
    [legacyDegraded, usage, timeRange]
  );
  const eventsFallbackUsage = useMemo(
    () => (eventsLegacyDegraded && usage ? filterUsageByTimeRange(usage, timeRange) : null),
    [eventsLegacyDegraded, timeRange, usage]
  );
  const credentialRequestWindow = useMemo(() => {
    return buildCredentialRequestWindow(summaryRange);
  }, [summaryRange]);
  const hourWindowHours = timeRange === 'all' ? undefined : HOUR_WINDOW_BY_TIME_RANGE[timeRange];

  const handleChartLinesChange = useCallback((lines: string[]) => {
    setChartLines(normalizeChartLines(lines));
  }, []);

  useEffect(() => {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }
      localStorage.setItem(CHART_LINES_STORAGE_KEY, JSON.stringify(chartLines));
    } catch {
      // Ignore storage errors.
    }
  }, [chartLines]);

  useEffect(() => {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }
      localStorage.setItem(TIME_RANGE_STORAGE_KEY, timeRange);
    } catch {
      // Ignore storage errors.
    }
  }, [timeRange]);

  const nowMs = lastRefreshedAt?.getTime() ?? 0;
  const allUsageDetails = useMemo(() => (legacyDegraded && usage ? collectUsageDetails(usage) : []), [legacyDegraded, usage]);

  // Sparklines hook
  const { requestsSparkline, tokensSparkline, rpmSparkline, tpmSparkline, costSparkline } =
    useSparklines({ usage: filteredUsage, loading, nowMs, modelPrices });

  // Chart data hook
  const {
    requestsPeriod,
    setRequestsPeriod,
    tokensPeriod,
    setTokensPeriod,
    requestsChartData,
    tokensChartData,
    requestsChartOptions,
    tokensChartOptions,
  } = useChartData({
    usage: filteredUsage,
    summary,
    chartLines,
    isDark,
    isMobile,
    hourWindowHours,
  });

  // Derived data
  const modelNames = useMemo(
    () => summaryDashboard?.modelStats.map((item) => item.model) ?? getModelNamesFromUsage(usage),
    [summaryDashboard, usage]
  );
  const apiStats = summaryDashboard?.apiStats ?? getApiStats(filteredUsage, modelPrices);
  const modelStats = summaryDashboard?.modelStats ?? getModelStats(filteredUsage, modelPrices);
  const hasPrices = Boolean(summaryDashboard || filteredUsage);
  const priceOptions = useMemo(
    () =>
      catalog
        ? getPriceOptionsFromCatalog(catalog, modelPrices)
        : getPriceOptionsFromUsage(allUsageDetails, modelPrices),
    [allUsageDetails, catalog, modelPrices]
  );

  return (
    <div className={styles.container}>
      {loading && !usage && (
        <div className={styles.loadingOverlay} aria-busy="true">
          <div className={styles.loadingOverlayContent}>
            <LoadingSpinner size={28} className={styles.loadingOverlaySpinner} />
            <span className={styles.loadingOverlayText}>{t('common.loading')}</span>
          </div>
        </div>
      )}

      <div className={styles.header}>
        <h1 className={styles.pageTitle}>{t('usage_stats.title')}</h1>
        <div className={styles.headerActions}>
          <div className={styles.timeRangeGroup}>
            <span className={styles.timeRangeLabel}>{t('usage_stats.range_filter')}</span>
            <Select
              value={timeRange}
              options={timeRangeOptions}
              onChange={(value) => setTimeRange(value as UsageTimeRange)}
              className={styles.timeRangeSelectControl}
              ariaLabel={t('usage_stats.range_filter')}
              fullWidth={false}
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExport}
            loading={exporting}
            disabled={loading || importing}
          >
            {t('usage_stats.export')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleImport}
            loading={importing}
            disabled={loading || exporting}
          >
            {t('usage_stats.import')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void refreshUsage().catch(() => {})}
            disabled={loading || exporting || importing}
          >
            {loading ? t('common.loading') : t('usage_stats.refresh')}
          </Button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={(event) => void handleImportChange(event, timeRange)}
          />
          {lastRefreshedAt && (
            <span className={styles.lastRefreshed}>
              {t('usage_stats.last_updated')}: {lastRefreshedAt.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {(error || summaryError) && <div className={styles.errorBox}>{error || summaryError}</div>}
      {summaryStatus === 'unavailable' && (
        <div className={styles.errorBox}>{t('usage_stats.loading_error')}</div>
      )}

      {/* Stats Overview Cards */}
      <StatCards
        usage={filteredUsage}
        dashboard={summaryDashboard}
        loading={loading}
        modelPrices={modelPrices}
        nowMs={nowMs}
        sparklines={{
          requests: requestsSparkline,
          tokens: tokensSparkline,
          rpm: rpmSparkline,
          tpm: tpmSparkline,
          cost: costSparkline,
        }}
      />

      {/* Chart Line Selection */}
      <ChartLineSelector
        chartLines={chartLines}
        modelNames={modelNames}
        maxLines={MAX_CHART_LINES}
        onChange={handleChartLinesChange}
      />

      {/* Service Health */}
      <ServiceHealthCard
        usage={filteredUsage}
        summaryHealth={summary ? buildSummaryHealthData(summary) : null}
        loading={loading}
      />

      {/* Charts Grid */}
      <div className={styles.chartsGrid}>
        <UsageChart
          title={t('usage_stats.requests_trend')}
          period={requestsPeriod}
          onPeriodChange={setRequestsPeriod}
          chartData={requestsChartData}
          chartOptions={requestsChartOptions}
          loading={loading}
          isMobile={isMobile}
          emptyText={t('usage_stats.no_data')}
        />
        <UsageChart
          title={t('usage_stats.tokens_trend')}
          period={tokensPeriod}
          onPeriodChange={setTokensPeriod}
          chartData={tokensChartData}
          chartOptions={tokensChartOptions}
          loading={loading}
          isMobile={isMobile}
          emptyText={t('usage_stats.no_data')}
        />
      </div>

      {/* Token Breakdown Chart */}
      <TokenBreakdownChart
        usage={filteredUsage}
        loading={loading}
        isDark={isDark}
        isMobile={isMobile}
        hourWindowHours={hourWindowHours}
      />

      {/* Cost Trend Chart */}
      <CostTrendChart
        usage={filteredUsage}
        loading={loading}
        isDark={isDark}
        isMobile={isMobile}
        modelPrices={modelPrices}
        hourWindowHours={hourWindowHours}
      />

      {/* Details Grid */}
      <div className={styles.detailsGrid}>
        <ApiDetailsCard
          apiStats={apiStats}
          loading={loading}
          hasPrices={hasPrices}
          numericDataComplete={summaryDashboard?.numericDataComplete ?? true}
        />
        <ModelStatsCard
          modelStats={modelStats}
          loading={loading}
          hasPrices={hasPrices}
          numericDataComplete={summaryDashboard?.numericDataComplete ?? true}
        />
      </div>

      <RequestEventsDetailsCard
        usage={legacyDegraded ? filteredUsage : eventsFallbackUsage}
        summaryMode={Boolean(summaryDashboard) && !eventsLegacyDegraded}
        usageWindow={timeRange}
        usageAnchor={summaryAnchor}
        summaryRange={summaryRange}
        events={events}
        eventsStatus={eventsStatus}
        eventsHasMore={eventsHasMore}
        eventsError={eventsError}
        legacyFallbackError={eventsFallbackError}
        loadUsageEvents={loadUsageEvents}
        loading={loading}
        geminiKeys={config?.geminiApiKeys || []}
        claudeConfigs={config?.claudeApiKeys || []}
        codexConfigs={config?.codexApiKeys || []}
        vertexConfigs={config?.vertexApiKeys || []}
        openaiProviders={openaiProvidersForUsage}
        modelPrices={modelPrices}
        catalog={catalog}
        facets={summary && typeof summary === 'object' ? (summary as Record<string, unknown>).facets : undefined}
      />

      {/* Credential Stats */}
      <CredentialStatsCard
        usage={filteredUsage}
        loading={loading}
        geminiKeys={config?.geminiApiKeys || []}
        claudeConfigs={config?.claudeApiKeys || []}
        codexConfigs={config?.codexApiKeys || []}
        vertexConfigs={config?.vertexApiKeys || []}
        openaiProviders={openaiProvidersForUsage}
        modelPrices={modelPrices}
        requestWindow={credentialRequestWindow}
      />

      {/* Price Settings */}
      <PriceSettingsCard
        priceOptions={priceOptions}
        modelPrices={modelPrices}
        onPricesChange={setModelPrices}
      />
    </div>
  );
}
