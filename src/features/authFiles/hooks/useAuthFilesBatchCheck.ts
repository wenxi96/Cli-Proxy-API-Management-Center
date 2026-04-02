import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useInterval } from '@/hooks/useInterval';
import { authFilesApi } from '@/services/api';
import { useNotificationStore } from '@/stores';
import type {
  AuthFileBatchCheckAggregate,
  AuthFileBatchCheckDiagnosis,
  AuthFileBatchCheckJobCreateResponse,
  AuthFileBatchCheckJobProgress,
  AuthFileBatchCheckJobResponse,
  AuthFileBatchCheckResult,
  AuthFileBatchCheckSkipped,
  AuthFileItem,
  AuthFilesBatchCheckResponse,
} from '@/types';

type RunBatchCheckOptions = {
  includeDisabled?: boolean;
  concurrency?: number;
};

export type UseAuthFilesBatchCheckResult = {
  checking: boolean;
  batchCheckJob: AuthFileBatchCheckJobResponse | null;
  progress: AuthFileBatchCheckJobProgress | null;
  batchCheckResponse: AuthFilesBatchCheckResponse | null;
  resultsMap: Map<string, AuthFileBatchCheckResult>;
  skippedMap: Map<string, AuthFileBatchCheckSkipped>;
  lastRequestedNames: string[];
  hasResults: boolean;
  runBatchCheck: (
    names: string[],
    options?: RunBatchCheckOptions
  ) => Promise<AuthFilesBatchCheckResponse | null>;
  clearBatchCheck: () => void;
};

const BATCH_CHECK_POLL_INTERVAL_MS = 1500;
const BATCH_CHECK_HEALTH_BUCKET_KEYS = [
  'full',
  'very_high',
  'high',
  'usable',
  'fair',
  'alert',
  'danger',
  'exhausted',
  'unknown',
] as const;
const BATCH_CHECK_REENABLE_BUCKET_RANKS: Record<string, number> = {
  danger: 1,
  alert: 2,
  fair: 3,
  usable: 4,
  high: 5,
  very_high: 6,
  full: 7,
};
const BATCH_CHECK_DEFAULT_REENABLE_THRESHOLD = 'danger';

const roundBatchCheckValue = (value: number): number => Math.round(value * 100) / 100;

const createEmptyBatchCheckSummary = (): AuthFilesBatchCheckResponse['summary'] => ({
  checked_count: 0,
  available_count: 0,
  available_provider_count: 0,
  skipped_count: 0,
  classification_counts: {},
  bucket_counts: {},
});

const createEmptyBatchCheckAggregate = (): AuthFileBatchCheckAggregate => ({
  capacity_overview: {
    remaining_total: 0,
    total_capacity: 0,
    remaining_percent: 0,
    used_total: 0,
    used_percent: 0,
    equivalent_full_accounts: 0,
    unknown_remaining_count: 0,
  },
  risk_overview: {
    invalidated_401_count: 0,
    no_quota_count: 0,
    api_error_count: 0,
    request_failed_count: 0,
    exhausted_count: 0,
    low_remaining_1_29_count: 0,
    mid_low_remaining_1_49_count: 0,
  },
  health_buckets: Object.fromEntries(BATCH_CHECK_HEALTH_BUCKET_KEYS.map((key) => [key, 0])) as Record<
    string,
    number
  >,
  scope_overview: {
    total_count: 0,
    enabled_count: 0,
    disabled_count: 0,
    processed_count: 0,
    skipped_count: 0,
  },
  refresh_overview: {
    highlight_windows: [],
    refresh_window_counts: {},
  },
  plan_distribution: {
    plan_type_counts: {},
    primary_cycle_counts: {},
    secondary_cycle_counts: {},
  },
  diagnosis: [],
  action_candidates: {
    invalidated_401_names: [],
    disable_exhausted_names: [],
    reenable_names: [],
    reenable_threshold_bucket: BATCH_CHECK_DEFAULT_REENABLE_THRESHOLD,
  },
});

