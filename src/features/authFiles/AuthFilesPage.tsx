import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useInterval } from '@/hooks/useInterval';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useRevealOnScroll } from '@/hooks/motion';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { copyToClipboard } from '@/utils/clipboard';
import {
  QUOTA_PROVIDER_TYPES,
  clampCardPageSize,
  getTypeLabel,
  isProblemAuthFile,
  isRuntimeOnlyAuthFile,
  normalizeProviderKey,
  type QuotaProviderType,
  type ResolvedTheme,
} from '@/features/authFiles/constants';
import { AuthFileCard } from '@/features/authFiles/components/AuthFileCard';
import { AuthFileDetailsSheet } from '@/features/authFiles/components/AuthFileDetailsSheet';
import { AuthFileModelsModal } from '@/features/authFiles/components/AuthFileModelsModal';
import { AuthFilesBatchCheckModal } from '@/features/authFiles/components/AuthFilesBatchCheckModal';
import { AuthFilesToolbar } from '@/features/authFiles/components/AuthFilesToolbar';
import { BatchActionBar } from '@/features/authFiles/components/BatchActionBar';
import { OAuthExcludedCard } from '@/features/authFiles/components/OAuthExcludedCard';
import { OAuthModelAliasCard } from '@/features/authFiles/components/OAuthModelAliasCard';
import { ProviderTabs } from '@/features/authFiles/components/ProviderTabs';
import { ReenableTieredModal } from '@/features/authFiles/components/ReenableTieredModal';
import { VaultHeader } from '@/features/authFiles/components/VaultHeader';
import { VaultPulse } from '@/features/authFiles/components/VaultPulse';
import { invalidateAuthFileDerivedCaches } from '@/features/authFiles/cacheInvalidation';
import {
  buildWildcardSearch,
  matchesAuthFileSearch,
  sortAuthFiles,
} from '@/features/authFiles/logic';
import { useAuthFilesData } from '@/features/authFiles/hooks/useAuthFilesData';
import {
  buildBatchCheckLiveResponse,
  useAuthFilesBatchCheck,
} from '@/features/authFiles/hooks/useAuthFilesBatchCheck';
import { useAuthFilesModels } from '@/features/authFiles/hooks/useAuthFilesModels';
import { useAuthFilesOauth } from '@/features/authFiles/hooks/useAuthFilesOauth';
import { useAuthFilesPrefixProxyEditor } from '@/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';
import { useAuthFilesStatusBarCache } from '@/features/authFiles/hooks/useAuthFilesStatusBarCache';
import {
  isAuthFilesStatusFilterMode,
  isAuthFilesSortMode,
  readAuthFilesUiState,
  readPersistedAuthFilesCompactMode,
  writeAuthFilesUiState,
  writePersistedAuthFilesCompactMode,
  type AuthFilesStatusFilterMode,
  type AuthFilesSortMode,
} from '@/features/authFiles/uiState';
import { useAuthStore, useConfigStore, useNotificationStore, useThemeStore } from '@/stores';
import type { AuthFileBatchCheckAggregate, AuthFileBatchCheckSummary } from '@/types';
import { getScopedPoolReasonKey, getScopedPoolStateKey } from '@/utils/scopedPool';
import legacyStyles from '@/pages/AuthFilesPage.module.scss';
import styles from './AuthFilesPage.module.scss';

const DEFAULT_REGULAR_PAGE_SIZE = 9;
const DEFAULT_COMPACT_PAGE_SIZE = 12;
const SKELETON_CARD_COUNT = 6;
/** 首屏卡片级联入场总预算，与 useRevealGroup 同一 360ms 语汇。 */
const CARD_ENTRANCE_BUDGET_MS = 360;
const MIN_BATCH_CHECK_CONCURRENCY = 1;
const MAX_BATCH_CHECK_CONCURRENCY = 12;
const DEFAULT_BATCH_CHECK_CONCURRENCY = 6;
const EMPTY_BATCH_CHECK_SUMMARY: AuthFileBatchCheckSummary = {
  checked_count: 0,
  available_count: 0,
  available_provider_count: 0,
  skipped_count: 0,
  classification_counts: {},
  bucket_counts: {},
};
const EMPTY_BATCH_CHECK_AGGREGATE: AuthFileBatchCheckAggregate = {
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
  health_buckets: {},
  scope_overview: { total_count: 0, enabled_count: 0, disabled_count: 0, processed_count: 0, skipped_count: 0 },
  refresh_overview: { highlight_windows: [], refresh_window_counts: {} },
  plan_distribution: { plan_type_counts: {}, primary_cycle_counts: {}, secondary_cycle_counts: {} },
  diagnosis: [],
  action_candidates: {
    invalidated_401_names: [],
    disable_exhausted_names: [],
    reenable_names: [],
    reenable_threshold_bucket: 'danger',
  },
};
type BatchCheckScope = 'selected' | 'page' | 'filtered';
type BatchCheckDirectAction = 'delete_invalidated_401' | 'disable_exhausted' | 'reenable_recovered';
type ScopedPoolState = 'in_pool' | 'standby' | 'penalized' | 'ejected' | 'disabled' | 'configured';
type ScopedPoolEntry = {
  name: string;
  providerLabel: string;
  state: ScopedPoolState;
  reasonLabel: string;
  remainingPercent?: number;
  lastQuotaCheckedAt?: string;
};
type ScopedPoolSummary = {
  totalFileCount: number;
  managedCount: number;
  activeCount: number;
  standbyCount: number;
  penalizedCount: number;
  ejectedCount: number;
  disabledCount: number;
  configuredCount: number;
  effective: boolean;
  entries: ScopedPoolEntry[];
};

const clampBatchCheckConcurrency = (value: number) =>
  Math.min(MAX_BATCH_CHECK_CONCURRENCY, Math.max(MIN_BATCH_CHECK_CONCURRENCY, Math.round(value)));

const readBooleanField = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return undefined;
};

const readNumberField = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const readStringField = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const readDateField = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) {
    const timestamp = value > 1_000_000_000_000 ? value : value * 1000;
    return new Date(timestamp).toISOString();
  }
  return undefined;
};

const resolveStatusFilterMode = (
  problemOnly: boolean,
  disabledOnly: boolean
): AuthFilesStatusFilterMode => {
  if (problemOnly) return 'problem';
  if (disabledOnly) return 'disabled';
  return 'all';
};

const normalizePersistedStatusFilterMode = (value: unknown): AuthFilesStatusFilterMode | null => {
  if (value === 'disabledProblem') return 'problem';
  return isAuthFilesStatusFilterMode(value) ? value : null;
};

