/**
 * Usage statistics utilities.
 * Pure logic migrated from the baseline modules/usage.js implementation.
 */

import type { ScriptableContext } from 'chart.js';
import type { LatencyAccumulator, LatencyStats } from './usage/latency';
import {
  addLatencySample,
  calculateLatencyStatsFromDetails,
  createLatencyAccumulator,
  extractLatencyMs,
  finalizeLatencyStats,
} from './usage/latency';
import {
  aggregateUsageCosts,
  calculateUsageCost,
  isCostUnresolved,
  type ModelPriceOverrides,
} from './usage/cost';
import {
  normalizeUsageDetail,
  parseNonNegativeNumber,
  resolveUsageCoverageStatus,
  type CostStatus,
  type NormalizedUsageCost,
  type NormalizedUsageDetail,
  type UsageCoverageStatus,
} from './usage/normalization';
import { maskApiKey } from './format';
import { parseTimestampMs } from './timestamp';

export type { DurationFormatOptions, LatencyStats } from './usage/latency';
export type {
  AggregateUsageCost,
  ModelPrice,
  ModelPriceOverrides,
  PriceOption,
  PriceKey,
  PriceSource,
  ResolvedModelPrice,
  UserModelPriceOverride,
} from './usage/cost';
export {
  aggregateUsageCosts,
  buildPriceKey,
  calculateUsageCost,
  getPriceOptionsFromUsage,
  hasAnyResolvedCost,
  isCostUnresolved,
  loadModelPrices,
  resolveModelPrice,
  saveModelPrices,
} from './usage/cost';
export type {
  CacheSplitStatus,
  CostStatus,
  NormalizedUsageCost,
  NormalizedUsageDetail,
  NormalizedUsageTokens,
  ReasoningCostMode,
  TokenUsageSource,
  UsageCoverageStatus,
  UsageThinking,
} from './usage/normalization';
export {
  normalizeUsageDetail,
  normalizeUsageTokens,
  parseNonNegativeNumber,
  resolveUsageCoverageStatus,
  resolveWindowUsageCoverageStatus,
} from './usage/normalization';
export {
  LATENCY_SOURCE_FIELD,
  LATENCY_SOURCE_UNIT,
  calculateLatencyStatsFromDetails,
  extractLatencyMs,
  formatDurationMs,
} from './usage/latency';

export interface KeyStatBucket {
  success: number;
  failure: number;
}

export interface KeyStats {
  bySource: Record<string, KeyStatBucket>;
  byAuthIndex: Record<string, KeyStatBucket>;
}

export interface TokenBreakdown {
  cachedTokens: number;
  reasoningTokens: number;
}

export interface RateStats {
  rpm: number;
  tpm: number;
  windowMinutes: number;
  requestCount: number;
  tokenCount: number;
}

export type UsageDetail = NormalizedUsageDetail;
export type UsageDetailWithEndpoint = NormalizedUsageDetail;

export interface ApiStats {
  endpoint: string;
  totalRequests: number;
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
  models: Record<
    string,
    {
      requests: number;
      successCount: number;
      failureCount: number;
      tokens: number;
      tokenCoverageStatus: UsageCoverageStatus;
    }
  >;
}

export interface ModelStatsSummary {
  model: string;
  requests: number;
  successCount: number;
  failureCount: number;
  tokens: number;
  tokenCoverageStatus: UsageCoverageStatus;
  knownUsageCount: number;
  unknownUsageCount: number;
  cost: number | null;
  costStatus: CostStatus;
  missingPriceModels: string[];
  missingPriceComponents: string[];
  averageLatencyMs: number | null;
  latencySampleCount: number;
}

export type UsageTimeRange = '7h' | '24h' | '7d' | 'all';

const USAGE_ENDPOINT_METHOD_REGEX = /^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+(\S+)/i;
const USAGE_TIME_RANGE_MS: Record<Exclude<UsageTimeRange, 'all'>, number> = {
  '7h': 7 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const getApisRecord = (usageData: unknown): Record<string, unknown> | null => {
  const usageRecord = isRecord(usageData) ? usageData : null;
  const apisRaw = usageRecord ? usageRecord.apis : null;
  return isRecord(apisRaw) ? apisRaw : null;
};

interface UsageSummary {
  totalRequests: number;
  successCount: number;
  failureCount: number;
  totalTokens: number;
}

const createUsageSummary = (): UsageSummary => ({
  totalRequests: 0,
  successCount: 0,
  failureCount: 0,
  totalTokens: 0,
});

const toUsageSummaryFields = (summary: UsageSummary) => ({
  total_requests: summary.totalRequests,
  success_count: summary.successCount,
  failure_count: summary.failureCount,
  total_tokens: summary.totalTokens,
});

export function filterUsageByTimeRange<T>(
  usageData: T,
  range: UsageTimeRange,
  nowMs: number = Date.now()
): T {
  if (range === 'all') {
    return usageData;
  }

  const usageRecord = isRecord(usageData) ? usageData : null;
  const apis = getApisRecord(usageData);
  if (!usageRecord || !apis) {
    return usageData;
  }

  const rangeMs = USAGE_TIME_RANGE_MS[range];
  if (!Number.isFinite(rangeMs) || rangeMs <= 0) {
    return usageData;
  }

  const windowStart = nowMs - rangeMs;
  const filteredApis: Record<string, unknown> = {};
  const totalSummary = createUsageSummary();

  Object.entries(apis).forEach(([apiName, apiEntry]) => {
    if (!isRecord(apiEntry)) {
      return;
    }

    const models = isRecord(apiEntry.models) ? apiEntry.models : null;
    if (!models) {
      return;
    }

    const filteredModels: Record<string, unknown> = {};
    const apiSummary = createUsageSummary();
    let hasModelData = false;

    Object.entries(models).forEach(([modelName, modelEntry]) => {
      if (!isRecord(modelEntry)) {
        return;
      }

      const detailsRaw = Array.isArray(modelEntry.details) ? modelEntry.details : [];
      const modelSummary = createUsageSummary();
      const filteredDetails: unknown[] = [];

      detailsRaw.forEach((detail) => {
        const detailRecord = isRecord(detail) ? detail : null;
        if (!detailRecord || typeof detailRecord.timestamp !== 'string') {
          return;
        }
        const timestamp = parseTimestampMs(detailRecord.timestamp);
        if (Number.isNaN(timestamp) || timestamp < windowStart || timestamp > nowMs) {
          return;
        }

        filteredDetails.push(detail);
        modelSummary.totalRequests += 1;
        if (detailRecord.failed === true) {
          modelSummary.failureCount += 1;
        } else {
          modelSummary.successCount += 1;
        }
        modelSummary.totalTokens += extractTotalTokens(detailRecord);
      });

      if (!filteredDetails.length) {
        return;
      }

      filteredModels[modelName] = {
        ...modelEntry,
        ...toUsageSummaryFields(modelSummary),
        details: filteredDetails,
      };
      hasModelData = true;

      apiSummary.totalRequests += modelSummary.totalRequests;
      apiSummary.successCount += modelSummary.successCount;
      apiSummary.failureCount += modelSummary.failureCount;
      apiSummary.totalTokens += modelSummary.totalTokens;
    });

    if (!hasModelData) {
      return;
    }

    filteredApis[apiName] = {
      ...apiEntry,
      ...toUsageSummaryFields(apiSummary),
      models: filteredModels,
    };

    totalSummary.totalRequests += apiSummary.totalRequests;
    totalSummary.successCount += apiSummary.successCount;
    totalSummary.failureCount += apiSummary.failureCount;
    totalSummary.totalTokens += apiSummary.totalTokens;
  });

  const { auths: _auths, ...usageWithoutAuths } = usageRecord;
  void _auths;

  return {
    ...usageWithoutAuths,
    ...toUsageSummaryFields(totalSummary),
    apis: filteredApis,
  } as T;
}

export const normalizeAuthIndex = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toString();
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return null;
};

