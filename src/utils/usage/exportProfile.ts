import { calculateUsageCost, type ModelPriceOverrides } from './cost';
import { normalizeUsageDetail, type NormalizedUsageDetail } from './normalization';

export const EXPORT_SCHEMA_VERSION = 'usage-events-v2';
export const EXPORT_DERIVATION_PROFILE = 'usage-events-v2-client-v1';
export const EXPORT_BLOB_LIMIT_BYTES = 64 * 1024 * 1024;

export type ExportProfileCostStatus =
  | 'complete'
  | 'partial'
  | 'unconfigured'
  | 'unknown_usage'
  | 'policy_unavailable';

export interface ExportProfileSnapshot {
  sourceLabels?: Record<string, string>;
  sourceKeys?: Record<string, string>;
  modelLabels?: Record<string, string>;
  modelPriceKeys?: Record<string, string>;
  priceOverrides: ModelPriceOverrides;
  billablePolicyVersion?: string;
  sourceKeyAlgorithm?: string;
  catalogFingerprint?: string;
  priceSnapshotFingerprint?: string;
  profileFingerprint?: string;
  snapshotFactsHash?: string;
  exportSchemaVersion?: string;
  exportDerivationProfile?: string;
  strictMappings?: boolean;
  eventCountUpperBound?: number;
  eventCountExact?: boolean;
  maxBytesUpperBound?: number;
  serverBytesUpperBound?: number;
  serverBytesUpperBoundComplete?: boolean;
  exportSnapshotId?: string;
}

export interface UsageExportRow {
  timestamp: string;
  model: string;
  source: string;
  source_raw: string;
  auth_index: string | null;
  failed: boolean;
  latency_ms: number | null;
  thinking: Record<string, unknown> | null;
  thinking_coverage: 'unavailable_legacy';
  tokens: {
    input_tokens: number | null;
    output_tokens: number | null;
    reasoning_tokens: number | null;
    cache_read_tokens: number | null;
    cache_creation_tokens: number | null;
    cached_tokens: number | null;
    total_tokens: number | null;
    reported_total_tokens: number | null;
    computed_total_tokens: number | null;
    cache_ratio: number | null;
  };
  cost: {
    input_cost_usd: number | null;
    output_cost_usd: number | null;
    cache_cost_usd: number | null;
    total_cost_usd: number | null;
    cost_status: ExportProfileCostStatus;
    missing_price_models: string[];
    missing_price_components: string[];
  };
}

const EXPORT_CSV_HEADER =
  'timestamp,model,source,source_raw,auth_index,result,latency_ms,thinking_intensity,thinking_mode,thinking_level,thinking_budget,input_tokens,output_tokens,reasoning_tokens,cache_read_tokens,cache_creation_tokens,cached_tokens,cache_ratio,total_tokens,reported_total_tokens,computed_total_tokens,input_cost_usd,output_cost_usd,cache_cost_usd,total_cost_usd,cost_status,missing_price_models,missing_price_components\r\n';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const finiteNonNegative = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return value;
};

const compareByteStrings = (left: string, right: string): number => {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    if (leftBytes[index] !== rightBytes[index]) return leftBytes[index] - rightBytes[index];
  }
  return leftBytes.length - rightBytes.length;
};

const EXPORT_COST_STATUSES: ReadonlySet<ExportProfileCostStatus> = new Set([
  'complete', 'partial', 'unconfigured', 'unknown_usage', 'policy_unavailable',
]);

/** canonical_decimal_v1: fixed decimal only, no exponent or non-finite values. */
export const canonicalDecimal = (value: unknown): string | null => {
  const number = finiteNonNegative(value);
  if (number === null) return null;
  const text = number.toString();
  if (/[eE]/.test(text)) return null;
  const [integer, fraction = ''] = text.split('.');
  if (integer.length > 20 || fraction.length > 8) return null;
  return fraction ? `${integer}.${fraction}` : integer;
};

const canonicalToken = (value: number | null): string => {
  if (value === null) return 'null';
  const normalized = canonicalDecimal(value);
  if (normalized === null || normalized.split('.')[0].replace(/^0+/, '').length > 19) {
    throw new Error('canonical_token_unavailable');
  }
  return normalized;
};

const normalizeMissingList = (values: unknown[], max: number, code: string): string[] => {
  if (!values.every((value) => typeof value === 'string' && value.trim())) {
    throw new Error(code);
  }
  const normalized = values.map((value) => String(value).trim()).sort(compareByteStrings);
  if (normalized.length > max) throw new Error(code);
  return normalized;
};

