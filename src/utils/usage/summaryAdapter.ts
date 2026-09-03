import {
  aggregateUsageCosts,
  type ApiStats,
  type ChartData,
  type CostStatus,
  type ModelPriceOverrides,
  type ModelStatsSummary,
  type NormalizedUsageCost,
  type ServiceHealthData,
  type StatusBlockDetail,
  type StatusBlockState,
  type UsageCoverageStatus,
} from '@/utils/usage';
import {
  buildPriceKey,
  resolveModelPrice,
  type PriceKey,
} from '@/utils/usage/cost';
import type { UsageModelPrice } from '@/utils/usage/pricingDefaults';

type SummaryRecord = Record<string, unknown>;
const SUPPORTED_BILLABLE_POLICY_VERSION = 'v1';

export interface SummaryDashboard {
  totalRequests: number;
  successCount: number;
  failureCount: number;
  totalTokens: number;
  tokenBreakdown: {
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    cachedTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  };
  averageLatencyMs: number | null;
  tokenCoverageStatus: UsageCoverageStatus;
  totalCost: number | null;
  totalCostStatus: CostStatus;
  apiStats: ApiStats[];
  modelStats: ModelStatsSummary[];
  authStats: SummaryAggregate[];
  providerStats: SummaryAggregate[];
  sourceStats: SummaryAggregate[];
  numericDataComplete: boolean;
  usage: SummaryDashboardUsage;
}

export interface SummaryAggregate {
  id: string;
  label: string;
  requests: number;
  successCount: number;
  failureCount: number;
  totalTokens: number;
  tokenCoverageStatus: UsageCoverageStatus;
  knownUsageCount: number;
  unknownUsageCount: number;
  totalCost: number | null;
  costStatus: CostStatus;
  missingPriceModels: string[];
  missingPriceComponents: string[];
  latencyMsSum: number;
  latencySampleCount: number;
}

export interface SummaryDashboardUsage {
  total_requests: number;
  success_count: number;
  failure_count: number;
  total_tokens: number;
  auths: unknown[];
  [key: string]: unknown;
}

export interface SummaryHealthPartialTail {
  complete: false;
  start: string;
  end: string;
  requests: number;
  success: number;
  failure: number;
  latencyMsSum: number;
}

export interface SummaryHealthData extends ServiceHealthData {
  partialTail: SummaryHealthPartialTail | null;
  partialTailPresent: boolean;
  observationTo: string | null;
  alignedTo: string | null;
  healthDataComplete: boolean;
}

const isRecord = (value: unknown): value is SummaryRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const asRecord = (value: unknown): SummaryRecord => (isRecord(value) ? value : {});

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const INTEGER_SUMMARY_KEYS = new Set([
  'requests', 'total_requests', 'success', 'failure', 'success_count', 'failure_count',
  'count', 'total_count', 'latency_sample_count', 'latency_ms_sum', 'input_tokens', 'output_tokens', 'reasoning_tokens', 'cached_tokens',
  'cache_read_tokens', 'cache_creation_tokens', 'total_tokens', 'reported_total_tokens',
  'computed_total_tokens', 'cache_tokens', 'unsplit_cache', 'cache_unsplit', 'details',
  'input', 'output', 'reasoning', 'cache_read', 'cache_creation',
  'with_any_usage', 'unknown_usage', 'known_total_only', 'unclassified_cache',
  'series_point_count', 'event_count', 'estimated_event_count', 'event_count_upper_bound',
  'server_bytes_upper_bound', 'client_derived_bytes_upper_bound', 'estimated_bytes_upper_bound',
  'blob_limit_bytes', 'snapshot_max_sequence', 'revision', 'rewrite_revision', 'bucket_seconds',
  'bucket_count', 'limit', 'offset', 'point_count', 'sample_count', 'sequence', 'next_sequence',
]);

const DECIMAL_SUMMARY_KEYS = new Set([
  'latency_ms', 'estimated_cost_usd', 'cache_ratio',
]);