const USAGE_SOURCE_PREFIX_KEY = 'k:';
const USAGE_SOURCE_PREFIX_MASKED = 'm:';
const USAGE_SOURCE_PREFIX_TEXT = 't:';

const KEY_LIKE_TOKEN_REGEX =
  /(sk-[A-Za-z0-9-_]{6,}|sk-ant-[A-Za-z0-9-_]{6,}|AIza[0-9A-Za-z-_]{8,}|AI[a-zA-Z0-9_-]{6,}|hf_[A-Za-z0-9]{6,}|pk_[A-Za-z0-9]{6,}|rk_[A-Za-z0-9]{6,})/;
const MASKED_TOKEN_HINT_REGEX = /^[^\s]{1,24}(\*{2,}|\.{3}|…)[^\s]{1,24}$/;

const keyFingerprintCache = new Map<string, string>();

const fnv1a64Hex = (value: string): string => {
  const cached = keyFingerprintCache.get(value);
  if (cached) return cached;

  const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
  const FNV_PRIME = 0x100000001b3n;

  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < value.length; i++) {
    hash ^= BigInt(value.charCodeAt(i));
    hash = (hash * FNV_PRIME) & 0xffffffffffffffffn;
  }

  const hex = hash.toString(16).padStart(16, '0');
  keyFingerprintCache.set(value, hex);
  return hex;
};

const looksLikeRawSecret = (text: string): boolean => {
  if (!text || /\s/.test(text)) return false;

  const lower = text.toLowerCase();
  if (lower.endsWith('.json')) return false;
  if (lower.startsWith('http://') || lower.startsWith('https://')) return false;
  if (/[\\/]/.test(text)) return false;

  if (KEY_LIKE_TOKEN_REGEX.test(text)) return true;

  if (text.length >= 32 && text.length <= 512) {
    return true;
  }

  if (text.length >= 16 && text.length < 32 && /^[A-Za-z0-9._=-]+$/.test(text)) {
    return /[A-Za-z]/.test(text) && /\d/.test(text);
  }

  return false;
};

