import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { formatDateTime, formatNumber } from '@/utils/format';
import type {
  AuthFileBatchCheckDetails,
  AuthFileBatchCheckResult,
  AuthFileBatchCheckSkipped,
  AuthFileBatchCheckWindow,
  AuthFilesBatchCheckResponse,
} from '@/types';
import styles from '@/pages/AuthFilesPage.module.scss';

export type AuthFilesBatchCheckModalProps = {
  open: boolean;
  response: AuthFilesBatchCheckResponse | null;
  focusName?: string;
  onClose: () => void;
};

type BatchCheckDetailFact = {
  label: string;
  value: string;
};

type BatchCheckDiagnosisGroupMeta = {
  key: string;
  label: string;
  note?: string;
};

type BatchCheckDetailEntry = {
  id: string;
  name: string;
  subtitle?: string;
  facts: BatchCheckDetailFact[];
  note?: string;
  error?: string;
};

type BatchCheckDetailGroup = {
  id: string;
  label: string;
  note?: string;
  entries: BatchCheckDetailEntry[];
};

type BatchCheckDetailState = {
  title: string;
  description?: string;
  note?: string;
  groups: BatchCheckDetailGroup[];
};

const HEALTH_BUCKET_META = [
  { key: 'full', range: '98-100%' },
  { key: 'very_high', range: '90-97%' },
  { key: 'high', range: '75-89%' },
  { key: 'usable', range: '50-74%' },
  { key: 'fair', range: '30-49%' },
  { key: 'alert', range: '10-29%' },
  { key: 'danger', range: '1-9%' },
  { key: 'exhausted', range: '= 0%' },
  { key: 'unknown', range: '-' },
] as const;

const DETAIL_WINDOW_KEYS = ['windows', 'buckets', 'rows', 'groups'] as const;
const DETAIL_PAGE_SIZE = 50;
const REFRESH_WINDOW_ORDER = [
  '已到刷新时间',
  '1小时内',
  '1-3小时',
  '3-6小时',
  '6-12小时',
  '12-24小时',
  '1-3天',
  '3-7天',
  '下周及以后',
  '未知',
] as const;

const DURATION_UNIT_TO_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

const ERROR_CARD_CLASSIFICATIONS = new Set([
  'invalidated_401',
  'api_error',
  'request_failed',
]);

const formatPercentValue = (value?: number | null): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  if (Number.isInteger(value)) return `${value}%`;
  if (Math.abs(value) >= 10) return `${value.toFixed(1)}%`;
  return `${value.toFixed(2)}%`;
};

const formatNumberValue = (value?: number | null): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  if (Number.isInteger(value)) return formatNumber(value);
  return value.toFixed(2);
};

const formatOptionalDate = (value?: string): string => {
  if (!value) return '-';
  return formatDateTime(value);
};

const sortDistributionEntries = (record: Record<string, number>) =>
  Object.entries(record)
    .filter(([, count]) => count > 0)
    .sort((left, right) => {
      const rightOrder = REFRESH_WINDOW_ORDER.indexOf(right[0] as (typeof REFRESH_WINDOW_ORDER)[number]);
      const leftOrder = REFRESH_WINDOW_ORDER.indexOf(left[0] as (typeof REFRESH_WINDOW_ORDER)[number]);
      if (rightOrder >= 0 || leftOrder >= 0) {
        if (leftOrder >= 0 && rightOrder >= 0 && leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }
        if (leftOrder >= 0) return -1;
        if (rightOrder >= 0) return 1;
      }
      if (right[1] !== left[1]) return right[1] - left[1];
      return left[0].localeCompare(right[0], undefined, { sensitivity: 'accent' });
    });

const sortResultsForDetail = (items: AuthFileBatchCheckResult[]): AuthFileBatchCheckResult[] =>
  [...items].sort((left, right) => {
    const leftRemaining = typeof left.remaining_percent === 'number' ? left.remaining_percent : Number.POSITIVE_INFINITY;
    const rightRemaining =
      typeof right.remaining_percent === 'number' ? right.remaining_percent : Number.POSITIVE_INFINITY;

    if (leftRemaining !== rightRemaining) {
      return leftRemaining - rightRemaining;
    }

    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  });

const sortSkippedForDetail = (items: AuthFileBatchCheckSkipped[]): AuthFileBatchCheckSkipped[] =>
  [...items].sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));

const collectDetailWindows = (details?: AuthFileBatchCheckDetails): AuthFileBatchCheckWindow[] => {
  if (!details) return [];

  const windows: AuthFileBatchCheckWindow[] = [];
  DETAIL_WINDOW_KEYS.forEach((key) => {
    const entries = details[key];
    if (!Array.isArray(entries)) return;

    entries.forEach((entry) => {
      if (entry && typeof entry === 'object') {
        windows.push(entry as AuthFileBatchCheckWindow);
      }
    });
  });

  return windows;
};

const parseDurationToMs = (value: string): number | null => {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '');
  if (!normalized) return null;

  const matcher = /(\d+(?:\.\d+)?)(ms|s|m|h|d)/g;
  let total = 0;
  let matched = false;
  let nextIndex = 0;

  for (const match of normalized.matchAll(matcher)) {
    const token = match[0];
    const index = match.index ?? 0;
    if (index !== nextIndex) return null;

    const amount = Number(match[1]);
    const unit = match[2];
    if (!Number.isFinite(amount) || !DURATION_UNIT_TO_MS[unit]) return null;

    matched = true;
    total += amount * DURATION_UNIT_TO_MS[unit];
    nextIndex = index + token.length;
  }

  if (!matched || nextIndex !== normalized.length) return null;
  return total > 0 ? total : null;
};

const hasRefreshSignal = (window: AuthFileBatchCheckWindow): boolean =>
  (typeof window.reset_at === 'number' && Number.isFinite(window.reset_at) && window.reset_at > 0) ||
  (typeof window.reset_after_seconds === 'number' &&
    Number.isFinite(window.reset_after_seconds) &&
    window.reset_after_seconds > 0) ||
  (typeof window.reset_time === 'string' && window.reset_time.trim().length > 0) ||
  (typeof window.reset_hint === 'string' && window.reset_hint.trim().length > 0);

