import { parseTimestampMs } from '@/utils/timestamp';

export type CostStatus = 'unknown_usage' | 'unconfigured' | 'partial' | 'complete';
export type TokenUsageSource = 'backend' | 'computed' | 'legacy' | 'unknown';
export type CacheSplitStatus = 'none' | 'unsplit' | 'split' | 'partial';
export type ReasoningCostMode = 'included' | 'separate' | 'unknown';
export type UsageCoverageStatus = 'unknown' | 'partial' | 'complete';

export interface NormalizedUsageTokens {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  cachedTokens: number;
  totalTokens: number;
  reportedTotalTokens: number | null;
  computedTotalTokens: number;
  tokenUsageSource: TokenUsageSource;
  cacheSplitStatus: CacheSplitStatus;
  reasoningCostMode: ReasoningCostMode;
  cacheRatio: number | null;
  cacheRatioNumeratorTokens: number;
  cacheRatioDenominatorTokens: number;
  hasKnownUsage: boolean;
}

export interface UsageThinking {
  intensity?: string;
  mode?: string;
  level?: string;
  budget?: number;
}

export interface NormalizedUsageCost {
  inputCostUsd: number | null;
  outputCostUsd: number | null;
  cacheCostUsd: number | null;
  totalCostUsd: number | null;
  costStatus: CostStatus;
  missingPriceModels: string[];
  missingPriceComponents: string[];
  priceKey?: string;
  priceSource?: string;
}

export interface NormalizedUsageDetail {
  requestId: string;
  clientIp: string;
  timestamp: string;
  endpoint: string;
  model: string;
  provider: string;
  executorType: string;
  authType: string;
  modelAlias: string;
  source: string;
  authIndex: string | number | null;
  auth_index: string | number | null;
  failed: boolean;
  latencyMs: number | null;
  latency_ms?: number;
  tokens: NormalizedUsageTokens;
  thinking: UsageThinking | null;
  estimatedCostUsd: number | null;
  cost: NormalizedUsageCost;
  raw: unknown;
  __modelName: string;
  __endpoint: string;
  __endpointMethod?: string;
  __endpointPath?: string;
  __timestampMs: number;
}

export interface NormalizeUsageDetailOptions {
  endpoint?: string;
  endpointMethod?: string;
  endpointPath?: string;
  model?: string;
  provider?: string;
  sourceNormalizer?: (value: unknown) => string;
}

const ENDPOINT_METHOD_REGEX = /^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+(\S+)/i;

const TOKEN_FIELD_NAMES = [
  'input_tokens',
  'inputTokens',
  'prompt_tokens',
  'promptTokens',
  'output_tokens',
  'outputTokens',
  'completion_tokens',
  'completionTokens',
  'reasoning_tokens',
  'reasoningTokens',
  'cached_tokens',
  'cachedTokens',
  'cache_tokens',
  'cacheTokens',
  'cache_read_tokens',
  'cacheReadTokens',
  'cache_creation_tokens',
  'cacheCreationTokens',
  'total_tokens',
  'totalTokens',
  'reported_total_tokens',
  'reportedTotalTokens',
  'computed_total_tokens',
  'computedTotalTokens',
];

export const EMPTY_USAGE_COST: NormalizedUsageCost = {
  inputCostUsd: null,
  outputCostUsd: null,
  cacheCostUsd: null,
  totalCostUsd: null,
  costStatus: 'unknown_usage',
  missingPriceModels: [],
  missingPriceComponents: [],
};

export const resolveUsageCoverageStatus = (
  knownCount: number,
  unknownCount: number
): UsageCoverageStatus => {
  if (knownCount <= 0) return 'unknown';
  return unknownCount > 0 ? 'partial' : 'complete';
};

export const resolveWindowUsageCoverageStatus = (
  hasValidTimeAnchor: boolean,
  knownCount: number,
  unknownCount: number,
  unlocatableCount: number,
  noRequestsKnown = false
): UsageCoverageStatus => {
  if (noRequestsKnown) return 'complete';
  if (!hasValidTimeAnchor) return 'unknown';
  if (knownCount + unknownCount + unlocatableCount <= 0) return 'complete';
  return resolveUsageCoverageStatus(knownCount, unknownCount + unlocatableCount);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const NON_NEGATIVE_DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;

export const parseNonNegativeNumber = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!NON_NEGATIVE_DECIMAL_PATTERN.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const readString = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return '';
};

