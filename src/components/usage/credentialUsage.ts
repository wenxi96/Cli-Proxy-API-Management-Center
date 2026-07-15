import type {
  AuthUsageRequestItem,
  UsageAuthSummary,
  CredentialCostStatus,
} from '@/services/api/usage';
import type { CredentialInfo } from '@/types/sourceInfo';
import { isRecord } from '@/utils/helpers';
import { parseTimestampMs } from '@/utils/timestamp';
import {
  buildSourceInfoMap,
  resolveSourceDisplay,
  type SourceInfoMap,
} from '@/utils/sourceResolver';
import {
  aggregateUsageCosts,
  calculateUsageCost,
  collectUsageDetails,
  extractLatencyMs,
  formatUsd,
  normalizeUsageDetail,
  normalizeUsageTokens,
  normalizeAuthIndex,
  normalizeUsageSourceId,
  resolveUsageCoverageStatus,
  type ModelPriceOverrides,
  type UsageCoverageStatus,
  type UsageDetail,
} from '@/utils/usage';

export type { CredentialCostStatus };

export interface CredentialTokenStats {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  cachedTokens: number;
  totalTokens: number;
  reportedTotalTokens: number | null;
  computedTotalTokens: number;
  cacheRatio: number | null;
  cacheRatioNumeratorTokens: number;
  cacheRatioDenominatorTokens: number;
  hasKnownUsage: boolean;
  usageCoverageStatus: UsageCoverageStatus;
  knownUsageCount: number;
  unknownUsageCount: number;
}

export interface CredentialCostSummary {
  inputCostUsd: number | null;
  outputCostUsd: number | null;
  cacheCostUsd: number | null;
  totalCostUsd: number | null;
  costStatus: CredentialCostStatus;
  missingPriceModels: string[];
  missingPriceComponents: string[];
}

export interface CredentialUsageRequestRow {
  id: string;
  timestamp: string;
  timestampMs: number;
  endpoint: string;
  model: string;
  source: string;
  sourceType: string;
  sourceKey: string;
  authIndex: string;
  failed: boolean;
  latencyMs: number | null;
  tokens: CredentialTokenStats;
  cost: CredentialCostSummary;
}

export interface CredentialUsageRow {
  key: string;
  authIndex: string | null;
  sourceKey: string;
  displayName: string;
  type: string;
  success: number;
  failure: number;
  total: number;
  successRate: number;
  tokens: CredentialTokenStats;
  cost: CredentialCostSummary;
  details: CredentialUsageRequestRow[];
  usesBackendAggregate: boolean;
}

export interface CredentialUsageBuildContext {
  sourceInfoMap: SourceInfoMap;
  authFileMap: Map<string, CredentialInfo>;
  modelPrices: ModelPriceOverrides;
}

const EMPTY_TOKENS: CredentialTokenStats = {
  inputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  cachedTokens: 0,
  totalTokens: 0,
  reportedTotalTokens: null,
  computedTotalTokens: 0,
  cacheRatio: null,
  cacheRatioNumeratorTokens: 0,
  cacheRatioDenominatorTokens: 0,
  hasKnownUsage: false,
  usageCoverageStatus: 'unknown',
  knownUsageCount: 0,
  unknownUsageCount: 0,
};

const UNKNOWN_MODEL = '-';

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(parsed, 0);
};

export function normalizeCredentialTokenStats(value: unknown): CredentialTokenStats {
  const tokens = normalizeUsageTokens(value);

  return {
    inputTokens: tokens.inputTokens,
    outputTokens: tokens.outputTokens,
    reasoningTokens: tokens.reasoningTokens,
    cacheReadTokens: tokens.cacheReadTokens,
    cacheCreationTokens: tokens.cacheCreationTokens,
    cachedTokens: tokens.cachedTokens,
    totalTokens: tokens.totalTokens,
    reportedTotalTokens: tokens.reportedTotalTokens,
    computedTotalTokens: tokens.computedTotalTokens,
    cacheRatio: tokens.cacheRatio,
    cacheRatioNumeratorTokens: tokens.cacheRatioNumeratorTokens,
    cacheRatioDenominatorTokens: tokens.cacheRatioDenominatorTokens,
    hasKnownUsage: tokens.hasKnownUsage,
    usageCoverageStatus: tokens.hasKnownUsage ? 'complete' : 'unknown',
    knownUsageCount: tokens.hasKnownUsage ? 1 : 0,
    unknownUsageCount: tokens.hasKnownUsage ? 0 : 1,
  };
}