const assertExportRow = (row: UsageExportRow): void => {
  if (!EXPORT_COST_STATUSES.has(row.cost.cost_status)) throw new Error('export_cost_status_invalid');
  row.cost.missing_price_models = normalizeMissingList(
    row.cost.missing_price_models,
    1,
    'export_missing_price_models_overflow'
  );
  row.cost.missing_price_components = normalizeMissingList(
    row.cost.missing_price_components,
    6,
    'export_missing_price_components_overflow'
  );
};

const jsonString = (value: string | null): string => JSON.stringify(value);
const jsonDecimal = (value: number | null): string => {
  if (value === null) return 'null';
  const normalized = canonicalDecimal(value);
  if (normalized === null) throw new Error('canonical_decimal_unavailable');
  return normalized;
};

const displayLabel = (id: string, labels: Record<string, string> | undefined): string =>
  labels?.[id]?.trim() || id || '-';

const normalizeSource = (event: Record<string, unknown>, snapshot: ExportProfileSnapshot) => {
  const sourceId = typeof event.source_id === 'string' ? event.source_id.trim() : '';
  const raw = typeof event.source_key === 'string'
    ? event.source_key.trim()
    : typeof event.source === 'string'
      ? event.source.trim()
      : '';
  const label = displayLabel(sourceId || raw, snapshot.sourceLabels);
  return { sourceId, raw, label };
};

const tokenOrNull = (detail: NormalizedUsageDetail, value: number): number | null =>
  detail.tokens.hasKnownUsage ? value : null;

export function buildExportRow(
  event: unknown,
  snapshot: ExportProfileSnapshot
): UsageExportRow {
  const record = isRecord(event) ? event : {};
  const normalized = normalizeUsageDetail(record, {
    model: typeof record.model === 'string' ? record.model : undefined,
    sourceNormalizer: (value) => String(value ?? '').trim(),
  });
  const source = normalizeSource(record, snapshot);
  const modelID = normalized.model || '-';
  if (snapshot.strictMappings) {
    const expectedSourceKey = source.sourceId ? snapshot.sourceKeys?.[source.sourceId] : undefined;
    const expectedModelPriceKey = snapshot.modelPriceKeys?.[modelID];
    const policy = typeof record.billable_policy_version === 'string'
      ? record.billable_policy_version.trim()
      : '';
    if (!source.sourceId || !expectedSourceKey || !source.raw || source.raw !== expectedSourceKey) {
      throw new Error('export_source_mapping_unavailable');
    }
    if (!Object.prototype.hasOwnProperty.call(snapshot.modelLabels ?? {}, modelID) || !expectedModelPriceKey) {
      throw new Error('export_model_mapping_unavailable');
    }
    if (policy !== (snapshot.billablePolicyVersion || 'v1')) {
      throw new Error('export_billable_policy_unavailable');
    }
    const eventPriceKey = typeof record.price_key === 'string' ? record.price_key.trim() : '';
    if (eventPriceKey && eventPriceKey !== expectedModelPriceKey) {
      throw new Error('export_model_price_mapping_mismatch');
    }
  }
  const detailTokens = normalized.tokens;
  const cost = calculateUsageCost(normalized, snapshot.priceOverrides);
  // Legacy event DTOs do not carry a stable thinking schema. The profile
  // therefore emits a fixed null value and an explicit coverage sentinel.
  const thinking = null;
  return {
    timestamp: normalized.timestamp,
    // Model is part of the server-owned row and must remain the stable model id.
    // Catalog labels are used for mapping and pricing, not for the server byte slot.
    model: modelID,
    source: source.label,
    source_raw: source.raw,
    auth_index: normalized.authIndex === null ? null : String(normalized.authIndex),
    failed: normalized.failed,
    latency_ms: normalized.latencyMs,
    thinking,
    thinking_coverage: 'unavailable_legacy',
    tokens: {
      input_tokens: tokenOrNull(normalized, detailTokens.inputTokens),
      output_tokens: tokenOrNull(normalized, detailTokens.outputTokens),
      reasoning_tokens: tokenOrNull(normalized, detailTokens.reasoningTokens),
      cache_read_tokens: tokenOrNull(normalized, detailTokens.cacheReadTokens),
      cache_creation_tokens: tokenOrNull(normalized, detailTokens.cacheCreationTokens),
      cached_tokens: tokenOrNull(normalized, detailTokens.cachedTokens),
      total_tokens: tokenOrNull(normalized, detailTokens.totalTokens),
      reported_total_tokens: normalized.tokens.hasKnownUsage ? detailTokens.reportedTotalTokens : null,
      computed_total_tokens: normalized.tokens.hasKnownUsage ? detailTokens.computedTotalTokens : null,
      cache_ratio: normalized.tokens.hasKnownUsage ? detailTokens.cacheRatio : null,
    },
    cost: {
      input_cost_usd: cost.inputCostUsd,
      output_cost_usd: cost.outputCostUsd,
      cache_cost_usd: cost.cacheCostUsd,
      total_cost_usd: cost.totalCostUsd,
      cost_status: cost.costStatus,
      missing_price_models: cost.missingPriceModels,
      missing_price_components: cost.missingPriceComponents,
    },
  };
}