const extractRawSecretFromText = (text: string): string | null => {
  if (!text) return null;
  if (looksLikeRawSecret(text)) return text;

  const keyLikeMatch = text.match(KEY_LIKE_TOKEN_REGEX);
  if (keyLikeMatch?.[0]) return keyLikeMatch[0];

  const queryMatch = text.match(
    /(?:[?&])(api[-_]?key|key|token|access_token|authorization)=([^&#\s]+)/i
  );
  const queryValue = queryMatch?.[2];
  if (queryValue && looksLikeRawSecret(queryValue)) {
    return queryValue;
  }

  const headerMatch = text.match(
    /(api[-_]?key|key|token|access[-_]?token|authorization)\s*[:=]\s*([A-Za-z0-9._=-]+)/i
  );
  const headerValue = headerMatch?.[2];
  if (headerValue && looksLikeRawSecret(headerValue)) {
    return headerValue;
  }

  const bearerMatch = text.match(/\bBearer\s+([A-Za-z0-9._=-]{6,})/i);
  const bearerValue = bearerMatch?.[1];
  if (bearerValue && looksLikeRawSecret(bearerValue)) {
    return bearerValue;
  }

  return null;
};

export function normalizeUsageSourceId(
  value: unknown,
  masker: (val: string) => string = maskApiKey
): string {
  const raw =
    typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value);
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const extracted = extractRawSecretFromText(trimmed);
  if (extracted) {
    return `${USAGE_SOURCE_PREFIX_KEY}${fnv1a64Hex(extracted)}`;
  }

  if (MASKED_TOKEN_HINT_REGEX.test(trimmed)) {
    return `${USAGE_SOURCE_PREFIX_MASKED}${masker(trimmed)}`;
  }

  return `${USAGE_SOURCE_PREFIX_TEXT}${trimmed}`;
}

export function buildCandidateUsageSourceIds(input: {
  apiKey?: string;
  prefix?: string;
}): string[] {
  const result: string[] = [];

  const prefix = input.prefix?.trim();
  if (prefix) {
    result.push(`${USAGE_SOURCE_PREFIX_TEXT}${prefix}`);
  }

  const apiKey = input.apiKey?.trim();
  if (apiKey) {
    // Include the normalised form first so that "non-standard" keys (e.g. short tokens,
    // keys containing '/' etc.) that are classified as text by normalizeUsageSourceId()
    // can still match usage details.
    result.push(normalizeUsageSourceId(apiKey));
    result.push(`${USAGE_SOURCE_PREFIX_KEY}${fnv1a64Hex(apiKey)}`);
    result.push(`${USAGE_SOURCE_PREFIX_MASKED}${maskApiKey(apiKey)}`);
  }

  return Array.from(new Set(result));
}

/**
 * Mask sensitive fields in usage data.
 */
export function maskUsageSensitiveValue(
  value: unknown,
  masker: (val: string) => string = maskApiKey
): string {
  if (value === null || value === undefined) {
    return '';
  }
  const raw = typeof value === 'string' ? value : String(value);
  if (!raw) {
    return '';
  }

  let masked = raw;

  const queryRegex = /([?&])(api[-_]?key|key|token|access_token|authorization)=([^&#\s]+)/gi;
  masked = masked.replace(
    queryRegex,
    (_full, prefix, keyName, valuePart) => `${prefix}${keyName}=${masker(valuePart)}`
  );

  const headerRegex =
    /(api[-_]?key|key|token|access[-_]?token|authorization)\s*([:=])\s*([A-Za-z0-9._-]+)/gi;
  masked = masked.replace(
    headerRegex,
    (_full, keyName, separator, valuePart) => `${keyName}${separator}${masker(valuePart)}`
  );

  const keyLikeRegex =
    /(sk-[A-Za-z0-9]{6,}|AI[a-zA-Z0-9_-]{6,}|AIza[0-9A-Za-z-_]{8,}|hf_[A-Za-z0-9]{6,}|pk_[A-Za-z0-9]{6,}|rk_[A-Za-z0-9]{6,})/g;
  masked = masked.replace(keyLikeRegex, (match) => masker(match));

  if (masked === raw) {
    const trimmed = raw.trim();
    if (trimmed && !/\s/.test(trimmed)) {
      const looksLikeKey =
        /^sk-/i.test(trimmed) ||
        /^AI/i.test(trimmed) ||
        /^AIza/i.test(trimmed) ||
        /^hf_/i.test(trimmed) ||
        /^pk_/i.test(trimmed) ||
        /^rk_/i.test(trimmed) ||
        (!/[\\/]/.test(trimmed) && (/\d/.test(trimmed) || trimmed.length >= 10)) ||
        trimmed.length >= 24;
      if (looksLikeKey) {
        return masker(trimmed);
      }
    }
  }

  return masked;
}

/**
 * Format a per-minute value.
 */
export function formatPerMinuteValue(value: number): string {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return '0.00';
  }
  const abs = Math.abs(num);
  if (abs >= 1000) {
    return Math.round(num).toLocaleString();
  }
  if (abs >= 100) {
    return num.toFixed(0);
  }
  if (abs >= 10) {
    return num.toFixed(1);
  }
  return num.toFixed(2);
}

/**
 * Format a compact number.
 */
export function formatCompactNumber(value: number): string {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return '0';
  }
  const abs = Math.abs(num);
  if (abs >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return abs >= 1 ? num.toFixed(0) : num.toFixed(2);
}

/**
 * Format a USD amount.
 */
export function formatUsd(value: number): string {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return '$0.00';
  }
  const abs = Math.abs(num);
  const fractionDigits = abs > 0 && abs < 0.0001 ? 8 : abs > 0 && abs < 0.01 ? 6 : 2;
  const fixed = num.toFixed(fractionDigits);
  const parts = Number(fixed).toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  return `$${parts}`;
}

const usageDetailsCache = new WeakMap<object, UsageDetail[]>();
const usageDetailsWithEndpointCache = new WeakMap<object, UsageDetailWithEndpoint[]>();

/**
 * Collect all request details from usage data.
 */
export function collectUsageDetails(usageData: unknown): UsageDetail[] {
  const cacheKey = isRecord(usageData) ? (usageData as object) : null;
  if (cacheKey) {
    const cached = usageDetailsCache.get(cacheKey);
    if (cached) return cached;
  }

  const apis = getApisRecord(usageData);
  if (!apis) return [];
  const details: UsageDetail[] = [];
  const sourceCache = new Map<string, string>();

  const normalizeSource = (value: unknown): string => {
    const raw =
      typeof value === 'string'
        ? value
        : value === null || value === undefined
          ? ''
          : String(value);
    const trimmed = raw.trim();
    if (!trimmed) return '';
    const cached = sourceCache.get(trimmed);
    if (cached !== undefined) return cached;
    const normalized = normalizeUsageSourceId(trimmed);
    sourceCache.set(trimmed, normalized);
    return normalized;
  };

  Object.values(apis).forEach((apiEntry) => {
    if (!isRecord(apiEntry)) return;
    const modelsRaw = apiEntry.models;
    const models = isRecord(modelsRaw) ? modelsRaw : null;
    if (!models) return;

    Object.entries(models).forEach(([modelName, modelEntry]) => {
      if (!isRecord(modelEntry)) return;
      const modelDetailsRaw = modelEntry.details;
      const modelDetails = Array.isArray(modelDetailsRaw) ? modelDetailsRaw : [];

      modelDetails.forEach((detailRaw) => {
        if (!isRecord(detailRaw) || typeof detailRaw.timestamp !== 'string') return;
        details.push(
          normalizeUsageDetail(detailRaw, {
            model: modelName,
            sourceNormalizer: normalizeSource,
          })
        );
      });
    });
  });

  if (cacheKey) {
    usageDetailsCache.set(cacheKey, details);
  }
  return details;
}

/**
 * Collect request details with endpoint/method/path metadata from usage data.
 */
export function collectUsageDetailsWithEndpoint(usageData: unknown): UsageDetailWithEndpoint[] {
  const cacheKey = isRecord(usageData) ? (usageData as object) : null;
  if (cacheKey) {
    const cached = usageDetailsWithEndpointCache.get(cacheKey);
    if (cached) return cached;
  }

  const apis = getApisRecord(usageData);
  if (!apis) return [];

  const details: UsageDetailWithEndpoint[] = [];
  const sourceCache = new Map<string, string>();

  const normalizeSource = (value: unknown): string => {
    const raw =
      typeof value === 'string'
        ? value
        : value === null || value === undefined
          ? ''
          : String(value);
    const trimmed = raw.trim();
    if (!trimmed) return '';
    const cached = sourceCache.get(trimmed);
    if (cached !== undefined) return cached;
    const normalized = normalizeUsageSourceId(trimmed);
    sourceCache.set(trimmed, normalized);
    return normalized;
  };

  Object.entries(apis).forEach(([endpoint, apiEntry]) => {
    if (!isRecord(apiEntry)) return;
    const modelsRaw = apiEntry.models;
    const models = isRecord(modelsRaw) ? modelsRaw : null;
    if (!models) return;

    const endpointMatch = endpoint.match(USAGE_ENDPOINT_METHOD_REGEX);
    const endpointMethod = endpointMatch?.[1]?.toUpperCase();
    const endpointPath = endpointMatch?.[2];

    Object.entries(models).forEach(([modelName, modelEntry]) => {
      if (!isRecord(modelEntry)) return;
      const modelDetailsRaw = modelEntry.details;
      const modelDetails = Array.isArray(modelDetailsRaw) ? modelDetailsRaw : [];

      modelDetails.forEach((detailRaw) => {
        if (!isRecord(detailRaw) || typeof detailRaw.timestamp !== 'string') return;
        details.push(
          normalizeUsageDetail(detailRaw, {
            model: modelName,
            endpoint,
            endpointMethod,
            endpointPath,
            sourceNormalizer: normalizeSource,
          })
        );
      });
    });
  });

  if (cacheKey) {
    usageDetailsWithEndpointCache.set(cacheKey, details);
  }
  return details;
}

/**
 * Extract total tokens from a single detail.
 */
export function extractTotalTokens(detail: unknown): number {
  return normalizeUsageDetail(detail).tokens.totalTokens;
}

/**
 * Calculate latency statistics.
 */
export function calculateLatencyStats(usageData: unknown): LatencyStats {
  return calculateLatencyStatsFromDetails(collectUsageDetails(usageData));
}

/**
 * Calculate token category statistics.
 */
export function calculateTokenBreakdown(usageData: unknown): TokenBreakdown {
  const details = collectUsageDetails(usageData);
  if (!details.length) {
    return { cachedTokens: 0, reasoningTokens: 0 };
  }

  let cachedTokens = 0;
  let reasoningTokens = 0;

  details.forEach((detail) => {
    cachedTokens += detail.tokens.cachedTokens;
    reasoningTokens += detail.tokens.reasoningTokens;
  });

  return { cachedTokens, reasoningTokens };
}

/**
 * Calculate RPM/TPM for the most recent N-minute window.
 */
export function calculateRecentPerMinuteRates(
  windowMinutes: number = 30,
  usageData: unknown
): RateStats {
  const details = collectUsageDetails(usageData);
  const effectiveWindow = Number.isFinite(windowMinutes) && windowMinutes > 0 ? windowMinutes : 30;

  if (!details.length) {
    return { rpm: 0, tpm: 0, windowMinutes: effectiveWindow, requestCount: 0, tokenCount: 0 };
  }

  const now = Date.now();
  const windowStart = now - effectiveWindow * 60 * 1000;
  let requestCount = 0;
  let tokenCount = 0;

  details.forEach((detail) => {
    const timestamp =
      typeof detail.__timestampMs === 'number'
        ? detail.__timestampMs
        : parseTimestampMs(detail.timestamp);
    if (!Number.isFinite(timestamp) || timestamp < windowStart || timestamp > now) {
      return;
    }
    requestCount += 1;
    tokenCount += extractTotalTokens(detail);
  });

  const denominator = effectiveWindow > 0 ? effectiveWindow : 1;
  return {
    rpm: requestCount / denominator,
    tpm: tokenCount / denominator,
    windowMinutes: effectiveWindow,
    requestCount,
    tokenCount,
  };
}

/**
 * Get model names from usage data.
 */
export function getModelNamesFromUsage(usageData: unknown): string[] {
  const apis = getApisRecord(usageData);
  if (!apis) return [];
  const names = new Set<string>();
  Object.values(apis).forEach((apiEntry) => {
    if (!isRecord(apiEntry)) return;
    const modelsRaw = apiEntry.models;
    const models = isRecord(modelsRaw) ? modelsRaw : null;
    if (!models) return;
    Object.keys(models).forEach((modelName) => {
      if (modelName) {
        names.add(modelName);
      }
    });
  });
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

/**
 * Calculate cost data.
 */
export function calculateCost(
  detail: UsageDetail,
  modelPrices: ModelPriceOverrides
): number {
  return calculateUsageCost(detail, modelPrices).totalCostUsd ?? 0;
}

/**
 * Calculate total cost.
 */
export function calculateTotalCost(
  usageData: unknown,
  modelPrices: ModelPriceOverrides
): number {
  const details = collectUsageDetails(usageData);
  if (!details.length) {
    return 0;
  }
  return aggregateUsageCosts(details.map((detail) => calculateUsageCost(detail, modelPrices)))
    .totalCostUsd ?? 0;
}

/**
 * Get API statistics.
 */
export function getApiStats(
  usageData: unknown,
  modelPrices: ModelPriceOverrides
): ApiStats[] {
  const apis = getApisRecord(usageData);
  if (!apis) return [];
  const result: ApiStats[] = [];

  Object.entries(apis).forEach(([endpoint, apiData]) => {
    if (!isRecord(apiData)) return;
    const models: Record<
      string,
      {
        requests: number;
        successCount: number;
        failureCount: number;
        tokens: number;
        tokenCoverageStatus: UsageCoverageStatus;
      }
    > = {};
    let derivedSuccessCount = 0;
    let derivedFailureCount = 0;
    const usageCosts: NormalizedUsageCost[] = [];
    let knownUsageCount = 0;
    let unknownUsageCount = 0;

    const modelsData = isRecord(apiData.models) ? apiData.models : {};
    Object.entries(modelsData).forEach(([modelName, modelData]) => {
      if (!isRecord(modelData)) return;
      const details = Array.isArray(modelData.details) ? modelData.details : [];
      const hasExplicitCounts =
        typeof modelData.success_count === 'number' || typeof modelData.failure_count === 'number';

      let successCount = 0;
      let failureCount = 0;
      let modelKnownUsageCount = 0;
      let modelUnknownUsageCount = 0;
      if (hasExplicitCounts) {
        successCount += Number(modelData.success_count) || 0;
        failureCount += Number(modelData.failure_count) || 0;
      }

      if (details.length > 0) {
        details.forEach((detail) => {
          const detailRecord = isRecord(detail) ? detail : null;
          if (!hasExplicitCounts) {
            if (detailRecord?.failed === true) {
              failureCount += 1;
            } else {
              successCount += 1;
            }
          }

          if (detailRecord) {
            const normalized = normalizeUsageDetail(detailRecord, {
              model: modelName,
              endpoint,
            });
            if (normalized.tokens.hasKnownUsage) {
              modelKnownUsageCount += 1;
              knownUsageCount += 1;
            } else {
              modelUnknownUsageCount += 1;
              unknownUsageCount += 1;
            }
            usageCosts.push(calculateUsageCost(normalized, modelPrices));
          }
        });
      }

      const modelTotalTokens = parseNonNegativeNumber(modelData.total_tokens) ?? 0;
      const modelTokenCoverageStatus =
        details.length > 0
          ? resolveUsageCoverageStatus(modelKnownUsageCount, modelUnknownUsageCount)
          : modelTotalTokens > 0
            ? 'complete'
            : 'unknown';
      models[modelName] = {
        requests: Number(modelData.total_requests) || 0,
        successCount,
        failureCount,
        tokens: modelTotalTokens,
        tokenCoverageStatus: modelTokenCoverageStatus,
      };
      derivedSuccessCount += successCount;
      derivedFailureCount += failureCount;
    });

    const hasApiExplicitCounts =
      typeof apiData.success_count === 'number' || typeof apiData.failure_count === 'number';
    const successCount = hasApiExplicitCounts
      ? Number(apiData.success_count) || 0
      : derivedSuccessCount;
    const failureCount = hasApiExplicitCounts
      ? Number(apiData.failure_count) || 0
      : derivedFailureCount;

    const costSummary = aggregateUsageCosts(usageCosts);
    const totalTokens = parseNonNegativeNumber(apiData.total_tokens) ?? 0;
    const tokenCoverageStatus =
      knownUsageCount + unknownUsageCount > 0
        ? resolveUsageCoverageStatus(knownUsageCount, unknownUsageCount)
        : totalTokens > 0
          ? 'complete'
          : 'unknown';
    result.push({
      endpoint: maskUsageSensitiveValue(endpoint) || endpoint,
      totalRequests: Number(apiData.total_requests) || 0,
      successCount,
      failureCount,
      totalTokens,
      tokenCoverageStatus,
      knownUsageCount,
      unknownUsageCount,
      totalCost: costSummary.totalCostUsd,
      costStatus: costSummary.costStatus,
      missingPriceModels: costSummary.missingPriceModels,
      missingPriceComponents: costSummary.missingPriceComponents,
      models,
    });
  });

  return result;
}

/**
 * Get model statistics.
 */
export function getModelStats(
  usageData: unknown,
  modelPrices: ModelPriceOverrides
): ModelStatsSummary[] {
  const apis = getApisRecord(usageData);
  if (!apis) return [];

  const modelMap = new Map<
    string,
    {
      requests: number;
      successCount: number;
      failureCount: number;
      tokens: number;
      costs: NormalizedUsageCost[];
      knownUsageCount: number;
      unknownUsageCount: number;
      latency: LatencyAccumulator;
    }
  >();

  Object.values(apis).forEach((apiData) => {
    if (!isRecord(apiData)) return;
    const modelsRaw = apiData.models;
    const models = isRecord(modelsRaw) ? modelsRaw : null;
    if (!models) return;

    Object.entries(models).forEach(([modelName, modelData]) => {
      if (!isRecord(modelData)) return;
      const existing = modelMap.get(modelName) || {
        requests: 0,
        successCount: 0,
        failureCount: 0,
        tokens: 0,
        costs: [],
        knownUsageCount: 0,
        unknownUsageCount: 0,
        latency: createLatencyAccumulator(),
      };
      existing.requests += Number(modelData.total_requests) || 0;
      existing.tokens += parseNonNegativeNumber(modelData.total_tokens) ?? 0;

      const details = Array.isArray(modelData.details) ? modelData.details : [];

      const hasExplicitCounts =
        typeof modelData.success_count === 'number' || typeof modelData.failure_count === 'number';
      if (hasExplicitCounts) {
        existing.successCount += Number(modelData.success_count) || 0;
        existing.failureCount += Number(modelData.failure_count) || 0;
      }

      if (details.length > 0) {
        details.forEach((detail) => {
          const detailRecord = isRecord(detail) ? detail : null;
          const latencyMs = extractLatencyMs(detailRecord);
          if (!hasExplicitCounts) {
            if (detailRecord?.failed === true) {
              existing.failureCount += 1;
            } else {
              existing.successCount += 1;
            }
          }

          addLatencySample(existing.latency, latencyMs);

          if (detailRecord) {
            const normalized = normalizeUsageDetail(detailRecord, { model: modelName });
            if (normalized.tokens.hasKnownUsage) {
              existing.knownUsageCount += 1;
            } else {
              existing.unknownUsageCount += 1;
            }
            existing.costs.push(calculateUsageCost(normalized, modelPrices));
          }
        });
      }
      modelMap.set(modelName, existing);
    });
  });

  return Array.from(modelMap.entries())
    .map(([model, stats]) => {
      const latencyStats = finalizeLatencyStats(stats.latency);
      const costSummary = aggregateUsageCosts(stats.costs);
      const tokenCoverageStatus =
        stats.knownUsageCount + stats.unknownUsageCount > 0
          ? resolveUsageCoverageStatus(stats.knownUsageCount, stats.unknownUsageCount)
          : stats.tokens > 0
            ? 'complete'
            : 'unknown';
      return {
        model,
        requests: stats.requests,
        successCount: stats.successCount,
        failureCount: stats.failureCount,
        tokens: stats.tokens,
        tokenCoverageStatus,
        knownUsageCount: stats.knownUsageCount,
        unknownUsageCount: stats.unknownUsageCount,
        cost: costSummary.totalCostUsd,
        costStatus: costSummary.costStatus,
        missingPriceModels: costSummary.missingPriceModels,
        missingPriceComponents: costSummary.missingPriceComponents,
        averageLatencyMs: latencyStats.averageMs,
        latencySampleCount: latencyStats.sampleCount,
      };
    })
    .sort((a, b) => b.requests - a.requests);
}

/**
 * Format an hourly label.
 */
export function formatHourLabel(date: Date): string {
  if (!(date instanceof Date)) {
    return '';
  }
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hour = date.getHours().toString().padStart(2, '0');
  return `${month}-${day} ${hour}:00`;
}

/**
 * Format a daily label.
 */
export function formatDayLabel(date: Date): string {
  if (!(date instanceof Date)) {
    return '';
  }
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Build an hourly data series.
 */
export interface ModelUsageSeries {
  labels: string[];
  dataByModel: Map<string, number[]>;
  coverageStatus: UsageCoverageStatus;
  knownUsageCount: number;
  unknownUsageCount: number;
  hasData: boolean;
}

export function buildHourlySeriesByModel(
  usageData: unknown,
  metric: 'requests' | 'tokens' = 'requests',
  hourWindow: number = 24
): ModelUsageSeries {
  const hourMs = 60 * 60 * 1000;
  const resolvedHourWindow =
    Number.isFinite(hourWindow) && hourWindow > 0
      ? Math.min(Math.max(Math.floor(hourWindow), 1), 24 * 31)
      : 24;
  const now = new Date();
  const currentHour = new Date(now);
  currentHour.setMinutes(0, 0, 0);

  const earliestBucket = new Date(currentHour);
  earliestBucket.setHours(earliestBucket.getHours() - (resolvedHourWindow - 1));
  const earliestTime = earliestBucket.getTime();

  const labels: string[] = [];
  for (let i = 0; i < resolvedHourWindow; i++) {
    const bucketStart = earliestTime + i * hourMs;
    labels.push(formatHourLabel(new Date(bucketStart)));
  }

  const details = collectUsageDetails(usageData);
  const dataByModel = new Map<string, number[]>();
  let hasData = false;
  let knownUsageCount = 0;
  let unknownUsageCount = 0;

  if (!details.length) {
    return {
      labels,
      dataByModel,
      coverageStatus: 'unknown',
      knownUsageCount,
      unknownUsageCount,
      hasData,
    };
  }

  details.forEach((detail) => {
    const timestamp =
      typeof detail.__timestampMs === 'number'
        ? detail.__timestampMs
        : parseTimestampMs(detail.timestamp);
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
      return;
    }

    const normalized = new Date(timestamp);
    normalized.setMinutes(0, 0, 0);
    const bucketStart = normalized.getTime();
    const lastBucketTime = earliestTime + (labels.length - 1) * hourMs;
    if (bucketStart < earliestTime || bucketStart > lastBucketTime) {
      return;
    }

    const bucketIndex = Math.floor((bucketStart - earliestTime) / hourMs);
    if (bucketIndex < 0 || bucketIndex >= labels.length) {
      return;
    }

    if (metric === 'tokens' && !detail.tokens.hasKnownUsage) {
      unknownUsageCount += 1;
      return;
    }
    knownUsageCount += 1;

    const modelName = detail.__modelName || 'Unknown';
    if (!dataByModel.has(modelName)) {
      dataByModel.set(modelName, new Array(labels.length).fill(0));
    }

    const bucketValues = dataByModel.get(modelName)!;
    if (metric === 'tokens') {
      bucketValues[bucketIndex] += extractTotalTokens(detail);
    } else {
      bucketValues[bucketIndex] += 1;
    }
    hasData = true;
  });

  return {
    labels,
    dataByModel,
    coverageStatus:
      metric === 'tokens'
        ? resolveUsageCoverageStatus(knownUsageCount, unknownUsageCount)
        : 'complete',
    knownUsageCount,
    unknownUsageCount,
    hasData,
  };
}

/**
 * Build a daily data series.
 */
export function buildDailySeriesByModel(
  usageData: unknown,
  metric: 'requests' | 'tokens' = 'requests'
): ModelUsageSeries {
  const details = collectUsageDetails(usageData);
  const valuesByModel = new Map<string, Map<string, number>>();
  const labelsSet = new Set<string>();
  let hasData = false;
  let knownUsageCount = 0;
  let unknownUsageCount = 0;

  if (!details.length) {
    return {
      labels: [],
      dataByModel: new Map(),
      coverageStatus: 'unknown',
      knownUsageCount,
      unknownUsageCount,
      hasData,
    };
  }

  details.forEach((detail) => {
    const timestamp =
      typeof detail.__timestampMs === 'number'
        ? detail.__timestampMs
        : parseTimestampMs(detail.timestamp);
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
      return;
    }
    const dayLabel = formatDayLabel(new Date(timestamp));
    if (!dayLabel) {
      return;
    }

    if (metric === 'tokens' && !detail.tokens.hasKnownUsage) {
      unknownUsageCount += 1;
      return;
    }
    knownUsageCount += 1;

    const modelName = detail.__modelName || 'Unknown';
    if (!valuesByModel.has(modelName)) {
      valuesByModel.set(modelName, new Map());
    }
    const modelDayMap = valuesByModel.get(modelName)!;
    const increment = metric === 'tokens' ? extractTotalTokens(detail) : 1;
    modelDayMap.set(dayLabel, (modelDayMap.get(dayLabel) || 0) + increment);
    labelsSet.add(dayLabel);
    hasData = true;
  });

  const labels = Array.from(labelsSet).sort();
  const dataByModel = new Map<string, number[]>();
  valuesByModel.forEach((dayMap, modelName) => {
    const series = labels.map((label) => dayMap.get(label) || 0);
    dataByModel.set(modelName, series);
  });

  return {
    labels,
    dataByModel,
    coverageStatus:
      metric === 'tokens'
        ? resolveUsageCoverageStatus(knownUsageCount, unknownUsageCount)
        : 'complete',
    knownUsageCount,
    unknownUsageCount,
    hasData,
  };
}

export interface ChartDataset {
  label: string;
  data: number[];
  borderColor: string;
  backgroundColor:
    | string
    | CanvasGradient
    | ((context: ScriptableContext<'line'>) => string | CanvasGradient);
  pointBackgroundColor?: string;
  pointBorderColor?: string;
  fill: boolean;
  tension: number;
}

export interface ChartData {
  labels: string[];
  datasets: ChartDataset[];
  coverageStatus?: UsageCoverageStatus;
  knownUsageCount?: number;
  unknownUsageCount?: number;
  hasData?: boolean;
}

const CHART_COLORS = [
  { borderColor: '#8b8680', backgroundColor: 'rgba(139, 134, 128, 0.15)' },
  { borderColor: '#22c55e', backgroundColor: 'rgba(34, 197, 94, 0.15)' },
  { borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.15)' },
  { borderColor: '#c65746', backgroundColor: 'rgba(198, 87, 70, 0.15)' },
  { borderColor: '#8b5cf6', backgroundColor: 'rgba(139, 92, 246, 0.15)' },
  { borderColor: '#06b6d4', backgroundColor: 'rgba(6, 182, 212, 0.15)' },
  { borderColor: '#ec4899', backgroundColor: 'rgba(236, 72, 153, 0.15)' },
  { borderColor: '#84cc16', backgroundColor: 'rgba(132, 204, 22, 0.15)' },
  { borderColor: '#f97316', backgroundColor: 'rgba(249, 115, 22, 0.15)' },
];

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const normalized = hex.trim().replace('#', '');
  if (normalized.length !== 6) {
    return null;
  }
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  if (![r, g, b].every((channel) => Number.isFinite(channel))) {
    return null;
  }
  return { r, g, b };
};

