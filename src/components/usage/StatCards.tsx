import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Line } from 'react-chartjs-2';
import {
  IconDiamond,
  IconDollarSign,
  IconSatellite,
  IconTimer,
  IconTrendingUp,
} from '@/components/ui/icons';
import {
  LATENCY_SOURCE_FIELD,
  aggregateUsageCosts,
  calculateLatencyStatsFromDetails,
  calculateUsageCost,
  collectUsageDetails,
  extractTotalTokens,
  formatCompactNumber,
  formatDurationMs,
  formatPerMinuteValue,
  formatUsd,
  parseNonNegativeNumber,
  resolveUsageCoverageStatus,
  resolveWindowUsageCoverageStatus,
  type CostStatus,
  type ModelPriceOverrides,
  type UsageCoverageStatus,
} from '@/utils/usage';
import { sparklineOptions } from '@/utils/usage/chartConfig';
import type { UsagePayload } from './hooks/useUsageData';
import type { SparklineBundle } from './hooks/useSparklines';
import styles from '@/pages/UsagePage.module.scss';

interface StatCardData {
  key: string;
  label: string;
  icon: ReactNode;
  accent: string;
  accentSoft: string;
  accentBorder: string;
  value: string;
  meta?: ReactNode;
  trend: SparklineBundle | null;
}

export interface StatCardsProps {
  usage: UsagePayload | null;
  loading: boolean;
  modelPrices: ModelPriceOverrides;
  nowMs: number;
  sparklines: {
    requests: SparklineBundle | null;
    tokens: SparklineBundle | null;
    rpm: SparklineBundle | null;
    tpm: SparklineBundle | null;
    cost: SparklineBundle | null;
  };
}

interface StatSummary {
  tokenBreakdown: { cachedTokens: number; reasoningTokens: number };
  tokenCoverageStatus: UsageCoverageStatus;
  rateTokenCoverageStatus: UsageCoverageStatus;
  rateStats: {
    rpm: number;
    tpm: number;
    windowMinutes: number;
    requestCount: number;
    tokenCount: number;
  };
  totalCost: number | null;
  totalCostStatus: CostStatus;
  latencyStats: {
    averageMs: number | null;
    totalMs: number | null;
    sampleCount: number;
  };
}

const getCostStatusLabelKey = (status: CostStatus) => {
  if (status === 'partial') return 'usage_stats.cost_status_partial';
  if (status === 'unconfigured') return 'usage_stats.cost_status_unconfigured';
  if (status === 'unknown_usage') return 'usage_stats.cost_status_unknown_usage';
  return 'usage_stats.cost_status_complete';
};

const getTokenCoverageLabelKey = (status: UsageCoverageStatus) =>
  status === 'partial'
    ? 'usage_stats.token_coverage_partial'
    : 'usage_stats.token_coverage_unknown';