export const addCredentialTokenStats = (
  current: CredentialTokenStats,
  addition: CredentialTokenStats
): CredentialTokenStats => ({
  inputTokens: current.inputTokens + addition.inputTokens,
  outputTokens: current.outputTokens + addition.outputTokens,
  reasoningTokens: current.reasoningTokens + addition.reasoningTokens,
  cacheReadTokens: current.cacheReadTokens + addition.cacheReadTokens,
  cacheCreationTokens: current.cacheCreationTokens + addition.cacheCreationTokens,
  cachedTokens: current.cachedTokens + addition.cachedTokens,
  totalTokens: current.totalTokens + addition.totalTokens,
  reportedTotalTokens: null,
  computedTotalTokens: current.computedTotalTokens + addition.computedTotalTokens,
  cacheRatio:
    current.cacheRatioDenominatorTokens + addition.cacheRatioDenominatorTokens > 0
      ? (current.cacheRatioNumeratorTokens + addition.cacheRatioNumeratorTokens) /
        (current.cacheRatioDenominatorTokens + addition.cacheRatioDenominatorTokens)
      : null,
  cacheRatioNumeratorTokens:
    current.cacheRatioNumeratorTokens + addition.cacheRatioNumeratorTokens,
  cacheRatioDenominatorTokens:
    current.cacheRatioDenominatorTokens + addition.cacheRatioDenominatorTokens,
  hasKnownUsage: current.hasKnownUsage || addition.hasKnownUsage,
  usageCoverageStatus: resolveUsageCoverageStatus(
    current.knownUsageCount + addition.knownUsageCount,
    current.unknownUsageCount + addition.unknownUsageCount
  ),
  knownUsageCount: current.knownUsageCount + addition.knownUsageCount,
  unknownUsageCount: current.unknownUsageCount + addition.unknownUsageCount,
});

const hasTokenSignal = (tokens: CredentialTokenStats): boolean =>
  tokens.hasKnownUsage;

export function summarizeCredentialCostCoverage(
  details: UsageDetail[],
  modelPrices: ModelPriceOverrides
): CredentialCostSummary {
  const costs = details.map((detail) => calculateUsageCost(detail, modelPrices));
  const aggregate = aggregateUsageCosts(costs);
  return {
    inputCostUsd: aggregate.inputCostUsd,
    outputCostUsd: aggregate.outputCostUsd,
    cacheCostUsd: aggregate.cacheCostUsd,
    totalCostUsd: aggregate.totalCostUsd,
    costStatus: aggregate.costStatus,
    missingPriceModels: aggregate.missingPriceModels,
    missingPriceComponents: aggregate.missingPriceComponents,
  };
}

export function formatCredentialCostLabel(cost: CredentialCostSummary): string {
  if (
    cost.costStatus === 'unknown_usage' ||
    cost.costStatus === 'unconfigured' ||
    cost.totalCostUsd === null
  ) {
    return '--';
  }
  return formatUsd(cost.totalCostUsd);
}

const normalizeBackendSource = (value: unknown): string => {
  const raw =
    typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value);
  const trimmed = raw.trim();
  return trimmed ? normalizeUsageSourceId(trimmed) : '';
};

const buildCredentialKey = (authIndex: string | null, sourceKey: string): string =>
  authIndex ? `auth:${authIndex}` : sourceKey || 'source:-';

const resolveCredentialIdentity = (
  source: string,
  authIndex: unknown,
  context: CredentialUsageBuildContext
) => {
  const normalizedAuthIndex = normalizeAuthIndex(authIndex);
  const sourceInfo = resolveSourceDisplay(
    source,
    normalizedAuthIndex,
    context.sourceInfoMap,
    context.authFileMap
  );
  const sourceKey = normalizedAuthIndex
    ? `auth:${normalizedAuthIndex}`
    : (sourceInfo.identityKey ?? `source:${source || sourceInfo.displayName}`);

  return {
    authIndex: normalizedAuthIndex,
    sourceKey,
    key: buildCredentialKey(normalizedAuthIndex, sourceKey),
    displayName: sourceInfo.displayName,
    type: sourceInfo.type,
  };
};

