/**
 * 认证文件相关类型
 * 基于原项目 src/modules/auth-files.js
 */

export type AuthFileType =
  | 'qwen'
  | 'kimi'
  | 'gemini'
  | 'gemini-cli'
  | 'aistudio'
  | 'claude'
  | 'codex'
  | 'antigravity'
  | 'iflow'
  | 'vertex'
  | 'empty'
  | 'unknown';

export interface AuthFileItem {
  name: string;
  type?: AuthFileType | string;
  provider?: string;
  size?: number;
  authIndex?: string | number | null;
  runtimeOnly?: boolean | string;
  disabled?: boolean;
  unavailable?: boolean;
  status?: string;
  statusMessage?: string;
  lastRefresh?: string | number;
  modified?: number;
  poolConfigured?: boolean;
  poolEnabled?: boolean;
  inPool?: boolean;
  poolState?: string;
  poolReason?: string;
  poolSupportsQuotaCheck?: boolean;
  poolRemainingPercent?: number;
  poolLastQuotaCheckedAt?: string | number;
  poolConsecutiveErrors?: number;
  poolRecentTimeoutCount?: number;
  poolPenaltyScore?: number;
  poolPenaltyUntil?: string | number;
  poolLastSelectedAt?: string | number;
  [key: string]: unknown;
}

export interface AuthFilesResponse {
  files: AuthFileItem[];
  total?: number;
}

export type AuthFileBatchCheckClassification =
  | 'ok'
  | 'no_quota'
  | 'invalidated_401'
  | 'api_error'
  | 'request_failed'
  | 'unsupported_provider'
  | 'disabled'
  | 'runtime_only'
  | 'auth_not_found'
  | 'unknown';

export type AuthFileBatchCheckBucket =
  | 'full'
  | 'very_high'
  | 'high'
  | 'usable'
  | 'fair'
  | 'alert'
  | 'danger'
  | 'exhausted'
  | 'unknown';

export interface AuthFileBatchCheckWindow {
  id: string;
  label?: string;
  used_percent?: number;
  remaining_percent?: number;
  reset_at?: number;
  reset_after_seconds?: number;
  reset_time?: string;
  remaining_amount?: number;
  limit?: number;
  used?: number;
  reset_hint?: string;
  token_type?: string;
  model_ids?: string[];
}

export interface AuthFileBatchCheckDetails {
  windows?: AuthFileBatchCheckWindow[];
  buckets?: AuthFileBatchCheckWindow[];
  rows?: AuthFileBatchCheckWindow[];
  groups?: AuthFileBatchCheckWindow[];
  project_id?: string;
  tier_id?: string;
  credit_balance?: number;
  plan_type?: string;
  [key: string]: unknown;
}

export interface AuthFileBatchCheckResult {
  name: string;
  provider: string;
  auth_index?: string;
  status?: string;
  status_message?: string;
  disabled: boolean;
  unavailable: boolean;
  available: boolean;
  classification: AuthFileBatchCheckClassification | string;
  remaining_percent?: number;
  bucket: AuthFileBatchCheckBucket | string;
  status_code?: number;
  error_message?: string;
  checked_at: string;
  details?: AuthFileBatchCheckDetails;
}

export interface AuthFileBatchCheckSummary {
  checked_count: number;
  available_count: number;
  available_provider_count: number;
  skipped_count: number;
  average_remaining_percent?: number;
  classification_counts: Record<string, number>;
  bucket_counts: Record<string, number>;
}

export interface AuthFileBatchCheckCapacityOverview {
  remaining_total: number;
  total_capacity: number;
  remaining_percent: number;
  used_total: number;
  used_percent: number;
  equivalent_full_accounts: number;
  average_remaining?: number;
  median_remaining?: number;
  unknown_remaining_count: number;
}

export interface AuthFileBatchCheckRiskOverview {
  invalidated_401_count: number;
  no_quota_count: number;
  api_error_count: number;
  request_failed_count: number;
  exhausted_count: number;
  low_remaining_1_29_count: number;
  mid_low_remaining_1_49_count: number;
}

export interface AuthFileBatchCheckScopeOverview {
  total_count: number;
  enabled_count: number;
  disabled_count: number;
  processed_count: number;
  skipped_count: number;
}

export interface AuthFileBatchCheckHighlightWindow {
  label: string;
  count: number;
}

export interface AuthFileBatchCheckRefreshOverview {
  next_refresh_at?: string;
  highlight_windows: AuthFileBatchCheckHighlightWindow[];
  refresh_window_counts: Record<string, number>;
}

export interface AuthFileBatchCheckPlanDistribution {
  plan_type_counts: Record<string, number>;
  primary_cycle_counts: Record<string, number>;
  secondary_cycle_counts: Record<string, number>;
}

export interface AuthFileBatchCheckDiagnosis {
  label: string;
  count: number;
  note: string;
  examples: string[];
}

export interface AuthFileBatchCheckActionCandidates {
  invalidated_401_names: string[];
  disable_exhausted_names: string[];
  reenable_names: string[];
  reenable_threshold_bucket: string;
}

export interface AuthFileBatchCheckAggregate {
  capacity_overview: AuthFileBatchCheckCapacityOverview;
  risk_overview: AuthFileBatchCheckRiskOverview;
  health_buckets: Record<string, number>;
  scope_overview: AuthFileBatchCheckScopeOverview;
  refresh_overview: AuthFileBatchCheckRefreshOverview;
  plan_distribution: AuthFileBatchCheckPlanDistribution;
  diagnosis: AuthFileBatchCheckDiagnosis[];
  action_candidates: AuthFileBatchCheckActionCandidates;
}

export interface AuthFileBatchCheckSkipped {
  name: string;
  provider?: string;
  reason: AuthFileBatchCheckClassification | string;
}

export interface AuthFilesBatchCheckResponse {
  checked_at: string;
  summary: AuthFileBatchCheckSummary;
  aggregate: AuthFileBatchCheckAggregate;
  results: AuthFileBatchCheckResult[];
  skipped: AuthFileBatchCheckSkipped[];
}

export type AuthFileBatchCheckJobStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed';

export interface AuthFileBatchCheckJobScope {
  requested_count: number;
  include_disabled: boolean;
  concurrency: number;
}

export interface AuthFileBatchCheckJobProgress {
  total: number;
  completed: number;
  checked: number;
  skipped: number;
  success: number;
  failed: number;
  percent: number;
  current_name?: string;
  current_provider?: string;
}

export interface AuthFileBatchCheckJobCreateResponse {
  job_id: string;
  status: AuthFileBatchCheckJobStatus | string;
  scope: AuthFileBatchCheckJobScope;
  created_at: string;
}

export interface AuthFileBatchCheckJobResponse extends AuthFilesBatchCheckResponse {
  job_id: string;
  status: AuthFileBatchCheckJobStatus | string;
  scope: AuthFileBatchCheckJobScope;
  progress: AuthFileBatchCheckJobProgress;
  created_at: string;
  started_at?: string;
  finished_at?: string;
  error_message?: string;
}