const isSafeSummaryNumber = (value: unknown, integerOnly: boolean): boolean => {
  if (value === null || value === undefined) return true;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return false;
    return !integerOnly || Number.isSafeInteger(value);
  }
  if (typeof value !== 'string' || value.trim() === '') return false;
  const text = value.trim();
  if (integerOnly && !/^\d+$/.test(text)) return false;
  if (/^\d+$/.test(text)) {
    try {
      const integer = BigInt(text);
      return integer <= BigInt(Number.MAX_SAFE_INTEGER);
    } catch {
      return false;
    }
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed >= 0;
};

const summaryNumbersAreComplete = (value: unknown, key?: string): boolean => {
  const isContainer = Array.isArray(value) || isRecord(value);
  if (key && !isContainer && (INTEGER_SUMMARY_KEYS.has(key) || DECIMAL_SUMMARY_KEYS.has(key))) {
    if (!isSafeSummaryNumber(value, INTEGER_SUMMARY_KEYS.has(key))) return false;
  }
  if (Array.isArray(value)) return value.every((item) => summaryNumbersAreComplete(item));
  if (!isRecord(value)) return true;
  return Object.entries(value).every(([entryKey, entryValue]) =>
    summaryNumbersAreComplete(entryValue, entryKey)
  );
};

const readNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) return fallback;
    return Math.max(value, 0);
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const text = value.trim();
    if (/^[+-]?\d+$/.test(text)) {
      try {
        const integer = BigInt(text);
        if (integer > BigInt(Number.MAX_SAFE_INTEGER) || integer < BigInt(Number.MIN_SAFE_INTEGER)) {
          return fallback;
        }
      } catch {
        return fallback;
      }
    }
    const parsed = Number(text);
    if (Number.isFinite(parsed)) return Math.max(parsed, 0);
  }
  return fallback;
};

const readLatencySum = (value: unknown): number => readNumber(value);

const readString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

const readTokens = (value: unknown): SummaryRecord => {
  const record = asRecord(value);
  return isRecord(record.tokens) ? record.tokens : record;
};

const readTokenTotal = (value: unknown): number => {
  const tokens = readTokens(value);
  return readNumber(tokens.total_tokens ?? tokens.totalTokens);
};

const readCoverage = (
  value: unknown,
  fallbackDetails: number
): { status: UsageCoverageStatus; known: number; unknown: number } => {
  const coverage = asRecord(value);
  const details = readNumber(coverage.details, fallbackDetails);
  const known = Math.min(readNumber(coverage.with_any_usage), details);
  const explicitUnknown = readNumber(coverage.unknown_usage);
  const unknown = Math.max(details - known, explicitUnknown);
  const status: UsageCoverageStatus =
    details <= 0 ? 'unknown' : known <= 0 ? 'unknown' : unknown > 0 ? 'partial' : 'complete';
  return { status, known, unknown };
};

const readPricingGroups = (value: unknown): SummaryRecord[] =>
  asArray(asRecord(value).pricing_groups).filter(isRecord);

const readBillableTokens = (group: SummaryRecord): SummaryRecord =>
  asRecord(group.billable_tokens ?? group.billableTokens);

const positiveComponents = (tokens: SummaryRecord): Array<[string, number]> => {
  const components: Array<[string, number]> = [
    ['input', readNumber(tokens.input)],
    ['output', readNumber(tokens.output)],
    ['reasoning', readNumber(tokens.reasoning)],
    ['cache_read', readNumber(tokens.cache_read)],
    ['cache_creation', readNumber(tokens.cache_creation)],
    ['cache_unsplit', readNumber(tokens.unsplit_cache ?? tokens.cache_unsplit)],
  ];
  return components.filter(([, amount]) => amount > 0);
};

const priceValue = (price: UsageModelPrice | null, key: keyof UsageModelPrice): number | null => {
  const value = price?.[key];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
};

const priceKeyParts = (value: unknown): { provider: string; model: string; key: PriceKey } => {
  const raw = readString(value);
  const separator = raw.indexOf(':');
  if (separator < 0) {
    return { provider: '', model: raw, key: buildPriceKey('', raw) };
  }
  const provider = raw.slice(0, separator);
  const model = raw.slice(separator + 1);
  return { provider, model, key: buildPriceKey(provider, model) };
};