const toUsageDetailForCost = (
  model: string,
  tokens: CredentialTokenStats,
  timestamp = ''
): UsageDetail =>
  normalizeUsageDetail(
    {
      timestamp,
      model,
      tokens: {
        inputTokens: tokens.inputTokens,
        outputTokens: tokens.outputTokens,
        reasoningTokens: tokens.reasoningTokens,
        cacheReadTokens: tokens.cacheReadTokens,
        cacheCreationTokens: tokens.cacheCreationTokens,
        cachedTokens: tokens.cachedTokens,
        totalTokens: tokens.totalTokens,
      },
      failed: false,
    },
    { model }
  );

const buildRequestRowFromUsageDetail = (
  detail: UsageDetail,
  index: number,
  context: CredentialUsageBuildContext
): CredentialUsageRequestRow => {
  const timestamp = detail.timestamp;
  const timestampMs =
    typeof detail.__timestampMs === 'number' && detail.__timestampMs > 0
      ? detail.__timestampMs
      : parseTimestampMs(timestamp);
  const source = String(detail.source ?? '').trim();
  const authIndex = normalizeAuthIndex(detail.auth_index);
  const sourceInfo = resolveSourceDisplay(source, authIndex, context.sourceInfoMap, context.authFileMap);
  const sourceKey = authIndex
    ? `auth:${authIndex}`
    : (sourceInfo.identityKey ?? `source:${source || sourceInfo.displayName}`);
  const model = (detail.__modelName || UNKNOWN_MODEL).trim() || UNKNOWN_MODEL;
  const tokens = normalizeCredentialTokenStats(detail.tokens);
  const cost = summarizeCredentialCostCoverage([detail], context.modelPrices);

  return {
    id: `${timestamp}-${model}-${sourceKey}-${index}`,
    timestamp,
    timestampMs: Number.isNaN(timestampMs) ? 0 : timestampMs,
    endpoint: detail.endpoint || detail.__endpoint || '',
    model,
    source: sourceInfo.displayName,
    sourceType: sourceInfo.type,
    sourceKey,
    authIndex: authIndex ?? '-',
    failed: detail.failed === true,
    latencyMs: extractLatencyMs(detail),
    tokens,
    cost,
  };
};

export function buildCredentialRequestRowsFromDetails(
  details: UsageDetail[],
  context: CredentialUsageBuildContext
): CredentialUsageRequestRow[] {
  return details
    .map((detail, index) => buildRequestRowFromUsageDetail(detail, index, context))
    .sort((a, b) => b.timestampMs - a.timestampMs);
}

export function buildCredentialRequestRowsFromAuthItems(
  items: AuthUsageRequestItem[],
  context: CredentialUsageBuildContext
): CredentialUsageRequestRow[] {
  return items
    .map((item, index) => {
      const timestamp = item.timestamp || '';
      const timestampMs = parseTimestampMs(timestamp);
      const source = normalizeBackendSource(item.source);
      const authIndex = normalizeAuthIndex(item.auth_index);
      const sourceInfo = resolveSourceDisplay(
        source,
        authIndex,
        context.sourceInfoMap,
        context.authFileMap
      );
      const sourceKey = authIndex
        ? `auth:${authIndex}`
        : (sourceInfo.identityKey ?? `source:${source || sourceInfo.displayName}`);
      const model = (item.model || UNKNOWN_MODEL).trim() || UNKNOWN_MODEL;
      const normalized = normalizeUsageDetail(item, {
        model,
        endpoint: item.endpoint || '',
        sourceNormalizer: normalizeBackendSource,
      });
      const tokens = normalizeCredentialTokenStats(normalized.tokens);
      const cost = summarizeCredentialCostCoverage(
        [normalized],
        context.modelPrices
      );
      const latencyRaw = Number(item.latency_ms);
      const latencyMs = Number.isFinite(latencyRaw) ? Math.max(latencyRaw, 0) : null;

      return {
        id: `${timestamp}-${model}-${sourceKey}-${index}`,
        timestamp,
        timestampMs: Number.isNaN(timestampMs) ? 0 : timestampMs,
        endpoint: item.endpoint || '',
        model,
        source: sourceInfo.displayName,
        sourceType: sourceInfo.type,
        sourceKey,
        authIndex: authIndex ?? '-',
        failed: item.failed === true,
        latencyMs,
        tokens,
        cost,
      };
    })
    .sort((a, b) => b.timestampMs - a.timestampMs);
}