const resolveWindowResetMs = (
  window: AuthFileBatchCheckWindow,
  nowMs: number
): number | null => {
  if (typeof window.reset_at === 'number' && Number.isFinite(window.reset_at) && window.reset_at > 0) {
    return window.reset_at > 1_000_000_000_000 ? window.reset_at : window.reset_at * 1000;
  }

  if (
    typeof window.reset_after_seconds === 'number' &&
    Number.isFinite(window.reset_after_seconds) &&
    window.reset_after_seconds > 0
  ) {
    return nowMs + window.reset_after_seconds * 1000;
  }

  if (typeof window.reset_time === 'string' && window.reset_time.trim().length > 0) {
    const parsed = Date.parse(window.reset_time);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  if (typeof window.reset_hint === 'string' && window.reset_hint.trim().length > 0) {
    const durationMs = parseDurationToMs(window.reset_hint);
    if (durationMs != null) {
      return nowMs + durationMs;
    }
  }

  return null;
};

const resolveRefreshWindowLabel = (refreshMs: number | null, nowMs: number): string => {
  if (refreshMs == null) return '未知';

  const delta = refreshMs - nowMs;
  if (delta <= 0) return '已到刷新时间';
  if (delta <= 3_600_000) return '1小时内';
  if (delta <= 10_800_000) return '1-3小时';
  if (delta <= 21_600_000) return '3-6小时';
  if (delta <= 43_200_000) return '6-12小时';
  if (delta <= 86_400_000) return '12-24小时';
  if (delta <= 259_200_000) return '1-3天';
  if (delta <= 604_800_000) return '3-7天';
  return '下周及以后';
};

const resolveResultRefreshMeta = (result: AuthFileBatchCheckResult, nowMs = Date.now()) => {
  const windows = collectDetailWindows(result.details);

  let earliestResetMs: number | null = null;
  let hasSignal = false;
  let hasParsableSignal = false;

  windows.forEach((window) => {
    hasSignal = hasSignal || hasRefreshSignal(window);
    const resetMs = resolveWindowResetMs(window, nowMs);
    if (resetMs == null) return;

    hasParsableSignal = true;
    earliestResetMs = earliestResetMs == null ? resetMs : Math.min(earliestResetMs, resetMs);
  });

  if (earliestResetMs != null) {
    return {
      label: resolveRefreshWindowLabel(earliestResetMs, nowMs),
      reasonKey: '',
    };
  }

  if (windows.length === 0) {
    return {
      label: '未知',
      reasonKey: 'auth_files.batch_check_detail_refresh_unknown_no_window',
    };
  }

  if (!hasSignal) {
    return {
      label: '未知',
      reasonKey: 'auth_files.batch_check_detail_refresh_unknown_no_reset',
    };
  }

  if (!hasParsableSignal) {
    return {
      label: '未知',
      reasonKey: 'auth_files.batch_check_detail_refresh_unknown_invalid_reset',
    };
  }

  return {
    label: '未知',
    reasonKey: 'auth_files.batch_check_reason_unknown',
  };
};

const normalizeText = (value?: string | null): string =>
  typeof value === 'string' ? value.trim() : '';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const resolveResultIssueMessage = (result: AuthFileBatchCheckResult): string =>
  normalizeText(result.error_message) || normalizeText(result.status_message);

const extractStructuredMessageParts = (value: string): string[] => {
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const values = new Set<string>();
    const collectValue = (candidate: unknown) => {
      if (typeof candidate === 'string') {
        const normalized = candidate.trim();
        if (normalized) {
          values.add(normalized);
        }
      }
    };

    if (isRecord(parsed)) {
      collectValue(parsed.message);
      collectValue(parsed.detail);
      collectValue(parsed.reason);
      collectValue(parsed.error_description);
      collectValue(parsed.error);

      if (isRecord(parsed.error)) {
        collectValue(parsed.error.message);
        collectValue(parsed.error.detail);
        collectValue(parsed.error.reason);
        collectValue(parsed.error.code);
        collectValue(parsed.error.type);
      }
    }

    return [...values];
  } catch {
    return [];
  }
};

const resolveResultIssueMatchText = (result: AuthFileBatchCheckResult): string => {
  const rawValues = [resolveResultIssueMessage(result), normalizeText(result.status_message)].filter(Boolean);
  const values = new Set<string>();

  rawValues.forEach((item) => {
    values.add(item.toLowerCase());
    extractStructuredMessageParts(item).forEach((part) => values.add(part.toLowerCase()));
  });

  return [...values].join(' | ');
};

const normalizeProviderKey = (provider?: string): string => normalizeText(provider).toLowerCase();

const includesAny = (value: string, patterns: string[]): boolean =>
  patterns.some((pattern) => value.includes(pattern));

const shouldShowResultErrorCard = (result: AuthFileBatchCheckResult): boolean =>
  ERROR_CARD_CLASSIFICATIONS.has(result.classification) && resolveResultIssueMessage(result).length > 0;