const withAlpha = (hex: string, alpha: number) => {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return hex;
  }
  const clamped = clamp(alpha, 0, 1);
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clamped})`;
};

const buildAreaGradient = (
  context: ScriptableContext<'line'>,
  baseHex: string,
  fallback: string
) => {
  const chart = context.chart;
  const ctx = chart.ctx;
  const area = chart.chartArea;

  if (!area) {
    return fallback;
  }

  const gradient = ctx.createLinearGradient(0, area.top, 0, area.bottom);
  gradient.addColorStop(0, withAlpha(baseHex, 0.28));
  gradient.addColorStop(0.6, withAlpha(baseHex, 0.12));
  gradient.addColorStop(1, withAlpha(baseHex, 0.02));
  return gradient;
};

/**
 * Build chart data.
 */
export function buildChartData(
  usageData: unknown,
  period: 'hour' | 'day' = 'day',
  metric: 'requests' | 'tokens' = 'requests',
  selectedModels: string[] = [],
  options: { hourWindowHours?: number } = {}
): ChartData {
  const baseSeries =
    period === 'hour'
      ? buildHourlySeriesByModel(usageData, metric, options.hourWindowHours)
      : buildDailySeriesByModel(usageData, metric);

  const { labels, dataByModel } = baseSeries;

  // Build "All" series as sum of all models
  const getAllSeries = (): number[] => {
    const summed = new Array(labels.length).fill(0);
    dataByModel.forEach((values) => {
      values.forEach((value, idx) => {
        summed[idx] = (summed[idx] || 0) + value;
      });
    });
    return summed;
  };

  // Determine which models to show
  const modelsToShow = selectedModels.length > 0 ? selectedModels : ['all'];

  const datasets: ChartDataset[] = modelsToShow.map((model, index) => {
    const isAll = model === 'all';
    const data = isAll
      ? getAllSeries()
      : dataByModel.get(model) || new Array(labels.length).fill(0);
    const colorIndex = index % CHART_COLORS.length;
    const style = CHART_COLORS[colorIndex];
    const shouldFill = modelsToShow.length === 1 || (isAll && modelsToShow.length > 1);

    return {
      label: isAll ? 'All Models' : model,
      data,
      borderColor: style.borderColor,
      backgroundColor: shouldFill
        ? (ctx) => buildAreaGradient(ctx, style.borderColor, style.backgroundColor)
        : style.backgroundColor,
      pointBackgroundColor: style.borderColor,
      pointBorderColor: style.borderColor,
      fill: shouldFill,
      tension: 0.35,
    };
  });

  return {
    labels,
    datasets,
    coverageStatus: baseSeries.coverageStatus,
    knownUsageCount: baseSeries.knownUsageCount,
    unknownUsageCount: baseSeries.unknownUsageCount,
    hasData: baseSeries.hasData,
  };
}

/**
 * Compute key usage stats from usage data.
 */
/**
 * State for a single status bar block.
 */
export type StatusBlockState = 'success' | 'failure' | 'mixed' | 'idle';

/**
 * Details for a single status bar block.
 */
export interface StatusBlockDetail {
  success: number;
  failure: number;
  /** Success rate for this block (0-1), or -1 when there are no requests. */
  rate: number;
  /** Block start timestamp in milliseconds. */
  startTime: number;
  /** Block end timestamp in milliseconds. */
  endTime: number;
}

/**
 * Status bar data.
 */
export interface StatusBarData {
  blocks: StatusBlockState[];
  blockDetails: StatusBlockDetail[];
  successRate: number;
  totalSuccess: number;
  totalFailure: number;
}

/**
 * Calculate status bar data for the most recent 200 minutes as twenty 10-minute blocks.
 * Each block is an equal interval in the window and displays success/failure trends.
 */
export function calculateStatusBarData(
  usageDetails: UsageDetail[],
  sourceFilter?: string,
  authIndexFilter?: string | number
): StatusBarData {
  const BLOCK_COUNT = 20;
  const BLOCK_DURATION_MS = 10 * 60 * 1000; // 10 minutes
  const WINDOW_MS = BLOCK_COUNT * BLOCK_DURATION_MS; // 200 minutes

  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  // Initialize blocks
  const blockStats: Array<{ success: number; failure: number }> = Array.from(
    { length: BLOCK_COUNT },
    () => ({ success: 0, failure: 0 })
  );

  let totalSuccess = 0;
  let totalFailure = 0;

  // Filter and bucket the usage details
  usageDetails.forEach((detail) => {
    const timestamp =
      typeof detail.__timestampMs === 'number'
        ? detail.__timestampMs
        : parseTimestampMs(detail.timestamp);
    if (
      !Number.isFinite(timestamp) ||
      timestamp <= 0 ||
      timestamp < windowStart ||
      timestamp > now
    ) {
      return;
    }

    // Apply filters if provided
    if (sourceFilter !== undefined && detail.source !== sourceFilter) {
      return;
    }
    if (authIndexFilter !== undefined && detail.auth_index !== authIndexFilter) {
      return;
    }

    // Calculate which block this falls into (0 = oldest, 19 = newest)
    const ageMs = now - timestamp;
    const blockIndex = BLOCK_COUNT - 1 - Math.floor(ageMs / BLOCK_DURATION_MS);

    if (blockIndex >= 0 && blockIndex < BLOCK_COUNT) {
      if (detail.failed) {
        blockStats[blockIndex].failure += 1;
        totalFailure += 1;
      } else {
        blockStats[blockIndex].success += 1;
        totalSuccess += 1;
      }
    }
  });

  // Convert stats to block states and build details
  const blocks: StatusBlockState[] = [];
  const blockDetails: StatusBlockDetail[] = [];

  blockStats.forEach((stat, idx) => {
    const total = stat.success + stat.failure;
    if (total === 0) {
      blocks.push('idle');
    } else if (stat.failure === 0) {
      blocks.push('success');
    } else if (stat.success === 0) {
      blocks.push('failure');
    } else {
      blocks.push('mixed');
    }

    const blockStartTime = windowStart + idx * BLOCK_DURATION_MS;
    blockDetails.push({
      success: stat.success,
      failure: stat.failure,
      rate: total > 0 ? stat.success / total : -1,
      startTime: blockStartTime,
      endTime: blockStartTime + BLOCK_DURATION_MS,
    });
  });

  // Calculate success rate
  const total = totalSuccess + totalFailure;
  const successRate = total > 0 ? (totalSuccess / total) * 100 : 100;

  return {
    blocks,
    blockDetails,
    successRate,
    totalSuccess,
    totalFailure,
  };
}

/**
 * Service health data for the most recent 168 hours / 7 days as a 7x96 grid.
 * Each cell represents 15 minutes of health.
 */
export interface ServiceHealthData {
  blocks: StatusBlockState[];
  blockDetails: StatusBlockDetail[];
  successRate: number;
  totalSuccess: number;
  totalFailure: number;
  rows: number;
  cols: number;
}

export function calculateServiceHealthData(usageDetails: UsageDetail[]): ServiceHealthData {
  const ROWS = 7;
  const COLS = 96;
  const BLOCK_COUNT = ROWS * COLS; // 672
  const BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes
  const WINDOW_MS = BLOCK_COUNT * BLOCK_DURATION_MS; // 168 hours (7 days)

  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  const blockStats: Array<{ success: number; failure: number }> = Array.from(
    { length: BLOCK_COUNT },
    () => ({ success: 0, failure: 0 })
  );

  let totalSuccess = 0;
  let totalFailure = 0;

  usageDetails.forEach((detail) => {
    const timestamp =
      typeof detail.__timestampMs === 'number'
        ? detail.__timestampMs
        : parseTimestampMs(detail.timestamp);
    if (
      !Number.isFinite(timestamp) ||
      timestamp <= 0 ||
      timestamp < windowStart ||
      timestamp > now
    ) {
      return;
    }

    const ageMs = now - timestamp;
    const blockIndex = BLOCK_COUNT - 1 - Math.floor(ageMs / BLOCK_DURATION_MS);

    if (blockIndex >= 0 && blockIndex < BLOCK_COUNT) {
      if (detail.failed) {
        blockStats[blockIndex].failure += 1;
        totalFailure += 1;
      } else {
        blockStats[blockIndex].success += 1;
        totalSuccess += 1;
      }
    }
  });

  const blocks: StatusBlockState[] = [];
  const blockDetails: StatusBlockDetail[] = [];

  blockStats.forEach((stat, idx) => {
    const total = stat.success + stat.failure;
    if (total === 0) {
      blocks.push('idle');
    } else if (stat.failure === 0) {
      blocks.push('success');
    } else if (stat.success === 0) {
      blocks.push('failure');
    } else {
      blocks.push('mixed');
    }

    const blockStartTime = windowStart + idx * BLOCK_DURATION_MS;
    blockDetails.push({
      success: stat.success,
      failure: stat.failure,
      rate: total > 0 ? stat.success / total : -1,
      startTime: blockStartTime,
      endTime: blockStartTime + BLOCK_DURATION_MS,
    });
  });

  const total = totalSuccess + totalFailure;
  const successRate = total > 0 ? (totalSuccess / total) * 100 : 100;

  return {
    blocks,
    blockDetails,
    successRate,
    totalSuccess,
    totalFailure,
    rows: ROWS,
    cols: COLS,
  };
}

export function computeKeyStats(
  usageData: unknown,
  masker: (val: string) => string = maskApiKey
): KeyStats {
  const apis = getApisRecord(usageData);
  if (!apis) {
    return { bySource: {}, byAuthIndex: {} };
  }

  const sourceStats: Record<string, KeyStatBucket> = {};
  const authIndexStats: Record<string, KeyStatBucket> = {};

  const ensureBucket = (bucket: Record<string, KeyStatBucket>, key: string) => {
    if (!bucket[key]) {
      bucket[key] = { success: 0, failure: 0 };
    }
    return bucket[key];
  };

  Object.values(apis).forEach((apiEntry) => {
    if (!isRecord(apiEntry)) return;
    const modelsRaw = apiEntry.models;
    const models = isRecord(modelsRaw) ? modelsRaw : null;
    if (!models) return;

    Object.values(models).forEach((modelEntry) => {
      if (!isRecord(modelEntry)) return;
      const details = Array.isArray(modelEntry.details) ? modelEntry.details : [];

      details.forEach((detail) => {
        const detailRecord = isRecord(detail) ? detail : null;
        const source = normalizeUsageSourceId(detailRecord?.source, masker);
        const authIndexKey = normalizeAuthIndex(detailRecord?.auth_index);
        const isFailed = detailRecord?.failed === true;

        if (source) {
          const bucket = ensureBucket(sourceStats, source);
          if (isFailed) {
            bucket.failure += 1;
          } else {
            bucket.success += 1;
          }
        }

        if (authIndexKey) {
          const bucket = ensureBucket(authIndexStats, authIndexKey);
          if (isFailed) {
            bucket.failure += 1;
          } else {
            bucket.success += 1;
          }
        }
      });
    });
  });

  return {
    bySource: sourceStats,
    byAuthIndex: authIndexStats,
  };
}

export function computeKeyStatsFromDetails(usageDetails: UsageDetail[]): KeyStats {
  const bySource: Record<string, KeyStatBucket> = {};
  const byAuthIndex: Record<string, KeyStatBucket> = {};

  const ensureBucket = (bucket: Record<string, KeyStatBucket>, key: string) => {
    if (!bucket[key]) {
      bucket[key] = { success: 0, failure: 0 };
    }
    return bucket[key];
  };

  usageDetails.forEach((detail) => {
    const source = detail.source;
    const authIndexKey = normalizeAuthIndex(detail.auth_index);
    const isFailed = detail.failed === true;

    if (source) {
      const bucket = ensureBucket(bySource, source);
      if (isFailed) {
        bucket.failure += 1;
      } else {
        bucket.success += 1;
      }
    }

    if (authIndexKey) {
      const bucket = ensureBucket(byAuthIndex, authIndexKey);
      if (isFailed) {
        bucket.failure += 1;
      } else {
        bucket.success += 1;
      }
    }
  });

  return { bySource, byAuthIndex };
}

export type TokenCategory = 'input' | 'output' | 'cached' | 'reasoning';

export interface TokenBreakdownSeries {
  labels: string[];
  dataByCategory: Record<TokenCategory, number[]>;
  cacheRatioNumeratorTokens: number[];
  cacheRatioDenominatorTokens: number[];
  coverageStatus: UsageCoverageStatus;
  knownUsageCount: number;
  unknownUsageCount: number;
  hasData: boolean;
}

/**
 * Build hourly grouped series by token category. Cache and reasoning are overlapping detail dimensions.
 */
export function buildHourlyTokenBreakdown(
  usageData: unknown,
  hourWindow: number = 24
): TokenBreakdownSeries {
  const hourMs = 60 * 60 * 1000;
  const resolvedHourWindow =
    Number.isFinite(hourWindow) && hourWindow > 0
      ? Math.min(Math.max(Math.floor(hourWindow), 1), 24 * 31)
      : 24;
  const now = new Date();
  const currentHour = new Date(now);
  currentHour.setMinutes(0, 0, 0);

  const earliestBucket = new Date(currentHour);
  earliestBucket.setHours(earliestBucket.getHours() - (resolvedHourWindow - 1));
  const earliestTime = earliestBucket.getTime();

  const labels: string[] = [];
  for (let i = 0; i < resolvedHourWindow; i++) {
    labels.push(formatHourLabel(new Date(earliestTime + i * hourMs)));
  }

  const dataByCategory: Record<TokenCategory, number[]> = {
    input: new Array(labels.length).fill(0),
    output: new Array(labels.length).fill(0),
    cached: new Array(labels.length).fill(0),
    reasoning: new Array(labels.length).fill(0),
  };
  const cacheRatioNumeratorTokens = new Array(labels.length).fill(0);
  const cacheRatioDenominatorTokens = new Array(labels.length).fill(0);

  const details = collectUsageDetails(usageData);
  let hasData = false;
  let knownUsageCount = 0;
  let unknownUsageCount = 0;

  details.forEach((detail) => {
    const timestamp =
      typeof detail.__timestampMs === 'number'
        ? detail.__timestampMs
        : parseTimestampMs(detail.timestamp);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return;
    const normalized = new Date(timestamp);
    normalized.setMinutes(0, 0, 0);
    const bucketStart = normalized.getTime();
    const lastBucketTime = earliestTime + (labels.length - 1) * hourMs;
    if (bucketStart < earliestTime || bucketStart > lastBucketTime) return;
    const bucketIndex = Math.floor((bucketStart - earliestTime) / hourMs);
    if (bucketIndex < 0 || bucketIndex >= labels.length) return;

    const tokens = detail.tokens;
    if (!tokens.hasKnownUsage) {
      unknownUsageCount += 1;
      return;
    }
    knownUsageCount += 1;
    dataByCategory.input[bucketIndex] += tokens.inputTokens;
    dataByCategory.output[bucketIndex] += tokens.outputTokens;
    dataByCategory.cached[bucketIndex] += tokens.cachedTokens;
    dataByCategory.reasoning[bucketIndex] += tokens.reasoningTokens;
    cacheRatioNumeratorTokens[bucketIndex] += tokens.cacheRatioNumeratorTokens;
    cacheRatioDenominatorTokens[bucketIndex] += tokens.cacheRatioDenominatorTokens;
    hasData = true;
  });

  return {
    labels,
    dataByCategory,
    cacheRatioNumeratorTokens,
    cacheRatioDenominatorTokens,
    coverageStatus: resolveUsageCoverageStatus(knownUsageCount, unknownUsageCount),
    knownUsageCount,
    unknownUsageCount,
    hasData,
  };
}

/**
 * Build daily grouped series by token category. Cache and reasoning are overlapping detail dimensions.
 */
export function buildDailyTokenBreakdown(usageData: unknown): TokenBreakdownSeries {
  const details = collectUsageDetails(usageData);
  const dayMap: Record<
    string,
    Record<TokenCategory, number> & {
      cacheRatioNumeratorTokens: number;
      cacheRatioDenominatorTokens: number;
    }
  > = {};
  let hasData = false;
  let knownUsageCount = 0;
  let unknownUsageCount = 0;

  details.forEach((detail) => {
    const timestamp =
      typeof detail.__timestampMs === 'number'
        ? detail.__timestampMs
        : parseTimestampMs(detail.timestamp);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return;
    const dayLabel = formatDayLabel(new Date(timestamp));
    if (!dayLabel) return;

    const tokens = detail.tokens;
    if (!tokens.hasKnownUsage) {
      unknownUsageCount += 1;
      return;
    }
    knownUsageCount += 1;

    if (!dayMap[dayLabel]) {
      dayMap[dayLabel] = {
        input: 0,
        output: 0,
        cached: 0,
        reasoning: 0,
        cacheRatioNumeratorTokens: 0,
        cacheRatioDenominatorTokens: 0,
      };
    }

    dayMap[dayLabel].input += tokens.inputTokens;
    dayMap[dayLabel].output += tokens.outputTokens;
    dayMap[dayLabel].cached += tokens.cachedTokens;
    dayMap[dayLabel].reasoning += tokens.reasoningTokens;
    dayMap[dayLabel].cacheRatioNumeratorTokens += tokens.cacheRatioNumeratorTokens;
    dayMap[dayLabel].cacheRatioDenominatorTokens += tokens.cacheRatioDenominatorTokens;
    hasData = true;
  });

  const labels = Object.keys(dayMap).sort();
  const dataByCategory: Record<TokenCategory, number[]> = {
    input: labels.map((l) => dayMap[l].input),
    output: labels.map((l) => dayMap[l].output),
    cached: labels.map((l) => dayMap[l].cached),
    reasoning: labels.map((l) => dayMap[l].reasoning),
  };
  const cacheRatioNumeratorTokens = labels.map(
    (label) => dayMap[label].cacheRatioNumeratorTokens
  );
  const cacheRatioDenominatorTokens = labels.map(
    (label) => dayMap[label].cacheRatioDenominatorTokens
  );

  return {
    labels,
    dataByCategory,
    cacheRatioNumeratorTokens,
    cacheRatioDenominatorTokens,
    coverageStatus: resolveUsageCoverageStatus(knownUsageCount, unknownUsageCount),
    knownUsageCount,
    unknownUsageCount,
    hasData,
  };
}

export interface CostSeries {
  labels: string[];
  data: Array<number | null>;
  costStatus: CostStatus;
  coverageStatus: UsageCoverageStatus;
  knownCostCount: number;
  incompleteCostCount: number;
  hasData: boolean;
}

/**
 * Build an hourly cost time series.
 */
export function buildHourlyCostSeries(
  usageData: unknown,
  modelPrices: ModelPriceOverrides,
  hourWindow: number = 24
): CostSeries {
  const hourMs = 60 * 60 * 1000;
  const resolvedHourWindow =
    Number.isFinite(hourWindow) && hourWindow > 0
      ? Math.min(Math.max(Math.floor(hourWindow), 1), 24 * 31)
      : 24;
  const now = new Date();
  const currentHour = new Date(now);
  currentHour.setMinutes(0, 0, 0);

  const earliestBucket = new Date(currentHour);
  earliestBucket.setHours(earliestBucket.getHours() - (resolvedHourWindow - 1));
  const earliestTime = earliestBucket.getTime();

  const labels: string[] = [];
  for (let i = 0; i < resolvedHourWindow; i++) {
    labels.push(formatHourLabel(new Date(earliestTime + i * hourMs)));
  }

  const data: Array<number | null> = new Array(labels.length).fill(0);
  const hasUnresolvedCost = new Array(labels.length).fill(false);
  const details = collectUsageDetails(usageData);
  const costs: NormalizedUsageCost[] = [];
  let hasData = false;
  let knownCostCount = 0;
  let incompleteCostCount = 0;

  details.forEach((detail) => {
    const timestamp =
      typeof detail.__timestampMs === 'number'
        ? detail.__timestampMs
        : parseTimestampMs(detail.timestamp);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return;
    const normalized = new Date(timestamp);
    normalized.setMinutes(0, 0, 0);
    const bucketStart = normalized.getTime();
    const lastBucketTime = earliestTime + (labels.length - 1) * hourMs;
    if (bucketStart < earliestTime || bucketStart > lastBucketTime) return;
    const bucketIndex = Math.floor((bucketStart - earliestTime) / hourMs);
    if (bucketIndex < 0 || bucketIndex >= labels.length) return;

    const cost = calculateUsageCost(detail, modelPrices);
    costs.push(cost);
    if (cost.costStatus !== 'complete') {
      incompleteCostCount += 1;
    }
    if (cost.totalCostUsd !== null) {
      knownCostCount += 1;
      data[bucketIndex] = (data[bucketIndex] ?? 0) + cost.totalCostUsd;
      hasData = true;
    } else if (isCostUnresolved(cost)) {
      hasUnresolvedCost[bucketIndex] = true;
    }
  });

  data.forEach((value, index) => {
    if (hasUnresolvedCost[index] && value === 0) {
      data[index] = null;
    }
  });

  return {
    labels,
    data,
    costStatus: aggregateUsageCosts(costs).costStatus,
    coverageStatus: resolveUsageCoverageStatus(knownCostCount, incompleteCostCount),
    knownCostCount,
    incompleteCostCount,
    hasData,
  };
}

/**
 * Build a daily cost time series.
 */
export function buildDailyCostSeries(
  usageData: unknown,
  modelPrices: ModelPriceOverrides
): CostSeries {
  const details = collectUsageDetails(usageData);
  const dayMap: Record<string, number> = {};
  const unresolvedDays = new Set<string>();
  const costs: NormalizedUsageCost[] = [];
  let hasData = false;
  let knownCostCount = 0;
  let incompleteCostCount = 0;

  details.forEach((detail) => {
    const timestamp =
      typeof detail.__timestampMs === 'number'
        ? detail.__timestampMs
        : parseTimestampMs(detail.timestamp);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return;
    const dayLabel = formatDayLabel(new Date(timestamp));
    if (!dayLabel) return;

    const cost = calculateUsageCost(detail, modelPrices);
    costs.push(cost);
    if (cost.costStatus !== 'complete') {
      incompleteCostCount += 1;
    }
    if (cost.totalCostUsd !== null) {
      knownCostCount += 1;
      dayMap[dayLabel] = (dayMap[dayLabel] || 0) + cost.totalCostUsd;
      hasData = true;
    } else if (isCostUnresolved(cost)) {
      unresolvedDays.add(dayLabel);
    }
  });

  const labels = Array.from(new Set([...Object.keys(dayMap), ...unresolvedDays])).sort();
  const data = labels.map((label) =>
    unresolvedDays.has(label) && !dayMap[label] ? null : (dayMap[label] ?? 0)
  );

  return {
    labels,
    data,
    costStatus: aggregateUsageCosts(costs).costStatus,
    coverageStatus: resolveUsageCoverageStatus(knownCostCount, incompleteCostCount),
    knownCostCount,
    incompleteCostCount,
    hasData,
  };
}
