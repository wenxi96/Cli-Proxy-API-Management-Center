/**
 * Usage statistics API helpers.
 */

import { apiClient } from './client';
import { computeKeyStats, KeyStats } from '@/utils/usage';

const USAGE_TIMEOUT_MS = 60 * 1000;

export type UsageInteger = number | string;
export type UsageDecimal = number | string;

export interface UsageExportPayload {
  version?: number;
  exported_at?: string;
  usage?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface UsageImportResponse {
  added?: number;
  skipped?: number;
  total_requests?: number;
  failed_requests?: number;
  [key: string]: unknown;
}

export type CredentialCostStatus =
  | 'unknown_usage'
  | 'unconfigured'
  | 'partial'
  | 'complete'
  | 'policy_unavailable';

export interface UsageTokenSummary {
  input_tokens?: UsageInteger;
  output_tokens?: UsageInteger;
  reasoning_tokens?: UsageInteger;
  cached_tokens?: UsageInteger;
  cache_read_tokens?: UsageInteger;
  cache_creation_tokens?: UsageInteger;
  cache_tokens?: UsageInteger;
  total_tokens?: UsageInteger;
  reported_total_tokens?: UsageInteger;
  computed_total_tokens?: UsageInteger;
  token_usage_source?: string;
  cache_split_status?: string;
  reasoning_cost_mode?: string;
  [key: string]: unknown;
}

export interface UsageAuthModelSummary extends UsageTokenSummary {
  requests?: UsageInteger;
  total_requests?: UsageInteger;
  success_count?: UsageInteger;
  failure_count?: UsageInteger;
  tokens?: UsageTokenSummary;
}

export interface UsageAuthSummary extends UsageTokenSummary {
  auth_index?: string | number | null;
  authIndex?: string | number | null;
  source?: string;
  type?: string;
  name?: string;
  total_requests?: UsageInteger;
  totalRequests?: number;
  requests?: UsageInteger;
  success_count?: UsageInteger;
  successCount?: number;
  success_requests?: UsageInteger;
  successRequests?: number;
  failure_count?: UsageInteger;
  failureCount?: number;
  failed_requests?: UsageInteger;
  failedRequests?: number;
  failures?: UsageInteger;
  tokens?: UsageTokenSummary;
  models?: Record<string, UsageAuthModelSummary>;
  estimated_cost_usd?: UsageDecimal | null;
  cost_status?: CredentialCostStatus;
  missing_price_models?: string[];
  missing_price_components?: string[];
  [key: string]: unknown;
}

export interface AuthUsageRequestsParams {
  limit?: number;
  offset?: number;
  model?: string;
  failed?: boolean;
  from?: string;
  to?: string;
  to_exclusive?: boolean;
}

export interface AuthUsageRequestItem {
  request_id?: string;
  client_ip?: string;
  timestamp: string;
  endpoint?: string;
  model: string;
  provider?: string;
  executor_type?: string;
  auth_type?: string;
  model_alias?: string;
  source: string;
  auth_index: string | number | null;
  failed: boolean;
  latency_ms?: UsageDecimal;
  tokens: UsageTokenSummary;
  estimated_cost_usd?: UsageDecimal | null;
}

export interface AuthUsageRequestsResponse {
  auth_index: string;
  total: UsageInteger;
  limit: UsageInteger;
  offset: UsageInteger;
  items: AuthUsageRequestItem[];
}

export interface UsageSummaryRequestOptions {
  window?: string;
  anchor?: string;
  timezone?: string;
  from?: string;
  to?: string;
  etag?: string;
}

export interface UsageSummaryResponse<T = Record<string, unknown>> {
  status: number;
  data: T | '';
  headers: Record<string, string>;
}

export interface UsageEventItem {
  stable_event_id?: string;
  request_id?: string;
  detail_role?: string;
  detail_sequence?: string | number;
  timestamp?: string;
  model?: string;
  source_id?: string;
  source_key?: string;
  source?: string;
  auth_index?: string | number | null;
  failed?: boolean;
  latency_ms?: UsageDecimal | null;
  [key: string]: unknown;
}

export interface UsageEventsRequestOptions {
  window?: string;
  anchor?: string;
  timezone?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
  api?: string;
  model?: string;
  provider?: string;
  source?: string | string[];
  auth_index?: string;
  failed?: boolean;
  etag?: string;
}

export interface UsageEventsPayload {
  schema_version?: number;
  range?: Record<string, unknown>;
  items?: UsageEventItem[];
  next_cursor?: string;
  has_more?: boolean;
  snapshot?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface UsageEventsResponse<T = UsageEventsPayload> {
  status: number;
  data: T | '';
  headers: Record<string, string>;
}

export interface UsageCatalogPayload {
  schema_version?: number;
  dataset_epoch?: string;
  revision?: UsageInteger;
  rewrite_revision?: UsageInteger;
  billable_policy_version?: string;
  source_key_algorithm?: string;
  models?: Array<Record<string, unknown>>;
  price_keys?: Array<Record<string, unknown>>;
  sources?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface UsageCatalogResponse {
  status: number;
  data: UsageCatalogPayload | '';
  headers: Record<string, string>;
}

export interface UsageExportEstimatePayload {
  schema_version?: number;
  export_snapshot_id: string;
  dataset_epoch?: string;
  snapshot_max_sequence?: UsageInteger;
  rewrite_revision?: UsageInteger;
  normalized_query?: Record<string, unknown>;
  snapshot_facts_hash?: string;
  export_snapshot_expires_at?: string;
  format: 'json' | 'csv';
  export_schema_version: string;
  export_derivation_profile: string;
  estimated_event_count?: UsageInteger;
  event_count_upper_bound?: UsageInteger;
  event_count_exact?: boolean;
  matched_source_id_counts?: Record<string, UsageInteger>;
  matched_model_counts?: Record<string, UsageInteger>;
  server_bytes_upper_bound?: UsageInteger;
  server_bytes_upper_bound_complete?: boolean;
  client_derived_bytes_upper_bound?: UsageInteger;
  client_derived_bytes_upper_bound_complete?: boolean;
  estimated_bytes_upper_bound?: UsageInteger;
  bytes_upper_bound_complete?: boolean;
  blob_limit_bytes?: UsageInteger;
  catalog_fingerprint?: string;
  price_snapshot_fingerprint?: string;
  profile_fingerprint?: string;
  error?: string;
  [key: string]: unknown;
}

export interface UsageExportRequestOptions extends UsageEventsRequestOptions {
  format: 'json' | 'csv';
  export_schema_version?: string;
  export_snapshot_id?: string;
}

export interface UsageCatalogRequestOptions {
  etag?: string;
}

const normalizeResponseHeaders = (headers: unknown): Record<string, string> => {
  if (!headers) return {};

  const source = headers as {
    entries?: () => Iterable<[string, unknown]>;
    get?: (name: string) => unknown;
  };
  const entries =
    typeof source.entries === 'function'
      ? Array.from(source.entries())
      : Object.entries(headers as Record<string, unknown>);
  const normalized = Object.fromEntries(
    entries.map(([key, value]) => [String(key).toLowerCase(), String(value ?? '')])
  );

  for (const key of ['etag', 'cache-control', 'x-usage-revision']) {
    if (normalized[key]) continue;
    const value = source.get?.(key);
    if (value !== undefined && value !== null) normalized[key] = String(value);
  }
  return normalized;
};

const cleanUsageSummaryParams = (options: UsageSummaryRequestOptions = {}) => {
  const params: Record<string, string> = {};
  for (const key of ['window', 'anchor', 'timezone', 'from', 'to'] as const) {
    const value = options[key]?.trim();
    if (value) params[key] = value;
  }
  return params;
};

const cleanUsageEventsParams = (options: UsageEventsRequestOptions = {}) => {
  const params: Record<string, string | number | boolean | string[]> = {};
  for (const key of ['window', 'anchor', 'timezone', 'from', 'to', 'cursor', 'api', 'model', 'provider', 'auth_index'] as const) {
    const value = options[key]?.trim();
    if (value) params[key] = value;
  }
  if (Number.isFinite(options.limit)) params.limit = Number(options.limit);
  if (typeof options.failed === 'boolean') params.failed = options.failed;
  if (Array.isArray(options.source)) {
    const sources = options.source.map((value) => value.trim()).filter(Boolean);
    if (sources.length) params.source = sources;
  } else if (options.source?.trim()) {
    params.source = options.source.trim();
  }
  return params;
};

const cleanUsageExportParams = (options: UsageExportRequestOptions) => ({
  ...cleanUsageEventsParams(options),
  format: options.format,
  export_schema_version: options.export_schema_version ?? 'usage-events-v2',
  ...(options.export_snapshot_id ? { export_snapshot_id: options.export_snapshot_id } : {}),
});

const serializeUsageQueryParams = (params: Record<string, unknown>): string => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => search.append(key, String(entry)));
      return;
    }
    if (value !== undefined && value !== null) search.append(key, String(value));
  });
  return search.toString();
};