export function AuthFilesPage() {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const config = useConfigStore((state) => state.config);
  const resolvedTheme: ResolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer ? pageTransitionLayer.status === 'current' : true;
  const navigate = useNavigate();

  const [filter, setFilter] = useState<'all' | string>('all');
  const [statusFilterMode, setStatusFilterMode] = useState<AuthFilesStatusFilterMode>('all');
  const [compactMode, setCompactMode] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSizeByMode, setPageSizeByMode] = useState({
    regular: DEFAULT_REGULAR_PAGE_SIZE,
    compact: DEFAULT_COMPACT_PAGE_SIZE,
  });
  const [pageSizeInput, setPageSizeInput] = useState('9');
  const [viewMode, setViewMode] = useState<'diagram' | 'list'>('list');
  const [sortMode, setSortMode] = useState<AuthFilesSortMode>('default');
  const [uiStateHydrated, setUiStateHydrated] = useState(false);
  const [batchCheckScope, setBatchCheckScope] = useState<BatchCheckScope>('page');
  const [batchCheckConcurrency, setBatchCheckConcurrency] = useState(DEFAULT_BATCH_CHECK_CONCURRENCY);
  const [batchCheckConcurrencyInput, setBatchCheckConcurrencyInput] = useState(
    String(DEFAULT_BATCH_CHECK_CONCURRENCY)
  );
  const [lastBatchCheckScope, setLastBatchCheckScope] = useState<BatchCheckScope>('page');
  const [batchCheckModalOpen, setBatchCheckModalOpen] = useState(false);
  const [batchCheckFocusName, setBatchCheckFocusName] = useState('');
  const [batchCheckActionPending, setBatchCheckActionPending] = useState<BatchCheckDirectAction | null>(null);
  const [reenableTieredModalOpen, setReenableTieredModalOpen] = useState(false);
  const [reenableModalSession, setReenableModalSession] = useState(0);
  const [scopedPoolModalOpen, setScopedPoolModalOpen] = useState(false);

  const {
    modelsModalOpen,
    modelsLoading,
    modelsList,
    modelsFileName,
    modelsFileType,
    modelsError,
    showModels,
    closeModelsModal,
    invalidateModels,
  } = useAuthFilesModels();

  const invalidateDerivedCaches = useCallback(
    (names?: string[]) => invalidateAuthFileDerivedCaches(invalidateModels, names),
    [invalidateModels]
  );

  const {
    files,
    selectedFiles,
    selectionCount,
    loading,
    refreshing,
    error,
    uploading,
    deleting,
    deletingAll,
    statusUpdating,
    manualRefreshing,
    batchStatusUpdating,
    fileInputRef,
    loadFiles,
    handleUploadClick,
    handleFileChange,
    handleDelete,
    handleDeleteAll,
    handleDownload,
    handleManualRefresh,
    handleStatusToggle,
    toggleSelect,
    selectAllVisible,
    invertVisibleSelection,
    deselectAll,
    batchDownload,
    batchSetStatus,
    deleteFilesNow,
    batchDelete,
  } = useAuthFilesData({ onFilesMutated: invalidateDerivedCaches });

  const {
    checking: batchChecking,
    batchCheckJob,
    progress: batchCheckProgress,
    batchCheckResponse,
    resultsMap,
    skippedMap,
    lastRequestedNames,
    runBatchCheck,
  } = useAuthFilesBatchCheck();

  const statusBarCache = useAuthFilesStatusBarCache(files);

  const {
    excluded,
    excludedError,
    modelAlias,
    modelAliasError,
    allProviderModels,
    loadExcluded,
    loadModelAlias,
    deleteExcluded,
    deleteModelAlias,
    handleMappingUpdate,
    handleDeleteLink,
    handleToggleFork,
    handleRenameAlias,
    handleDeleteAlias,
  } = useAuthFilesOauth({ viewMode, files });

  const {
    prefixProxyEditor,
    prefixProxyUpdatedText,
    prefixProxyDirty,
    openPrefixProxyEditor,
    closePrefixProxyEditor,
    handlePrefixProxyChange,
    handlePrefixProxySave,
  } = useAuthFilesPrefixProxyEditor({
    disableControls: connectionStatus !== 'connected',
    loadFiles,
  });

  const disableControls = connectionStatus !== 'connected';
  const normalizedFilter = normalizeProviderKey(String(filter));
  const quotaFilterType: QuotaProviderType | null = QUOTA_PROVIDER_TYPES.has(
    normalizedFilter as QuotaProviderType
  )
    ? (normalizedFilter as QuotaProviderType)
    : null;
  const pageSize = compactMode ? pageSizeByMode.compact : pageSizeByMode.regular;
  const problemOnly = statusFilterMode === 'problem';
  const disabledOnly = statusFilterMode === 'disabled';
  const enabledOnly = statusFilterMode === 'enabled';

  /* ---------- uiState 水合与持久化（localStorage key/形状与旧版完全一致） ---------- */

  useEffect(() => {
    const persistedCompactMode = readPersistedAuthFilesCompactMode();
    if (typeof persistedCompactMode === 'boolean') {
      setCompactMode(persistedCompactMode);
    }

    const persisted = readAuthFilesUiState();
    if (persisted) {
      if (typeof persisted.filter === 'string' && persisted.filter.trim()) {
        setFilter(normalizeProviderKey(persisted.filter));
      }
      const persistedStatusFilterMode = normalizePersistedStatusFilterMode(
        persisted.statusFilterMode
      );
      if (persistedStatusFilterMode) {
        setStatusFilterMode(persistedStatusFilterMode);
      } else if (
        typeof persisted.problemOnly === 'boolean' ||
        typeof persisted.disabledOnly === 'boolean'
      ) {
        setStatusFilterMode(
          resolveStatusFilterMode(persisted.problemOnly === true, persisted.disabledOnly === true)
        );
      }
      if (typeof persistedCompactMode !== 'boolean' && typeof persisted.compactMode === 'boolean') {
        setCompactMode(persisted.compactMode);
      }
      if (typeof persisted.search === 'string') {
        setSearch(persisted.search);
      }
      if (typeof persisted.page === 'number' && Number.isFinite(persisted.page)) {
        setPage(Math.max(1, Math.round(persisted.page)));
      }
      const legacyPageSize =
        typeof persisted.pageSize === 'number' && Number.isFinite(persisted.pageSize)
          ? clampCardPageSize(persisted.pageSize)
          : null;
      const regularPageSize =
        typeof persisted.regularPageSize === 'number' && Number.isFinite(persisted.regularPageSize)
          ? clampCardPageSize(persisted.regularPageSize)
          : (legacyPageSize ?? DEFAULT_REGULAR_PAGE_SIZE);
      const compactPageSize =
        typeof persisted.compactPageSize === 'number' && Number.isFinite(persisted.compactPageSize)
          ? clampCardPageSize(persisted.compactPageSize)
          : (legacyPageSize ?? DEFAULT_COMPACT_PAGE_SIZE);
      setPageSizeByMode({
        regular: regularPageSize,
        compact: compactPageSize,
      });
      if (isAuthFilesSortMode(persisted.sortMode)) {
        setSortMode(persisted.sortMode);
      }
      if (
        typeof persisted.batchCheckConcurrency === 'number' &&
        Number.isFinite(persisted.batchCheckConcurrency)
      ) {
        setBatchCheckConcurrency(clampBatchCheckConcurrency(persisted.batchCheckConcurrency));
      }
    }

    setUiStateHydrated(true);
  }, []);

  useEffect(() => {
    if (!uiStateHydrated) return;

    writeAuthFilesUiState({
      filter,
      statusFilterMode,
      problemOnly,
      disabledOnly,
      compactMode,
      search,
      page,
      pageSize,
      regularPageSize: pageSizeByMode.regular,
      compactPageSize: pageSizeByMode.compact,
      sortMode,
      batchCheckConcurrency,
    });
    writePersistedAuthFilesCompactMode(compactMode);
  }, [
    compactMode,
    batchCheckConcurrency,
    disabledOnly,
    filter,
    page,
    pageSize,
    pageSizeByMode,
    problemOnly,
    search,
    sortMode,
    statusFilterMode,
    uiStateHydrated,
  ]);

  useEffect(() => {
    setPageSizeInput(String(pageSize));
  }, [pageSize]);

  useEffect(() => {
    setBatchCheckConcurrencyInput(String(batchCheckConcurrency));
  }, [batchCheckConcurrency]);

  const setCurrentModePageSize = useCallback(
    (next: number) => {
      setPageSizeByMode((current) =>
        compactMode ? { ...current, compact: next } : { ...current, regular: next }
      );
    },
    [compactMode]
  );

  const commitPageSizeInput = useCallback(
    (rawValue: string) => {
      const trimmed = rawValue.trim();
      if (!trimmed) {
        setPageSizeInput(String(pageSize));
        return;
      }

      const value = Number(trimmed);
      if (!Number.isFinite(value)) {
        setPageSizeInput(String(pageSize));
        return;
      }

      const next = clampCardPageSize(value);
      setCurrentModePageSize(next);
      setPageSizeInput(String(next));
      setPage(1);
    },
    [pageSize, setCurrentModePageSize]
  );

  const handlePageSizeChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const rawValue = event.currentTarget.value;
      setPageSizeInput(rawValue);

      const trimmed = rawValue.trim();
      if (!trimmed) return;

      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed)) return;

      const rounded = Math.round(parsed);
      // 超出 [MIN, MAX] 时不提交（clamp 后不等于原值即越界）
      if (clampCardPageSize(rounded) !== rounded) return;

      setCurrentModePageSize(rounded);
      setPage(1);
    },
    [setCurrentModePageSize]
  );

  const handleSortModeChange = useCallback(
    (value: string) => {
      if (!isAuthFilesSortMode(value) || value === sortMode) return;
      setSortMode(value);
      setPage(1);
    },
    [sortMode]
  );

  const handleStatusFilterModeChange = useCallback((nextMode: AuthFilesStatusFilterMode) => {
    setStatusFilterMode(nextMode);
    setPage(1);
  }, []);

  /* ---------- 数据加载：首载前台（骨架屏），此后一律后台（不清空网格） ---------- */

  const initialLoadDoneRef = useRef(false);

  const handleHeaderRefresh = useCallback(async () => {
    await Promise.all([loadFiles({ background: true }), loadExcluded(), loadModelAlias()]);
  }, [loadFiles, loadExcluded, loadModelAlias]);

  useHeaderRefresh(handleHeaderRefresh);

  useEffect(() => {
    if (!isCurrentLayer) return;
    void loadFiles(initialLoadDoneRef.current ? { background: true } : undefined);
    initialLoadDoneRef.current = true;
    loadExcluded();
    loadModelAlias();
  }, [isCurrentLayer, loadFiles, loadExcluded, loadModelAlias]);

  useInterval(
    () => {
      void loadFiles({ background: true }).catch(() => {});
    },
    isCurrentLayer ? 240_000 : null
  );

  /* ---------- 过滤 / 排序 / 分页 memos ---------- */

  const existingTypes = useMemo(() => {
    const types = new Set<string>(['all']);
    files.forEach((file) => {
      const type = normalizeProviderKey(String(file.type ?? file.provider ?? ''));
      if (type) types.add(type);
    });
    return Array.from(types);
  }, [files]);

  const filesMatchingStatusFilters = useMemo(
    () =>
      files.filter((file) => {
        if (enabledOnly && file.disabled === true) return false;
        if (disabledOnly && file.disabled !== true) return false;
        if (problemOnly && !isProblemAuthFile(file)) return false;
        return true;
      }),
    [disabledOnly, enabledOnly, files, problemOnly]
  );

  const statusFilterOptions = useMemo(
    () =>
      [
        { value: 'all', label: t('auth_files.problem_filter_all') },
        { value: 'enabled', label: t('auth_files.problem_filter_enabled') },
        { value: 'disabled', label: t('auth_files.problem_filter_disabled') },
        { value: 'problem', label: t('auth_files.problem_filter_problem') },
      ] satisfies Array<{ value: AuthFilesStatusFilterMode; label: string }>,
    [t]
  );

  const sortOptions = useMemo(
    () => [
      { value: 'default', label: t('auth_files.sort_default') },
      { value: 'az', label: t('auth_files.sort_az') },
      { value: 'priority', label: t('auth_files.sort_priority') },
    ],
    [t]
  );

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: filesMatchingStatusFilters.length };
    filesMatchingStatusFilters.forEach((file) => {
      const type = normalizeProviderKey(String(file.type ?? file.provider ?? ''));
      if (!type) return;
      counts[type] = (counts[type] || 0) + 1;
    });
    return counts;
  }, [filesMatchingStatusFilters]);

  const normalizedSearch = search.trim();
  const wildcardSearch = useMemo(() => buildWildcardSearch(normalizedSearch), [normalizedSearch]);

  const filtered = useMemo(
    () =>
      filesMatchingStatusFilters.filter((item) => {
        const type = normalizeProviderKey(String(item.type ?? item.provider ?? ''));
        const matchType = normalizedFilter === 'all' || type === normalizedFilter;
        return matchType && matchesAuthFileSearch(item, normalizedSearch, wildcardSearch);
      }),
    [filesMatchingStatusFilters, normalizedFilter, normalizedSearch, wildcardSearch]
  );

  const sorted = useMemo(() => sortAuthFiles(filtered, sortMode), [filtered, sortMode]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageItems = useMemo(() => sorted.slice(start, start + pageSize), [pageSize, sorted, start]);
  const selectablePageItems = useMemo(
    () => pageItems.filter((file) => !isRuntimeOnlyAuthFile(file)),
    [pageItems]
  );
  const selectableFilteredItems = useMemo(
    () => sorted.filter((file) => !isRuntimeOnlyAuthFile(file)),
    [sorted]
  );
  const selectedNames = useMemo(() => Array.from(selectedFiles), [selectedFiles]);
  const batchCheckPageNames = useMemo(() => pageItems.map((file) => file.name), [pageItems]);
  const batchCheckTargetNames = useMemo(() => {
    if (batchCheckScope === 'selected') return selectedNames;
    if (batchCheckScope === 'filtered') return sorted.map((file) => file.name);
    return batchCheckPageNames;
  }, [batchCheckPageNames, batchCheckScope, selectedNames, sorted]);
  const selectedHasStatusUpdating = useMemo(
    () => selectedNames.some((name) => statusUpdating[name] === true),
    [selectedNames, statusUpdating]
  );
  const batchStatusButtonsDisabled =
    disableControls ||
    selectedNames.length === 0 ||
    batchStatusUpdating ||
    selectedHasStatusUpdating;

  const liveBatchCheckResponse = useMemo(
    () => buildBatchCheckLiveResponse(batchCheckResponse, files),
    [batchCheckResponse, files]
  );
  const batchCheckDisplaySummary =
    liveBatchCheckResponse?.summary ?? (batchCheckJob ? EMPTY_BATCH_CHECK_SUMMARY : null);
  const batchCheckDisplayAggregate =
    liveBatchCheckResponse?.aggregate ?? (batchCheckJob ? EMPTY_BATCH_CHECK_AGGREGATE : null);
  const batchCheckActionCandidates = batchCheckDisplayAggregate?.action_candidates ?? null;
  const lastBatchCheckScopeLabel =
    lastBatchCheckScope === 'selected'
      ? t('auth_files.batch_check_scope_selected_short')
      : lastBatchCheckScope === 'filtered'
        ? t('auth_files.batch_check_scope_filtered_short')
        : t('auth_files.batch_check_scope_page_short');
  const hasBatchCheckDisplayResults = Boolean(
    liveBatchCheckResponse &&
      ((liveBatchCheckResponse.results ?? []).length > 0 ||
        (liveBatchCheckResponse.skipped ?? []).length > 0)
  );
  const batchCheckHeroMetrics = useMemo(() => {
    if (!batchCheckDisplaySummary || !batchCheckDisplayAggregate) return [];
    return [
      {
        key: 'remaining',
        label: t('auth_files.batch_check_total_remaining'),
        value: `${batchCheckDisplayAggregate.capacity_overview.remaining_total} / ${batchCheckDisplayAggregate.capacity_overview.total_capacity}`,
        hint: `${batchCheckDisplayAggregate.capacity_overview.remaining_percent}%`,
      },
      {
        key: 'available',
        label: t('auth_files.batch_check_available_count'),
        value: String(batchCheckDisplaySummary.available_count),
      },
      {
        key: 'processed',
        label: t('auth_files.batch_check_processed_count'),
        value: String(batchCheckDisplayAggregate.scope_overview.processed_count),
        hint: t('auth_files.batch_check_scope_count', { count: lastRequestedNames.length }),
      },
      {
        key: 'disabled',
        label: t('auth_files.batch_check_disabled_count'),
        value: String(batchCheckDisplayAggregate.scope_overview.disabled_count),
      },
      {
        key: 'invalidated',
        label: t('auth_files.batch_check_invalidated_count'),
        value: String(batchCheckDisplayAggregate.risk_overview.invalidated_401_count),
      },
      {
        key: 'noQuota',
        label: t('auth_files.batch_check_no_quota_count'),
        value: String(batchCheckDisplayAggregate.risk_overview.no_quota_count),
      },
    ];
  }, [batchCheckDisplayAggregate, batchCheckDisplaySummary, lastRequestedNames.length, t]);

  const scopedPoolSummary = useMemo<ScopedPoolSummary | null>(() => {
    const entries: ScopedPoolEntry[] = [];
    let totalFileCount = 0;
    let activeCount = 0;
    let standbyCount = 0;
    let penalizedCount = 0;
    let ejectedCount = 0;
    let disabledCount = 0;
    let configuredCount = 0;

    files.forEach((file) => {
      if (isRuntimeOnlyAuthFile(file)) return;
      totalFileCount += 1;
      const poolConfigured = readBooleanField(file.poolConfigured ?? file['pool_configured']) ?? false;
      const poolEnabled = readBooleanField(file.poolEnabled ?? file['pool_enabled']) ?? false;
      const poolState = readStringField(file.poolState ?? file['pool_state']);
      const poolReason = readStringField(file.poolReason ?? file['pool_reason']);
      const managed = poolConfigured || poolEnabled || poolState !== '' || poolReason !== '';
      if (!managed) return;

      const stateValue = file.disabled
        ? 'disabled'
        : poolState
          ? getScopedPoolStateKey(poolState)
          : poolConfigured
            ? 'configured'
            : 'configured';
      const state: ScopedPoolState =
        stateValue === 'in_pool' ||
        stateValue === 'standby' ||
        stateValue === 'penalized' ||
        stateValue === 'ejected' ||
        stateValue === 'disabled'
          ? stateValue
          : 'configured';
      if (state === 'in_pool') activeCount += 1;
      if (state === 'standby') standbyCount += 1;
      if (state === 'penalized') penalizedCount += 1;
      if (state === 'ejected') ejectedCount += 1;
      if (state === 'disabled') disabledCount += 1;
      if (state === 'configured') configuredCount += 1;
      entries.push({
        name: file.name,
        providerLabel: getTypeLabel(t, normalizeProviderKey(String(file.provider ?? file.type ?? 'unknown'))),
        state,
        reasonLabel:
          getScopedPoolReasonKey(poolReason) !== 'none'
            ? t(`auth_files.pool_reason_${getScopedPoolReasonKey(poolReason)}`)
            : '',
        remainingPercent: readNumberField(file.poolRemainingPercent ?? file['pool_remaining_percent']),
        lastQuotaCheckedAt: readDateField(file.poolLastQuotaCheckedAt ?? file['pool_last_quota_checked_at']),
      });
    });

    const managedCount = entries.length;
    if (managedCount === 0) return null;
    return {
      totalFileCount,
      managedCount,
      activeCount,
      standbyCount,
      penalizedCount,
      ejectedCount,
      disabledCount,
      configuredCount,
      effective: activeCount + standbyCount + penalizedCount + ejectedCount + disabledCount > 0,
      entries: entries.sort((left, right) => left.name.localeCompare(right.name)),
    };
  }, [files, t]);
  const scopedPoolEnabled =
    (config?.routingStrategy === 'round-robin' || config?.routingStrategy === 'weighted-round-robin') &&
    config?.routingScopedPool?.enabled === true;
  const visibleScopedPoolSummary = scopedPoolEnabled && scopedPoolSummary?.effective ? scopedPoolSummary : null;

  /* ---------- 头部遥测计数 ---------- */

  const activeCount = useMemo(() => files.filter((file) => file.disabled !== true).length, [files]);
  const problemCount = useMemo(() => files.filter(isProblemAuthFile).length, [files]);

  /* ---------- 首屏卡片一次性级联入场 ----------
   * 首批数据渲染后立即翻转 cardsAnimated；已挂载的卡片在挂载时捕获过
   * 自己的延迟（AuthFileCard 内 useState 初始化），不受后续 null 影响，
   * 而过滤/翻页/轮询新挂载的卡片拿到 null——不重播。 */

  const [cardsAnimated, setCardsAnimated] = useState(false);
  const enableCardEntrance = !cardsAnimated && isCurrentLayer && !loading && pageItems.length > 0;
  useEffect(() => {
    if (enableCardEntrance) {
      setCardsAnimated(true);
    }
  }, [enableCardEntrance]);
  const cardEntranceDelay = (index: number): number | null => {
    if (!enableCardEntrance) return null;
    if (pageItems.length <= 1) return 0;
    return Math.round((index / (pageItems.length - 1)) * CARD_ENTRANCE_BUDGET_MS);
  };

  /* ---------- 杂项 ---------- */

  const copyTextWithNotification = useCallback(
    async (text: string) => {
      const copied = await copyToClipboard(text);
      showNotification(
        copied
          ? t('notification.link_copied', { defaultValue: 'Copied to clipboard' })
          : t('notification.copy_failed', { defaultValue: 'Copy failed' }),
        copied ? 'success' : 'error'
      );
    },
    [showNotification, t]
  );

  const openExcludedEditor = useCallback(
    (provider?: string) => {
      const providerValue = (provider || (filter !== 'all' ? String(filter) : '')).trim();
      const params = new URLSearchParams();
      if (providerValue) {
        params.set('provider', providerValue);
      }
      const nextSearch = params.toString();
      navigate(`/auth-files/oauth-excluded${nextSearch ? `?${nextSearch}` : ''}`, {
        state: { fromAuthFiles: true },
      });
    },
    [filter, navigate]
  );

  const openModelAliasEditor = useCallback(
    (provider?: string) => {
      const providerValue = (provider || (filter !== 'all' ? String(filter) : '')).trim();
      const params = new URLSearchParams();
      if (providerValue) {
        params.set('provider', providerValue);
      }
      const nextSearch = params.toString();
      navigate(`/auth-files/oauth-model-alias${nextSearch ? `?${nextSearch}` : ''}`, {
        state: { fromAuthFiles: true },
      });
    },
    [filter, navigate]
  );

  const handleRunBatchCheck = useCallback(async () => {
    setLastBatchCheckScope(batchCheckScope);
    await runBatchCheck(batchCheckTargetNames, {
      includeDisabled: true,
      concurrency: batchCheckConcurrency,
    });
  }, [batchCheckConcurrency, batchCheckScope, batchCheckTargetNames, runBatchCheck]);

  const commitBatchCheckConcurrencyInput = useCallback(
    (rawValue: string) => {
      const trimmed = rawValue.trim();
      if (!trimmed) {
        setBatchCheckConcurrencyInput(String(batchCheckConcurrency));
        return;
      }
      const value = Number(trimmed);
      if (!Number.isFinite(value)) {
        setBatchCheckConcurrencyInput(String(batchCheckConcurrency));
        return;
      }
      const next = clampBatchCheckConcurrency(value);
      setBatchCheckConcurrency(next);
      setBatchCheckConcurrencyInput(String(next));
    },
    [batchCheckConcurrency]
  );

  const handleBatchCheckConcurrencyChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const rawValue = event.currentTarget.value;
    setBatchCheckConcurrencyInput(rawValue);
    const trimmed = rawValue.trim();
    if (!trimmed) return;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return;
    const rounded = Math.round(parsed);
    if (rounded < MIN_BATCH_CHECK_CONCURRENCY || rounded > MAX_BATCH_CHECK_CONCURRENCY) return;
    setBatchCheckConcurrency(rounded);
  }, []);

  const handleBatchCheckSummaryAction = useCallback(
    (
      action: BatchCheckDirectAction,
      title: string,
      message: string,
      runner: () => Promise<unknown>,
      variant: 'danger' | 'primary' | 'secondary' = 'danger'
    ) => {
      showConfirmation({
        title,
        message,
        variant,
        confirmText: t('common.confirm'),
        onConfirm: async () => {
          setBatchCheckActionPending(action);
          try {
            await runner();
          } finally {
            setBatchCheckActionPending((current) => (current === action ? null : current));
          }
        },
      });
    },
    [showConfirmation, t]
  );

  const handleDeleteInvalidated401 = useCallback(() => {
    const names = batchCheckActionCandidates?.invalidated_401_names ?? [];
    if (names.length === 0) return;
    handleBatchCheckSummaryAction(
      'delete_invalidated_401',
      t('auth_files.batch_check_action_delete_invalidated_401'),
      t('auth_files.batch_check_confirm_delete_invalidated_401', { count: names.length }),
      () => deleteFilesNow(names)
    );
  }, [batchCheckActionCandidates, deleteFilesNow, handleBatchCheckSummaryAction, t]);

  const handleDisableExhausted = useCallback(() => {
    const names = batchCheckActionCandidates?.disable_exhausted_names ?? [];
    if (names.length === 0) return;
    handleBatchCheckSummaryAction(
      'disable_exhausted',
      t('auth_files.batch_check_action_disable_exhausted'),
      t('auth_files.batch_check_confirm_disable_exhausted', { count: names.length }),
      () => batchSetStatus(names, false),
      'secondary'
    );
  }, [batchCheckActionCandidates, batchSetStatus, handleBatchCheckSummaryAction, t]);

  const handleReenableRecovered = useCallback(() => {
    if ((batchCheckActionCandidates?.reenable_names ?? []).length === 0) return;
    setReenableModalSession((session) => session + 1);
    setReenableTieredModalOpen(true);
  }, [batchCheckActionCandidates]);

  const handleReenableConfirm = useCallback(
    async (names: string[]) => {
      if (names.length === 0) return;
      setBatchCheckActionPending('reenable_recovered');
      try {
        await batchSetStatus(names, true);
        setReenableTieredModalOpen(false);
      } finally {
        setBatchCheckActionPending((current) =>
          current === 'reenable_recovered' ? null : current
        );
      }
    },
    [batchSetStatus]
  );

  const handleOpenBatchCheckDetails = useCallback((name?: string) => {
    setBatchCheckFocusName(name ?? '');
    setBatchCheckModalOpen(true);
  }, []);

  const handleCloseBatchCheckDetails = useCallback(() => {
    setBatchCheckModalOpen(false);
    setBatchCheckFocusName('');
  }, []);

  const clearFilters = useCallback(() => {
    setFilter('all');
    setStatusFilterMode('all');
    setSearch('');
    setPage(1);
  }, []);

  const deleteAllButtonLabel = (() => {
    if (enabledOnly || disabledOnly) {
      return t('auth_files.delete_filtered_result_button');
    }
    if (problemOnly) {
      return normalizedFilter === 'all'
        ? t('auth_files.delete_problem_button')
        : t('auth_files.delete_problem_button_with_type', {
            type: getTypeLabel(t, normalizedFilter),
          });
    }
    return normalizedFilter === 'all'
      ? t('auth_files.delete_all_button')
      : `${t('common.delete')} ${getTypeLabel(t, normalizedFilter)}`;
  })();

  const oauthSectionRef = useRevealOnScroll<HTMLDivElement>();

  const isFirstRunEmpty = !loading && files.length === 0 && !error;
  const isNoResults = !loading && files.length > 0 && pageItems.length === 0;

  const gridClasses = [
    styles.grid,
    compactMode ? styles.gridCompact : '',
    quotaFilterType ? styles.gridQuota : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.page}>
      <VaultHeader
        totalCount={files.length}
        activeCount={activeCount}
        problemCount={problemCount}
        loading={loading}
        refreshing={refreshing}
        uploading={uploading}
        disableControls={disableControls}
        onUpload={handleUploadClick}
        onRefresh={() => void handleHeaderRefresh()}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <VaultPulse files={files} statusBarCache={statusBarCache} />

      <section className={styles.workbench} aria-label={t('auth_files.title_section')}>
        <ProviderTabs
          types={existingTypes}
          counts={typeCounts}
          active={normalizedFilter}
          resolvedTheme={resolvedTheme}
          onChange={(type) => {
            setFilter(type);
            setPage(1);
          }}
        />

        <AuthFilesToolbar
          search={search}
          onSearchChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          statusFilterMode={statusFilterMode}
          statusFilterOptions={statusFilterOptions}
          onStatusFilterChange={handleStatusFilterModeChange}
          sortMode={sortMode}
          sortOptions={sortOptions}
          onSortModeChange={handleSortModeChange}
          pageSizeInput={pageSizeInput}
          onPageSizeInputChange={handlePageSizeChange}
          onPageSizeCommit={commitPageSizeInput}
          compactMode={compactMode}
          onCompactModeChange={setCompactMode}
          deleteLabel={deleteAllButtonLabel}
          deleteDisabled={disableControls || loading || deletingAll || files.length === 0}
          deleteLoading={deletingAll}
          onDelete={() =>
            handleDeleteAll({
              filter,
              problemOnly,
              disabledOnly,
              enabledOnly,
              onResetFilterToAll: () => setFilter('all'),
              onResetProblemOnly: () => setStatusFilterMode('all'),
              onResetDisabledOnly: () => setStatusFilterMode('all'),
              onResetEnabledOnly: () => setStatusFilterMode('all'),
            })
          }
        />

        <div className={legacyStyles.batchCheckPanel}>
          <div className={legacyStyles.batchCheckPanelHeader}>
            <div className={legacyStyles.batchCheckPanelTitleWrap}>
              <h2 className={legacyStyles.batchCheckPanelTitle}>{t('auth_files.batch_check_title')}</h2>
              <p className={legacyStyles.batchCheckPanelDescription}>
                {t('auth_files.batch_check_description')}
              </p>
            </div>
            <div className={legacyStyles.batchCheckPanelActions}>
              <div className={legacyStyles.batchCheckInlineControls}>
                <div className={legacyStyles.batchCheckScopeControl}>
                  <span className={legacyStyles.batchCheckScopeLabel}>
                    {t('auth_files.batch_check_scope_label')}
                  </span>
                  <Select
                    value={batchCheckScope}
                    options={[
                      {
                        value: 'selected',
                        label: t('auth_files.batch_check_scope_selected', {
                          count: selectedNames.length,
                        }),
                      },
                      {
                        value: 'page',
                        label: t('auth_files.batch_check_scope_page', {
                          count: batchCheckPageNames.length,
                        }),
                      },
                      {
                        value: 'filtered',
                        label: t('auth_files.batch_check_scope_filtered', { count: sorted.length }),
                      },
                    ]}
                    onChange={(value) => setBatchCheckScope(value as BatchCheckScope)}
                    disabled={disableControls || batchChecking}
                    ariaLabel={t('auth_files.batch_check_scope_label')}
                  />
                </div>
                <div className={legacyStyles.batchCheckConcurrencyControl}>
                  <span className={legacyStyles.batchCheckScopeLabel}>
                    {t('auth_files.batch_check_concurrency_label')}
                  </span>
                  <input
                    className={legacyStyles.batchCheckConcurrencyInput}
                    type="number"
                    min={MIN_BATCH_CHECK_CONCURRENCY}
                    max={MAX_BATCH_CHECK_CONCURRENCY}
                    step={1}
                    value={batchCheckConcurrencyInput}
                    onChange={handleBatchCheckConcurrencyChange}
                    onBlur={(event) => commitBatchCheckConcurrencyInput(event.currentTarget.value)}
                    disabled={disableControls || batchChecking}
                    aria-label={t('auth_files.batch_check_concurrency_label')}
                  />
                </div>
                <Button
                  className={legacyStyles.batchCheckStartButton}
                  onClick={() => void handleRunBatchCheck()}
                  disabled={disableControls || batchCheckTargetNames.length === 0}
                  loading={batchChecking}
                >
                  {t('auth_files.batch_check_button')}
                </Button>
              </div>
            </div>
          </div>

          {batchCheckJob && batchChecking && batchCheckProgress ? (
            <div className={legacyStyles.batchCheckProgressSection}>
              <div className={legacyStyles.batchCheckProgressHeader}>
                <strong>{t('auth_files.batch_check_progress_title')}</strong>
                <span>{batchCheckProgress.percent}%</span>
              </div>
              <div className={legacyStyles.batchCheckProgressBar}>
                <div
                  className={legacyStyles.batchCheckProgressBarFill}
                  style={{ width: `${batchCheckProgress.percent}%` }}
                />
              </div>
              <div className={legacyStyles.batchCheckProgressHint}>
                {batchCheckProgress.current_name
                  ? t('auth_files.batch_check_progress_current', {
                      name: batchCheckProgress.current_name,
                      provider:
                        batchCheckProgress.current_provider ||
                        t('auth_files.batch_check_classification_unknown'),
                    })
                  : t('auth_files.batch_check_progress_waiting')}
              </div>
            </div>
          ) : null}

          {batchCheckDisplaySummary && batchCheckDisplayAggregate ? (
            <>
              <div className={legacyStyles.batchCheckPanelMeta}>
                {t('auth_files.batch_check_scope_label')}: {lastBatchCheckScopeLabel}
              </div>
              <div className={legacyStyles.batchCheckHeroGrid}>
                {batchCheckHeroMetrics.map((item) => (
                  <div key={item.key} className={legacyStyles.batchCheckHeroCard}>
                    <span className={legacyStyles.batchCheckHeroLabel}>{item.label}</span>
                    <strong className={legacyStyles.batchCheckHeroValue}>{item.value}</strong>
                    {item.hint ? <span className={legacyStyles.batchCheckHeroHint}>{item.hint}</span> : null}
                  </div>
                ))}
              </div>
              <div className={legacyStyles.batchCheckActionBar}>
                <span className={legacyStyles.batchCheckActionHint}>
                  {t('auth_files.batch_check_summary_hint')}
                </span>
                <div className={legacyStyles.batchCheckActionButtons}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleOpenBatchCheckDetails()}
                    disabled={!hasBatchCheckDisplayResults}
                  >
                    {t('auth_files.batch_check_view_details')}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleDeleteInvalidated401}
                    disabled={
                      disableControls ||
                      batchChecking ||
                      batchCheckActionPending !== null ||
                      (batchCheckActionCandidates?.invalidated_401_names.length ?? 0) === 0
                    }
                    loading={batchCheckActionPending === 'delete_invalidated_401'}
                  >
                    {`${t('auth_files.batch_check_action_delete_invalidated_401')} (${batchCheckActionCandidates?.invalidated_401_names.length ?? 0})`}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleDisableExhausted}
                    disabled={
                      disableControls ||
                      batchChecking ||
                      batchCheckActionPending !== null ||
                      (batchCheckActionCandidates?.disable_exhausted_names.length ?? 0) === 0
                    }
                    loading={batchCheckActionPending === 'disable_exhausted'}
                  >
                    {`${t('auth_files.batch_check_action_disable_exhausted')} (${batchCheckActionCandidates?.disable_exhausted_names.length ?? 0})`}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleReenableRecovered}
                    disabled={
                      disableControls ||
                      batchChecking ||
                      batchCheckActionPending !== null ||
                      (batchCheckActionCandidates?.reenable_names.length ?? 0) === 0
                    }
                    loading={batchCheckActionPending === 'reenable_recovered'}
                  >
                    {`${t('auth_files.batch_check_action_reenable_available')} (${batchCheckActionCandidates?.reenable_names.length ?? 0})`}
                  </Button>
                </div>
              </div>
            </>
          ) : !batchChecking ? (
            <div className={legacyStyles.batchCheckEmptyHint}>{t('auth_files.batch_check_empty_desc')}</div>
          ) : null}
        </div>

        {visibleScopedPoolSummary ? (
          <div className={legacyStyles.scopedPoolAuthSummaryRow}>
            <div className={legacyStyles.scopedPoolAuthSummaryMeta}>
              <span className={`${legacyStyles.batchCheckBadge} ${legacyStyles.batchCheckBadgeSuccess}`}>
                {t('auth_files.scoped_pool_auth_effective')}
              </span>
              <span className={legacyStyles.scopedPoolAuthSummaryHint}>
                {t('auth_files.scoped_pool_auth_managed_files', {
                  count: visibleScopedPoolSummary.managedCount,
                })}
              </span>
              <span className={legacyStyles.scopedPoolAuthSummaryHint}>
                {t('auth_files.scoped_pool_auth_inline_counts', {
                  active: visibleScopedPoolSummary.activeCount,
                  standby: visibleScopedPoolSummary.standbyCount,
                  penalized: visibleScopedPoolSummary.penalizedCount,
                  ejected: visibleScopedPoolSummary.ejectedCount,
                  disabled: visibleScopedPoolSummary.disabledCount,
                })}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className={legacyStyles.scopedPoolAuthSummaryButton}
              onClick={() => setScopedPoolModalOpen(true)}
            >
              {t('auth_files.scoped_pool_auth_view_details')}
            </Button>
          </div>
        ) : null}

        {error && (
          <div className={styles.errorBanner} role="alert">
            {error}
          </div>
        )}

        {loading ? (
          <div className={gridClasses} aria-hidden="true">
            {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
              <Skeleton key={index} height={206} rounded={14} />
            ))}
          </div>
        ) : isFirstRunEmpty ? (
          <EmptyState
            title={t('auth_files.empty_title')}
            description={t('auth_files.empty_desc')}
            action={
              <div className={styles.emptyActions}>
                <Button
                  size="sm"
                  onClick={handleUploadClick}
                  disabled={disableControls || uploading}
                >
                  {t('auth_files.upload_button')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigate('/oauth')}>
                  {t('auth_files.empty_oauth_link')}
                </Button>
              </div>
            }
          />
        ) : isNoResults ? (
          <EmptyState
            title={t('auth_files.search_empty_title')}
            description={t('auth_files.search_empty_desc')}
            action={
              <Button variant="secondary" size="sm" onClick={clearFilters}>
                {t('auth_files.no_results_clear')}
              </Button>
            }
          />
        ) : (
          <div className={gridClasses}>
            {pageItems.map((file, index) => (
              <AuthFileCard
                key={file.name}
                file={file}
                compact={compactMode}
                selected={selectedFiles.has(file.name)}
                resolvedTheme={resolvedTheme}
                disableControls={disableControls}
                deleting={deleting}
                statusUpdating={statusUpdating}
                manualRefreshing={manualRefreshing}
                quotaFilterType={quotaFilterType}
                statusBarCache={statusBarCache}
                batchCheckResult={resultsMap.get(file.name) ?? null}
                skippedReason={skippedMap.get(file.name)?.reason ?? null}
                entranceDelayMs={cardEntranceDelay(index)}
                onShowModels={showModels}
                onDownload={handleDownload}
                onManualRefresh={handleManualRefresh}
                onOpenPrefixProxyEditor={openPrefixProxyEditor}
                onDelete={handleDelete}
                onToggleStatus={handleStatusToggle}
                onToggleSelect={toggleSelect}
              />
            ))}
          </div>
        )}

        {!loading && sorted.length > pageSize && (
          <div className={styles.pagination}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
            >
              {t('auth_files.pagination_prev')}
            </Button>
            <div className={styles.pageInfo}>
              {t('auth_files.pagination_info', {
                current: currentPage,
                total: totalPages,
                count: sorted.length,
              })}
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage >= totalPages}
            >
              {t('auth_files.pagination_next')}
            </Button>
          </div>
        )}
      </section>

      <div className={styles.configGrid} ref={oauthSectionRef}>
        <OAuthExcludedCard
          disableControls={disableControls}
          excludedError={excludedError}
          excluded={excluded}
          onRetry={loadExcluded}
          onAdd={() => openExcludedEditor()}
          onEdit={openExcludedEditor}
          onDelete={deleteExcluded}
        />

        <OAuthModelAliasCard
          disableControls={disableControls}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onRetry={loadModelAlias}
          onAdd={() => openModelAliasEditor()}
          onEditProvider={openModelAliasEditor}
          onDeleteProvider={deleteModelAlias}
          modelAliasError={modelAliasError}
          modelAlias={modelAlias}
          allProviderModels={allProviderModels}
          onUpdate={handleMappingUpdate}
          onDeleteLink={handleDeleteLink}
          onToggleFork={handleToggleFork}
          onRenameAlias={handleRenameAlias}
          onDeleteAlias={handleDeleteAlias}
        />
      </div>

      <AuthFileModelsModal
        open={modelsModalOpen}
        fileName={modelsFileName}
        fileType={modelsFileType}
        loading={modelsLoading}
        error={modelsError}
        models={modelsList}
        excluded={excluded}
        onClose={closeModelsModal}
        onCopyText={copyTextWithNotification}
      />

      <AuthFileDetailsSheet
        disableControls={disableControls}
        editor={prefixProxyEditor}
        updatedText={prefixProxyUpdatedText}
        dirty={prefixProxyDirty}
        onClose={closePrefixProxyEditor}
        onCopyText={copyTextWithNotification}
        onSave={handlePrefixProxySave}
        onChange={handlePrefixProxyChange}
      />

      <AuthFilesBatchCheckModal
        open={batchCheckModalOpen}
        response={liveBatchCheckResponse}
        focusName={batchCheckFocusName}
        onClose={handleCloseBatchCheckDetails}
      />

      <ReenableTieredModal
        key={`reenable-${reenableModalSession}`}
        open={reenableTieredModalOpen}
        results={liveBatchCheckResponse?.results ?? []}
        reenableNames={batchCheckActionCandidates?.reenable_names ?? []}
        onConfirm={handleReenableConfirm}
        onClose={() => {
          if (batchCheckActionPending !== 'reenable_recovered') setReenableTieredModalOpen(false);
        }}
        loading={batchCheckActionPending === 'reenable_recovered'}
      />

      <Modal
        open={Boolean(visibleScopedPoolSummary && scopedPoolModalOpen)}
        onClose={() => setScopedPoolModalOpen(false)}
        title={t('auth_files.scoped_pool_auth_modal_title')}
        width={760}
        className={legacyStyles.batchCheckModal}
        footer={
          <Button variant="secondary" onClick={() => setScopedPoolModalOpen(false)}>
            {t('common.close')}
          </Button>
        }
      >
        {visibleScopedPoolSummary ? (
          <div className={legacyStyles.scopedPoolAuthModalContent}>
            <div className={legacyStyles.scopedPoolAuthProviderGrid}>
              {visibleScopedPoolSummary.entries.map((entry) => (
                <div key={entry.name} className={legacyStyles.scopedPoolAuthProviderCard}>
                  <div className={legacyStyles.scopedPoolAuthProviderHeader}>
                    <span className={legacyStyles.scopedPoolAuthProviderNames}>{entry.name}</span>
                    <span className={legacyStyles.batchCheckBadge}>
                      {t(`auth_files.pool_state_${entry.state}`)}
                    </span>
                  </div>
                  <div className={legacyStyles.batchCheckDetailFacts}>
                    <span>{entry.providerLabel}</span>
                    {entry.reasonLabel ? <span>{entry.reasonLabel}</span> : null}
                    {entry.remainingPercent !== undefined ? (
                      <span>{t('auth_files.pool_remaining_percent', { value: entry.remainingPercent })}</span>
                    ) : null}
                    {entry.lastQuotaCheckedAt ? <span>{entry.lastQuotaCheckedAt}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Modal>

      <BatchActionBar
        selectionCount={selectionCount}
        selectablePageCount={selectablePageItems.length}
        selectableFilteredCount={selectableFilteredItems.length}
        disableControls={disableControls}
        batchStatusDisabled={batchStatusButtonsDisabled}
        onSelectPage={() => selectAllVisible(pageItems)}
        onSelectFiltered={() => selectAllVisible(sorted)}
        onInvertPage={() => invertVisibleSelection(pageItems)}
        onDeselectAll={deselectAll}
        onDownload={() => void batchDownload(selectedNames)}
        onEnable={() => batchSetStatus(selectedNames, true)}
        onDisable={() => batchSetStatus(selectedNames, false)}
        onDelete={() => batchDelete(selectedNames)}
      />
    </div>
  );
}