const readNonNegativeNumber = (...values: unknown[]): number | null => {
  for (const value of values) {
    const parsed = parseNonNegativeNumber(value);
    if (parsed !== null) return parsed;
  }
  return null;
};

const readMaxNonNegativeNumber = (...values: unknown[]): number | null => {
  const parsedValues = values
    .map(parseNonNegativeNumber)
    .filter((value): value is number => value !== null);
  if (!parsedValues.length) return null;
  return Math.max(...parsedValues);
};

const readBoolean = (value: unknown): boolean => value === true;

const hasTokenFact = (record: Record<string, unknown>): boolean =>
  TOKEN_FIELD_NAMES.some((field) => {
    const parsed = parseNonNegativeNumber(record[field]);
    return parsed !== null && parsed > 0;
  });

const normalizeReasoningCostMode = (
  value: unknown,
  provider: unknown,
  reasoningTokens: number
): ReasoningCostMode => {
  const mode = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (mode === 'separate') return 'separate';
  if (
    mode === 'included' ||
    mode === 'included_in_output' ||
    mode === 'output' ||
    mode === 'default'
  ) {
    return 'included';
  }
  if (mode === 'unknown') return 'unknown';
  if (reasoningTokens <= 0) return 'unknown';
  const normalizedProvider = typeof provider === 'string' ? provider.trim().toLowerCase() : '';
  if (
    normalizedProvider === 'gemini' ||
    normalizedProvider === 'gemini-interactions' ||
    normalizedProvider === 'vertex' ||
    normalizedProvider === 'aistudio' ||
    normalizedProvider === 'antigravity' ||
    normalizedProvider === 'interactions'
  ) {
    return 'separate';
  }
  return 'included';
};

const normalizeTokenUsageSource = (value: unknown, fallback: TokenUsageSource): TokenUsageSource => {
  const source = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (source === 'provider_usage') return 'backend';
  if (source === 'missing_usage') return 'unknown';
  if (source === 'backend' || source === 'computed' || source === 'legacy' || source === 'unknown') {
    return source;
  }
  return fallback;
};

export const isCacheAdditiveProvider = (provider: unknown): boolean => {
  const normalized = typeof provider === 'string' ? provider.trim().toLowerCase() : '';
  return (
    normalized === 'claude' ||
    normalized === 'anthropic' ||
    normalized.startsWith('claude-') ||
    normalized.startsWith('anthropic-')
  );
};

const normalizeCacheSplitStatus = (
  value: unknown,
  cacheReadTokens: number,
  cacheCreationTokens: number,
  cachedTokens: number
): CacheSplitStatus => {
  const status = typeof value === 'string' ? value.trim().toLowerCase() : '';
  const splitCacheTokens = cacheReadTokens + cacheCreationTokens;
  if (splitCacheTokens > 0 && cachedTokens > splitCacheTokens) return 'partial';
  if (status === 'split' || status === 'separate') return 'split';
  if (status === 'partial') return 'partial';
  if (status === 'unsplit' || status === 'legacy') return 'unsplit';
  if (splitCacheTokens > 0) return 'split';
  if (cachedTokens > 0) return 'unsplit';
  return 'none';
};

