import { useCallback, useMemo } from 'react';
import {
  calculateUsageCost,
  collectUsageDetails,
  extractTotalTokens,
  isCostUnresolved,
  type ModelPriceOverrides,
} from '@/utils/usage';
import type { UsagePayload } from './useUsageData';

export interface SparklineData {
  labels: string[];
  datasets: [
    {
      data: Array<number | null>;
      borderColor: string;
      backgroundColor: string;
      fill: boolean;
      tension: number;
      pointRadius: number;
      borderWidth: number;
    }
  ];
}

export interface SparklineBundle {
  data: SparklineData;
}

export interface UseSparklinesOptions {
  usage: UsagePayload | null;
  loading: boolean;
  nowMs: number;
  modelPrices: ModelPriceOverrides;
}

export interface UseSparklinesReturn {
  requestsSparkline: SparklineBundle | null;
  tokensSparkline: SparklineBundle | null;
  rpmSparkline: SparklineBundle | null;
  tpmSparkline: SparklineBundle | null;
  costSparkline: SparklineBundle | null;
}

export function useSparklines({
  usage,
  loading,
  nowMs,
  modelPrices,
}: UseSparklinesOptions): UseSparklinesReturn {
  const lastHourSeries = useMemo(() => {
    if (!usage) return { labels: [], requests: [], tokens: [], cost: [] as Array<number | null> };
    if (!Number.isFinite(nowMs) || nowMs <= 0) {
      return { labels: [], requests: [], tokens: [], cost: [] as Array<number | null> };
    }
    const details = collectUsageDetails(usage);
    if (!details.length) return { labels: [], requests: [], tokens: [], cost: [] as Array<number | null> };

    const windowMinutes = 60;
    const now = nowMs;
    const windowStart = now - windowMinutes * 60 * 1000;
    const requestBuckets = new Array(windowMinutes).fill(0);
    const tokenBuckets: Array<number | null> = new Array(windowMinutes).fill(0);
    const unresolvedTokenBuckets = new Array(windowMinutes).fill(false);
    const costBuckets: Array<number | null> = new Array(windowMinutes).fill(0);
    const unresolvedCostBuckets = new Array(windowMinutes).fill(false);

    details.forEach((detail) => {
      const timestamp = detail.__timestampMs ?? 0;
      if (!Number.isFinite(timestamp) || timestamp < windowStart || timestamp > now) {
        return;
      }
      const minuteIndex = Math.min(
        windowMinutes - 1,
        Math.floor((timestamp - windowStart) / 60000)
      );
      requestBuckets[minuteIndex] += 1;
      if (detail.tokens.hasKnownUsage) {
        tokenBuckets[minuteIndex] =
          (tokenBuckets[minuteIndex] ?? 0) + extractTotalTokens(detail);
      } else {
        unresolvedTokenBuckets[minuteIndex] = true;
      }
      const cost = calculateUsageCost(detail, modelPrices);
      if (cost.totalCostUsd !== null) {
        costBuckets[minuteIndex] = (costBuckets[minuteIndex] ?? 0) + cost.totalCostUsd;
      } else if (isCostUnresolved(cost)) {
        unresolvedCostBuckets[minuteIndex] = true;
      }
    });

    tokenBuckets.forEach((value, index) => {
      if (unresolvedTokenBuckets[index] && value === 0) {
        tokenBuckets[index] = null;
      }
    });
    costBuckets.forEach((value, index) => {
      if (unresolvedCostBuckets[index] && value === 0) {
        costBuckets[index] = null;
      }
    });

    const labels = requestBuckets.map((_, idx) => {
      const date = new Date(windowStart + (idx + 1) * 60000);
      const h = date.getHours().toString().padStart(2, '0');
      const m = date.getMinutes().toString().padStart(2, '0');
      return `${h}:${m}`;
    });

    return { labels, requests: requestBuckets, tokens: tokenBuckets, cost: costBuckets };
  }, [modelPrices, nowMs, usage]);

  const buildSparkline = useCallback(
    (
      series: { labels: string[]; data: Array<number | null> },
      color: string,
      backgroundColor: string
    ): SparklineBundle | null => {
      if (loading || !series?.data?.length) {
        return null;
      }
      const sliceStart = Math.max(series.data.length - 60, 0);
      const labels = series.labels.slice(sliceStart);
      const points = series.data.slice(sliceStart);
      return {
        data: {
          labels,
          datasets: [
            {
              data: points,
              borderColor: color,
              backgroundColor,
              fill: true,
              tension: 0.45,
              pointRadius: 0,
              borderWidth: 2
            }
          ]
        }
      };
    },
    [loading]
  );

  const requestsSparkline = useMemo(
    () =>
      buildSparkline(
        { labels: lastHourSeries.labels, data: lastHourSeries.requests },
        '#8b8680',
        'rgba(139, 134, 128, 0.18)'
      ),
    [buildSparkline, lastHourSeries.labels, lastHourSeries.requests]
  );

  const tokensSparkline = useMemo(
    () =>
      buildSparkline(
        { labels: lastHourSeries.labels, data: lastHourSeries.tokens },
        '#8b5cf6',
        'rgba(139, 92, 246, 0.18)'
      ),
    [buildSparkline, lastHourSeries.labels, lastHourSeries.tokens]
  );

  const rpmSparkline = useMemo(
    () =>
      buildSparkline(
        { labels: lastHourSeries.labels, data: lastHourSeries.requests },
        '#22c55e',
        'rgba(34, 197, 94, 0.18)'
      ),
    [buildSparkline, lastHourSeries.labels, lastHourSeries.requests]
  );

  const tpmSparkline = useMemo(
    () =>
      buildSparkline(
        { labels: lastHourSeries.labels, data: lastHourSeries.tokens },
        '#f97316',
        'rgba(249, 115, 22, 0.18)'
      ),
    [buildSparkline, lastHourSeries.labels, lastHourSeries.tokens]
  );

  const costSparkline = useMemo(
    () =>
      buildSparkline(
        { labels: lastHourSeries.labels, data: lastHourSeries.cost },
        '#f59e0b',
        'rgba(245, 158, 11, 0.18)'
      ),
    [buildSparkline, lastHourSeries.cost, lastHourSeries.labels]
  );

  return {
    requestsSparkline,
    tokensSparkline,
    rpmSparkline,
    tpmSparkline,
    costSparkline
  };
}