const buildPricingCost = (
  group: SummaryRecord,
  userOverrides: ModelPriceOverrides
): NormalizedUsageCost => {
  const policyVersion = readString(
    group.billable_policy_version ?? group.billablePolicyVersion
  ).toLowerCase();
  if (policyVersion !== SUPPORTED_BILLABLE_POLICY_VERSION) {
    return {
      inputCostUsd: null,
      outputCostUsd: null,
      cacheCostUsd: null,
      totalCostUsd: null,
      costStatus: 'policy_unavailable',
      missingPriceModels: [],
      missingPriceComponents: [],
    };
  }
  const billable = readBillableTokens(group);
  const components = positiveComponents(billable);
  const explicitPriceKey = readString(group.price_key ?? group.priceKey);
  const parts = priceKeyParts(explicitPriceKey || `${readString(group.provider)}:${readString(group.model)}`);
  const resolved = resolveModelPrice(parts.provider, parts.model, userOverrides);
  const price = resolved.price;

  if (!components.length) {
    return {
      inputCostUsd: 0,
      outputCostUsd: 0,
      cacheCostUsd: 0,
      totalCostUsd: 0,
      costStatus: 'complete',
      missingPriceModels: [],
      missingPriceComponents: [],
      priceKey: explicitPriceKey || resolved.key,
      priceSource: resolved.source,
    };
  }

  const missingModels = price ? [] : [explicitPriceKey || resolved.key];
  const missingComponents = new Set<string>();
  const costPerMillion = (component: string): number | null => {
    const key: keyof UsageModelPrice =
      component === 'input'
        ? 'inputUsdPer1M'
        : component === 'output' || component === 'reasoning'
          ? component === 'reasoning'
            ? 'reasoningUsdPer1M'
            : 'outputUsdPer1M'
          : component === 'cache_read'
            ? 'cacheReadUsdPer1M'
            : 'cache_creation' === component
              ? 'cacheCreationUsdPer1M'
              : 'cacheReadUsdPer1M';
    const direct = priceValue(price, key);
    if (direct !== null) return direct;
    if (component === 'reasoning') return priceValue(price, 'outputUsdPer1M');
    return null;
  };

  let inputCost: number | null = 0;
  let outputCost: number | null = 0;
  let cacheCost: number | null = 0;
  let totalCost = 0;

  components.forEach(([component, amount]) => {
    if (component === 'cache_unsplit') {
      missingComponents.add(`${explicitPriceKey || resolved.key}:cache_unsplit`);
      cacheCost = null;
      return;
    }
    const pricePerMillion = costPerMillion(component);
    if (pricePerMillion === null) {
      missingComponents.add(`${explicitPriceKey || resolved.key}:${component}`);
      if (component === 'input') inputCost = null;
      else if (component === 'output' || component === 'reasoning') outputCost = null;
      else cacheCost = null;
      return;
    }
    const amountCost = (amount / 1_000_000) * pricePerMillion;
    totalCost += amountCost;
    if (component === 'input') inputCost = (inputCost ?? 0) + amountCost;
    else if (component === 'output' || component === 'reasoning') {
      outputCost = (outputCost ?? 0) + amountCost;
    } else {
      cacheCost = (cacheCost ?? 0) + amountCost;
    }
  });

  const missing = Array.from(missingComponents).sort();
  const hasMissing = missing.length > 0 || !price;
  const knownSubtotal = [inputCost, outputCost, cacheCost]
    .filter((value): value is number => typeof value === 'number')
    .reduce((sum, value) => sum + value, 0);

  return {
    inputCostUsd: inputCost,
    outputCostUsd: outputCost,
    cacheCostUsd: cacheCost,
    totalCostUsd: hasMissing && knownSubtotal <= 0 ? null : totalCost,
    costStatus: hasMissing ? (knownSubtotal > 0 ? 'partial' : price ? 'partial' : 'unconfigured') : 'complete',
    missingPriceModels: missingModels,
    missingPriceComponents: missing,
    priceKey: explicitPriceKey || resolved.key,
    priceSource: resolved.source,
  };
};

const buildDimensionCost = (dimension: SummaryRecord, userOverrides: ModelPriceOverrides) =>
  aggregateUsageCosts(readPricingGroups(dimension).map((group) => buildPricingCost(group, userOverrides)));

const dimensionLabel = (value: SummaryRecord, fallback = 'Unknown'): string =>
  readString(value.label ?? value.name ?? value.id, fallback);

