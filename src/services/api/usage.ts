/**
 * 使用统计相关 API
 */

import { apiClient } from './client';
import { computeKeyStats, KeyStats } from '@/utils/usage';

const USAGE_TIMEOUT_MS = 60 * 1000;

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

export type CredentialCostStatus = 'complete' | 'partial' | 'unconfigured';

export interface UsageTokenSummary {
  input_tokens?: number;
  output_tokens?: number;
  reasoning_tokens?: number;
  cached_tokens?: number;
  cache_tokens?: number;
  total_tokens?: number;
  [key: string]: unknown;
}

export interface UsageAuthModelSummary extends UsageTokenSummary {
  requests?: number;
  total_requests?: number;
  success_count?: number;
  failure_count?: number;
  tokens?: UsageTokenSummary;
}

export interface UsageAuthSummary extends UsageTokenSummary {
  auth_index?: string | number | null;
  authIndex?: string | number | null;
  source?: string;
  type?: string;
  name?: string;
  total_requests?: number;
  totalRequests?: number;
  requests?: number;
  success_count?: number;
  successCount?: number;
  success_requests?: number;
  successRequests?: number;
  failure_count?: number;
  failureCount?: number;
  failed_requests?: number;
  failedRequests?: number;
  failures?: number;
  tokens?: UsageTokenSummary;
  models?: Record<string, UsageAuthModelSummary>;
  estimated_cost_usd?: number | null;
  cost_status?: CredentialCostStatus;
  missing_price_models?: string[];
  [key: string]: unknown;
}

export interface AuthUsageRequestsParams {
  limit?: number;
  offset?: number;
  model?: string;
  failed?: boolean;
  from?: string;
  to?: string;
}

export interface AuthUsageRequestItem {
  timestamp: string;
  endpoint?: string;
  model: string;
  source: string;
  auth_index: string | number | null;
  failed: boolean;
  latency_ms?: number;
  tokens: UsageTokenSummary;
  estimated_cost_usd?: number | null;
}

export interface AuthUsageRequestsResponse {
  auth_index: string;
  total: number;
  limit: number;
  offset: number;
  items: AuthUsageRequestItem[];
}

const cleanAuthUsageRequestParams = (params: AuthUsageRequestsParams = {}) => {
  const cleaned: Record<string, string | number | boolean> = {};
  if (Number.isFinite(params.limit)) cleaned.limit = Number(params.limit);
  if (Number.isFinite(params.offset)) cleaned.offset = Number(params.offset);
  if (params.model) cleaned.model = params.model;
  if (typeof params.failed === 'boolean') cleaned.failed = params.failed;
  if (params.from) cleaned.from = params.from;
  if (params.to) cleaned.to = params.to;
  return cleaned;
};

export const usageApi = {
  /**
   * 获取使用统计原始数据
   */
  getUsage: () => apiClient.get<Record<string, unknown>>('/usage', { timeout: USAGE_TIMEOUT_MS }),

  /**
   * 导出使用统计快照
   */
  exportUsage: () => apiClient.get<UsageExportPayload>('/usage/export', { timeout: USAGE_TIMEOUT_MS }),

  /**
   * 导入使用统计快照
   */
  importUsage: (payload: unknown) =>
    apiClient.post<UsageImportResponse>('/usage/import', payload, { timeout: USAGE_TIMEOUT_MS }),

  /**
   * 获取单个认证文件/凭证的请求明细
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
   * 计算密钥成功/失败统计，必要时会先获取 usage 数据
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