interface CredentialAccumulator {
  key: string;
  authIndex: string | null;
  sourceKey: string;
  displayName: string;
  type: string;
  success: number;
  failure: number;
  tokens: CredentialTokenStats;
  costDetails: UsageDetail[];
  requestRows: CredentialUsageRequestRow[];
}

const createAccumulator = (
  identity: ReturnType<typeof resolveCredentialIdentity>
): CredentialAccumulator => ({
  key: identity.key,
  authIndex: identity.authIndex,
  sourceKey: identity.sourceKey,
  displayName: identity.displayName,
  type: identity.type,
  success: 0,
  failure: 0,
  tokens: { ...EMPTY_TOKENS },
  costDetails: [],
  requestRows: [],
});

const finalizeAccumulator = (
  accumulator: CredentialAccumulator,
  modelPrices: ModelPriceOverrides,
  usesBackendAggregate: boolean
): CredentialUsageRow => {
  const total = accumulator.success + accumulator.failure;
  const details = accumulator.requestRows.sort((a, b) => b.timestampMs - a.timestampMs);
  return {
    key: accumulator.key,
    authIndex: accumulator.authIndex,
    sourceKey: accumulator.sourceKey,
    displayName: accumulator.displayName,
    type: accumulator.type,
    success: accumulator.success,
    failure: accumulator.failure,
    total,
    successRate: total > 0 ? (accumulator.success / total) * 100 : 100,
    tokens: accumulator.tokens,
    cost: summarizeCredentialCostCoverage(accumulator.costDetails, modelPrices),
    details,
    usesBackendAggregate,
  };
};

const getSuccessCount = (summary: Record<string, unknown>, total: number, failure: number) => {
  const explicit =
    summary.success_count ??
    summary.successCount ??
    summary.success_requests ??
    summary.successRequests;
  if (explicit !== undefined && explicit !== null) return toNumber(explicit);
  return Math.max(total - failure, 0);
};

const getFailureCount = (summary: Record<string, unknown>) =>
  toNumber(
    summary.failure_count ??
      summary.failureCount ??
      summary.failed_requests ??
      summary.failedRequests ??
      summary.failures
  );

const getTotalRequests = (summary: Record<string, unknown>, success: number, failure: number) => {
  const explicit = summary.total_requests ?? summary.totalRequests ?? summary.requests;
  const parsed = toNumber(explicit);
  return parsed > 0 ? parsed : success + failure;
};

const collectBackendAuthSummaries = (usage: unknown): Array<UsageAuthSummary & { __key?: string }> => {
  if (!isRecord(usage)) return [];
  const auths = usage.auths;
  if (Array.isArray(auths)) {
    return auths.filter(isRecord) as UsageAuthSummary[];
  }
  if (!isRecord(auths)) return [];
  return Object.entries(auths)
    .filter(([, value]) => isRecord(value))
    .map(([key, value]) => ({ ...(value as UsageAuthSummary), __key: key }));
};

const buildCostDetailsFromBackendSummary = (summary: Record<string, unknown>): UsageDetail[] => {
  const models = isRecord(summary.models) ? summary.models : null;
  if (!models) {
    const tokens = normalizeCredentialTokenStats(summary.tokens ?? summary);
    if (!hasTokenSignal(tokens)) return [];
    return [toUsageDetailForCost(UNKNOWN_MODEL, tokens)];
  }

  const details: UsageDetail[] = [];
  Object.entries(models).forEach(([model, raw]) => {
    if (!isRecord(raw)) return;
    const tokens = normalizeCredentialTokenStats(raw.tokens ?? raw);
    if (!hasTokenSignal(tokens)) return;
    details.push(toUsageDetailForCost(model || UNKNOWN_MODEL, tokens));
  });
  return details;
};