export function normalizeUsageTokens(value: unknown, provider?: unknown): NormalizedUsageTokens {
  const source = isRecord(value) && isRecord(value.tokens) ? value.tokens : value;
  const tokens = isRecord(source) ? source : {};
  const explicitHasKnownUsage =
    typeof tokens.hasKnownUsage === 'boolean' ? tokens.hasKnownUsage : null;
  const rawTokenUsageSource = tokens.token_usage_source ?? tokens.tokenUsageSource;
  const rawTokenUsageSourceName =
    typeof rawTokenUsageSource === 'string' ? rawTokenUsageSource.trim().toLowerCase() : '';

  const inputTokens =
    readNonNegativeNumber(tokens.input_tokens, tokens.inputTokens, tokens.prompt_tokens, tokens.promptTokens) ?? 0;
  const outputTokens =
    readNonNegativeNumber(
      tokens.output_tokens,
      tokens.outputTokens,
      tokens.completion_tokens,
      tokens.completionTokens
    ) ?? 0;
  const reasoningTokens =
    readNonNegativeNumber(tokens.reasoning_tokens, tokens.reasoningTokens) ?? 0;
  const cacheReadTokens =
    readNonNegativeNumber(tokens.cache_read_tokens, tokens.cacheReadTokens) ?? 0;
  const cacheCreationTokens =
    readNonNegativeNumber(tokens.cache_creation_tokens, tokens.cacheCreationTokens) ?? 0;
  const unsplitCachedTokens =
    readMaxNonNegativeNumber(
      tokens.cached_tokens,
      tokens.cachedTokens,
      tokens.cache_tokens,
      tokens.cacheTokens
    ) ?? 0;
  const splitCachedTokens = cacheReadTokens + cacheCreationTokens;
  const cachedTokens =
    cacheReadTokens > 0 && cacheCreationTokens > 0
      ? splitCachedTokens
      : Math.max(unsplitCachedTokens, splitCachedTokens);
  const reportedTotalTokens = readNonNegativeNumber(
    tokens.reported_total_tokens,
    tokens.reportedTotalTokens
  );
  const finalTotalTokens = readNonNegativeNumber(
    tokens.total_tokens,
    tokens.totalTokens
  );
  const explicitComputedTotal = readNonNegativeNumber(
    tokens.computed_total_tokens,
    tokens.computedTotalTokens
  );
  const reasoningCostMode = normalizeReasoningCostMode(
    tokens.reasoning_cost_mode ?? tokens.reasoningCostMode,
    provider,
    reasoningTokens
  );
  const primaryTokens = inputTokens + outputTokens;
  let computedFromFacts = primaryTokens;
  if (isCacheAdditiveProvider(provider)) {
    computedFromFacts += cachedTokens;
  } else if (computedFromFacts === 0 && cachedTokens > 0) {
    computedFromFacts = cachedTokens;
  }
  if (reasoningTokens > 0) {
    if (reasoningCostMode === 'separate') {
      computedFromFacts += reasoningTokens;
    } else if (reasoningCostMode === 'unknown' && primaryTokens === 0 && cachedTokens === 0) {
      computedFromFacts += reasoningTokens;
    }
  }
  const computedTotalTokens =
    explicitComputedTotal ?? computedFromFacts;
  const totalTokens =
    finalTotalTokens ??
    (reportedTotalTokens !== null && reportedTotalTokens > 0
      ? reportedTotalTokens
      : computedTotalTokens);
  const cacheSplitStatus = normalizeCacheSplitStatus(
    tokens.cache_split_status ?? tokens.cacheSplitStatus,
    cacheReadTokens,
    cacheCreationTokens,
    cachedTokens
  );
  const tokenUsageSource = normalizeTokenUsageSource(
    rawTokenUsageSource,
    finalTotalTokens !== null || reportedTotalTokens !== null
      ? 'backend'
      : computedTotalTokens > 0
        ? 'computed'
        : 'unknown'
  );
  const hasKnownUsage =
    explicitHasKnownUsage ??
    (rawTokenUsageSourceName === 'missing_usage'
      ? false
      : rawTokenUsageSourceName === 'provider_usage'
        ? true
        : hasTokenFact(tokens));
  const explicitCacheRatio = readNonNegativeNumber(tokens.cache_ratio, tokens.cacheRatio);
  const explicitCacheRatioDenominator = readNonNegativeNumber(
    tokens.cache_ratio_denominator_tokens,
    tokens.cacheRatioDenominatorTokens
  );
  const cacheRatioDenominator =
    explicitCacheRatioDenominator ??
    (isCacheAdditiveProvider(provider) ? inputTokens + cachedTokens : inputTokens);
  const cacheRatioNumerator =
    cacheReadTokens + cacheCreationTokens > 0 ? cacheReadTokens : cachedTokens;
  const cacheRatio =
    explicitCacheRatio !== null
      ? Math.min(explicitCacheRatio, 1)
      : cacheRatioDenominator > 0
        ? Math.min(cacheRatioNumerator / cacheRatioDenominator, 1)
        : null;

  return {
    inputTokens,
    outputTokens,
    reasoningTokens,
    cacheReadTokens,
    cacheCreationTokens,
    cachedTokens,
    totalTokens,
    reportedTotalTokens,
    computedTotalTokens,
    tokenUsageSource,
    cacheSplitStatus,
    reasoningCostMode,
    cacheRatio,
    cacheRatioNumeratorTokens: cacheRatioNumerator,
    cacheRatioDenominatorTokens: cacheRatioDenominator,
    hasKnownUsage,
  };
}