const dimensionId = (value: SummaryRecord, fallback = ''): string =>
  readString(value.id ?? value.key ?? value.name, fallback);

const dimensionStats = (
  value: unknown,
  userOverrides: ModelPriceOverrides,
  dimension: 'api' | 'model'
): ApiStats | ModelStatsSummary | null => {
  if (!isRecord(value)) return null;
  const requests = readNumber(value.requests ?? value.total_requests);
  const success = readNumber(value.success ?? value.success_count);
  const failure = readNumber(value.failure ?? value.failure_count);
  const tokens = readTokenTotal(value.tokens ?? value);
  const coverage = readCoverage(value.token_coverage, requests);
  const costs = buildDimensionCost(value, userOverrides);
  const latencySum = readLatencySum(value.latency_ms_sum);
  const latencySamples = readNumber(value.latency_sample_count);
  const averageLatencyMs = latencySamples > 0 ? latencySum / latencySamples : null;
  const id = dimensionId(value, dimension === 'api' ? 'Unknown API' : 'Unknown model');
  if (dimension === 'api') {
    return {
      endpoint: dimensionLabel(value, id),
      totalRequests: requests,
      successCount: success,
      failureCount: failure,
      totalTokens: tokens,
      tokenCoverageStatus: coverage.status,
      knownUsageCount: coverage.known,
      unknownUsageCount: coverage.unknown,
      totalCost: costs.totalCostUsd,
      costStatus: costs.costStatus,
      missingPriceModels: costs.missingPriceModels,
      missingPriceComponents: costs.missingPriceComponents,
      models: {},
    };
  }
  return {
    model: dimensionLabel(value, id),
    requests,
    successCount: success,
    failureCount: failure,
    tokens,
    tokenCoverageStatus: coverage.status,
    knownUsageCount: coverage.known,
    unknownUsageCount: coverage.unknown,
    cost: costs.totalCostUsd,
    costStatus: costs.costStatus,
    missingPriceModels: costs.missingPriceModels,
    missingPriceComponents: costs.missingPriceComponents,
    averageLatencyMs,
    latencySampleCount: latencySamples,
  };
};

const buildSummaryAggregate = (
  value: unknown,
  userOverrides: ModelPriceOverrides
): SummaryAggregate | null => {
  if (!isRecord(value)) return null;
  const requests = readNumber(value.requests ?? value.total_requests);
  const successCount = readNumber(value.success ?? value.success_count);
  const failureCount = readNumber(value.failure ?? value.failure_count);
  const coverage = readCoverage(value.token_coverage, requests);
  const costs = buildDimensionCost(value, userOverrides);
  return {
    id: dimensionId(value, dimensionLabel(value)),
    label: dimensionLabel(value),
    requests,
    successCount,
    failureCount,
    totalTokens: readTokenTotal(value.tokens ?? value),
    tokenCoverageStatus: coverage.status,
    knownUsageCount: coverage.known,
    unknownUsageCount: coverage.unknown,
    totalCost: costs.totalCostUsd,
    costStatus: costs.costStatus,
    missingPriceModels: costs.missingPriceModels,
    missingPriceComponents: costs.missingPriceComponents,
    latencyMsSum: readLatencySum(value.latency_ms_sum),
    latencySampleCount: readNumber(value.latency_sample_count),
  };
};

const sumDimensionCosts = (dimensions: SummaryRecord[], userOverrides: ModelPriceOverrides) =>
  aggregateUsageCosts(dimensions.flatMap((dimension) =>
    readPricingGroups(dimension).map((group) => buildPricingCost(group, userOverrides))
  ));

