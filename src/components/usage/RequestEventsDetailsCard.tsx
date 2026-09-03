import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Select';
import { authFilesApi } from '@/services/api/authFiles';
import type { GeminiKeyConfig, ProviderKeyConfig, OpenAIProviderConfig } from '@/types';
import type { AuthFileItem } from '@/types/authFile';
import type { CredentialInfo } from '@/types/sourceInfo';
import { buildSourceInfoMap, resolveSourceDisplay } from '@/utils/sourceResolver';
import { parseTimestampMs } from '@/utils/timestamp';
import type { UsageEventItem, UsageEventsRequestOptions } from '@/services/api/usage';
import type { UsageEventsStatus } from '@/stores/useUsageStatsStore';
import {
  calculateUsageCost,
  collectUsageDetails,
  extractLatencyMs,
  formatUsd,
  formatDurationMs,
  LATENCY_SOURCE_FIELD,
  normalizeAuthIndex,
  normalizeUsageDetail,
  type CostStatus,
  type ModelPriceOverrides,
  type UsageThinking,
} from '@/utils/usage';
import { downloadBlob } from '@/utils/download';
import {
  canUseBlobFallback,
  createBlobSink,
  createFileSystemSink,
  createServiceWorkerSink,
  estimateUsageEventsExport,
  getExportSinkSuccessTranslationKey,
  streamUsageEventsExportToSink,
  type ExportLabelOverrides,
} from '@/utils/usage/exportClient';
import { EXPORT_DERIVATION_PROFILE, EXPORT_SCHEMA_VERSION } from '@/utils/usage/exportProfile';
import type { UsageCatalogPayload } from '@/services/api/usage';
import { useNotificationStore } from '@/stores';
import {
  usageEventIdentityKey,
  usageEventOccurrenceKey,
} from '@/utils/usage/eventIdentity';
import { buildUsageEventQueryOptionsFromRange } from '@/utils/usage/eventQuery';
import { filterUsageEventRows } from '@/utils/usage/eventFilters';
import { buildUsageRangeQuery } from '@/utils/usage/serverRange';
import styles from '@/pages/UsagePage.module.scss';

const ALL_FILTER = '__all__';
const MAX_RENDERED_EVENTS = 500;

type RequestEventRow = {
  id: string;
  timestamp: string;
  timestampMs: number;
  timestampLabel: string;
  model: string;
  sourceKey: string;
  sourceRaw: string;
  source: string;
  sourceType: string;
  authIndex: string;
  failed: boolean;
  latencyMs: number | null;
  thinking: UsageThinking | null;
  thinkingLabel: string;
  hasKnownUsage: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  cacheReadTokens: number | null;
  cacheCreationTokens: number | null;
  cachedTokens: number | null;
  totalTokens: number | null;
  reportedTotalTokens: number | null;
  computedTotalTokens: number | null;
  cacheRatio: number | null;
  inputCostUsd: number | null;
  outputCostUsd: number | null;
  cacheCostUsd: number | null;
  totalCostUsd: number | null;
  costStatus: CostStatus;
  missingPriceModels: string[];
  missingPriceComponents: string[];
};

export interface RequestEventsDetailsCardProps {
  usage: unknown;
  summaryMode?: boolean;
  usageWindow?: string;
  usageAnchor?: string | null;
  summaryRange?: Record<string, unknown> | null;
  events?: UsageEventItem[];
  eventsStatus?: UsageEventsStatus;
  eventsHasMore?: boolean;
  eventsError?: string | null;
  legacyFallbackError?: string | null;
  loadUsageEvents?: (options?: UsageEventsRequestOptions & { append?: boolean }) => Promise<void>;
  loading: boolean;
  geminiKeys: GeminiKeyConfig[];
  claudeConfigs: ProviderKeyConfig[];
  codexConfigs: ProviderKeyConfig[];
  vertexConfigs: ProviderKeyConfig[];
  openaiProviders: OpenAIProviderConfig[];
  modelPrices: ModelPriceOverrides;
  catalog?: unknown;
  facets?: unknown;
}

const normalizeThinkingText = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const formatThinkingLabel = (thinking: UsageThinking | null): string => {
  if (!thinking) return '-';

  const intensity = normalizeThinkingText(thinking.intensity);
  const level = normalizeThinkingText(thinking.level);
  const mode = normalizeThinkingText(thinking.mode);
  const budget =
    typeof thinking.budget === 'number' && Number.isFinite(thinking.budget)
      ? thinking.budget
      : null;
  const label = intensity || level || (budget !== null ? String(budget) : mode);
  const budgetLabel = budget !== null ? budget.toLocaleString() : null;

  if (!label) return '-';
  if (budgetLabel !== null && label === String(budget)) {
    return budgetLabel;
  }
  if (mode === 'budget' && budget !== null && budget > 0) {
    return `${label} (${budgetLabel})`;
  }
  if (budget === -1 && label !== 'auto') {
    return `${label} (-1)`;
  }
  return label;
};

