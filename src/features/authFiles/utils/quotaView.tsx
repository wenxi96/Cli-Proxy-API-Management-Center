import type { TFunction } from 'i18next';
import type {
  AntigravityQuotaState,
  AuthFileBatchCheckDetails,
  AuthFileBatchCheckResult,
  AuthFileBatchCheckWindow,
  ClaudeQuotaState,
  CodexQuotaState,
  KimiQuotaState,
  XaiQuotaState,
} from '@/types';
import { formatDateTime, formatDateTimeValue, formatNumber } from '@/utils/format';
import {
  formatKimiResetHint,
  formatQuotaResetTime,
  formatShanghaiDateTime,
  normalizePlanType,
} from '@/utils/quota';
import { CLAUDE_USAGE_WINDOW_KEYS } from '@/utils/quota/constants';
import {
  ANTIGRAVITY_BUCKET_LABEL_KEYS,
  ANTIGRAVITY_GROUP_LABEL_KEYS,
  CODEX_MAX_MONTH_SECONDS,
  CODEX_MIN_MONTH_SECONDS,
  CODEX_WINDOW_META,
  PREMIUM_CODEX_PLAN_TYPES,
  formatAntigravityResetLabel,
  formatUsdFromCents,
  formatXaiRemainingAmount,
  getAntigravityPlanLabel,
  resolveXaiPlan,
  translateAntigravityQuotaDescription,
  translateAntigravityQuotaLabel,
} from '@/components/quota/quotaConfigs';
import type { QuotaProviderType } from '@/features/authFiles/constants';

//region 归一化视图模型
//
// leaf/group 分型：从类型层面杜绝 antigravity group header 行被渲染出
// null → 0 宽度进度条（QuotaProgressBar 在 percent 为 null 时仍渲染容器）。
// B 路径（batchResultToQuotaView）永远只产出 leaf 行；group 行只由 A 路径 antigravity 触发。

export type NormalizedQuotaLeafRow = {
  kind: 'leaf';
  key: string;
  label: string;
  percent: number | null;
  percentLabel: string;
  amountLabel?: string;
  resetLabel?: string;
  /** tooltip 语义（B 路径既有，antigravity bucket description 用此）。 */
  title?: string;
};

export type NormalizedQuotaGroupRow = {
  kind: 'group';
  key: string;
  label: string;
  /** 可见副标题（antigravity group description 用此，不可塞进 title tooltip）。 */
  description?: string;
  /** 一层嵌套即可（antigravity group → bucket）；不可多层。 */
  nested: NormalizedQuotaLeafRow[];
};

export type NormalizedQuotaRow = NormalizedQuotaLeafRow | NormalizedQuotaGroupRow;

export type NormalizedQuotaPlanItem = {
  key: string;
  label: string;
  value: string;
  premium?: boolean;
};

export type NormalizedQuotaResetCredits = {
  title: string;
  items: { key: string; label: string; time: string }[];
  error?: string;
};

export type NormalizedQuotaView = {
  plan?: { items: NormalizedQuotaPlanItem[] };
  rows: NormalizedQuotaRow[];
  /** codex reset credits 过期列表（结构化，由 QuotaRowsView 用 CSS Modules 渲染）。 */
  resetCredits?: NormalizedQuotaResetCredits;
  /** provider 特有空态文案；rows 为空时渲染。 */
  empty?: string;
};
//endregion

//region B 路径私有辅助（自 AuthFileBatchQuotaSection 迁入，行为不变）

const DETAIL_WINDOW_KEYS = ['windows', 'buckets', 'rows', 'groups'] as const;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const clampPercent = (value: number): number => Math.max(0, Math.min(100, value));

const isCodexMonthlyWindow = (window: AuthFileBatchCheckWindow): boolean =>
  isFiniteNumber(window.limit_window_seconds) &&
  window.limit_window_seconds >= CODEX_MIN_MONTH_SECONDS &&
  window.limit_window_seconds <= CODEX_MAX_MONTH_SECONDS;