const normalizeUsageThinking = (value: unknown): UsageThinking | null => {
  if (!isRecord(value)) return null;

  const intensity = readString(value.intensity);
  const mode = readString(value.mode);
  const level = readString(value.level);
  const budget = readNonNegativeNumber(value.budget);
  const normalizedBudget =
    budget !== null
      ? budget
      : typeof value.budget === 'number' && value.budget === -1
        ? -1
        : undefined;

  if (!intensity && !mode && !level && normalizedBudget === undefined) {
    return null;
  }

  return {
    ...(intensity ? { intensity } : {}),
    ...(mode ? { mode } : {}),
    ...(level ? { level } : {}),
    ...(normalizedBudget !== undefined ? { budget: normalizedBudget } : {}),
  };
};

const readLatencyMs = (record: Record<string, unknown>): number | null => {
  const latency = readNonNegativeNumber(record.latency_ms, record.latencyMs);
  return latency ?? null;
};

const readEstimatedCost = (record: Record<string, unknown>): number | null => {
  const value = readNonNegativeNumber(record.estimated_cost_usd, record.estimatedCostUsd);
  return value ?? null;
};

export function normalizeUsageDetail(
  value: unknown,
  options: NormalizeUsageDetailOptions = {}
): NormalizedUsageDetail {
  const record = isRecord(value) ? value : {};
  const endpoint = readString(record.endpoint, options.endpoint);
  const endpointMatch = endpoint.match(ENDPOINT_METHOD_REGEX);
  const endpointMethod = options.endpointMethod ?? endpointMatch?.[1]?.toUpperCase();
  const endpointPath = options.endpointPath ?? endpointMatch?.[2];
  const timestamp = readString(record.timestamp);
  const timestampMs = parseTimestampMs(timestamp);
  const sourceRaw = record.source ?? '';
  const source = options.sourceNormalizer ? options.sourceNormalizer(sourceRaw) : readString(sourceRaw);
  const authIndex = (record.auth_index ?? record.authIndex ?? record.AuthIndex ?? null) as
    | string
    | number
    | null;
  const model = readString(record.model, record.__modelName, options.model);
  const provider = readString(record.provider, options.provider);
  const latencyMs = readLatencyMs(record);

  return {
    requestId: readString(record.request_id, record.requestId, record.id),
    clientIp: readString(record.client_ip, record.clientIp),
    timestamp,
    endpoint,
    model,
    provider,
    executorType: readString(record.executor_type, record.executorType),
    authType: readString(record.auth_type, record.authType),
    modelAlias: readString(record.model_alias, record.modelAlias),
    source,
    authIndex,
    auth_index: authIndex,
    failed: readBoolean(record.failed),
    latencyMs,
    ...(latencyMs !== null ? { latency_ms: latencyMs } : {}),
    tokens: normalizeUsageTokens(record.tokens ?? record, provider),
    thinking: normalizeUsageThinking(record.thinking),
    estimatedCostUsd: readEstimatedCost(record),
    cost: { ...EMPTY_USAGE_COST },
    raw: value,
    __modelName: model,
    __endpoint: endpoint,
    ...(endpointMethod ? { __endpointMethod: endpointMethod } : {}),
    ...(endpointPath ? { __endpointPath: endpointPath } : {}),
    __timestampMs: Number.isNaN(timestampMs) ? 0 : timestampMs,
  };
}