const encodeCsv = (value: string | number | null): string => {
  const text = String(value ?? '');
  const trimmedLeft = text.replace(/^\s+/, '');
  const safeText = trimmedLeft && /^[=+\-@]/.test(trimmedLeft) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
};

const formatTokenValue = (value: number | null): string =>
  value === null ? '--' : value.toLocaleString();

const formatCostValue = (value: number | null): string => (value === null ? '--' : formatUsd(value));

const getCostStatusLabelKey = (status: CostStatus) => {
  if (status === 'unknown_usage') return 'usage_stats.cost_status_unknown_usage';
  if (status === 'partial') return 'usage_stats.cost_status_partial';
  if (status === 'unconfigured') return 'usage_stats.cost_status_unconfigured';
  if (status === 'policy_unavailable') return 'usage_stats.cost_status_policy_unavailable';
  return 'usage_stats.cost_status_complete';
};

const getCostStatusClassName = (status: CostStatus) => {
  if (status === 'complete') return styles.costStatusComplete;
  if (status === 'partial') return styles.costStatusPartial;
  if (status === 'unknown_usage') return styles.costStatusUnknown;
  if (status === 'policy_unavailable') return styles.costStatusUnknown;
  return styles.costStatusUnconfigured;
};

export function RequestEventsDetailsCard({
  usage,
  loading,
  geminiKeys,
  claudeConfigs,
  codexConfigs,
  vertexConfigs,
  openaiProviders,
  modelPrices,
  catalog,
  facets,
  summaryMode = false,
  usageWindow,
  usageAnchor,
  summaryRange,
  events = [],
  eventsStatus = 'idle',
  eventsHasMore = false,
  eventsError = null,
  legacyFallbackError = null,
  loadUsageEvents,
}: RequestEventsDetailsCardProps) {
  const { t, i18n } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const latencyHint = t('usage_stats.latency_unit_hint', {
    field: LATENCY_SOURCE_FIELD,
    unit: t('usage_stats.duration_unit_ms'),
  });

  const [modelFilter, setModelFilter] = useState(ALL_FILTER);
  const [sourceFilter, setSourceFilter] = useState(ALL_FILTER);
  const [authIndexFilter, setAuthIndexFilter] = useState(ALL_FILTER);
  const [authFileMap, setAuthFileMap] = useState<Map<string, CredentialInfo>>(new Map());

  useEffect(() => {
    let cancelled = false;
    authFilesApi
      .list()
      .then((res) => {
        if (cancelled) return;
        const files = Array.isArray(res) ? res : (res as { files?: AuthFileItem[] })?.files;
        if (!Array.isArray(files)) return;
        const map = new Map<string, CredentialInfo>();
        files.forEach((file) => {
          const key = normalizeAuthIndex(file['auth_index'] ?? file.authIndex);
          if (!key) return;
          map.set(key, {
            name: file.name || key,
            type: (file.type || file.provider || '').toString(),
          });
        });
        setAuthFileMap(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const sourceInfoMap = useMemo(
    () =>
      buildSourceInfoMap({
        geminiApiKeys: geminiKeys,
        claudeApiKeys: claudeConfigs,
        codexApiKeys: codexConfigs,
        vertexApiKeys: vertexConfigs,
        openaiCompatibility: openaiProviders,
        catalog,
      }),
    [catalog, claudeConfigs, codexConfigs, geminiKeys, openaiProviders, vertexConfigs]
  );

  const exportLabelOverrides = useMemo<ExportLabelOverrides>(() => {
    const sourceLabels: Record<string, string> = {};
    const modelLabels: Record<string, string> = {};
    const catalogRecord = catalog && typeof catalog === 'object' ? catalog as Record<string, unknown> : {};
    const catalogSources = Array.isArray(catalogRecord.sources) ? catalogRecord.sources : [];
    const catalogModels = Array.isArray(catalogRecord.models) ? catalogRecord.models : [];

    catalogSources.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const record = item as Record<string, unknown>;
      const sourceID = typeof record.source_id === 'string' ? record.source_id.trim() : '';
      const sourceKey = typeof record.source_key === 'string' ? record.source_key.trim() : '';
      if (!sourceID) return;
      const catalogLabel = typeof record.label === 'string' ? record.label.trim() : '';
      const configEntry = sourceKey ? sourceInfoMap.bySource.get(sourceKey) : undefined;
      const authIndex = normalizeAuthIndex(sourceKey);
      const authEntry = authIndex ? authFileMap.get(authIndex) : undefined;
      const label = catalogLabel && catalogLabel !== sourceKey && catalogLabel !== sourceID
        ? catalogLabel
        : authEntry?.name?.trim() || configEntry?.displayName?.trim() || sourceKey || sourceID;
      if (label) sourceLabels[sourceID] = label;
    });

    catalogModels.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const record = item as Record<string, unknown>;
      const id = typeof record.id === 'string' ? record.id.trim() : '';
      const label = typeof record.label === 'string' ? record.label.trim() : '';
      if (id && label) modelLabels[id] = label;
    });

    return { sourceLabels, modelLabels };
  }, [authFileMap, catalog, sourceInfoMap]);

  const legacyRows = useMemo<RequestEventRow[]>(() => {
    const details = collectUsageDetails(usage);

    const baseRows = details.map((detail, index) => {
      const timestamp = detail.timestamp;
      const timestampMs =
        typeof detail.__timestampMs === 'number' && detail.__timestampMs > 0
          ? detail.__timestampMs
          : parseTimestampMs(timestamp);
      const date = Number.isNaN(timestampMs) ? null : new Date(timestampMs);
      const sourceRaw = String(detail.source ?? '').trim();
      const authIndexRaw = detail.auth_index as unknown;
      const authIndex =
        authIndexRaw === null || authIndexRaw === undefined || authIndexRaw === ''
          ? '-'
          : String(authIndexRaw);
      const sourceInfo = resolveSourceDisplay(sourceRaw, authIndexRaw, sourceInfoMap, authFileMap);
      const source = sourceInfo.displayName;
      const sourceKey = sourceInfo.identityKey ?? `source:${sourceRaw || source}`;
      const sourceType = sourceInfo.type;
      const model = String(detail.__modelName ?? '').trim() || '-';
      const tokens = detail.tokens;
      const hasKnownUsage = tokens.hasKnownUsage;
      const cost = calculateUsageCost(detail, modelPrices);
      const latencyMs = extractLatencyMs(detail);
      const thinking = detail.thinking ?? null;
      const thinkingLabel = formatThinkingLabel(thinking);
      const tokenValue = (value: number): number | null => (hasKnownUsage ? value : null);

      const rawIdentity = detail.raw && typeof detail.raw === 'object'
        ? detail.raw
        : {
            timestamp,
            model,
            source: sourceRaw,
            auth_index: authIndex,
            failed: detail.failed === true,
            tokens: detail.tokens,
          };

      return {
        id: usageEventOccurrenceKey(rawIdentity, index),
        timestamp,
        timestampMs: Number.isNaN(timestampMs) ? 0 : timestampMs,
        timestampLabel: date ? date.toLocaleString(i18n.language) : timestamp || '-',
        model,
        sourceKey,
        sourceRaw: sourceRaw || '-',
        source,
        sourceType,
        authIndex,
        failed: detail.failed === true,
        latencyMs,
        thinking,
        thinkingLabel,
        hasKnownUsage,
        inputTokens: tokenValue(tokens.inputTokens),
        outputTokens: tokenValue(tokens.outputTokens),
        reasoningTokens: tokenValue(tokens.reasoningTokens),
        cacheReadTokens: tokenValue(tokens.cacheReadTokens),
        cacheCreationTokens: tokenValue(tokens.cacheCreationTokens),
        cachedTokens: tokenValue(tokens.cachedTokens),
        totalTokens: tokenValue(tokens.totalTokens),
        reportedTotalTokens: hasKnownUsage ? tokens.reportedTotalTokens : null,
        computedTotalTokens: hasKnownUsage ? tokens.computedTotalTokens : null,
        cacheRatio: hasKnownUsage ? tokens.cacheRatio : null,
        inputCostUsd: cost.inputCostUsd,
        outputCostUsd: cost.outputCostUsd,
        cacheCostUsd: cost.cacheCostUsd,
        totalCostUsd: cost.totalCostUsd,
        costStatus: cost.costStatus,
        missingPriceModels: cost.missingPriceModels,
        missingPriceComponents: cost.missingPriceComponents,
      };
    });

    const sourceLabelKeyMap = new Map<string, Set<string>>();
    baseRows.forEach((row) => {
      const keys = sourceLabelKeyMap.get(row.source) ?? new Set<string>();
      keys.add(row.sourceKey);
      sourceLabelKeyMap.set(row.source, keys);
    });

    const buildDisambiguatedSourceLabel = (row: RequestEventRow) => {
      const labelKeyCount = sourceLabelKeyMap.get(row.source)?.size ?? 0;
      if (labelKeyCount <= 1) {
        return row.source;
      }

      if (row.authIndex !== '-') {
        return `${row.source} · ${row.authIndex}`;
      }

      if (row.sourceRaw !== '-' && row.sourceRaw !== row.source) {
        return `${row.source} · ${row.sourceRaw}`;
      }

      if (row.sourceType) {
        return `${row.source} · ${row.sourceType}`;
      }

      return `${row.source} · ${row.sourceKey}`;
    };

    return baseRows
      .map((row) => ({
        ...row,
        source: buildDisambiguatedSourceLabel(row),
      }))
      .sort((a, b) => b.timestampMs - a.timestampMs || a.id.localeCompare(b.id));
  }, [authFileMap, i18n.language, modelPrices, sourceInfoMap, usage]);

  const eventRows = useMemo<RequestEventRow[]>(() => {
    const seen = new Set<string>();
    return events
      .filter((event) => {
        const identity = usageEventIdentityKey(event);
        if (seen.has(identity)) return false;
        seen.add(identity);
        return true;
      })
      .map((event) => {
        const normalized = normalizeUsageDetail(event, {
          model: typeof event.model === 'string' ? event.model : undefined,
          sourceNormalizer: (value) => String(value ?? '').trim(),
        });
        const timestamp = normalized.timestamp;
        const timestampMs = parseTimestampMs(timestamp);
        const date = Number.isNaN(timestampMs) ? null : new Date(timestampMs);
        const sourceRaw = String(event.source_key ?? event.source ?? '').trim();
        const sourceId = String(event.source_id ?? sourceRaw).trim();
        const authIndexRaw = event.auth_index ?? normalized.auth_index;
        const authIndex = authIndexRaw === null || authIndexRaw === undefined || authIndexRaw === ''
          ? '-'
          : String(authIndexRaw);
        const sourceInfo = resolveSourceDisplay(sourceRaw, authIndexRaw, sourceInfoMap, authFileMap, sourceId);
        const model = String(event.model ?? normalized.model ?? '').trim() || '-';
        const tokens = normalized.tokens;
        const hasKnownUsage = tokens.hasKnownUsage;
        const cost = calculateUsageCost(normalized, modelPrices);
        const thinking = event.thinking && typeof event.thinking === 'object'
          ? event.thinking as UsageThinking
          : null;
        const tokenValue = (value: number): number | null => (hasKnownUsage ? value : null);
        return {
          id: usageEventIdentityKey(event),
          timestamp,
          timestampMs: Number.isNaN(timestampMs) ? 0 : timestampMs,
          timestampLabel: date ? date.toLocaleString(i18n.language) : timestamp || '-',
          model,
          sourceKey: sourceId,
          sourceRaw: sourceRaw || '-',
          source: sourceInfo.displayName,
          sourceType: sourceInfo.type,
          authIndex,
          failed: event.failed === true,
          latencyMs: normalized.latencyMs,
          thinking,
          thinkingLabel: formatThinkingLabel(thinking),
          hasKnownUsage,
          inputTokens: tokenValue(tokens.inputTokens),
          outputTokens: tokenValue(tokens.outputTokens),
          reasoningTokens: tokenValue(tokens.reasoningTokens),
          cacheReadTokens: tokenValue(tokens.cacheReadTokens),
          cacheCreationTokens: tokenValue(tokens.cacheCreationTokens),
          cachedTokens: tokenValue(tokens.cachedTokens),
          totalTokens: tokenValue(tokens.totalTokens),
          reportedTotalTokens: hasKnownUsage ? tokens.reportedTotalTokens : null,
          computedTotalTokens: hasKnownUsage ? tokens.computedTotalTokens : null,
          cacheRatio: hasKnownUsage ? tokens.cacheRatio : null,
          inputCostUsd: cost.inputCostUsd,
          outputCostUsd: cost.outputCostUsd,
          cacheCostUsd: cost.cacheCostUsd,
          totalCostUsd: cost.totalCostUsd,
          costStatus: cost.costStatus,
          missingPriceModels: cost.missingPriceModels,
          missingPriceComponents: cost.missingPriceComponents,
        };
      });
  }, [authFileMap, events, i18n.language, modelPrices, sourceInfoMap]);

  const eventsUnavailable =
    summaryMode && events.length === 0 && ['unavailable', 'error'].includes(eventsStatus);
  const eventsStaleError =
    summaryMode && events.length > 0 && ['unavailable', 'error'].includes(eventsStatus);
  const exportUnavailable = summaryMode && (!catalog || eventsUnavailable);
  const rows = summaryMode
    ? eventsStatus === 'legacy_degraded'
      ? legacyRows
      : eventRows
    : legacyRows;
  const preserveStaleEvents =
    summaryMode &&
    eventRows.length > 0 &&
    ['loading', 'error', 'unavailable'].includes(eventsStatus);
  const displayRows = preserveStaleEvents ? eventRows : rows;
  const legacyFallbackUnavailable =
    !summaryMode && eventsStatus === 'legacy_degraded' && Boolean(legacyFallbackError);
  const rangeQuery = buildUsageRangeQuery(summaryRange, usageWindow, usageAnchor);
  const rangeAligned = rangeQuery !== null;

  const hasLatencyData = useMemo(
    () => displayRows.some((row) => row.latencyMs !== null),
    [displayRows]
  );

  const modelOptions = useMemo(
    () => {
      const options = new Map<string, string>();
      displayRows.forEach((row) => options.set(row.model, row.model));
      const catalogRecord = catalog && typeof catalog === 'object' ? catalog as Record<string, unknown> : {};
      const facetRecord = facets && typeof facets === 'object' ? facets as Record<string, unknown> : {};
      const catalogModels = Array.isArray(catalogRecord.models) ? catalogRecord.models as unknown[] : [];
      const facetModels = Array.isArray(facetRecord.models) ? facetRecord.models as unknown[] : [];
      [...catalogModels, ...facetModels].forEach((item) => {
        if (!item || typeof item !== 'object') return;
        const record = item as Record<string, unknown>;
        const id = typeof record.id === 'string' ? record.id.trim() : '';
        if (!id) return;
        const label = typeof record.label === 'string' && record.label.trim() ? record.label.trim() : id;
        options.set(id, label);
      });
      return [
        { value: ALL_FILTER, label: t('usage_stats.filter_all') },
        ...Array.from(options.entries()).sort(([left], [right]) => left.localeCompare(right)).map(([value, label]) => ({ value, label })),
      ];
    },
    [catalog, displayRows, facets, t]
  );

  const sourceOptions = useMemo(() => {
    const optionMap = new Map<string, string>();
    displayRows.forEach((row) => {
      if (!optionMap.has(row.sourceKey)) {
        optionMap.set(row.sourceKey, row.source);
      }
    });

    const catalogRecord = catalog && typeof catalog === 'object' ? catalog as Record<string, unknown> : {};
    const facetRecord = facets && typeof facets === 'object' ? facets as Record<string, unknown> : {};
    const catalogSources = Array.isArray(catalogRecord.sources) ? catalogRecord.sources as unknown[] : [];
    const facetSources = Array.isArray(facetRecord.sources) ? facetRecord.sources as unknown[] : [];
    [...catalogSources, ...facetSources].forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const record = item as Record<string, unknown>;
      const id = typeof record.source_id === 'string' ? record.source_id.trim() : '';
      if (!id) return;
      const sourceInfo = sourceInfoMap.bySourceId?.get(id);
      const label = sourceInfo?.displayName || (typeof record.label === 'string' ? record.label.trim() : '') || id;
      optionMap.set(id, label);
    });

    return [
      { value: ALL_FILTER, label: t('usage_stats.filter_all') },
      ...Array.from(optionMap.entries()).map(([value, label]) => ({
        value,
        label,
      })),
    ];
  }, [catalog, displayRows, facets, sourceInfoMap, t]);

  const authIndexOptions = useMemo(
    () => {
      const values = new Set(displayRows.map((row) => row.authIndex));
      const facetRecord = facets && typeof facets === 'object' ? facets as Record<string, unknown> : {};
      const authFacetValues = Array.isArray(facetRecord.auths) ? facetRecord.auths : [];
      authFacetValues.forEach((item) => {
        if (!item || typeof item !== 'object') return;
        const id = typeof (item as Record<string, unknown>).id === 'string' ? String((item as Record<string, unknown>).id).trim() : '';
        if (id) values.add(id);
      });
      return [
        { value: ALL_FILTER, label: t('usage_stats.filter_all') },
        ...Array.from(values).sort((left, right) => left.localeCompare(right)).map((value) => ({ value, label: value })),
      ];
    },
    [displayRows, facets, t]
  );

  const modelOptionSet = useMemo(
    () => new Set(modelOptions.map((option) => option.value)),
    [modelOptions]
  );
  const sourceOptionSet = useMemo(
    () => new Set(sourceOptions.map((option) => option.value)),
    [sourceOptions]
  );
  const authIndexOptionSet = useMemo(
    () => new Set(authIndexOptions.map((option) => option.value)),
    [authIndexOptions]
  );

  const effectiveModelFilter = modelOptionSet.has(modelFilter) ? modelFilter : ALL_FILTER;
  const effectiveSourceFilter = sourceOptionSet.has(sourceFilter) ? sourceFilter : ALL_FILTER;
  const effectiveAuthIndexFilter = authIndexOptionSet.has(authIndexFilter)
    ? authIndexFilter
    : ALL_FILTER;

  const eventQueryOptions = useMemo(
    () =>
      buildUsageEventQueryOptionsFromRange(summaryRange, usageWindow, usageAnchor, {
        model: effectiveModelFilter === ALL_FILTER ? undefined : effectiveModelFilter,
        source: effectiveSourceFilter === ALL_FILTER ? undefined : effectiveSourceFilter,
        authIndex: effectiveAuthIndexFilter === ALL_FILTER ? undefined : effectiveAuthIndexFilter,
      }, 50),
    [
      effectiveAuthIndexFilter,
      effectiveModelFilter,
      effectiveSourceFilter,
      summaryRange,
      usageAnchor,
      usageWindow,
    ]
  );

  useEffect(() => {
    if (!summaryMode || !loadUsageEvents || !eventQueryOptions) return;
    if (!rangeAligned) return;
    void loadUsageEvents(eventQueryOptions).catch(() => {});
  }, [eventQueryOptions, loadUsageEvents, rangeAligned, summaryMode]);

  const filteredRows = useMemo(
    () => filterUsageEventRows(
      displayRows,
      {
        model: effectiveModelFilter,
        source: effectiveSourceFilter,
        authIndex: effectiveAuthIndexFilter,
      },
      ALL_FILTER
    ),
    [displayRows, effectiveAuthIndexFilter, effectiveModelFilter, effectiveSourceFilter]
  );

  const renderedRows = useMemo(
    () => (summaryMode ? filteredRows : filteredRows.slice(0, MAX_RENDERED_EVENTS)),
    [filteredRows, summaryMode]
  );

  const hasActiveFilters =
    effectiveModelFilter !== ALL_FILTER ||
    effectiveSourceFilter !== ALL_FILTER ||
    effectiveAuthIndexFilter !== ALL_FILTER;

  const handleClearFilters = () => {
    setModelFilter(ALL_FILTER);
    setSourceFilter(ALL_FILTER);
    setAuthIndexFilter(ALL_FILTER);
  };

  const buildExportOptions = (format: 'json' | 'csv') => {
    const queryOptions = buildUsageEventQueryOptionsFromRange(summaryRange, usageWindow, usageAnchor, {
      model: effectiveModelFilter === ALL_FILTER ? undefined : effectiveModelFilter,
      source: effectiveSourceFilter === ALL_FILTER ? undefined : effectiveSourceFilter,
      authIndex: effectiveAuthIndexFilter === ALL_FILTER ? undefined : effectiveAuthIndexFilter,
    });
    if (!queryOptions) return null;
    return {
      format,
      export_schema_version: EXPORT_SCHEMA_VERSION,
      ...queryOptions,
    };
  };

  const handleExportV2 = async (format: 'json' | 'csv') => {
    if (!catalog || !summaryMode || !rangeAligned) return;
    const options = buildExportOptions(format);
    if (!options) return;
    const estimate = await estimateUsageEventsExport(
      options,
      catalog as UsageCatalogPayload,
      modelPrices,
      exportLabelOverrides
    );
    if (!estimate.complete) throw new Error(`${EXPORT_DERIVATION_PROFILE}:estimate_incomplete`);
    const fileTime = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `usage-events-${fileTime}.${format}`;
    const mimeType = format === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8';
    const blobSink = canUseBlobFallback(estimate) ? createBlobSink(filename, mimeType) : null;
    const sink = createFileSystemSink() ?? createServiceWorkerSink() ?? blobSink;
    if (!sink) throw new Error(`${EXPORT_DERIVATION_PROFILE}:sink_unavailable`);
    const result = await streamUsageEventsExportToSink(
      { ...options, export_snapshot_id: estimate.estimate.export_snapshot_id },
      estimate.snapshot,
      sink,
      filename
    );
    if (blobSink && sink === blobSink) {
      downloadBlob({ filename, blob: blobSink.blob() });
    }
    void result;
    showNotification(t(getExportSinkSuccessTranslationKey(sink)), 'success');
  };

  const handleExportCsv = () => {
    if (summaryMode) {
      void handleExportV2('csv').catch((error: unknown) => {
        const message = error instanceof Error ? error.message : '';
        showNotification(`${t('notification.download_failed')}${message ? `: ${message}` : ''}`, 'error');
      });
      return;
    }
    if (!filteredRows.length) return;

    const csvHeader = [
      'timestamp',
      'model',
      'source',
      'source_raw',
      'auth_index',
      'result',
      ...(hasLatencyData ? ['latency_ms'] : []),
      'thinking_intensity',
      'thinking_mode',
      'thinking_level',
      'thinking_budget',
      'input_tokens',
      'output_tokens',
      'reasoning_tokens',
      'cache_read_tokens',
      'cache_creation_tokens',
      'cached_tokens',
      'cache_ratio',
      'total_tokens',
      'reported_total_tokens',
      'computed_total_tokens',
      'input_cost_usd',
      'output_cost_usd',
      'cache_cost_usd',
      'total_cost_usd',
      'cost_status',
      'missing_price_models',
      'missing_price_components',
    ];

    const csvRows = filteredRows.map((row) =>
      [
        row.timestamp,
        row.model,
        row.source,
        row.sourceRaw,
        row.authIndex,
        row.failed ? 'failed' : 'success',
        ...(hasLatencyData ? [row.latencyMs ?? ''] : []),
        row.thinking?.intensity ?? '',
        row.thinking?.mode ?? '',
        row.thinking?.level ?? '',
        row.thinking?.budget ?? '',
        row.inputTokens,
        row.outputTokens,
        row.reasoningTokens,
        row.cacheReadTokens,
        row.cacheCreationTokens,
        row.cachedTokens,
        row.cacheRatio === null ? null : row.cacheRatio,
        row.totalTokens,
        row.reportedTotalTokens,
        row.computedTotalTokens,
        row.inputCostUsd,
        row.outputCostUsd,
        row.cacheCostUsd,
        row.totalCostUsd,
        row.costStatus,
        row.missingPriceModels.join('|'),
        row.missingPriceComponents.join('|'),
      ]
        .map((value) => encodeCsv(value))
        .join(',')
    );

    const content = [csvHeader.join(','), ...csvRows].join('\n');
    const fileTime = new Date().toISOString().replace(/[:.]/g, '-');
    downloadBlob({
      filename: `usage-events-${fileTime}.csv`,
      blob: new Blob([content], { type: 'text/csv;charset=utf-8' }),
    });
  };

  const handleExportJson = () => {
    if (summaryMode) {
      void handleExportV2('json').catch((error: unknown) => {
        const message = error instanceof Error ? error.message : '';
        showNotification(`${t('notification.download_failed')}${message ? `: ${message}` : ''}`, 'error');
      });
      return;
    }
    if (!filteredRows.length) return;

    const payload = filteredRows.map((row) => ({
      timestamp: row.timestamp,
      model: row.model,
      source: row.source,
      source_raw: row.sourceRaw,
      auth_index: row.authIndex,
      failed: row.failed,
      ...(hasLatencyData && row.latencyMs !== null ? { latency_ms: row.latencyMs } : {}),
      ...(row.thinking ? { thinking: row.thinking } : {}),
      tokens: {
        input_tokens: row.inputTokens,
        output_tokens: row.outputTokens,
        reasoning_tokens: row.reasoningTokens,
        cache_read_tokens: row.cacheReadTokens,
        cache_creation_tokens: row.cacheCreationTokens,
        cached_tokens: row.cachedTokens,
        total_tokens: row.totalTokens,
        reported_total_tokens: row.reportedTotalTokens,
        computed_total_tokens: row.computedTotalTokens,
        cache_ratio: row.cacheRatio,
      },
      cost: {
        input_cost_usd: row.inputCostUsd,
        output_cost_usd: row.outputCostUsd,
        cache_cost_usd: row.cacheCostUsd,
        total_cost_usd: row.totalCostUsd,
        cost_status: row.costStatus,
        missing_price_models: row.missingPriceModels,
        missing_price_components: row.missingPriceComponents,
      },
    }));

    const content = JSON.stringify(payload, null, 2);
    const fileTime = new Date().toISOString().replace(/[:.]/g, '-');
    downloadBlob({
      filename: `usage-events-${fileTime}.json`,
      blob: new Blob([content], { type: 'application/json;charset=utf-8' }),
    });
  };

  const renderCostCell = (row: RequestEventRow) => {
    const missingModelsLabel = row.missingPriceModels.join(', ');
    const missingComponentsLabel = row.missingPriceComponents.join(', ');
    const tooltip = [missingModelsLabel, missingComponentsLabel].filter(Boolean).join('\n');
    return (
      <span className={styles.requestEventsCostCell}>
        <span>{formatCostValue(row.totalCostUsd)}</span>
        {row.costStatus !== 'complete' && (
          <span className={getCostStatusClassName(row.costStatus)} title={tooltip || undefined}>
            {t(getCostStatusLabelKey(row.costStatus))}
          </span>
        )}
      </span>
    );
  };

  return (
    <Card
      title={t('usage_stats.request_events_title')}
      extra={
        <div className={styles.requestEventsActions}>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearFilters}
            disabled={!hasActiveFilters}
          >
            {t('usage_stats.clear_filters')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportCsv}
            disabled={summaryMode ? exportUnavailable || !rangeAligned : filteredRows.length === 0}
          >
            {t('usage_stats.export_csv')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportJson}
            disabled={summaryMode ? exportUnavailable || !rangeAligned : filteredRows.length === 0}
          >
            {t('usage_stats.export_json')}
          </Button>
        </div>
      }
    >
      <div className={styles.requestEventsToolbar}>
        <div className={styles.requestEventsFilterItem}>
          <span className={styles.requestEventsFilterLabel}>
            {t('usage_stats.request_events_filter_model')}
          </span>
          <Select
            value={effectiveModelFilter}
            options={modelOptions}
            onChange={setModelFilter}
            className={styles.requestEventsSelect}
            ariaLabel={t('usage_stats.request_events_filter_model')}
            fullWidth={false}
          />
        </div>
        <div className={styles.requestEventsFilterItem}>
          <span className={styles.requestEventsFilterLabel}>
            {t('usage_stats.request_events_filter_source')}
          </span>
          <Select
            value={effectiveSourceFilter}
            options={sourceOptions}
            onChange={setSourceFilter}
            className={styles.requestEventsSelect}
            ariaLabel={t('usage_stats.request_events_filter_source')}
            fullWidth={false}
          />
        </div>
        <div className={styles.requestEventsFilterItem}>
          <span className={styles.requestEventsFilterLabel}>
            {t('usage_stats.request_events_filter_auth_index')}
          </span>
          <Select
            value={effectiveAuthIndexFilter}
            options={authIndexOptions}
            onChange={setAuthIndexFilter}
            className={styles.requestEventsSelect}
            ariaLabel={t('usage_stats.request_events_filter_auth_index')}
            fullWidth={false}
          />
        </div>
      </div>

      {(eventsStaleError || legacyFallbackUnavailable) && (
        <div className={styles.errorBox} role="alert">
          {legacyFallbackError || eventsError || t('usage_stats.loading_error')}
        </div>
      )}

      {eventsUnavailable ? (
        <EmptyState
          title={t('usage_stats.request_events_empty_title')}
          description={eventsError || t('usage_stats.loading_error')}
        />
      ) : legacyFallbackUnavailable ? (
        <EmptyState
          title={t('usage_stats.request_events_empty_title')}
          description={legacyFallbackError || t('usage_stats.loading_error')}
        />
      ) : (loading || (summaryMode && eventsStatus === 'loading')) && displayRows.length === 0 ? (
        <div className={styles.hint}>{t('common.loading')}</div>
      ) : displayRows.length === 0 ? (
        <EmptyState
          title={t('usage_stats.request_events_empty_title')}
          description={t('usage_stats.request_events_empty_desc')}
        />
      ) : filteredRows.length === 0 ? (
        <EmptyState
          title={t('usage_stats.request_events_no_result_title')}
          description={t('usage_stats.request_events_no_result_desc')}
        />
      ) : (
        <>
          <div className={styles.requestEventsMeta}>
            <span>{t('usage_stats.request_events_count', { count: filteredRows.length })}</span>
            {hasLatencyData && <span className={styles.requestEventsLimitHint}>{latencyHint}</span>}
            {!summaryMode && filteredRows.length > MAX_RENDERED_EVENTS && (
              <span className={styles.requestEventsLimitHint}>
                {t('usage_stats.request_events_limit_hint', {
                  shown: MAX_RENDERED_EVENTS,
                  total: filteredRows.length,
                })}
              </span>
            )}
          </div>

          <div className={styles.requestEventsTableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('usage_stats.request_events_timestamp')}</th>
                  <th>{t('usage_stats.model_name')}</th>
                  <th>{t('usage_stats.request_events_source')}</th>
                  <th>{t('usage_stats.request_events_auth_index')}</th>
                  <th>{t('usage_stats.request_events_result')}</th>
                  {hasLatencyData && <th title={latencyHint}>{t('usage_stats.time')}</th>}
                  <th>{t('usage_stats.thinking_intensity')}</th>
                  <th>{t('usage_stats.input_tokens')}</th>
                  <th>{t('usage_stats.output_tokens')}</th>
                  <th>{t('usage_stats.reasoning_tokens')}</th>
                  <th>{t('usage_stats.cached_tokens')}</th>
                  <th>{t('usage_stats.total_tokens')}</th>
                  <th>{t('usage_stats.total_cost')}</th>
                </tr>
              </thead>
              <tbody>
                {renderedRows.map((row) => (
                  <tr key={row.id}>
                    <td title={row.timestamp} className={styles.requestEventsTimestamp}>
                      {row.timestampLabel}
                    </td>
                    <td className={styles.modelCell}>{row.model}</td>
                    <td className={styles.requestEventsSourceCell} title={row.source}>
                      <span>{row.source}</span>
                      {row.sourceType && (
                        <span className={styles.credentialType}>{row.sourceType}</span>
                      )}
                    </td>
                    <td className={styles.requestEventsAuthIndex} title={row.authIndex}>
                      {row.authIndex}
                    </td>
                    <td>
                      <span
                        className={
                          row.failed
                            ? styles.requestEventsResultFailed
                            : styles.requestEventsResultSuccess
                        }
                      >
                        {row.failed ? t('stats.failure') : t('stats.success')}
                      </span>
                    </td>
                    {hasLatencyData && (
                      <td className={styles.durationCell}>{formatDurationMs(row.latencyMs)}</td>
                    )}
                    <td>
                      <span
                        className={
                          row.thinking
                            ? styles.requestEventsThinkingBadge
                            : styles.requestEventsThinkingEmpty
                        }
                        title={
                          row.thinking
                            ? [
                                row.thinking.mode
                                  ? `${t('usage_stats.thinking_mode')}: ${row.thinking.mode}`
                                  : '',
                                row.thinking.level
                                  ? `${t('usage_stats.thinking_level')}: ${row.thinking.level}`
                                  : '',
                                typeof row.thinking.budget === 'number'
                                  ? `${t('usage_stats.thinking_budget')}: ${row.thinking.budget.toLocaleString()}`
                                  : '',
                              ]
                                .filter(Boolean)
                                .join(' · ')
                            : undefined
                        }
                      >
                        {row.thinkingLabel}
                      </span>
                    </td>
                    <td>{formatTokenValue(row.inputTokens)}</td>
                    <td>{formatTokenValue(row.outputTokens)}</td>
                    <td>{formatTokenValue(row.reasoningTokens)}</td>
                    <td>{formatTokenValue(row.cachedTokens)}</td>
                    <td>{formatTokenValue(row.totalTokens)}</td>
                    <td>{renderCostCell(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {summaryMode && eventsHasMore && loadUsageEvents && (
            <div className={styles.requestEventsPager}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (!rangeAligned) return;
                  void loadUsageEvents({ ...eventQueryOptions, append: true }).catch(() => {});
                }}
                disabled={!rangeAligned || eventsStatus === 'loading'}
              >
                {eventsStatus === 'loading' ? t('common.loading') : t('usage_stats.next_page')}
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