const createPendingBatchCheckJobSnapshot = (
  created: AuthFileBatchCheckJobCreateResponse
): AuthFileBatchCheckJobResponse => ({
  job_id: created.job_id,
  status: created.status,
  scope: created.scope,
  created_at: created.created_at,
  checked_at: created.created_at,
  summary: createEmptyBatchCheckSummary(),
  aggregate: createEmptyBatchCheckAggregate(),
  results: [],
  skipped: [],
  progress: {
    total: created.scope.requested_count,
    completed: 0,
    checked: 0,
    skipped: 0,
    success: 0,
    failed: 0,
    percent: 0,
  },
});

const batchCheckMedian = (values: number[]): number | undefined => {
  if (values.length === 0) return undefined;
  const clone = [...values].sort((left, right) => left - right);
  const middle = Math.floor(clone.length / 2);

  if (clone.length % 2 === 1) {
    return clone[middle];
  }

  return roundBatchCheckValue((clone[middle - 1] + clone[middle]) / 2);
};

const appendDiagnosis = (
  collection: AuthFileBatchCheckDiagnosis[],
  label: string,
  note: string,
  example: string
) => {
  if (!label) return;

  const existing = collection.find((item) => item.label === label);
  if (existing) {
    existing.count += 1;
    if (example && existing.examples.length < 3 && !existing.examples.includes(example)) {
      existing.examples.push(example);
    }
    return;
  }

  collection.push({
    label,
    count: 1,
    note,
    examples: example ? [example] : [],
  });
};

const buildLiveBatchCheckSummary = (
  results: AuthFileBatchCheckResult[],
  skipped: AuthFileBatchCheckSkipped[]
): AuthFilesBatchCheckResponse['summary'] => {
  const summary: AuthFilesBatchCheckResponse['summary'] = {
    checked_count: results.length,
    available_count: 0,
    available_provider_count: 0,
    skipped_count: skipped.length,
    classification_counts: {},
    bucket_counts: {},
  };

  const availableProviders = new Set<string>();
  const remainingValues: number[] = [];

  results.forEach((result) => {
    summary.classification_counts[result.classification] =
      (summary.classification_counts[result.classification] ?? 0) + 1;
    summary.bucket_counts[result.bucket] = (summary.bucket_counts[result.bucket] ?? 0) + 1;

    const enabled = result.disabled !== true;

    if (result.available && enabled) {
      summary.available_count += 1;
      if (result.provider) {
        availableProviders.add(result.provider);
      }
    }

    if (
      enabled &&
      typeof result.remaining_percent === 'number' &&
      Number.isFinite(result.remaining_percent)
    ) {
      remainingValues.push(result.remaining_percent);
    }
  });

  summary.available_provider_count = availableProviders.size;
  if (remainingValues.length > 0) {
    const total = remainingValues.reduce((sum, value) => sum + value, 0);
    summary.average_remaining_percent = Math.trunc(total / remainingValues.length);
  }

  return summary;
};