export function buildSummaryDashboard(
  summaryValue: unknown,
  userOverrides: ModelPriceOverrides = {}
): SummaryDashboard {
  const summary = asRecord(summaryValue);
  const numericDataComplete = summaryNumbersAreComplete(summary);
  const summaryPolicyVersion = readString(summary.billable_policy_version).toLowerCase();
  const totals = asRecord(summary.totals);
  const totalRequests = readNumber(totals.requests ?? summary.total_requests);
  const successCount = readNumber(totals.success ?? summary.success_count);
  const failureCount = readNumber(totals.failure ?? summary.failure_count);
  const totalTokens = readTokenTotal(totals.tokens ?? totals);
  const totalTokenFacts = readTokens(totals.tokens ?? totals);
  const coverage = readCoverage(totals.token_coverage, totalRequests);
  const latencySum = readLatencySum(totals.latency_ms_sum);
  const latencySamples = readNumber(totals.latency_sample_count);
  const dimensions = (key: string) => asArray(summary[key]).filter(isRecord);
  const models = dimensions('models');
  const apis = dimensions('apis');
  const modelStats = models
    .map((model) => dimensionStats(model, userOverrides, 'model'))
    .filter((value): value is ModelStatsSummary => value !== null);
  const apiStats = apis
    .map((api) => dimensionStats(api, userOverrides, 'api'))
    .filter((value): value is ApiStats => value !== null);
  const topLevelPricingGroups = readPricingGroups(summary);
  const totalCosts = topLevelPricingGroups.length
    ? aggregateUsageCosts(topLevelPricingGroups.map((group) => buildPricingCost(group, userOverrides)))
    : sumDimensionCosts(models, userOverrides);
  const policyUnavailable = summaryPolicyVersion !== SUPPORTED_BILLABLE_POLICY_VERSION;
  const totalCost = totalCosts.totalCostUsd;
  const totalCostStatus = totalCosts.costStatus;
  const auths = asArray(summary.auths);
  const authStats = auths
    .map((item) => buildSummaryAggregate(item, userOverrides))
    .filter((item): item is SummaryAggregate => item !== null);
  const providerStats = dimensions('providers')
    .map((item) => buildSummaryAggregate(item, userOverrides))
    .filter((item): item is SummaryAggregate => item !== null);
  const sourceStats = dimensions('sources')
    .map((item) => buildSummaryAggregate(item, userOverrides))
    .filter((item): item is SummaryAggregate => item !== null);

  return {
    totalRequests,
    successCount,
    failureCount,
    totalTokens,
    tokenBreakdown: {
      inputTokens: readNumber(totalTokenFacts.input_tokens),
      outputTokens: readNumber(totalTokenFacts.output_tokens),
      reasoningTokens: readNumber(totalTokenFacts.reasoning_tokens),
      cachedTokens: readNumber(totalTokenFacts.cached_tokens),
      cacheReadTokens: readNumber(totalTokenFacts.cache_read_tokens),
      cacheCreationTokens: readNumber(totalTokenFacts.cache_creation_tokens),
    },
    averageLatencyMs: latencySamples > 0 ? latencySum / latencySamples : null,
    tokenCoverageStatus: coverage.status,
    totalCost: policyUnavailable || !numericDataComplete ? null : totalCost,
    totalCostStatus: policyUnavailable ? 'policy_unavailable' : totalCostStatus,
    apiStats,
    modelStats,
    authStats,
    providerStats,
    sourceStats,
    numericDataComplete,
    usage: {
      total_requests: totalRequests,
      success_count: successCount,
      failure_count: failureCount,
      total_tokens: totalTokens,
      auths,
    },
  };
}

const chartColor = {
  borderColor: '#8b8680',
  backgroundColor: 'rgba(139, 134, 128, 0.15)',
};

export function buildSummaryChartData(
  summaryValue: unknown,
  metric: 'requests' | 'tokens'
): ChartData {
  const summary = asRecord(summaryValue);
  const series = asRecord(summary.series);
  const points = asArray(series[metric]).filter(isRecord);
  const declaredAvailability = readString(series.series_availability, 'available') === 'unavailable'
    ? 'unavailable' as const
    : 'available' as const;
  const numericDataComplete = summaryNumbersAreComplete(summary);
  const availability = !numericDataComplete ? 'unavailable' as const : declaredAvailability;
  const seriesError = isRecord(series.series_error)
    ? series.series_error
    : !numericDataComplete
      ? { code: 'numeric_data_incomplete' }
      : null;
  const safePoints = numericDataComplete ? points : [];
  const labels = safePoints.map((point) => readString(point.start));
  const data = safePoints.map((point) =>
    metric === 'requests' ? readNumber(point.requests) : readTokenTotal(point.tokens ?? point)
  );
  const coverage = readCoverage(asRecord(summary.totals).token_coverage, 0);
  return {
    labels,
    datasets: [
      {
        label: 'All Models',
        data,
        borderColor: chartColor.borderColor,
        backgroundColor: chartColor.backgroundColor,
        pointBackgroundColor: chartColor.borderColor,
        pointBorderColor: chartColor.borderColor,
        fill: true,
        tension: 0.35,
      },
    ],
    coverageStatus: metric === 'tokens' ? coverage.status : 'complete',
    knownUsageCount: coverage.known,
    unknownUsageCount: coverage.unknown,
    hasData: data.some((value) => value > 0),
    availability,
    seriesError,
    numericDataComplete,
  };
}

