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
import {
  calculateUsageCost,
  collectUsageDetails,
  extractLatencyMs,
  formatUsd,
  formatDurationMs,
  LATENCY_SOURCE_FIELD,
  normalizeAuthIndex,
  type CostStatus,
  type ModelPriceOverrides,
  type UsageThinking,
} from '@/utils/usage';
import { downloadBlob } from '@/utils/download';
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
  loading: boolean;
  geminiKeys: GeminiKeyConfig[];
  claudeConfigs: ProviderKeyConfig[];
  codexConfigs: ProviderKeyConfig[];
  vertexConfigs: ProviderKeyConfig[];
  openaiProviders: OpenAIProviderConfig[];
  modelPrices: ModelPriceOverrides;
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
  return 'usage_stats.cost_status_complete';
};

const getCostStatusClassName = (status: CostStatus) => {
  if (status === 'complete') return styles.costStatusComplete;
  if (status === 'partial') return styles.costStatusPartial;
  if (status === 'unknown_usage') return styles.costStatusUnknown;
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
}: RequestEventsDetailsCardProps) {
  const { t, i18n } = useTranslation();
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
      }),
    [claudeConfigs, codexConfigs, geminiKeys, openaiProviders, vertexConfigs]
  );

  const rows = useMemo<RequestEventRow[]>(() => {
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

      return {
        id: `${timestamp}-${model}-${sourceKey}-${authIndex}-${index}`,
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
      .sort((a, b) => b.timestampMs - a.timestampMs);
  }, [authFileMap, i18n.language, modelPrices, sourceInfoMap, usage]);

  const hasLatencyData = useMemo(() => rows.some((row) => row.latencyMs !== null), [rows]);

  const modelOptions = useMemo(
    () => [
      { value: ALL_FILTER, label: t('usage_stats.filter_all') },
      ...Array.from(new Set(rows.map((row) => row.model))).map((model) => ({
        value: model,
        label: model,
      })),
    ],
    [rows, t]
  );

  const sourceOptions = useMemo(() => {
    const optionMap = new Map<string, string>();
    rows.forEach((row) => {
      if (!optionMap.has(row.sourceKey)) {
        optionMap.set(row.sourceKey, row.source);
      }
    });

    return [
      { value: ALL_FILTER, label: t('usage_stats.filter_all') },
      ...Array.from(optionMap.entries()).map(([value, label]) => ({
        value,
        label,
      })),
    ];
  }, [rows, t]);

  const authIndexOptions = useMemo(
    () => [
      { value: ALL_FILTER, label: t('usage_stats.filter_all') },
      ...Array.from(new Set(rows.map((row) => row.authIndex))).map((authIndex) => ({
        value: authIndex,
        label: authIndex,
      })),
    ],
    [rows, t]
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

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        const modelMatched =
          effectiveModelFilter === ALL_FILTER || row.model === effectiveModelFilter;
        const sourceMatched =
          effectiveSourceFilter === ALL_FILTER || row.sourceKey === effectiveSourceFilter;
        const authIndexMatched =
          effectiveAuthIndexFilter === ALL_FILTER || row.authIndex === effectiveAuthIndexFilter;
        return modelMatched && sourceMatched && authIndexMatched;
      }),
    [effectiveAuthIndexFilter, effectiveModelFilter, effectiveSourceFilter, rows]
  );

  const renderedRows = useMemo(() => filteredRows.slice(0, MAX_RENDERED_EVENTS), [filteredRows]);

  const hasActiveFilters =
    effectiveModelFilter !== ALL_FILTER ||
    effectiveSourceFilter !== ALL_FILTER ||
    effectiveAuthIndexFilter !== ALL_FILTER;

  const handleClearFilters = () => {
    setModelFilter(ALL_FILTER);
    setSourceFilter(ALL_FILTER);
    setAuthIndexFilter(ALL_FILTER);
  };

  const handleExportCsv = () => {
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
            disabled={filteredRows.length === 0}
          >
            {t('usage_stats.export_csv')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportJson}
            disabled={filteredRows.length === 0}
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

      {loading && rows.length === 0 ? (
        <div className={styles.hint}>{t('common.loading')}</div>
      ) : rows.length === 0 ? (
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
            {filteredRows.length > MAX_RENDERED_EVENTS && (
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
        </>
      )}
    </Card>
  );
}