const buildLiveBatchCheckAggregate = (
  baseAggregate: AuthFileBatchCheckAggregate,
  results: AuthFileBatchCheckResult[],
  skipped: AuthFileBatchCheckSkipped[]
): AuthFileBatchCheckAggregate => {
  const thresholdBucket =
    baseAggregate?.action_candidates?.reenable_threshold_bucket || BATCH_CHECK_DEFAULT_REENABLE_THRESHOLD;
  const healthBuckets = Object.fromEntries(BATCH_CHECK_HEALTH_BUCKET_KEYS.map((key) => [key, 0])) as Record<
    string,
    number
  >;
  const diagnosis: AuthFileBatchCheckDiagnosis[] = [];
  const remainingValues: number[] = [];

  const aggregate: AuthFileBatchCheckAggregate = {
    capacity_overview: {
      remaining_total: 0,
      total_capacity: 0,
      remaining_percent: 0,
      used_total: 0,
      used_percent: 0,
      equivalent_full_accounts: 0,
      unknown_remaining_count: 0,
    },
    risk_overview: {
      invalidated_401_count: 0,
      no_quota_count: 0,
      api_error_count: 0,
      request_failed_count: 0,
      exhausted_count: 0,
      low_remaining_1_29_count: 0,
      mid_low_remaining_1_49_count: 0,
    },
    health_buckets: healthBuckets,
    scope_overview: {
      total_count: results.length + skipped.length,
      enabled_count: 0,
      disabled_count: skipped.filter((item) => item.reason === 'disabled').length,
      processed_count: results.length,
      skipped_count: skipped.length,
    },
    refresh_overview: {
      next_refresh_at: baseAggregate?.refresh_overview?.next_refresh_at,
      highlight_windows: Array.isArray(baseAggregate?.refresh_overview?.highlight_windows)
        ? baseAggregate.refresh_overview.highlight_windows
        : [],
      refresh_window_counts: baseAggregate?.refresh_overview?.refresh_window_counts ?? {},
    },
    plan_distribution: {
      plan_type_counts: baseAggregate?.plan_distribution?.plan_type_counts ?? {},
      primary_cycle_counts: baseAggregate?.plan_distribution?.primary_cycle_counts ?? {},
      secondary_cycle_counts: baseAggregate?.plan_distribution?.secondary_cycle_counts ?? {},
    },
    diagnosis,
    action_candidates: {
      invalidated_401_names: [],
      disable_exhausted_names: [],
      reenable_names: [],
      reenable_threshold_bucket: thresholdBucket,
    },
  };

  results.forEach((result) => {
    if (result.disabled) {
      aggregate.scope_overview.disabled_count += 1;
    } else {
      aggregate.scope_overview.enabled_count += 1;
    }

    const bucketKey =
      typeof result.bucket === 'string' && result.bucket in healthBuckets ? result.bucket : 'unknown';
    aggregate.health_buckets[bucketKey] += 1;

    switch (result.classification) {
      case 'invalidated_401':
        aggregate.risk_overview.invalidated_401_count += 1;
        aggregate.action_candidates.invalidated_401_names.push(result.name);
        appendDiagnosis(diagnosis, '认证失效', '请重新登录或更换认证文件。', result.name);
        break;
      case 'no_quota':
        aggregate.risk_overview.no_quota_count += 1;
        appendDiagnosis(diagnosis, '额度耗尽', '建议禁用已耗尽文件，等待额度恢复后再启用。', result.name);
        break;
      case 'api_error':
        aggregate.risk_overview.api_error_count += 1;
        appendDiagnosis(diagnosis, '接口错误', '请检查上游接口状态、代理链路或返回格式。', result.name);
        break;
      case 'request_failed':
        aggregate.risk_overview.request_failed_count += 1;
        appendDiagnosis(diagnosis, '请求失败', '请检查网络、代理配置或本地运行环境。', result.name);
        break;
      default:
        break;
    }

    const enabled = result.disabled !== true;

    if (
      enabled &&
      typeof result.remaining_percent === 'number' &&
      Number.isFinite(result.remaining_percent)
    ) {
      const remaining = result.remaining_percent;
      aggregate.capacity_overview.remaining_total += remaining;
      remainingValues.push(remaining);

      if (remaining <= 0) {
        aggregate.risk_overview.exhausted_count += 1;
      }
      if (remaining >= 1 && remaining <= 29) {
        aggregate.risk_overview.low_remaining_1_29_count += 1;
      }
      if (remaining >= 1 && remaining <= 49) {
        aggregate.risk_overview.mid_low_remaining_1_49_count += 1;
      }
    } else if (enabled) {
      aggregate.capacity_overview.unknown_remaining_count += 1;
    }

    if (!result.disabled && result.bucket === 'exhausted') {
      aggregate.action_candidates.disable_exhausted_names.push(result.name);
    }
    if (
      result.disabled &&
      result.classification === 'ok' &&
      (BATCH_CHECK_REENABLE_BUCKET_RANKS[result.bucket] ?? 0) >=
        (BATCH_CHECK_REENABLE_BUCKET_RANKS[thresholdBucket] ?? 0)
    ) {
      aggregate.action_candidates.reenable_names.push(result.name);
    }
  });

  const knownCount = remainingValues.length;
  aggregate.capacity_overview.total_capacity = knownCount * 100;
  aggregate.capacity_overview.used_total = Math.max(
    0,
    aggregate.capacity_overview.total_capacity - aggregate.capacity_overview.remaining_total
  );

  if (aggregate.capacity_overview.total_capacity > 0) {
    aggregate.capacity_overview.remaining_percent = roundBatchCheckValue(
      (aggregate.capacity_overview.remaining_total * 100) / aggregate.capacity_overview.total_capacity
    );
    aggregate.capacity_overview.used_percent = roundBatchCheckValue(
      (aggregate.capacity_overview.used_total * 100) / aggregate.capacity_overview.total_capacity
    );
  }

  if (knownCount > 0) {
    aggregate.capacity_overview.equivalent_full_accounts = roundBatchCheckValue(
      aggregate.capacity_overview.remaining_total / 100
    );
    aggregate.capacity_overview.average_remaining = roundBatchCheckValue(
      aggregate.capacity_overview.remaining_total / knownCount
    );
    aggregate.capacity_overview.median_remaining = batchCheckMedian(remainingValues);
  }

  aggregate.action_candidates.invalidated_401_names.sort();
  aggregate.action_candidates.disable_exhausted_names.sort();
  aggregate.action_candidates.reenable_names.sort();
  diagnosis.forEach((item) => item.examples.sort());

  return aggregate;
};