/** 百分比小数算法（B 路径既有）：整数无小数，≥10 取 1 位，<10 取 2 位。 */
export const formatPercentValue = (value: number | null): string => {
  if (value === null) return '--';
  const normalized = clampPercent(value);
  if (Number.isInteger(normalized)) return `${normalized}%`;
  if (Math.abs(normalized) >= 10) return `${normalized.toFixed(1)}%`;
  return `${normalized.toFixed(2)}%`;
};

const formatDurationSeconds = (seconds: number): string => {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${totalSeconds}s`;
};

const collectBatchQuotaWindows = (
  details?: AuthFileBatchCheckDetails
): AuthFileBatchCheckWindow[] => {
  if (!details) return [];

  const seen = new Set<string>();
  const windows: AuthFileBatchCheckWindow[] = [];

  DETAIL_WINDOW_KEYS.forEach((key) => {
    const entries = details[key];
    if (!Array.isArray(entries)) return;

    entries.forEach((entry, index) => {
      if (!entry || typeof entry !== 'object') return;
      const window = entry as AuthFileBatchCheckWindow;
      const dedupeKey = [
        key,
        window.id,
        window.label,
        window.token_type,
        window.model_ids?.join(','),
        index,
      ].join(':');
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      windows.push(window);
    });
  });

  return windows;
};

const resolveWindowPercent = (window: AuthFileBatchCheckWindow): number | null => {
  if (isFiniteNumber(window.remaining_percent)) return clampPercent(window.remaining_percent);
  if (isFiniteNumber(window.used_percent)) return clampPercent(100 - window.used_percent);
  return null;
};

/**
 * B 路径 labelKey 映射：根据 provider + window.id 查 A 路径已建的映射表，
 * 命中则返回翻译后的 label（与单文件刷新一致），未命中返回 undefined（走回退链）。
 */
const resolveBatchWindowLabel = (
  provider: string,
  window: AuthFileBatchCheckWindow,
  t: TFunction
): string | undefined => {
  const id = String(window.id ?? '').trim();
  if (!id) return undefined;

  if (provider === 'codex') {
    if (id === CODEX_WINDOW_META.codeWeekly.id && isCodexMonthlyWindow(window)) {
      return t(CODEX_WINDOW_META.codeMonthly.labelKey);
    }
    if (id === CODEX_WINDOW_META.codeReviewWeekly.id && isCodexMonthlyWindow(window)) {
      return t(CODEX_WINDOW_META.codeReviewMonthly.labelKey);
    }
    const meta = Object.values(CODEX_WINDOW_META).find((item) => item.id === id);
    if (meta) return t(meta.labelKey);
  } else if (provider === 'claude') {
    const entry = CLAUDE_USAGE_WINDOW_KEYS.find((item) => item.id === id);
    if (entry) return t(entry.labelKey);
  }
  // antigravity/kimi/xai 的 B 路径 id 待后续 HAR 验证后端 id 是否匹配，暂透传。
  return undefined;
};

const resolveWindowLabel = (
  provider: string,
  window: AuthFileBatchCheckWindow,
  index: number,
  fallbackLabel: string,
  t: TFunction
): string => {
  const mapped = resolveBatchWindowLabel(provider, window, t);
  if (mapped) return mapped;

  const label = String(window.label ?? '').trim();
  if (label) return label;

  const modelIds = Array.isArray(window.model_ids)
    ? window.model_ids.map((item) => String(item).trim()).filter(Boolean)
    : [];
  if (modelIds.length > 0) {
    return modelIds.slice(0, 3).join(', ');
  }

  const tokenType = String(window.token_type ?? '').trim();
  if (tokenType) return tokenType;

  const id = String(window.id ?? '').trim();
  if (id) return id;

  return `${fallbackLabel} ${index + 1}`;
};

const resolveAmountLabel = (window: AuthFileBatchCheckWindow): string | undefined => {
  if (isFiniteNumber(window.remaining_amount) && isFiniteNumber(window.limit)) {
    return `${formatNumber(window.remaining_amount)} / ${formatNumber(window.limit)}`;
  }

  if (isFiniteNumber(window.used) && isFiniteNumber(window.limit)) {
    return `${formatNumber(window.used)} / ${formatNumber(window.limit)}`;
  }

  if (isFiniteNumber(window.remaining_amount)) {
    return formatNumber(window.remaining_amount);
  }

  if (isFiniteNumber(window.limit)) {
    return formatNumber(window.limit);
  }

  return undefined;
};

const resolveResetLabel = (window: AuthFileBatchCheckWindow): string | undefined => {
  const resetHint = String(window.reset_hint ?? '').trim();
  if (resetHint) return resetHint;

  const resetTime = String(window.reset_time ?? '').trim();
  if (resetTime) {
    const formatted = formatDateTime(resetTime);
    return formatted || resetTime;
  }

  if (isFiniteNumber(window.reset_at) && window.reset_at > 0) {
    const resetAtMs =
      window.reset_at > 1_000_000_000_000 ? window.reset_at : window.reset_at * 1000;
    const formatted = formatDateTime(new Date(resetAtMs));
    if (formatted) return formatted;
  }

  if (isFiniteNumber(window.reset_after_seconds) && window.reset_after_seconds > 0) {
    return formatDurationSeconds(window.reset_after_seconds);
  }

  return undefined;
};

const buildBatchQuotaRows = (
  result: AuthFileBatchCheckResult,
  fallbackLabel: string,
  t: TFunction
): NormalizedQuotaLeafRow[] => {
  const windows = collectBatchQuotaWindows(result.details);

  if (windows.length === 0) {
    if (!isFiniteNumber(result.remaining_percent)) return [];
    const percent = clampPercent(result.remaining_percent);
    return [
      {
        kind: 'leaf',
        key: 'summary',
        label: fallbackLabel,
        percent,
        percentLabel: formatPercentValue(percent),
      },
    ];
  }

  return windows.map((window, index) => {
    const percent = resolveWindowPercent(window);
    const label = resolveWindowLabel(result.provider, window, index, fallbackLabel, t);
    const modelIds = Array.isArray(window.model_ids)
      ? window.model_ids.map((item) => String(item).trim()).filter(Boolean)
      : [];

    return {
      kind: 'leaf' as const,
      key: `${window.id || label || 'window'}:${index}`,
      label,
      percent,
      percentLabel: formatPercentValue(percent),
      amountLabel: resolveAmountLabel(window),
      resetLabel: resolveResetLabel(window),
      title: modelIds.length > 0 ? modelIds.join(', ') : undefined,
    };
  });
};
//endregion

//region B 路径 adapter（导出，供 AuthFileBatchQuotaSection 复用）
//
// 输出与原 buildBatchQuotaRows + plan 区 + credit_balance 处理完全等价；
// B 路径 rows 永远只含 leaf 行（无 group/nested）。

const buildBatchQuotaPlan = (
  result: AuthFileBatchCheckResult,
  t: TFunction
): NormalizedQuotaPlanItem[] | undefined => {
  const planType = String(result.details?.plan_type ?? '').trim();
  const creditBalance = result.details?.credit_balance;
  const isCodex = result.provider === 'codex';

  const items: NormalizedQuotaPlanItem[] = [];
  if (isCodex) {
    const planLabel = getCodexPlanLabel(planType || null, t);
    const normalizedPlan = normalizePlanType(planType);
    const expiryLabel = result.details?.subscription_active_until
      ? formatDateTimeValue(result.details.subscription_active_until)
      : '';
    const resetCreditsAvailableCount =
      result.details?.rate_limit_reset_credits_available_count ?? null;

    if (planLabel) {
      items.push({
        key: 'plan-type',
        label: t('codex_quota.plan_label'),
        value: planLabel,
        premium: PREMIUM_CODEX_PLAN_TYPES.has(normalizedPlan ?? ''),
      });
    }
    if (expiryLabel) {
      items.push({
        key: 'subscription-expiry',
        label: t('codex_quota.expires_label'),
        value: expiryLabel,
      });
    }
    if (resetCreditsAvailableCount !== null) {
      items.push({
        key: 'reset-credits',
        label: t('codex_quota.reset_credits_label'),
        value: resetCreditsAvailableCount.toString(),
      });
    }
  } else if (planType) {
    items.push({
      key: 'plan_type',
      label: t('auth_files.batch_check_plan_type'),
      value: planType,
    });
  }
  if (isFiniteNumber(creditBalance)) {
    items.push({
      key: 'credit_balance',
      label: t('auth_files.batch_check_credit_balance'),
      value: formatNumber(creditBalance),
    });
  }
  return items.length > 0 ? items : undefined;
};

const buildBatchCodexResetCredits = (
  result: AuthFileBatchCheckResult,
  t: TFunction
): NormalizedQuotaResetCredits | undefined => {
  if (result.provider !== 'codex') return undefined;

  const credits = result.details?.rate_limit_reset_credits ?? [];
  const error = String(result.details?.rate_limit_reset_credits_error ?? '').trim();

  if (credits.length > 0) {
    return {
      title: t('codex_quota.reset_credits_expiry_label'),
      items: credits.map((credit, index) => ({
        key: credit.id || `${credit.expiresAt}-${index}`,
        label: t('codex_quota.reset_credit_number', { index: index + 1 }),
        time: formatShanghaiDateTime(credit.expiresAt) || credit.expiresAt,
      })),
    };
  }

  if (error) {
    return {
      title: t('codex_quota.reset_credits_expiry_label'),
      items: [],
      error: t('codex_quota.reset_credits_expiry_failed', { message: error }),
    };
  }

  return undefined;
};

export const batchResultToQuotaView = (
  result: AuthFileBatchCheckResult,
  t: TFunction
): NormalizedQuotaView => {
  const fallbackLabel = t('auth_files.batch_check_remaining_percent');
  const planItems = buildBatchQuotaPlan(result, t);

  return {
    plan: planItems ? { items: planItems } : undefined,
    rows: buildBatchQuotaRows(result, fallbackLabel, t),
    resetCredits: buildBatchCodexResetCredits(result, t),
    empty: t('common.not_set'),
  };
};
//endregion

//region A 路径 provider adapter（success 状态；百分比统一用 formatPercentValue 小数；特有文案保留）
//
// 注：codex/claude/kimi/xai 的纯百分比统一为 formatPercentValue 小数（对齐 B）；
// antigravity 的 percentLabel 是 provider 特有文案（remaining_percent/quota_available），保留原样。

function getCodexPlanLabel(planType: string | null, t: TFunction): string | null {
  // 复刻 quotaConfigs.ts renderCodexItems 内局部 getPlanLabel 逻辑。
  const normalized = normalizePlanType(planType);
  if (!normalized) return null;
  if (normalized === 'pro') return t('codex_quota.plan_pro');
  if (PREMIUM_CODEX_PLAN_TYPES.has(normalized) && normalized !== 'pro') {
    return t('codex_quota.plan_prolite');
  }
  if (normalized === 'plus') return t('codex_quota.plan_plus');
  if (normalized === 'team') return t('codex_quota.plan_team');
  if (normalized === 'free') return t('codex_quota.plan_free');
  return planType || normalized;
}

const codexStateToQuotaView = (quota: CodexQuotaState, t: TFunction): NormalizedQuotaView => {
  const windows = quota.windows ?? [];
  const planType = quota.planType ?? null;
  const subscriptionActiveUntil = quota.subscriptionActiveUntil ?? null;
  const rateLimitResetCreditsAvailableCount = quota.rateLimitResetCreditsAvailableCount ?? null;
  const rateLimitResetCredits = quota.rateLimitResetCredits ?? [];
  const rateLimitResetCreditsError = quota.rateLimitResetCreditsError ?? '';

  const planLabel = getCodexPlanLabel(planType, t);
  const isPremiumPlan = PREMIUM_CODEX_PLAN_TYPES.has(normalizePlanType(planType) ?? '');
  const expiryLabel = subscriptionActiveUntil ? formatDateTimeValue(subscriptionActiveUntil) : '';

  // plan.items（对齐 quotaConfigs.ts:924-958）
  const planItems: NormalizedQuotaPlanItem[] = [];
  if (planLabel) {
    planItems.push({
      key: 'plan-type',
      label: t('codex_quota.plan_label'),
      value: planLabel,
      premium: isPremiumPlan,
    });
  }
  if (expiryLabel) {
    planItems.push({ key: 'subscription-expiry', label: t('codex_quota.expires_label'), value: expiryLabel });
  }
  if (rateLimitResetCreditsAvailableCount !== null) {
    planItems.push({
      key: 'reset-credits',
      label: t('codex_quota.reset_credits_label'),
      value: rateLimitResetCreditsAvailableCount.toString(),
    });
  }

  // resetCredits: 过期列表（结构化，由 QuotaRowsView 用 CSS Modules 渲染；复刻 quotaConfigs.ts:963-1004 语义）
  let resetCredits: NormalizedQuotaResetCredits | undefined;
  if (rateLimitResetCredits.length > 0) {
    resetCredits = {
      title: t('codex_quota.reset_credits_expiry_label'),
      items: rateLimitResetCredits.map((credit, index) => ({
        key: credit.id || `${credit.expiresAt}-${index}`,
        label: t('codex_quota.reset_credit_number', { index: index + 1 }),
        time: formatShanghaiDateTime(credit.expiresAt) || credit.expiresAt,
      })),
    };
  } else if (rateLimitResetCreditsError) {
    resetCredits = {
      title: t('codex_quota.reset_credits_expiry_label'),
      items: [],
      error: t('codex_quota.reset_credits_expiry_failed', { message: rateLimitResetCreditsError }),
    };
  }

  // rows: windows → leaf（percent 用小数，无 amount，对齐 quotaConfigs.ts:1013-1042 但百分比小数化）
  const rows: NormalizedQuotaRow[] = windows.map((window) => {
    const used = window.usedPercent;
    const remaining =
      used === null ? null : Math.max(0, Math.min(100, 100 - Math.max(0, Math.min(100, used))));
    const windowLabel = window.labelKey
      ? t(window.labelKey, (window.labelParams ?? {}) as Record<string, string | number>)
      : window.label;
    return {
      kind: 'leaf',
      key: window.id,
      label: windowLabel,
      percent: remaining,
      percentLabel: formatPercentValue(remaining),
      resetLabel: window.resetLabel,
    };
  });

  return {
    plan: planItems.length > 0 ? { items: planItems } : undefined,
    rows,
    resetCredits,
    empty: rows.length === 0 ? t('codex_quota.empty_windows') : undefined,
  };
};

const claudeStateToQuotaView = (quota: ClaudeQuotaState, t: TFunction): NormalizedQuotaView => {
  const windows = quota.windows ?? [];
  const planType = quota.planType ?? null;
  const extraUsage = quota.extraUsage;

  // plan.items: plan_type + extra_usage（仅 $used/$limit，无百分比；容器合并为单 plan，预期视觉近似）
  const planItems: NormalizedQuotaPlanItem[] = [];
  if (planType) {
    planItems.push({
      key: 'plan',
      label: t('claude_quota.plan_label'),
      value: t(`claude_quota.${planType}`),
    });
  }
  if (extraUsage && extraUsage.is_enabled) {
    const usedLabel = `$${(extraUsage.used_credits / 100).toFixed(2)} / $${(extraUsage.monthly_limit / 100).toFixed(2)}`;
    planItems.push({ key: 'extra', label: t('claude_quota.extra_usage_label'), value: usedLabel });
  }

  const rows: NormalizedQuotaRow[] = windows.map((window) => {
    const used = window.usedPercent;
    const remaining =
      used === null ? null : Math.max(0, Math.min(100, 100 - Math.max(0, Math.min(100, used))));
    const windowLabel = window.labelKey ? t(window.labelKey) : window.label;
    return {
      kind: 'leaf',
      key: window.id,
      label: windowLabel,
      percent: remaining,
      percentLabel: formatPercentValue(remaining),
      resetLabel: window.resetLabel,
    };
  });

  return {
    plan: planItems.length > 0 ? { items: planItems } : undefined,
    rows,
    empty: rows.length === 0 ? t('claude_quota.empty_windows') : undefined,
  };
};

const antigravityStateToQuotaView = (
  quota: AntigravityQuotaState,
  t: TFunction
): NormalizedQuotaView => {
  const groups = quota.groups ?? [];
  const nowMs = Date.now() + (quota.serverTimeOffsetMs ?? 0);

  // plan.items: plan_label（ultra/ultra-lite premium）
  const planLabel = getAntigravityPlanLabel(quota.subscription, t);
  const normalizedPlan = quota.subscription?.plan?.toLowerCase() ?? '';
  const isPremiumPlan = normalizedPlan === 'ultra' || normalizedPlan === 'ultra-lite';
  const planItems: NormalizedQuotaPlanItem[] = [];
  if (planLabel) {
    planItems.push({
      key: 'plan',
      label: t('antigravity_quota.plan_label'),
      value: planLabel,
      premium: isPremiumPlan,
    });
  }

  // groups → 顶层 group rows（仅 label + description，不设 percent/amount/reset）；
  // buckets → nested leaf rows（title=description tooltip；percentLabel 保留 provider 特有文案）
  const rows: NormalizedQuotaRow[] = groups.map((group) => {
    const groupLabel = translateAntigravityQuotaLabel(group.label, ANTIGRAVITY_GROUP_LABEL_KEYS, t);
    const groupDescription = translateAntigravityQuotaDescription(group.description, t);

    const nested: NormalizedQuotaLeafRow[] = group.buckets.map((bucket) => {
      const clamped = Math.max(0, Math.min(1, bucket.remainingFraction));
      const percent = clamped * 100;
      const percentLabel =
        bucket.remainingFraction === 1
          ? t('antigravity_quota.quota_available')
          : t('antigravity_quota.remaining_percent', { percent: Math.round(percent) });
      const resetLabel = formatAntigravityResetLabel(bucket.resetTime, t, nowMs);
      const bucketLabel = translateAntigravityQuotaLabel(
        bucket.label,
        ANTIGRAVITY_BUCKET_LABEL_KEYS,
        t
      );
      const bucketDescription = translateAntigravityQuotaDescription(bucket.description, t);

      return {
        kind: 'leaf',
        key: bucket.id,
        label: bucketLabel,
        percent,
        percentLabel,
        resetLabel,
        title: bucketDescription,
      };
    });

    return {
      kind: 'group',
      key: group.id,
      label: groupLabel,
      description: groupDescription,
      nested,
    };
  });

  return {
    plan: planItems.length > 0 ? { items: planItems } : undefined,
    rows,
    empty: rows.length === 0 ? t('antigravity_quota.empty_models') : undefined,
  };
};

const kimiStateToQuotaView = (quota: KimiQuotaState, t: TFunction): NormalizedQuotaView => {
  const rowsInput = quota.rows ?? [];

  const rows: NormalizedQuotaRow[] = rowsInput.map((row) => {
    const limit = row.limit;
    const used = row.used;
    const remaining =
      limit > 0
        ? Math.max(0, Math.min(100, ((limit - used) / limit) * 100))
        : used > 0
          ? 0
          : null;
    const rowLabel = row.labelKey
      ? t(row.labelKey, (row.labelParams ?? {}) as Record<string, string | number>)
      : (row.label ?? '');
    const resetLabel = formatKimiResetHint(t, row.resetHint);
    return {
      kind: 'leaf',
      key: row.id,
      label: rowLabel,
      percent: remaining,
      percentLabel: formatPercentValue(remaining),
      amountLabel: limit > 0 ? `${used} / ${limit}` : undefined,
      resetLabel: resetLabel || undefined,
    };
  });

  return {
    plan: undefined,
    rows,
    empty: rows.length === 0 ? t('kimi_quota.empty_data') : undefined,
  };
};

const xaiStateToQuotaView = (quota: XaiQuotaState, t: TFunction): NormalizedQuotaView => {
  const billing = quota.billing;
  if (!billing) {
    return { rows: [], empty: t('xai_quota.empty_data') };
  }

  const clampedUsed =
    billing.usedPercent === null ? null : Math.max(0, Math.min(100, billing.usedPercent));
  const remaining =
    clampedUsed === null ? null : Math.max(0, Math.min(100, 100 - clampedUsed));
  const amountLabel = formatXaiRemainingAmount(billing);
  const resetLabel = formatQuotaResetTime(billing.billingPeriodEnd);
  const onDemandCap = billing.onDemandCapCents ?? 0;
  const plan = resolveXaiPlan(billing.monthlyLimitCents);
  const payAsYouGoLabel =
    onDemandCap > 0
      ? t('xai_quota.pay_as_you_go_enabled', { cap: formatUsdFromCents(onDemandCap) })
      : t('xai_quota.pay_as_you_go_disabled');

  // plan.items: plan（supergrok heavy premium）+ pay-as-you-go（完整本地化标签）
  const planItems: NormalizedQuotaPlanItem[] = [];
  if (plan) {
    planItems.push({
      key: 'plan',
      label: t('xai_quota.plan_label'),
      value: t(`xai_quota.${plan.labelKey}`),
      premium: plan.premium,
    });
  }
  planItems.push({
    key: 'pay-as-you-go',
    label: t('xai_quota.pay_as_you_go_label'),
    value: payAsYouGoLabel,
  });

  // rows: 单行 monthly credits
  const rows: NormalizedQuotaRow[] = [
    {
      kind: 'leaf',
      key: 'monthly-credits',
      label: t('xai_quota.monthly_credits'),
      percent: remaining,
      percentLabel: formatPercentValue(remaining),
      amountLabel,
      resetLabel,
    },
  ];

  return {
    plan: planItems.length > 0 ? { items: planItems } : undefined,
    rows,
    empty: undefined,
  };
};

/** A 路径入口：按 quotaType 分派到 5 个子 adapter（仅处理 success 状态的数据）。 */
export function providerStateToQuotaView(
  quotaType: QuotaProviderType,
  quota: unknown,
  t: TFunction
): NormalizedQuotaView {
  switch (quotaType) {
    case 'codex':
      return codexStateToQuotaView(quota as CodexQuotaState, t);
    case 'claude':
      return claudeStateToQuotaView(quota as ClaudeQuotaState, t);
    case 'antigravity':
      return antigravityStateToQuotaView(quota as AntigravityQuotaState, t);
    case 'kimi':
      return kimiStateToQuotaView(quota as KimiQuotaState, t);
    case 'xai':
      return xaiStateToQuotaView(quota as XaiQuotaState, t);
    default: {
      const exhaustive: never = quotaType;
      throw new Error(`Unsupported quota type: ${exhaustive}`);
    }
  }
}
//endregion