export function StatCards({ usage, loading, modelPrices, nowMs, sparklines }: StatCardsProps) {
  const { t } = useTranslation();
  const totalTokens = parseNonNegativeNumber(usage?.total_tokens) ?? 0;
  const latencyHint = t('usage_stats.latency_unit_hint', {
    field: LATENCY_SOURCE_FIELD,
    unit: t('usage_stats.duration_unit_ms'),
  });

  const {
    tokenBreakdown,
    tokenCoverageStatus,
    rateTokenCoverageStatus,
    rateStats,
    totalCost,
    totalCostStatus,
    latencyStats,
  } = useMemo<StatSummary>(() => {
    const empty = {
      tokenBreakdown: { cachedTokens: 0, reasoningTokens: 0 },
      tokenCoverageStatus: 'unknown' as UsageCoverageStatus,
      rateTokenCoverageStatus: 'unknown' as UsageCoverageStatus,
      rateStats: { rpm: 0, tpm: 0, windowMinutes: 30, requestCount: 0, tokenCount: 0 },
      totalCost: null as number | null,
      totalCostStatus: 'unknown_usage' as CostStatus,
      latencyStats: {
        averageMs: null as number | null,
        totalMs: null as number | null,
        sampleCount: 0,
      },
    };

    if (!usage) return empty;
    const now = nowMs;
    const hasValidNow = Number.isFinite(now) && now > 0;
    const details = collectUsageDetails(usage);
    if (!details.length) {
      const rawTotalRequests = Number(usage.total_requests);
      const hasTotalRequests = Number.isFinite(rawTotalRequests);
      const totalRequests = hasTotalRequests ? Math.max(rawTotalRequests, 0) : 0;
      const noRequestsKnown = hasTotalRequests && totalRequests === 0;
      return {
        ...empty,
        tokenCoverageStatus: noRequestsKnown ? 'complete' : 'unknown',
        rateTokenCoverageStatus: resolveWindowUsageCoverageStatus(
          hasValidNow,
          0,
          0,
          hasTotalRequests ? totalRequests : 1,
          noRequestsKnown
        ),
      };
    }

    const latencyStats = calculateLatencyStatsFromDetails(details);

    let cachedTokens = 0;
    let reasoningTokens = 0;
    const windowMinutes = 30;
    const windowStart = now - windowMinutes * 60 * 1000;
    let requestCount = 0;
    let tokenCount = 0;
    let rateKnownUsageCount = 0;
    let rateUnknownUsageCount = 0;
    let rateUnlocatableUsageCount = 0;

    details.forEach((detail) => {
      const tokens = detail.tokens;
      cachedTokens += tokens.cachedTokens;
      reasoningTokens += tokens.reasoningTokens;

      const timestamp = detail.__timestampMs ?? 0;
      if (!hasValidNow || !Number.isFinite(timestamp) || timestamp <= 0) {
        rateUnlocatableUsageCount += 1;
      } else if (timestamp >= windowStart && timestamp <= now) {
        requestCount += 1;
        if (detail.tokens.hasKnownUsage) {
          tokenCount += extractTotalTokens(detail);
          rateKnownUsageCount += 1;
        } else {
          rateUnknownUsageCount += 1;
        }
      }
    });
    const costSummary = aggregateUsageCosts(
      details.map((detail) => calculateUsageCost(detail, modelPrices))
    );
    const knownUsageCount = details.filter((detail) => detail.tokens.hasKnownUsage).length;
    const tokenCoverageStatus = resolveUsageCoverageStatus(
      knownUsageCount,
      details.length - knownUsageCount
    );
    const rateTokenCoverageStatus = resolveWindowUsageCoverageStatus(
      hasValidNow,
      rateKnownUsageCount,
      rateUnknownUsageCount,
      rateUnlocatableUsageCount
    );

    const denominator = windowMinutes > 0 ? windowMinutes : 1;
    return {
      tokenBreakdown: { cachedTokens, reasoningTokens },
      tokenCoverageStatus,
      rateTokenCoverageStatus,
      rateStats: {
        rpm: requestCount / denominator,
        tpm: tokenCount / denominator,
        windowMinutes,
        requestCount,
        tokenCount,
      },
      totalCost: costSummary.totalCostUsd,
      totalCostStatus: costSummary.costStatus,
      latencyStats,
    };
  }, [modelPrices, nowMs, usage]);

  const statsCards: StatCardData[] = [
    {
      key: 'requests',
      label: t('usage_stats.total_requests'),
      icon: <IconSatellite size={16} />,
      accent: '#8b8680',
      accentSoft: 'rgba(139, 134, 128, 0.18)',
      accentBorder: 'rgba(139, 134, 128, 0.35)',
      value: loading ? '-' : (usage?.total_requests ?? 0).toLocaleString(),
      meta: (
        <>
          <span className={styles.statMetaItem}>
            <span className={styles.statMetaDot} style={{ backgroundColor: '#10b981' }} />
            {t('usage_stats.success_requests')}: {loading ? '-' : (usage?.success_count ?? 0)}
          </span>
          <span className={styles.statMetaItem}>
            <span className={styles.statMetaDot} style={{ backgroundColor: '#c65746' }} />
            {t('usage_stats.failed_requests')}: {loading ? '-' : (usage?.failure_count ?? 0)}
          </span>
          {latencyStats.sampleCount > 0 && (
            <span className={styles.statMetaItem} title={latencyHint}>
              {t('usage_stats.avg_time')}:{' '}
              {loading ? '-' : formatDurationMs(latencyStats.averageMs)}
            </span>
          )}
        </>
      ),
      trend: sparklines.requests,
    },
    {
      key: 'tokens',
      label: t('usage_stats.total_tokens'),
      icon: <IconDiamond size={16} />,
      accent: '#8b5cf6',
      accentSoft: 'rgba(139, 92, 246, 0.18)',
      accentBorder: 'rgba(139, 92, 246, 0.35)',
      value:
        loading
          ? '-'
          : tokenCoverageStatus === 'unknown'
            ? '--'
            : formatCompactNumber(totalTokens),
      meta: (
        <>
          <span className={styles.statMetaItem}>
            {t('usage_stats.cached_tokens')}:{' '}
            {loading || tokenCoverageStatus === 'unknown'
              ? '-'
              : formatCompactNumber(tokenBreakdown.cachedTokens)}
          </span>
          <span className={styles.statMetaItem}>
            {t('usage_stats.reasoning_tokens')}:{' '}
            {loading || tokenCoverageStatus === 'unknown'
              ? '-'
              : formatCompactNumber(tokenBreakdown.reasoningTokens)}
          </span>
          {!loading && tokenCoverageStatus !== 'complete' && (
            <span className={`${styles.statMetaItem} ${styles.statSubtle}`}>
              {t(getTokenCoverageLabelKey(tokenCoverageStatus))}
            </span>
          )}
        </>
      ),
      trend: sparklines.tokens,
    },
    {
      key: 'rpm',
      label: t('usage_stats.rpm_30m'),
      icon: <IconTimer size={16} />,
      accent: '#22c55e',
      accentSoft: 'rgba(34, 197, 94, 0.18)',
      accentBorder: 'rgba(34, 197, 94, 0.32)',
      value: loading ? '-' : formatPerMinuteValue(rateStats.rpm),
      meta: (
        <span className={styles.statMetaItem}>
          {t('usage_stats.total_requests')}:{' '}
          {loading ? '-' : rateStats.requestCount.toLocaleString()}
        </span>
      ),
      trend: sparklines.rpm,
    },
    {
      key: 'tpm',
      label: t('usage_stats.tpm_30m'),
      icon: <IconTrendingUp size={16} />,
      accent: '#f97316',
      accentSoft: 'rgba(249, 115, 22, 0.18)',
      accentBorder: 'rgba(249, 115, 22, 0.32)',
      value:
        loading
          ? '-'
          : rateTokenCoverageStatus === 'unknown'
            ? '--'
            : formatPerMinuteValue(rateStats.tpm),
      meta: (
        <>
          <span className={styles.statMetaItem}>
            {t('usage_stats.total_tokens')}:{' '}
            {loading || rateTokenCoverageStatus === 'unknown'
              ? '-'
              : formatCompactNumber(rateStats.tokenCount)}
          </span>
          {!loading && rateTokenCoverageStatus !== 'complete' && (
            <span className={`${styles.statMetaItem} ${styles.statSubtle}`}>
              {t(getTokenCoverageLabelKey(rateTokenCoverageStatus))}
            </span>
          )}
        </>
      ),
      trend: rateTokenCoverageStatus === 'unknown' ? null : sparklines.tpm,
    },
    {
      key: 'cost',
      label: t('usage_stats.total_cost'),
      icon: <IconDollarSign size={16} />,
      accent: '#f59e0b',
      accentSoft: 'rgba(245, 158, 11, 0.18)',
      accentBorder: 'rgba(245, 158, 11, 0.32)',
      value: loading ? '-' : totalCost !== null ? formatUsd(totalCost) : '--',
      meta: (
        <>
          <span className={styles.statMetaItem}>
            {t('usage_stats.total_tokens')}:{' '}
            {loading ? '-' : formatCompactNumber(totalTokens)}
          </span>
          {!loading && totalCostStatus !== 'complete' && (
            <span className={`${styles.statMetaItem} ${styles.statSubtle}`}>
              {t(getCostStatusLabelKey(totalCostStatus))}
            </span>
          )}
        </>
      ),
      trend: totalCost !== null ? sparklines.cost : null,
    },
  ];

  return (
    <div className={styles.statsGrid}>
      {statsCards.map((card) => (
        <div
          key={card.key}
          className={styles.statCard}
          style={
            {
              '--accent': card.accent,
              '--accent-soft': card.accentSoft,
              '--accent-border': card.accentBorder,
            } as CSSProperties
          }
        >
          <div className={styles.statCardHeader}>
            <div className={styles.statLabelGroup}>
              <span className={styles.statLabel}>{card.label}</span>
            </div>
            <span className={styles.statIconBadge}>{card.icon}</span>
          </div>
          <div className={styles.statValue}>{card.value}</div>
          {card.meta && <div className={styles.statMetaRow}>{card.meta}</div>}
          <div className={styles.statTrend}>
            {card.trend ? (
              <Line
                className={styles.sparkline}
                data={card.trend.data}
                options={sparklineOptions}
              />
            ) : (
              <div className={styles.statTrendPlaceholder}></div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