export const buildBatchCheckLiveResponse = (
  response: AuthFilesBatchCheckResponse | null,
  files: AuthFileItem[]
): AuthFilesBatchCheckResponse | null => {
  if (!response) return null;

  const fileMap = new Map(files.map((file) => [file.name, file]));
  const results = (response.results ?? []).flatMap((result) => {
    const currentFile = fileMap.get(result.name);
    if (!currentFile) return [];

    return [
      {
        ...result,
        provider: result.provider || currentFile.provider || currentFile.type || '',
        disabled: currentFile.disabled === true,
      },
    ];
  });

  const skipped = (response.skipped ?? []).flatMap((item) => {
    const currentFile = fileMap.get(item.name);
    if (!currentFile) {
      return item.reason === 'auth_not_found' ? [item] : [];
    }

    return [
      {
        ...item,
        provider: item.provider || currentFile.provider || currentFile.type || undefined,
      },
    ];
  });

  const summary = buildLiveBatchCheckSummary(results, skipped);
  const aggregate = buildLiveBatchCheckAggregate(response.aggregate, results, skipped);

  return {
    ...response,
    summary,
    aggregate,
    results,
    skipped,
  };
};

const batchCheckJobToResponse = (
  job: AuthFileBatchCheckJobResponse | null
): AuthFilesBatchCheckResponse | null => {
  if (!job) return null;
  const results = Array.isArray(job.results) ? job.results : [];
  const skipped = Array.isArray(job.skipped) ? job.skipped : [];
  return {
    checked_at: job.checked_at,
    summary: job.summary,
    aggregate: job.aggregate,
    results,
    skipped,
  };
};

const normalizeRequestedNames = (names: string[]): string[] => {
  const seen = new Set<string>();
  const normalized: string[] = [];

  names.forEach((name) => {
    const trimmed = String(name ?? '').trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    normalized.push(trimmed);
  });

  return normalized;
};