const resolveDiagnosisGroupMeta = (
  result: AuthFileBatchCheckResult,
  t: (key: string) => string,
  resolveClassificationLabel: (classification: string) => string
): BatchCheckDiagnosisGroupMeta => {
  const normalized = resolveResultIssueMatchText(result);
  const providerKey = normalizeProviderKey(result.provider);
  const statusCode =
    typeof result.status_code === 'number' && Number.isFinite(result.status_code) ? result.status_code : 0;
  const isCodexProvider = providerKey === 'codex' || providerKey.includes('codex');
  const isGeminiProvider = providerKey === 'gemini' || providerKey === 'gemini-cli' || providerKey.includes('gemini');
  const createMeta = (
    key: string,
    labelKey: string,
    noteKey: string
  ): BatchCheckDiagnosisGroupMeta => ({
    key,
    label: t(labelKey),
    note: t(noteKey),
  });

  switch (result.classification) {
    case 'invalidated_401':
      if (normalized.includes('invalid bearer token')) {
        return createMeta(
          'invalidated_401:invalid_bearer_token',
          'auth_files.batch_check_diag_reason_invalid_bearer_token',
          'auth_files.batch_check_diag_reason_invalid_bearer_token_note'
        );
      }
      if (
        includesAny(normalized, [
          'token expired',
          'access token expired',
          'expired access token',
          'session expired',
        ])
      ) {
        return createMeta(
          'invalidated_401:access_token_expired',
          'auth_files.batch_check_diag_reason_access_token_expired',
          'auth_files.batch_check_diag_reason_access_token_expired_note'
        );
      }
      if (normalized.includes('unauthorized')) {
        return createMeta(
          'invalidated_401:unauthorized',
          'auth_files.batch_check_diag_reason_unauthorized',
          'auth_files.batch_check_diag_reason_unauthorized_note'
        );
      }
      return createMeta(
        'invalidated_401:other',
        'auth_files.batch_check_diag_reason_auth_invalid_other',
        'auth_files.batch_check_diag_reason_auth_invalid_other_note'
      );
    case 'request_failed':
      if (normalized.includes('missing chatgpt account id')) {
        return isCodexProvider
          ? createMeta(
              'request_failed:codex_missing_chatgpt_account_id',
              'auth_files.batch_check_diag_reason_codex_missing_chatgpt_account_id',
              'auth_files.batch_check_diag_reason_codex_missing_chatgpt_account_id_note'
            )
          : createMeta(
              'request_failed:missing_chatgpt_account_id',
              'auth_files.batch_check_diag_reason_missing_chatgpt_account_id',
              'auth_files.batch_check_diag_reason_missing_chatgpt_account_id_note'
            );
      }
      if (
        includesAny(normalized, [
          'missing project id',
          'project id is required',
          'project_id is required',
          'missing google cloud project id',
        ])
      ) {
        return createMeta(
          'request_failed:missing_project_id',
          'auth_files.batch_check_diag_reason_missing_project_id',
          'auth_files.batch_check_diag_reason_missing_project_id_note'
        );
      }
      if (
        includesAny(normalized, [
          'missing access token',
          'access token is required',
          'access token missing',
          'no access token',
          'access token not found',
        ])
      ) {
        return createMeta(
          'request_failed:missing_access_token',
          'auth_files.batch_check_diag_reason_missing_access_token',
          'auth_files.batch_check_diag_reason_missing_access_token_note'
        );
      }
      if (
        includesAny(normalized, [
          'invalid_grant',
          'refresh token is invalid',
          'refresh token revoked',
          'auth token refresh failed',
        ])
      ) {
        return isGeminiProvider
          ? createMeta(
              'request_failed:gemini_invalid_grant',
              'auth_files.batch_check_diag_reason_gemini_invalid_grant',
              'auth_files.batch_check_diag_reason_gemini_invalid_grant_note'
            )
          : createMeta(
              'request_failed:invalid_grant',
              'auth_files.batch_check_diag_reason_invalid_grant',
              'auth_files.batch_check_diag_reason_invalid_grant_note'
            );
      }
      if (
        includesAny(normalized, [
          'proxyconnect',
          'proxy connect',
          'proxy error',
          'proxy authentication required',
          'proxy unavailable',
        ])
      ) {
        return createMeta(
          'request_failed:proxy_connect',
          'auth_files.batch_check_diag_reason_proxy_connect',
          'auth_files.batch_check_diag_reason_proxy_connect_note'
        );
      }
      if (
        includesAny(normalized, [
          'tls handshake',
          'certificate signed by unknown authority',
          'certificate verify failed',
          'x509',
          'handshake failure',
        ])
      ) {
        return createMeta(
          'request_failed:tls_handshake',
          'auth_files.batch_check_diag_reason_tls_handshake',
          'auth_files.batch_check_diag_reason_tls_handshake_note'
        );
      }
      if (
        includesAny(normalized, [
          'timeout',
          'timed out',
          'deadline exceeded',
          'context deadline exceeded',
          'i/o timeout',
          'client timeout',
        ])
      ) {
        return createMeta(
          'request_failed:timeout',
          'auth_files.batch_check_diag_reason_timeout',
          'auth_files.batch_check_diag_reason_timeout_note'
        );
      }
      if (
        includesAny(normalized, [
          'unexpected end of json input',
          'empty payload',
          'empty response',
          'no response body',
          'response body is empty',
        ])
      ) {
        return createMeta(
          'request_failed:empty_payload',
          'auth_files.batch_check_diag_reason_empty_payload',
          'auth_files.batch_check_diag_reason_empty_payload_note'
        );
      }
      if (
        includesAny(normalized, [
          'invalid character',
          'cannot unmarshal',
          'json parse',
          'invalid json',
          'malformed json',
        ])
      ) {
        return createMeta(
          'request_failed:invalid_json',
          'auth_files.batch_check_diag_reason_invalid_json',
          'auth_files.batch_check_diag_reason_invalid_json_note'
        );
      }
      if (
        includesAny(normalized, [
          'dial tcp',
          'connection refused',
          'connection reset by peer',
          'network is unreachable',
          'no route to host',
          'lookup ',
          'connect:',
        ])
      ) {
        return createMeta(
          'request_failed:connection',
          'auth_files.batch_check_diag_reason_connection',
          'auth_files.batch_check_diag_reason_connection_note'
        );
      }
      return createMeta(
        'request_failed:other',
        'auth_files.batch_check_diag_reason_request_failed_other',
        'auth_files.batch_check_diag_reason_request_failed_other_note'
      );
    case 'api_error':
      if (
        statusCode === 403 ||
        includesAny(normalized, ['forbidden', 'permission denied', 'insufficient permissions'])
      ) {
        return createMeta(
          'api_error:forbidden',
          'auth_files.batch_check_diag_reason_api_forbidden',
          'auth_files.batch_check_diag_reason_api_forbidden_note'
        );
      }
      if (
        includesAny(normalized, [
          'unexpected end of json input',
          'empty payload',
          'empty response',
          'no response body',
          'response body is empty',
        ])
      ) {
        return createMeta(
          'api_error:empty_payload',
          'auth_files.batch_check_diag_reason_empty_payload',
          'auth_files.batch_check_diag_reason_empty_payload_note'
        );
      }
      if (
        includesAny(normalized, [
          'invalid character',
          'cannot unmarshal',
          'json parse',
          'invalid json',
          'malformed json',
        ])
      ) {
        return createMeta(
          'api_error:invalid_json',
          'auth_files.batch_check_diag_reason_invalid_json',
          'auth_files.batch_check_diag_reason_invalid_json_note'
        );
      }
      if (
        statusCode === 429 ||
        includesAny(normalized, ['429', 'too many requests', 'rate limit', 'rate limited', 'throttl'])
      ) {
        return createMeta(
          'api_error:rate_limited',
          'auth_files.batch_check_diag_reason_rate_limited',
          'auth_files.batch_check_diag_reason_rate_limited_note'
        );
      }
      if (
        (statusCode >= 500 && statusCode <= 599) ||
        normalized.includes('500') ||
        normalized.includes('502') ||
        normalized.includes('503') ||
        normalized.includes('504') ||
        normalized.includes('server error') ||
        normalized.includes('internal error') ||
        normalized.includes('bad gateway') ||
        normalized.includes('service unavailable')
      ) {
        return createMeta(
          'api_error:upstream_5xx',
          'auth_files.batch_check_diag_reason_upstream_5xx',
          'auth_files.batch_check_diag_reason_upstream_5xx_note'
        );
      }
      if (
        statusCode === 400 ||
        includesAny(normalized, ['400', 'bad request', 'invalid request', 'invalid argument', 'malformed request'])
      ) {
        return createMeta(
          'api_error:bad_request',
          'auth_files.batch_check_diag_reason_api_bad_request',
          'auth_files.batch_check_diag_reason_api_bad_request_note'
        );
      }
      return createMeta(
        'api_error:other',
        'auth_files.batch_check_diag_reason_api_error_other',
        'auth_files.batch_check_diag_reason_api_error_other_note'
      );
    case 'no_quota':
      return createMeta(
        'no_quota:exhausted',
        'auth_files.batch_check_diag_reason_no_quota',
        'auth_files.batch_check_diag_reason_no_quota_note'
      );
    default:
      return {
        key: `${result.classification}:other`,
        label: resolveClassificationLabel(result.classification),
        note: t('auth_files.batch_check_detail_scope_note'),
      };
  }
};

const renderMetric = (
  label: string,
  value: string,
  hint?: string,
  onClick?: () => void
) => {
  if (onClick) {
    return (
      <button
        type="button"
        className={`${styles.batchCheckMetric} ${styles.batchCheckMetricButton}`}
        onClick={onClick}
      >
        <span className={styles.batchCheckMetricLabel}>{label}</span>
        <span className={styles.batchCheckMetricValue}>{value}</span>
        {hint ? <span className={styles.batchCheckMetricHint}>{hint}</span> : null}
      </button>
    );
  }

  return (
    <div className={styles.batchCheckMetric}>
      <span className={styles.batchCheckMetricLabel}>{label}</span>
      <span className={styles.batchCheckMetricValue}>{value}</span>
      {hint ? <span className={styles.batchCheckMetricHint}>{hint}</span> : null}
    </div>
  );
};