const getBackendSummaryTokens = (summary: Record<string, unknown>): CredentialTokenStats => {
  const directTokens = normalizeCredentialTokenStats(summary.tokens ?? summary);
  if (hasTokenSignal(directTokens)) {
    return directTokens;
  }

  const models = isRecord(summary.models) ? summary.models : null;
  if (!models) {
    return directTokens;
  }

  return Object.values(models).reduce<CredentialTokenStats>((total, raw) => {
    if (!isRecord(raw)) return total;
    return addCredentialTokenStats(total, normalizeCredentialTokenStats(raw.tokens ?? raw));
  }, { ...EMPTY_TOKENS });
};

export function buildCredentialUsageRows(
  usage: unknown,
  context: CredentialUsageBuildContext
): CredentialUsageRow[] {
  const localAccumulators = new Map<string, CredentialAccumulator>();
  const details = collectUsageDetails(usage);
  const requestRows = details.map((detail, index) =>
    buildRequestRowFromUsageDetail(detail, index, context)
  );

  details.forEach((detail, index) => {
    const source = String(detail.source ?? '').trim();
    const identity = resolveCredentialIdentity(source, detail.auth_index, context);
    const accumulator = localAccumulators.get(identity.key) ?? createAccumulator(identity);
    const tokens = normalizeCredentialTokenStats(detail.tokens);

    if (detail.failed === true) {
      accumulator.failure += 1;
    } else {
      accumulator.success += 1;
    }
    accumulator.tokens = addCredentialTokenStats(accumulator.tokens, tokens);
    accumulator.costDetails.push(detail);
    accumulator.requestRows.push(requestRows[index]);
    localAccumulators.set(identity.key, accumulator);
  });

  const backendSummaries = collectBackendAuthSummaries(usage);
  if (!backendSummaries.length) {
    return Array.from(localAccumulators.values())
      .map((accumulator) => finalizeAccumulator(accumulator, context.modelPrices, false))
      .sort((a, b) => b.total - a.total);
  }

  const usedLocalKeys = new Set<string>();
  const rows: CredentialUsageRow[] = backendSummaries
    .map((summary) => {
      const authIndex = normalizeAuthIndex(summary.auth_index ?? summary.authIndex ?? summary.__key);
      const source = normalizeBackendSource(summary.source);
      const identity = resolveCredentialIdentity(source, authIndex, context);
      const local = localAccumulators.get(identity.key);
      if (local) usedLocalKeys.add(identity.key);

      const totalHint = toNumber(summary.total_requests ?? summary.totalRequests ?? summary.requests);
      const failure = getFailureCount(summary);
      const success = getSuccessCount(summary, totalHint, failure);
      const total = getTotalRequests(summary, success, failure);
      const backendTokens = getBackendSummaryTokens(summary);
      const tokens = local ? local.tokens : backendTokens;
      const costDetails = local?.costDetails.length
        ? local.costDetails
        : buildCostDetailsFromBackendSummary(summary);
      const cost = summarizeCredentialCostCoverage(costDetails, context.modelPrices);

      return {
        key: identity.key,
        authIndex,
        sourceKey: identity.sourceKey,
        displayName: identity.displayName,
        type: identity.type,
        success,
        failure,
        total,
        successRate: total > 0 ? (success / total) * 100 : 100,
        tokens,
        cost,
        details: local?.requestRows.sort((a, b) => b.timestampMs - a.timestampMs) ?? [],
        usesBackendAggregate: true,
      } satisfies CredentialUsageRow;
    })
    .filter((row) => row.total > 0 || row.tokens.totalTokens > 0);

  localAccumulators.forEach((accumulator, key) => {
    if (usedLocalKeys.has(key)) return;
    rows.push(finalizeAccumulator(accumulator, context.modelPrices, false));
  });

  return rows.sort((a, b) => b.total - a.total);
}

export function buildDefaultCredentialUsageContext(
  input: Parameters<typeof buildSourceInfoMap>[0],
  authFileMap: Map<string, CredentialInfo>,
  modelPrices: ModelPriceOverrides
): CredentialUsageBuildContext {
  return {
    sourceInfoMap: buildSourceInfoMap(input),
    authFileMap,
    modelPrices,
  };
}