export function useAuthFilesBatchCheck(): UseAuthFilesBatchCheckResult {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);

  const [checking, setChecking] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [batchCheckJob, setBatchCheckJob] = useState<AuthFileBatchCheckJobResponse | null>(null);
  const [batchCheckResponse, setBatchCheckResponse] = useState<AuthFilesBatchCheckResponse | null>(
    null
  );
  const [lastRequestedNames, setLastRequestedNames] = useState<string[]>([]);
  const pollingRef = useRef(false);
  const activeJobIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeJobIdRef.current = activeJobId;
  }, [activeJobId]);

  const resultsMap = useMemo(
    () => new Map((batchCheckResponse?.results ?? []).map((item) => [item.name, item])),
    [batchCheckResponse]
  );

  const skippedMap = useMemo(
    () => new Map((batchCheckResponse?.skipped ?? []).map((item) => [item.name, item])),
    [batchCheckResponse]
  );

  const hasResults = Boolean(
    batchCheckResponse &&
    ((batchCheckResponse.results ?? []).length > 0 || (batchCheckResponse.skipped ?? []).length > 0)
  );

  const progress = batchCheckJob?.progress ?? null;

  const applyJobSnapshot = useCallback(
    (job: AuthFileBatchCheckJobResponse) => {
      setBatchCheckJob(job);
      setBatchCheckResponse(batchCheckJobToResponse(job));

      if (job.status === 'completed') {
        setChecking(false);
        activeJobIdRef.current = null;
        setActiveJobId(null);
        showNotification(
          t('auth_files.batch_check_success', {
            checked: job.summary.checked_count,
            skipped: job.summary.skipped_count,
          }),
          job.summary.checked_count > 0 ? 'success' : 'warning'
        );
        return;
      }

      if (job.status === 'failed') {
        setChecking(false);
        activeJobIdRef.current = null;
        setActiveJobId(null);
        showNotification(
          t('auth_files.batch_check_failed', {
            message: job.error_message || t('common.unknown_error'),
          }),
          'error'
        );
        return;
      }

      setChecking(true);
    },
    [showNotification, t]
  );

  const pollJob = useCallback(
    async (jobId: string): Promise<AuthFileBatchCheckJobResponse | null> => {
      if (!jobId || pollingRef.current) return null;

      pollingRef.current = true;
      try {
        const job = await authFilesApi.getBatchCheckJob(jobId);
        if (activeJobIdRef.current !== jobId) return null;
        applyJobSnapshot(job);
        return job;
      } catch (err: unknown) {
        if (activeJobIdRef.current !== jobId) return null;
        setChecking(false);
        activeJobIdRef.current = null;
        setActiveJobId(null);
        const errorMessage = err instanceof Error ? err.message : t('common.unknown_error');
        showNotification(t('auth_files.batch_check_failed', { message: errorMessage }), 'error');
        return null;
      } finally {
        pollingRef.current = false;
      }
    },
    [applyJobSnapshot, showNotification, t]
  );

  const runBatchCheck = useCallback(
    async (names: string[], options?: RunBatchCheckOptions) => {
      const normalizedNames = normalizeRequestedNames(names);
      if (normalizedNames.length === 0) {
        showNotification(t('auth_files.batch_check_empty_scope'), 'warning');
        return null;
      }

      setLastRequestedNames(normalizedNames);
      setChecking(true);
      activeJobIdRef.current = null;
      setActiveJobId(null);
      setBatchCheckJob(null);
      setBatchCheckResponse(null);

      try {
        const created = await authFilesApi.createBatchCheckJob(
          normalizedNames,
          options?.includeDisabled ?? true,
          options?.concurrency
        );
        activeJobIdRef.current = created.job_id;
        setActiveJobId(created.job_id);
        applyJobSnapshot(createPendingBatchCheckJobSnapshot(created));
        showNotification(
          t('auth_files.batch_check_started', {
            count: normalizedNames.length,
            concurrency: created.scope.concurrency,
          }),
          'info'
        );
        const initialJob = await pollJob(created.job_id);
        return batchCheckJobToResponse(initialJob);
      } catch (err: unknown) {
        setChecking(false);
        activeJobIdRef.current = null;
        const errorMessage = err instanceof Error ? err.message : t('common.unknown_error');
        showNotification(t('auth_files.batch_check_failed', { message: errorMessage }), 'error');
        return null;
      }
    },
    [pollJob, showNotification, t]
  );

  const clearBatchCheck = useCallback(() => {
    setChecking(false);
    activeJobIdRef.current = null;
    setActiveJobId(null);
    setBatchCheckJob(null);
    setBatchCheckResponse(null);
    setLastRequestedNames([]);
  }, []);

  useInterval(
    () => {
      if (!activeJobId) return;
      void pollJob(activeJobId);
    },
    activeJobId ? BATCH_CHECK_POLL_INTERVAL_MS : null
  );

  return {
    checking,
    batchCheckJob,
    progress,
    batchCheckResponse,
    resultsMap,
    skippedMap,
    lastRequestedNames,
    hasResults,
    runBatchCheck,
    clearBatchCheck,
  };
}