export const isUsageCapabilityFallbackStatus = (status: number | undefined): boolean =>
  status === 404 || status === 405 || status === 501;

const cleanAuthUsageRequestParams = (params: AuthUsageRequestsParams = {}) => {
  const cleaned: Record<string, string | number | boolean> = {};
  if (Number.isFinite(params.limit)) cleaned.limit = Number(params.limit);
  if (Number.isFinite(params.offset)) cleaned.offset = Number(params.offset);
  if (params.model) cleaned.model = params.model;
  if (typeof params.failed === 'boolean') cleaned.failed = params.failed;
  if (params.from) cleaned.from = params.from;
  if (params.to) cleaned.to = params.to;
  if (params.to_exclusive === true) cleaned.to_exclusive = true;
  return cleaned;
};

export const usageApi = {
  /**
   * Fetch compact summary facts while preserving conditional response metadata.
   */
  getUsageSummary: async (
    options: UsageSummaryRequestOptions = {}
  ): Promise<UsageSummaryResponse> => {
    const response = await apiClient.requestRaw({
      method: 'GET',
      url: '/usage/summary',
      params: cleanUsageSummaryParams(options),
      headers: options.etag ? { 'If-None-Match': options.etag } : undefined,
      validateStatus: (status) => (status >= 200 && status < 300) || status === 304,
      timeout: USAGE_TIMEOUT_MS,
    });
    return {
      status: response.status,
      data: response.status === 304 ? '' : (response.data as Record<string, unknown>),
      headers: normalizeResponseHeaders(response.headers),
    };
  },

  /**
   * Fetch one immutable cursor page of usage events with response metadata.
   */
  getUsageEvents: async (
    options: UsageEventsRequestOptions = {}
  ): Promise<UsageEventsResponse> => {
    const response = await apiClient.requestRaw({
      method: 'GET',
      url: '/usage/events',
      params: cleanUsageEventsParams(options),
      paramsSerializer: { serialize: serializeUsageQueryParams },
      headers: options.etag ? { 'If-None-Match': options.etag } : undefined,
      validateStatus: (status) => (status >= 200 && status < 300) || status === 304,
      timeout: USAGE_TIMEOUT_MS,
    });
    return {
      status: response.status,
      data: response.status === 304 ? '' : (response.data as UsageEventsPayload),
      headers: normalizeResponseHeaders(response.headers),
    };
  },

  /** Fetch the all-history catalog used for labels and price/source options. */
  getUsageCatalog: async (options: UsageCatalogRequestOptions = {}): Promise<UsageCatalogResponse> => {
    const response = await apiClient.requestRaw({
      method: 'GET',
      url: '/usage/catalog',
      headers: options.etag ? { 'If-None-Match': options.etag } : undefined,
      validateStatus: (status) => (status >= 200 && status < 300) || status === 304,
      timeout: USAGE_TIMEOUT_MS,
    });
    return {
      status: response.status,
      data: response.status === 304 ? '' : (response.data as UsageCatalogPayload),
      headers: normalizeResponseHeaders(response.headers),
    };
  },

  getUsageEventsExportEstimate: async (
    options: UsageExportRequestOptions
  ): Promise<UsageExportEstimatePayload> => {
    const response = await apiClient.requestRaw({
      method: 'GET',
      url: '/usage/events/export/estimate',
      params: cleanUsageExportParams(options),
      paramsSerializer: { serialize: serializeUsageQueryParams },
      validateStatus: (status) => status >= 200 && status < 300,
      timeout: USAGE_TIMEOUT_MS,
    });
    return response.data as UsageExportEstimatePayload;
  },

  streamUsageEventsExport: (
    options: UsageExportRequestOptions,
    signal?: AbortSignal
  ): Promise<Response> =>
    apiClient.fetchStream('/usage/events/export', {
      params: cleanUsageExportParams(options),
      signal,
    }),

  isCapabilityFallbackStatus: isUsageCapabilityFallbackStatus,

  /**
   * Fetch raw usage statistics.
   */
  getUsage: () => apiClient.get<Record<string, unknown>>('/usage', { timeout: USAGE_TIMEOUT_MS }),

  /**
   * Export a usage statistics snapshot.
   */
  exportUsage: () => apiClient.get<UsageExportPayload>('/usage/export', { timeout: USAGE_TIMEOUT_MS }),

  /**
   * Import a usage statistics snapshot.
   */
  importUsage: (payload: unknown) =>
    apiClient.post<UsageImportResponse>('/usage/import', payload, { timeout: USAGE_TIMEOUT_MS }),

  /**
   * Fetch request details for a single credential.
   */
  getAuthUsageRequests: (authIndex: string, params: AuthUsageRequestsParams = {}) =>
    apiClient.get<AuthUsageRequestsResponse>(
      `/usage/auths/${encodeURIComponent(authIndex)}/requests`,
      {
        params: cleanAuthUsageRequestParams(params),
        timeout: USAGE_TIMEOUT_MS,
      }
    ),

  /**
   * Compute key success/failure stats, fetching usage first when needed.
   */
  async getKeyStats(usageData?: unknown): Promise<KeyStats> {
    let payload = usageData;
    if (!payload) {
      const response = await apiClient.get<Record<string, unknown>>('/usage', { timeout: USAGE_TIMEOUT_MS });
      payload = response?.usage ?? response;
    }
    return computeKeyStats(payload);
  }
};