const renderDistributionCard = (
  title: string,
  value: string,
  hint?: string,
  onClick?: () => void
) => {
  const className = onClick
    ? `${styles.batchCheckDistributionCard} ${styles.batchCheckDistributionCardButton}`
    : styles.batchCheckDistributionCard;

  const content = (
    <>
      <div className={styles.batchCheckDistributionTitle}>{title}</div>
      <div className={styles.batchCheckDistributionValue}>{value}</div>
      {hint ? <div className={styles.batchCheckDistributionHint}>{hint}</div> : null}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
};

export function AuthFilesBatchCheckModal(props: AuthFilesBatchCheckModalProps) {
  const { open, response, onClose } = props;
  const { t } = useTranslation();
  const [detailState, setDetailState] = useState<BatchCheckDetailState | null>(null);
  const [detailPageByGroup, setDetailPageByGroup] = useState<Record<string, number>>({});

  const aggregate = response?.aggregate ?? null;
  const results = useMemo(
    () => (Array.isArray(response?.results) ? response.results : []),
    [response]
  );
  const skipped = useMemo(
    () => (Array.isArray(response?.skipped) ? response.skipped : []),
    [response]
  );

  const totalHealthCount = useMemo(() => {
    if (!aggregate) return 0;
    return Object.values(aggregate.health_buckets ?? {}).reduce((sum, value) => sum + value, 0);
  }, [aggregate]);

  const refreshDistribution = useMemo(
    () => sortDistributionEntries(aggregate?.refresh_overview?.refresh_window_counts ?? {}),
    [aggregate]
  );
  const planDistribution = useMemo(
    () => sortDistributionEntries(aggregate?.plan_distribution?.plan_type_counts ?? {}),
    [aggregate]
  );
  const primaryCycleDistribution = useMemo(
    () => sortDistributionEntries(aggregate?.plan_distribution?.primary_cycle_counts ?? {}),
    [aggregate]
  );
  const secondaryCycleDistribution = useMemo(
    () => sortDistributionEntries(aggregate?.plan_distribution?.secondary_cycle_counts ?? {}),
    [aggregate]
  );

  const resultByName = useMemo(() => new Map(results.map((item) => [item.name, item])), [results]);
  const refreshMetaByName = useMemo(
    () =>
      new Map(
        results.map((item) => [
          item.name,
          resolveResultRefreshMeta(item),
        ])
      ),
    [results]
  );

  const resolveBucketLabel = (bucket: string) => {
    const key = `auth_files.batch_check_bucket_${bucket}`;
    const translated = t(key);
    return translated === key ? bucket : translated;
  };

  const resolveClassificationLabel = (classification: string) => {
    const key = `auth_files.batch_check_classification_${classification}`;
    const translated = t(key);
    return translated === key ? classification : translated;
  };

  const resolveSkippedReasonLabel = (reason: string) => {
    const key = `auth_files.batch_check_reason_${reason}`;
    const translated = t(key);
    return translated === key ? resolveClassificationLabel(reason) : translated;
  };

  const getPlanType = (result: AuthFileBatchCheckResult): string => {
    const planType = result.details?.plan_type;
    return typeof planType === 'string' ? planType.trim() : '';
  };

  const buildResultEntry = (
    result: AuthFileBatchCheckResult,
    note?: string
  ): BatchCheckDetailEntry => {
    const displayErrorMessage = shouldShowResultErrorCard(result)
      ? resolveResultIssueMessage(result)
      : '';
    const normalizedStatusMessage = normalizeText(result.status_message);

    const facts: BatchCheckDetailFact[] = [
      {
        label: t('auth_files.batch_check_detail_classification_label'),
        value: resolveClassificationLabel(result.classification),
      },
      {
        label: t('auth_files.batch_check_detail_bucket_label'),
        value: resolveBucketLabel(result.bucket),
      },
      {
        label: t('auth_files.batch_check_enabled_state'),
        value: result.disabled ? t('auth_files.batch_check_disabled') : t('auth_files.batch_check_enabled'),
      },
    ];

    if (typeof result.remaining_percent === 'number' && Number.isFinite(result.remaining_percent)) {
      facts.push({
        label: t('auth_files.batch_check_remaining_percent'),
        value: formatPercentValue(result.remaining_percent),
      });
    }

    if (typeof result.status_code === 'number' && Number.isFinite(result.status_code) && result.status_code > 0) {
      facts.push({
        label: t('auth_files.batch_check_status_code'),
        value: String(result.status_code),
      });
    }

    if (normalizedStatusMessage && normalizedStatusMessage !== displayErrorMessage) {
      facts.push({
        label: t('auth_files.batch_check_status_message'),
        value: normalizedStatusMessage,
      });
    }

    const planType = getPlanType(result);
    if (planType) {
      facts.push({
        label: t('auth_files.batch_check_plan_type'),
        value: planType,
      });
    }

    return {
      id: `result:${result.name}`,
      name: result.name,
      subtitle: result.provider || undefined,
      facts,
      note,
      error: displayErrorMessage || undefined,
    };
  };

  const buildSkippedEntry = (item: AuthFileBatchCheckSkipped): BatchCheckDetailEntry => ({
    id: `skipped:${item.name}`,
    name: item.name,
    subtitle: item.provider || undefined,
    facts: [],
    note: resolveSkippedReasonLabel(item.reason),
  });

  const createResultGroups = (
    items: AuthFileBatchCheckResult[],
    options?: {
      entryNote?: (result: AuthFileBatchCheckResult) => string | undefined;
      groupBy?: (
        result: AuthFileBatchCheckResult
      ) => { key: string; label: string; note?: string };
    }
  ): BatchCheckDetailGroup[] => {
    const groups = new Map<string, BatchCheckDetailGroup>();

    sortResultsForDetail(items).forEach((result) => {
      const groupMeta =
        options?.groupBy?.(result) ??
        ({
          key: 'files',
          label: t('auth_files.batch_check_detail_file_list'),
          note: undefined,
        } as { key: string; label: string; note?: string });
      const group =
        groups.get(groupMeta.key) ??
        ({
          id: groupMeta.key,
          label: groupMeta.label,
          note: groupMeta.note,
          entries: [],
        } as BatchCheckDetailGroup);

      if (!group.note && groupMeta.note) {
        group.note = groupMeta.note;
      }
      group.entries.push(buildResultEntry(result, options?.entryNote?.(result)));
      groups.set(groupMeta.key, group);
    });

    return Array.from(groups.values()).sort((left, right) => {
      if (right.entries.length !== left.entries.length) {
        return right.entries.length - left.entries.length;
      }
      return left.label.localeCompare(right.label, undefined, { sensitivity: 'base' });
    });
  };

  const createSkippedGroups = (): BatchCheckDetailGroup[] => {
    const groups = new Map<string, BatchCheckDetailGroup>();

    sortSkippedForDetail(skipped).forEach((item) => {
      const label = resolveSkippedReasonLabel(item.reason);
      const group =
        groups.get(item.reason) ??
        ({
          id: item.reason,
          label,
          entries: [],
        } as BatchCheckDetailGroup);

      group.entries.push(buildSkippedEntry(item));
      groups.set(item.reason, group);
    });

    return Array.from(groups.values()).sort((left, right) => {
      if (right.entries.length !== left.entries.length) {
        return right.entries.length - left.entries.length;
      }
      return left.label.localeCompare(right.label, undefined, { sensitivity: 'base' });
    });
  };

  const openDetailState = (state: BatchCheckDetailState) => {
    setDetailState(state);
    setDetailPageByGroup({});
  };

  const openSkippedDetail = () => {
    openDetailState({
      title: t('auth_files.batch_check_skipped_section'),
      description: t('auth_files.batch_check_detail_skipped_desc'),
      note: t('auth_files.batch_check_detail_scope_note'),
      groups: createSkippedGroups(),
    });
  };

  const openResultListDetail = (
    title: string,
    description: string,
    items: AuthFileBatchCheckResult[],
    note?: string,
    options?: {
      entryNote?: (result: AuthFileBatchCheckResult) => string | undefined;
      groupBy?: (
        result: AuthFileBatchCheckResult
      ) => { key: string; label: string; note?: string };
    }
  ) => {
    openDetailState({
      title,
      description,
      note,
      groups: createResultGroups(items, options),
    });
  };

  const openActionDetail = (
    title: string,
    description: string,
    names: string[],
    note?: string
  ) => {
    const matched = names
      .map((name) => resultByName.get(name))
      .filter((item): item is AuthFileBatchCheckResult => Boolean(item));

    openResultListDetail(title, description, matched, note);
  };

  const openDiagnosisDetail = (label: string, note: string) => {
    const matched = results.filter((result) => {
      switch (label) {
        case '认证失效':
          return result.classification === 'invalidated_401';
        case '额度耗尽':
          return result.classification === 'no_quota';
        case '接口错误':
          return result.classification === 'api_error';
        case '请求失败':
          return result.classification === 'request_failed';
        default:
          return false;
      }
    });

    openResultListDetail(
      label,
      t('auth_files.batch_check_detail_diagnosis_desc', { diagnosis: label }),
      matched,
      note,
      {
        groupBy: (result) => {
          const groupMeta = resolveDiagnosisGroupMeta(result, t, resolveClassificationLabel);
          return {
            key: groupMeta.key,
            label: groupMeta.label,
            note: groupMeta.note,
          };
        },
      }
    );
  };

  const openRefreshDetail = (label: string) => {
    const matched = results.filter((result) => refreshMetaByName.get(result.name)?.label === label);
    const note =
      label === '未知'
        ? t('auth_files.batch_check_detail_refresh_unknown_note')
        : t('auth_files.batch_check_detail_scope_note');

    openResultListDetail(
      label,
      t('auth_files.batch_check_detail_refresh_window_desc', { window: label }),
      matched,
      note,
      label === '未知'
        ? {
            entryNote: (result) => {
              const reasonKey = refreshMetaByName.get(result.name)?.reasonKey;
              return reasonKey ? t(reasonKey) : t('auth_files.batch_check_reason_unknown');
            },
            groupBy: (result) => {
              const reasonKey = refreshMetaByName.get(result.name)?.reasonKey;
              const reasonLabel = reasonKey ? t(reasonKey) : t('auth_files.batch_check_reason_unknown');
              return {
                key: reasonLabel,
                label: reasonLabel,
              };
            },
          }
        : undefined
    );
  };

  const handleClose = () => {
    setDetailState(null);
    setDetailPageByGroup({});
    onClose();
  };

  return (
    <>
      <Modal
        open={open}
        onClose={handleClose}
        width={980}
        className={styles.batchCheckModal}
        title={t('auth_files.batch_check_modal_title')}
        footer={
          <Button variant="secondary" onClick={handleClose}>
            {t('common.close')}
          </Button>
        }
      >
        {!response || !aggregate ? (
          <EmptyState
            title={t('auth_files.batch_check_empty_title')}
            description={t('auth_files.batch_check_empty_desc')}
          />
        ) : (
          <div className={styles.batchCheckModalContent}>
            <div className={styles.batchCheckPanelMeta}>
              <span>
                {t('auth_files.batch_check_last_checked')}: {formatDateTime(response.checked_at)}
              </span>
              <span>
                {t('auth_files.batch_check_scope_total')}: {formatNumber(aggregate.scope_overview.total_count)}
              </span>
              <span>
                {t('auth_files.batch_check_checked_count')}: {formatNumber(response.summary.checked_count)}
              </span>
              <span>
                {t('auth_files.batch_check_skipped_count')}: {formatNumber(response.summary.skipped_count)}
              </span>
            </div>

            <div className={styles.batchCheckInfoBanner}>
              <strong>{t('auth_files.batch_check_detail_scope_note')}</strong>
              <span>{t('auth_files.batch_check_click_detail_hint')}</span>
            </div>

            <section className={styles.batchCheckModalSection}>
              <div className={styles.batchCheckSectionTitleWrap}>
                <div className={styles.batchCheckSectionTitle}>
                  {t('auth_files.batch_check_modal_section_overview')}
                </div>
                <div className={styles.batchCheckSectionDescription}>
                  {t('auth_files.batch_check_modal_section_overview_desc')}
                </div>
              </div>
              <div className={styles.batchCheckMetricGrid}>
                {renderMetric(
                  t('auth_files.batch_check_total_remaining'),
                  `${formatNumber(aggregate.capacity_overview.remaining_total)} / ${formatNumber(aggregate.capacity_overview.total_capacity)}`,
                  formatPercentValue(aggregate.capacity_overview.remaining_percent)
                )}
                {renderMetric(
                  t('auth_files.batch_check_used_total'),
                  `${formatNumber(aggregate.capacity_overview.used_total)} / ${formatNumber(aggregate.capacity_overview.total_capacity)}`,
                  formatPercentValue(aggregate.capacity_overview.used_percent)
                )}
                {renderMetric(
                  t('auth_files.batch_check_equivalent_accounts'),
                  formatNumberValue(aggregate.capacity_overview.equivalent_full_accounts)
                )}
                {renderMetric(
                  t('auth_files.batch_check_average_remaining'),
                  formatPercentValue(aggregate.capacity_overview.average_remaining)
                )}
                {renderMetric(
                  t('auth_files.batch_check_median_remaining'),
                  formatPercentValue(aggregate.capacity_overview.median_remaining)
                )}
                {renderMetric(
                  t('auth_files.batch_check_unknown_remaining_count'),
                  formatNumber(aggregate.capacity_overview.unknown_remaining_count),
                  undefined,
                  () =>
                    openResultListDetail(
                      t('auth_files.batch_check_unknown_remaining_count'),
                      t('auth_files.batch_check_detail_unknown_remaining_desc'),
                      results.filter(
                        (result) =>
                          typeof result.remaining_percent !== 'number' ||
                          !Number.isFinite(result.remaining_percent)
                      ),
                      t('auth_files.batch_check_detail_scope_note')
                    )
                )}
                {renderMetric(
                  t('auth_files.batch_check_available_count'),
                  formatNumber(response.summary.available_count),
                  undefined,
                  () =>
                    openResultListDetail(
                      t('auth_files.batch_check_available_count'),
                      t('auth_files.batch_check_detail_available_desc'),
                      results.filter((result) => result.available),
                      t('auth_files.batch_check_detail_scope_note')
                    )
                )}
                {renderMetric(
                  t('auth_files.batch_check_available_provider_count'),
                  formatNumber(response.summary.available_provider_count)
                )}
                {renderMetric(
                  t('auth_files.batch_check_enabled_count'),
                  formatNumber(aggregate.scope_overview.enabled_count),
                  undefined,
                  () =>
                    openResultListDetail(
                      t('auth_files.batch_check_enabled_count'),
                      t('auth_files.batch_check_detail_enabled_desc'),
                      results.filter((result) => !result.disabled),
                      t('auth_files.batch_check_detail_scope_note')
                    )
                )}
                {renderMetric(
                  t('auth_files.batch_check_disabled_count'),
                  formatNumber(aggregate.scope_overview.disabled_count),
                  undefined,
                  () =>
                    openDetailState({
                      title: t('auth_files.batch_check_disabled_count'),
                      description: t('auth_files.batch_check_detail_disabled_desc'),
                      note: t('auth_files.batch_check_detail_scope_note'),
                      groups: [
                        {
                          id: 'checked-disabled',
                          label: t('auth_files.batch_check_detail_checked_disabled'),
                          entries: createResultGroups(results.filter((result) => result.disabled))[0]?.entries ?? [],
                        },
                        {
                          id: 'skipped-disabled',
                          label: t('auth_files.batch_check_detail_skipped_disabled'),
                          entries: createSkippedGroups()
                            .find((group) => group.id === 'disabled')
                            ?.entries ?? [],
                        },
                      ].filter((group) => group.entries.length > 0),
                    })
                )}
                {renderMetric(
                  t('auth_files.batch_check_processed_count'),
                  formatNumber(aggregate.scope_overview.processed_count)
                )}
                {renderMetric(
                  t('auth_files.batch_check_skipped_count'),
                  formatNumber(aggregate.scope_overview.skipped_count),
                  undefined,
                  openSkippedDetail
                )}
              </div>
            </section>

            <section className={styles.batchCheckModalSection}>
              <div className={styles.batchCheckSectionTitleWrap}>
                <div className={styles.batchCheckSectionTitle}>
                  {t('auth_files.batch_check_modal_section_health')}
                </div>
                <div className={styles.batchCheckSectionDescription}>
                  {t('auth_files.batch_check_modal_section_health_desc')}
                </div>
              </div>
              <div className={styles.batchCheckHealthGrid}>
                {HEALTH_BUCKET_META.map((item) => {
                  const count = aggregate.health_buckets[item.key] ?? 0;
                  const percent = totalHealthCount > 0 ? (count / totalHealthCount) * 100 : 0;
                  const bucketLabel = resolveBucketLabel(item.key);
                  return (
                    <button
                      key={item.key}
                      type="button"
                      className={`${styles.batchCheckHealthCard} ${styles.batchCheckHealthCardButton}`}
                      onClick={() =>
                        openResultListDetail(
                          bucketLabel,
                          t('auth_files.batch_check_detail_health_bucket_desc', {
                            bucket: bucketLabel,
                          }),
                          results.filter((result) => result.bucket === item.key),
                          t('auth_files.batch_check_detail_scope_note')
                        )
                      }
                    >
                      <div className={styles.batchCheckHealthHeader}>
                        <span className={styles.batchCheckHealthLabel}>{bucketLabel}</span>
                        <span className={styles.batchCheckHealthRange}>{item.range}</span>
                      </div>
                      <strong className={styles.batchCheckHealthValue}>{formatNumber(count)}</strong>
                      <div className={styles.batchCheckHealthBarTrack}>
                        <span
                          className={styles.batchCheckHealthBarFill}
                          style={{ width: `${Math.max(0, Math.min(percent, 100))}%` }}
                        />
                      </div>
                      <div className={styles.batchCheckHealthHint}>{formatPercentValue(percent)}</div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className={styles.batchCheckModalSection}>
              <div className={styles.batchCheckSectionTitleWrap}>
                <div className={styles.batchCheckSectionTitle}>
                  {t('auth_files.batch_check_modal_section_risk')}
                </div>
                <div className={styles.batchCheckSectionDescription}>
                  {t('auth_files.batch_check_modal_section_risk_desc')}
                </div>
              </div>
              <div className={styles.batchCheckMetricGrid}>
                {renderMetric(
                  t('auth_files.batch_check_invalidated_count'),
                  formatNumber(aggregate.risk_overview.invalidated_401_count),
                  t('auth_files.batch_check_action_delete_invalidated_401_hint'),
                  () =>
                    openResultListDetail(
                      t('auth_files.batch_check_invalidated_count'),
                      t('auth_files.batch_check_detail_invalidated_desc'),
                      results.filter((result) => result.classification === 'invalidated_401'),
                      t('auth_files.batch_check_detail_scope_note')
                    )
                )}
                {renderMetric(
                  t('auth_files.batch_check_no_quota_count'),
                  formatNumber(aggregate.risk_overview.no_quota_count),
                  t('auth_files.batch_check_no_quota_hint'),
                  () =>
                    openResultListDetail(
                      t('auth_files.batch_check_no_quota_count'),
                      t('auth_files.batch_check_detail_no_quota_desc'),
                      results.filter((result) => result.classification === 'no_quota'),
                      t('auth_files.batch_check_detail_no_quota_note')
                    )
                )}
                {renderMetric(
                  t('auth_files.batch_check_api_error_count'),
                  formatNumber(aggregate.risk_overview.api_error_count),
                  undefined,
                  () =>
                    openResultListDetail(
                      t('auth_files.batch_check_api_error_count'),
                      t('auth_files.batch_check_detail_api_error_desc'),
                      results.filter((result) => result.classification === 'api_error'),
                      t('auth_files.batch_check_detail_scope_note'),
                      {
                        groupBy: (result) => {
                          const groupMeta = resolveDiagnosisGroupMeta(result, t, resolveClassificationLabel);
                          return {
                            key: groupMeta.key,
                            label: groupMeta.label,
                            note: groupMeta.note,
                          };
                        },
                      }
                    )
                )}
                {renderMetric(
                  t('auth_files.batch_check_request_failed_count'),
                  formatNumber(aggregate.risk_overview.request_failed_count),
                  undefined,
                  () =>
                    openResultListDetail(
                      t('auth_files.batch_check_request_failed_count'),
                      t('auth_files.batch_check_detail_request_failed_desc'),
                      results.filter((result) => result.classification === 'request_failed'),
                      t('auth_files.batch_check_detail_scope_note'),
                      {
                        groupBy: (result) => {
                          const groupMeta = resolveDiagnosisGroupMeta(result, t, resolveClassificationLabel);
                          return {
                            key: groupMeta.key,
                            label: groupMeta.label,
                            note: groupMeta.note,
                          };
                        },
                      }
                    )
                )}
                {renderMetric(
                  t('auth_files.batch_check_exhausted_count'),
                  formatNumber(aggregate.risk_overview.exhausted_count),
                  t('auth_files.batch_check_exhausted_hint'),
                  () =>
                    openResultListDetail(
                      t('auth_files.batch_check_exhausted_count'),
                      t('auth_files.batch_check_detail_exhausted_desc'),
                      results.filter(
                        (result) =>
                          typeof result.remaining_percent === 'number' &&
                          Number.isFinite(result.remaining_percent) &&
                          result.remaining_percent <= 0
                      ),
                      t('auth_files.batch_check_detail_exhausted_note')
                    )
                )}
                {renderMetric(
                  t('auth_files.batch_check_low_remaining_1_29'),
                  formatNumber(aggregate.risk_overview.low_remaining_1_29_count),
                  undefined,
                  () =>
                    openResultListDetail(
                      t('auth_files.batch_check_low_remaining_1_29'),
                      t('auth_files.batch_check_detail_low_1_29_desc'),
                      results.filter(
                        (result) =>
                          typeof result.remaining_percent === 'number' &&
                          result.remaining_percent >= 1 &&
                          result.remaining_percent <= 29
                      ),
                      t('auth_files.batch_check_detail_scope_note')
                    )
                )}
                {renderMetric(
                  t('auth_files.batch_check_low_remaining_1_49'),
                  formatNumber(aggregate.risk_overview.mid_low_remaining_1_49_count),
                  undefined,
                  () =>
                    openResultListDetail(
                      t('auth_files.batch_check_low_remaining_1_49'),
                      t('auth_files.batch_check_detail_low_1_49_desc'),
                      results.filter(
                        (result) =>
                          typeof result.remaining_percent === 'number' &&
                          result.remaining_percent >= 1 &&
                          result.remaining_percent <= 49
                      ),
                      t('auth_files.batch_check_detail_scope_note')
                    )
                )}
              </div>

              <div className={styles.batchCheckDetailGroup}>
                <div className={styles.batchCheckSectionTitle}>
                  {t('auth_files.batch_check_action_candidates')}
                </div>
                <div className={styles.batchCheckDistributionGrid}>
                  {renderDistributionCard(
                    t('auth_files.batch_check_action_delete_invalidated_401'),
                    formatNumber(aggregate.action_candidates.invalidated_401_names.length),
                    t('auth_files.batch_check_action_delete_invalidated_401_hint'),
                    () =>
                      openActionDetail(
                        t('auth_files.batch_check_action_delete_invalidated_401'),
                        t('auth_files.batch_check_detail_action_desc', {
                          action: t('auth_files.batch_check_action_delete_invalidated_401'),
                        }),
                        aggregate.action_candidates.invalidated_401_names,
                        t('auth_files.batch_check_detail_scope_note')
                      )
                  )}
                  {renderDistributionCard(
                    t('auth_files.batch_check_action_disable_exhausted'),
                    formatNumber(aggregate.action_candidates.disable_exhausted_names.length),
                    t('auth_files.batch_check_action_disable_exhausted_hint'),
                    () =>
                      openActionDetail(
                        t('auth_files.batch_check_action_disable_exhausted'),
                        t('auth_files.batch_check_detail_action_desc', {
                          action: t('auth_files.batch_check_action_disable_exhausted'),
                        }),
                        aggregate.action_candidates.disable_exhausted_names,
                        t('auth_files.batch_check_detail_disable_exhausted_note')
                      )
                  )}
                  {renderDistributionCard(
                    t('auth_files.batch_check_action_reenable_recovered'),
                    formatNumber(aggregate.action_candidates.reenable_names.length),
                    t('auth_files.batch_check_action_reenable_recovered_hint'),
                    () =>
                      openActionDetail(
                        t('auth_files.batch_check_action_reenable_recovered'),
                        t('auth_files.batch_check_detail_action_desc', {
                          action: t('auth_files.batch_check_action_reenable_recovered'),
                        }),
                        aggregate.action_candidates.reenable_names,
                        t('auth_files.batch_check_detail_reenable_note')
                      )
                  )}
                </div>
              </div>

              <div className={styles.batchCheckDetailGroup}>
                <div className={styles.batchCheckSectionTitle}>{t('auth_files.batch_check_diagnosis')}</div>
                {aggregate.diagnosis.length > 0 ? (
                  <div className={styles.batchCheckDiagnosisList}>
                    {aggregate.diagnosis.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        className={`${styles.batchCheckDiagnosisCard} ${styles.batchCheckDiagnosisButton}`}
                        onClick={() => openDiagnosisDetail(item.label, item.note)}
                      >
                        <div className={styles.batchCheckDiagnosisHeader}>
                          <span className={styles.batchCheckDiagnosisLabel}>{item.label}</span>
                          <span className={styles.batchCheckDiagnosisCount}>{formatNumber(item.count)}</span>
                        </div>
                        <div className={styles.batchCheckDiagnosisNote}>{item.note}</div>
                        {item.examples.length > 0 ? (
                          <div className={styles.batchCheckDiagnosisExamples}>
                            {t('auth_files.batch_check_diagnosis_examples', {
                              examples: item.examples.join('、'),
                            })}
                          </div>
                        ) : null}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className={styles.batchCheckInfoBanner}>
                    <span>{t('auth_files.batch_check_no_diagnosis')}</span>
                  </div>
                )}
              </div>
            </section>

            <section className={styles.batchCheckModalSection}>
              <div className={styles.batchCheckSectionTitleWrap}>
                <div className={styles.batchCheckSectionTitle}>
                  {t('auth_files.batch_check_modal_section_refresh')}
                </div>
                <div className={styles.batchCheckSectionDescription}>
                  {t('auth_files.batch_check_modal_section_refresh_desc')}
                </div>
              </div>
              <div className={styles.batchCheckMetricGrid}>
                {renderMetric(
                  t('auth_files.batch_check_next_refresh_at'),
                  formatOptionalDate(aggregate.refresh_overview.next_refresh_at)
                )}
                {renderMetric(
                  t('auth_files.batch_check_refresh_highlights'),
                  aggregate.refresh_overview.highlight_windows.length > 0
                    ? aggregate.refresh_overview.highlight_windows
                        .map((item) => `${item.label} ${item.count}`)
                        .join(' · ')
                    : t('common.not_set')
                )}
              </div>
              <div className={styles.batchCheckDistributionGrid}>
                <div className={styles.batchCheckDistributionCard}>
                  <div className={styles.batchCheckDistributionTitle}>
                    {t('auth_files.batch_check_refresh_distribution')}
                  </div>
                  {refreshDistribution.length > 0 ? (
                    <div className={styles.batchCheckDistributionList}>
                      {refreshDistribution.map(([label, count]) => (
                        <button
                          key={label}
                          type="button"
                          className={`${styles.batchCheckDistributionRow} ${styles.batchCheckDistributionRowButton}`}
                          onClick={() => openRefreshDetail(label)}
                        >
                          <span>{label}</span>
                          <strong>{formatNumber(count)}</strong>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.batchCheckDistributionEmpty}>
                      {t('auth_files.batch_check_distribution_empty')}
                    </div>
                  )}
                </div>

                <div className={styles.batchCheckDistributionCard}>
                  <div className={styles.batchCheckDistributionTitle}>
                    {t('auth_files.batch_check_plan_distribution')}
                  </div>
                  {planDistribution.length > 0 ? (
                    <div className={styles.batchCheckDistributionList}>
                      {planDistribution.map(([label, count]) => (
                        <div key={label} className={styles.batchCheckDistributionRow}>
                          <span>{label}</span>
                          <strong>{formatNumber(count)}</strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.batchCheckDistributionEmpty}>
                      {t('auth_files.batch_check_distribution_empty')}
                    </div>
                  )}
                </div>

                <div className={styles.batchCheckDistributionCard}>
                  <div className={styles.batchCheckDistributionTitle}>
                    {t('auth_files.batch_check_primary_cycle_distribution')}
                  </div>
                  {primaryCycleDistribution.length > 0 ? (
                    <div className={styles.batchCheckDistributionList}>
                      {primaryCycleDistribution.map(([label, count]) => (
                        <div key={label} className={styles.batchCheckDistributionRow}>
                          <span>{label}</span>
                          <strong>{formatNumber(count)}</strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.batchCheckDistributionEmpty}>
                      {t('auth_files.batch_check_distribution_empty')}
                    </div>
                  )}
                </div>

                <div className={styles.batchCheckDistributionCard}>
                  <div className={styles.batchCheckDistributionTitle}>
                    {t('auth_files.batch_check_secondary_cycle_distribution')}
                  </div>
                  {secondaryCycleDistribution.length > 0 ? (
                    <div className={styles.batchCheckDistributionList}>
                      {secondaryCycleDistribution.map(([label, count]) => (
                        <div key={label} className={styles.batchCheckDistributionRow}>
                          <span>{label}</span>
                          <strong>{formatNumber(count)}</strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.batchCheckDistributionEmpty}>
                      {t('auth_files.batch_check_distribution_empty')}
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(detailState)}
        onClose={() => {
          setDetailState(null);
          setDetailPageByGroup({});
        }}
        width={860}
        className={styles.batchCheckModal}
        title={detailState?.title}
        footer={
          <Button
            variant="secondary"
            onClick={() => {
              setDetailState(null);
              setDetailPageByGroup({});
            }}
          >
            {t('common.close')}
          </Button>
        }
      >
        {!detailState ? null : detailState.groups.length === 0 ? (
          <EmptyState
            title={t('auth_files.batch_check_distribution_empty')}
            description={t('auth_files.batch_check_detail_empty')}
          />
        ) : (
          <div className={styles.batchCheckModalContent}>
            <div className={styles.batchCheckInfoBanner}>
              {detailState.description ? <strong>{detailState.description}</strong> : null}
              {detailState.note ? <span>{detailState.note}</span> : null}
            </div>

            {detailState.groups.map((group) => (
              (() => {
                const currentPage = detailPageByGroup[group.id] ?? 1;
                const totalPages = Math.max(1, Math.ceil(group.entries.length / DETAIL_PAGE_SIZE));
                const safePage = Math.min(Math.max(1, currentPage), totalPages);
                const startIndex = (safePage - 1) * DETAIL_PAGE_SIZE;
                const visibleEntries = group.entries.slice(startIndex, startIndex + DETAIL_PAGE_SIZE);

                return (
                  <section key={group.id} className={styles.batchCheckDetailModalGroup}>
                    <div className={styles.batchCheckDetailModalHeader}>
                      <div>
                        <div className={styles.batchCheckSectionTitle}>{group.label}</div>
                        {group.note ? (
                          <div className={styles.batchCheckSectionDescription}>{group.note}</div>
                        ) : null}
                      </div>
                      <div className={styles.batchCheckDetailModalCount}>
                        {t('auth_files.batch_check_detail_hits', { count: group.entries.length })}
                      </div>
                    </div>

                    <div className={styles.batchCheckDetailEntryList}>
                      {visibleEntries.map((entry) => (
                        <article key={entry.id} className={styles.batchCheckDetailEntry}>
                          <div className={styles.batchCheckDetailEntryHeader}>
                            <div className={styles.batchCheckDetailEntryTitleWrap}>
                              <div className={styles.batchCheckDetailEntryName}>{entry.name}</div>
                              {entry.subtitle ? (
                                <div className={styles.batchCheckDetailEntrySubtitle}>{entry.subtitle}</div>
                              ) : null}
                            </div>
                          </div>

                          {entry.facts.length > 0 ? (
                            <div className={styles.batchCheckDetailFacts}>
                              {entry.facts.map((fact) => (
                                <div key={`${entry.id}:${fact.label}`} className={styles.batchCheckDetailFact}>
                                  <span className={styles.batchCheckMetricLabel}>{fact.label}</span>
                                  <strong className={styles.batchCheckMetricValue}>{fact.value}</strong>
                                </div>
                              ))}
                            </div>
                          ) : null}

                          {entry.note ? (
                            <div className={styles.batchCheckDetailEntryNote}>
                              <strong>{t('auth_files.batch_check_detail_note_label')}：</strong>
                              <span>{entry.note}</span>
                            </div>
                          ) : null}

                          {entry.error ? (
                            <div className={styles.batchCheckDetailEntryError}>
                              <strong>{t('auth_files.batch_check_detail_error_label')}：</strong>
                              <span>{entry.error}</span>
                            </div>
                          ) : null}
                        </article>
                      ))}
                    </div>

                    {totalPages > 1 ? (
                      <div className={styles.pagination}>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            setDetailPageByGroup((current) => ({
                              ...current,
                              [group.id]: Math.max(1, safePage - 1),
                            }))
                          }
                          disabled={safePage <= 1}
                        >
                          {t('auth_files.pagination_prev')}
                        </Button>
                        <div className={styles.pageInfo}>
                          {t('auth_files.pagination_info', {
                            current: safePage,
                            total: totalPages,
                            count: group.entries.length,
                          })}
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            setDetailPageByGroup((current) => ({
                              ...current,
                              [group.id]: Math.min(totalPages, safePage + 1),
                            }))
                          }
                          disabled={safePage >= totalPages}
                        >
                          {t('auth_files.pagination_next')}
                        </Button>
                      </div>
                    ) : null}
                  </section>
                );
              })()
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}