const jsonOptionalRecord = (value: Record<string, unknown> | null): string =>
  value === null ? 'null' : JSON.stringify(value);

export const serializeJsonRow = (row: UsageExportRow): string => {
  assertExportRow(row);
  const tokens = row.tokens;
  const cost = row.cost;
  const tokenJSON = [
    `"input_tokens":${canonicalToken(tokens.input_tokens)}`,
    `"output_tokens":${canonicalToken(tokens.output_tokens)}`,
    `"reasoning_tokens":${canonicalToken(tokens.reasoning_tokens)}`,
    `"cache_read_tokens":${canonicalToken(tokens.cache_read_tokens)}`,
    `"cache_creation_tokens":${canonicalToken(tokens.cache_creation_tokens)}`,
    `"cached_tokens":${canonicalToken(tokens.cached_tokens)}`,
    `"total_tokens":${canonicalToken(tokens.total_tokens)}`,
    `"reported_total_tokens":${canonicalToken(tokens.reported_total_tokens)}`,
    `"computed_total_tokens":${canonicalToken(tokens.computed_total_tokens)}`,
    `"cache_ratio":${jsonDecimal(tokens.cache_ratio)}`,
  ].join(',');
  const costJSON = [
    `"input_cost_usd":${jsonDecimal(cost.input_cost_usd)}`,
    `"output_cost_usd":${jsonDecimal(cost.output_cost_usd)}`,
    `"cache_cost_usd":${jsonDecimal(cost.cache_cost_usd)}`,
    `"total_cost_usd":${jsonDecimal(cost.total_cost_usd)}`,
    `"cost_status":${jsonString(cost.cost_status)}`,
    `"missing_price_models":${JSON.stringify(cost.missing_price_models)}`,
    `"missing_price_components":${JSON.stringify(cost.missing_price_components)}`,
  ].join(',');
  return `{${[
    `"timestamp":${jsonString(row.timestamp)}`,
    `"model":${jsonString(row.model)}`,
    `"source":${jsonString(row.source)}`,
    `"source_raw":${jsonString(row.source_raw)}`,
    `"auth_index":${jsonString(row.auth_index)}`,
    `"failed":${row.failed ? 'true' : 'false'}`,
    `"latency_ms":${jsonDecimal(row.latency_ms)}`,
    `"thinking":${jsonOptionalRecord(row.thinking)}`,
    `"thinking_coverage":${jsonString(row.thinking_coverage)}`,
    `"tokens":{${tokenJSON}}`,
    `"cost":{${costJSON}}`,
  ].join(',')}}`;
};

const csvEscape = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@]/.test(text.trimStart()) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};

const csvNumber = (value: number | null, token = false): string => {
  if (value === null) return '';
  const normalized = token ? canonicalToken(value) : canonicalDecimal(value);
  if (normalized === null) throw new Error('canonical_decimal_unavailable');
  return normalized;
};

export const serializeCsvHeader = (): string => EXPORT_CSV_HEADER;

export const serializeCsvRow = (row: UsageExportRow): string => {
  assertExportRow(row);
  const thinking = row.thinking || {};
  const values = [
    row.timestamp, row.model, row.source, row.source_raw, row.auth_index,
    row.failed ? 'failed' : 'success', csvNumber(row.latency_ms),
    thinking.intensity ?? '', thinking.mode ?? '', thinking.level ?? '', thinking.budget ?? '',
    csvNumber(row.tokens.input_tokens, true), csvNumber(row.tokens.output_tokens, true), csvNumber(row.tokens.reasoning_tokens, true),
    csvNumber(row.tokens.cache_read_tokens, true), csvNumber(row.tokens.cache_creation_tokens, true), csvNumber(row.tokens.cached_tokens, true),
    csvNumber(row.tokens.cache_ratio), csvNumber(row.tokens.total_tokens, true), csvNumber(row.tokens.reported_total_tokens, true),
    csvNumber(row.tokens.computed_total_tokens, true), csvNumber(row.cost.input_cost_usd), csvNumber(row.cost.output_cost_usd),
    csvNumber(row.cost.cache_cost_usd), csvNumber(row.cost.total_cost_usd), row.cost.cost_status,
    row.cost.missing_price_models.join('|'), row.cost.missing_price_components.join('|'),
  ];
  return `${values.map(csvEscape).join(',')}\r\n`;
};
