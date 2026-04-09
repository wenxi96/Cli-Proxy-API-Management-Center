/**
 * AI 提供商相关类型
 * 基于原项目 src/modules/ai-providers.js
 */

export interface ModelAlias {
  name: string;
  alias?: string;
  priority?: number;
  testModel?: string;
}

export interface ApiKeyEntry {
  apiKey: string;
  proxyUrl?: string;
  headers?: Record<string, string>;
}

export interface CloakConfig {
  mode?: string;
  strictMode?: boolean;
  sensitiveWords?: string[];
}

export interface GeminiKeyConfig {
  apiKey: string;
  priority?: number;
  prefix?: string;
  baseUrl?: string;
  proxyUrl?: string;
  models?: ModelAlias[];
  headers?: Record<string, string>;
  excludedModels?: string[];
}

export interface ProviderKeyConfig {
  apiKey: string;
  priority?: number;
  prefix?: string;
  baseUrl?: string;
  websockets?: boolean;
  proxyUrl?: string;
  headers?: Record<string, string>;
  models?: ModelAlias[];
  excludedModels?: string[];
  cloak?: CloakConfig;
}

export interface OpenAIProviderConfig {
  name: string;
  prefix?: string;
  baseUrl: string;
  apiKeyEntries: ApiKeyEntry[];
  headers?: Record<string, string>;
  models?: ModelAlias[];
  priority?: number;
  testModel?: string;
  [key: string]: unknown;
}

export type ScopedPoolState =
  | 'unmanaged'
  | 'in_pool'
  | 'standby'
  | 'penalized'
  | 'ejected'
  | 'disabled';

export type ScopedPoolReason =
  | ''
  | 'healthy'
  | 'pool_full'
  | 'not_enabled'
  | 'strategy_incompatible'
  | 'disabled'
  | 'unavailable'
  | 'penalty_window'
  | 'consecutive_errors'
  | 'request_timeout'
  | 'low_quota';

export interface ScopedPoolAuthRuntimeStatus {
  authId: string;
  authIndex?: string;
  provider: string;
  configured: boolean;
  poolEnabled: boolean;
  inPool: boolean;
  state: ScopedPoolState | string;
  reason?: ScopedPoolReason | string;
  runtimeOnly?: boolean;
  disabled?: boolean;
  supportsQuotaCheck?: boolean;
  remainingPercent?: number;
  lastQuotaCheckedAt?: string;
  consecutiveErrors?: number;
  recentTimeoutCount?: number;
  penaltyScore?: number;
  penaltyUntil?: string;
  lastSelectedAt?: string;
  lastPoolEventAt?: string;
  lastTransitionAt?: string;
}

export interface ScopedPoolProviderRuntimeStatus {
  provider: string;
  configured: boolean;
  effective: boolean;
  reason?: ScopedPoolReason | string;
  limit: number;
  candidateCount: number;
  activeCount: number;
  standbyCount: number;
  penalizedCount: number;
  ejectedCount: number;
  disabledCount: number;
  activeAuthIds: string[];
  auths: Record<string, ScopedPoolAuthRuntimeStatus>;
}

export interface ScopedPoolStatusResponse {
  strategy: string;
  generated: boolean;
  generatedAt?: string;
  providers: Record<string, ScopedPoolProviderRuntimeStatus>;
  auths: Record<string, ScopedPoolAuthRuntimeStatus>;
}

export interface OpenAIProviderEntryScopedPoolStatus {
  providerStatus?: ScopedPoolProviderRuntimeStatus;
  authStatus?: ScopedPoolAuthRuntimeStatus;
}