const toTimestamp = (value: unknown, fallback: number): number => {
  const parsed = Date.parse(readString(value));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toHealthPoint = (point: SummaryRecord, startFallback: number, durationMs: number) => {
  const start = toTimestamp(point.start, startFallback);
  const end = toTimestamp(point.end, start + durationMs);
  const success = readNumber(point.success);
  const failure = readNumber(point.failure);
  const total = success + failure;
  const detail: StatusBlockDetail = {
    success,
    failure,
    rate: total > 0 ? success / total : -1,
    startTime: start,
    endTime: end,
  };
  return detail;
};

const healthState = (detail: StatusBlockDetail): StatusBlockState => {
  const total = detail.success + detail.failure;
  if (total <= 0) return 'idle';
  if (detail.failure <= 0) return 'success';
  if (detail.success <= 0) return 'failure';
  return 'mixed';
};

export function buildSummaryHealthData(summaryValue: unknown): SummaryHealthData {
  const summary = asRecord(summaryValue);
  const numericDataComplete = summaryNumbersAreComplete(summary);
  const series = asRecord(summary.series);
  const rawHealth = numericDataComplete ? asArray(series.health).filter(isRecord) : [];
  const durationMs = 15 * 60 * 1000;
  const expectedBlocks = 7 * 96;
  const healthRange = asRecord(summary.health_range);
  const declaredBucketCount =
    healthRange.bucket_count === undefined ? expectedBlocks : readNumber(healthRange.bucket_count, -1);
  const rawTail = series.health_partial_tail ?? summary.health_partial_tail;
  const tailRecord = isRecord(rawTail) ? rawTail : null;
  const partialTail = tailRecord
    ? {
        complete: false as const,
        start: readString(tailRecord.start),
        end: readString(tailRecord.end),
        requests: readNumber(tailRecord.requests),
        success: readNumber(tailRecord.success),
        failure: readNumber(tailRecord.failure),
        latencyMsSum: readLatencySum(tailRecord.latency_ms_sum),
      }
    : null;
  const observationTo = readString(summary.observation_to ?? healthRange.observation_to, '') || null;
  const alignedTo = readString(summary.aligned_to ?? healthRange.aligned_to, '') || null;
  const healthShapeComplete =
    numericDataComplete && declaredBucketCount === expectedBlocks && rawHealth.length === expectedBlocks;

  if (!healthShapeComplete) {
    return {
      blocks: [],
      blockDetails: [],
      successRate: 0,
      totalSuccess: 0,
      totalFailure: 0,
      rows: 7,
      cols: 96,
      partialTail,
      partialTailPresent: partialTail !== null,
      observationTo,
      alignedTo,
      healthDataComplete: false,
    };
  }

  const firstStart = toTimestamp(rawHealth[0]?.start, Date.now() - expectedBlocks * durationMs);
  const blockDetails = Array.from({ length: expectedBlocks }, (_, index) => {
    const point = rawHealth[index];
    if (point) return toHealthPoint(point, firstStart + index * durationMs, durationMs);
    return toHealthPoint({}, firstStart + index * durationMs, durationMs);
  });
  const blocks = blockDetails.map(healthState);
  const totalSuccess = blockDetails.reduce((sum, detail) => sum + detail.success, 0);
  const totalFailure = blockDetails.reduce((sum, detail) => sum + detail.failure, 0);
  const total = totalSuccess + totalFailure;

  return {
    blocks,
    blockDetails,
    successRate: total > 0 ? (totalSuccess / total) * 100 : 100,
    totalSuccess,
    totalFailure,
    rows: 7,
    cols: 96,
    partialTail,
    partialTailPresent: partialTail !== null,
    observationTo,
    alignedTo,
    healthDataComplete: healthRange.partial_tail_present !== true,
  };
}
