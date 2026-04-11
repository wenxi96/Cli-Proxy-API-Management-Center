import {
  useCallback,
  type CSSProperties,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { animate } from 'motion/mini';
import type { AnimationPlaybackControlsWithThen } from 'motion-dom';
import { useInterval } from '@/hooks/useInterval';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { IconFilterAll } from '@/components/ui/icons';
import { EmptyState } from '@/components/ui/EmptyState';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { copyToClipboard } from '@/utils/clipboard';
import { formatDateTime, formatNumber } from '@/utils/format';
import {
  MAX_CARD_PAGE_SIZE,
  MIN_CARD_PAGE_SIZE,
  QUOTA_PROVIDER_TYPES,
  clampCardPageSize,
  getAuthFileIcon,
  getTypeColor,
  getTypeLabel,
  hasAuthFileStatusMessage,
  isRuntimeOnlyAuthFile,
  normalizeProviderKey,
  parsePriorityValue,
  type QuotaProviderType,
  type ResolvedTheme,
} from '@/features/authFiles/constants';
import { AuthFileCard } from '@/features/authFiles/components/AuthFileCard';
import { AuthFilesBatchCheckModal } from '@/features/authFiles/components/AuthFilesBatchCheckModal';
import { AuthFileModelsModal } from '@/features/authFiles/components/AuthFileModelsModal';
import { AuthFilesPrefixProxyEditorModal } from '@/features/authFiles/components/AuthFilesPrefixProxyEditorModal';
import { OAuthExcludedCard } from '@/features/authFiles/components/OAuthExcludedCard';
import { OAuthModelAliasCard } from '@/features/authFiles/components/OAuthModelAliasCard';
import {
  buildBatchCheckLiveResponse,
  useAuthFilesBatchCheck,
} from '@/features/authFiles/hooks/useAuthFilesBatchCheck';
import { useAuthFilesData } from '@/features/authFiles/hooks/useAuthFilesData';
import { useAuthFilesModels } from '@/features/authFiles/hooks/useAuthFilesModels';
import { useAuthFilesOauth } from '@/features/authFiles/hooks/useAuthFilesOauth';
import { useAuthFilesPrefixProxyEditor } from '@/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';
import { useAuthFilesStats } from '@/features/authFiles/hooks/useAuthFilesStats';
import { useAuthFilesStatusBarCache } from '@/features/authFiles/hooks/useAuthFilesStatusBarCache';
import {
  isAuthFilesSortMode,
  readAuthFilesUiState,
  readPersistedAuthFilesCompactMode,
  writeAuthFilesUiState,
  writePersistedAuthFilesCompactMode,
  type AuthFilesSortMode,
} from '@/features/authFiles/uiState';
import { useAuthStore, useNotificationStore, useThemeStore } from '@/stores';
import type { AuthFileBatchCheckAggregate, AuthFileBatchCheckSummary } from '@/types';
import { getScopedPoolReasonKey, getScopedPoolStateKey } from '@/utils/scopedPool';
import styles from './AuthFilesPage.module.scss';

const easePower3Out = (progress: number) => 1 - (1 - progress) ** 4;
const easePower2In = (progress: number) => progress ** 3;
const BATCH_BAR_BASE_TRANSFORM = 'translateX(-50%)';
const BATCH_BAR_HIDDEN_TRANSFORM = 'translateX(-50%) translateY(56px)';
const DEFAULT_REGULAR_PAGE_SIZE = 9;
const DEFAULT_COMPACT_PAGE_SIZE = 12;
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
  health_buckets: {
    full: 0,
    very_high: 0,
    high: 0,
    usable: 0,
    fair: 0,
    alert: 0,
    danger: 0,
    exhausted: 0,
    unknown: 0,
  },
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
    reenable_threshold_bucket: 'danger',
  },
};
type BatchCheckScope = 'selected' | 'page' | 'filtered';
type BatchCheckDirectAction = 'delete_invalidated_401' | 'disable_exhausted' | 'reenable_recovered';
type AuthFileScopedPoolState =
  | 'in_pool'
  | 'standby'
  | 'penalized'
  | 'ejected'
  | 'disabled'
  | 'configured';
type AuthFileScopedPoolEntry = {
  name: string;
  providerKey: string;
  providerLabel: string;
  state: AuthFileScopedPoolState;
  stateLabel: string;
  reasonKey: string;
  reasonLabel: string;
  remainingPercent?: number;
  lastQuotaCheckedAt?: string;
};
type AuthFileScopedPoolProviderBucket = {
  providerKey: string;
  providerLabel: string;
  managedCount: number;
  activeCount: number;
  standbyCount: number;
  penalizedCount: number;
  ejectedCount: number;
  disabledCount: number;
  entries: AuthFileScopedPoolEntry[];
};
type AuthFileScopedPoolSummary = {
  totalFileCount: number;
  managedCount: number;
  providerCount: number;
  activeProviderCount: number;
  activeCount: number;
  standbyCount: number;
  penalizedCount: number;
  ejectedCount: number;
  disabledCount: number;
  configuredCount: number;
  effective: boolean;
  providerBuckets: AuthFileScopedPoolProviderBucket[];
  entriesByState: Record<AuthFileScopedPoolState, AuthFileScopedPoolEntry[]>;
};

const escapeWildcardSearchSegment = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildWildcardSearch = (value: string): RegExp | null => {
  if (!value.includes('*')) return null;
  const pattern = value.split('*').map(escapeWildcardSearchSegment).join('.*');
  return new RegExp(pattern, 'i');
};

const formatBatchCheckPercent = (value?: number | null): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  if (Number.isInteger(value)) return `${value}%`;
  if (Math.abs(value) >= 10) return `${value.toFixed(1)}%`;
  return `${value.toFixed(2)}%`;
};

const formatBatchCheckNumber = (value?: number | null): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  if (Number.isInteger(value)) return formatNumber(value);
  return value.toFixed(2);
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
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
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

export function AuthFilesPage() {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const resolvedTheme: ResolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer ? pageTransitionLayer.status === 'current' : true;
  const navigate = useNavigate();

  const [filter, setFilter] = useState<'all' | string>('all');
  const [problemOnly, setProblemOnly] = useState(false);
  const [enabledOnly, setEnabledOnly] = useState(false);
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
  const [batchActionBarVisible, setBatchActionBarVisible] = useState(false);
  const [uiStateHydrated, setUiStateHydrated] = useState(false);
  const [batchCheckModalOpen, setBatchCheckModalOpen] = useState(false);
  const [batchCheckFocusName, setBatchCheckFocusName] = useState('');
  const [batchCheckScope, setBatchCheckScope] = useState<BatchCheckScope>('page');
  const [batchCheckConcurrency, setBatchCheckConcurrency] = useState(DEFAULT_BATCH_CHECK_CONCURRENCY);
  const [batchCheckConcurrencyInput, setBatchCheckConcurrencyInput] = useState(
    String(DEFAULT_BATCH_CHECK_CONCURRENCY)
  );
  const [authFilesScopedPoolModalOpen, setAuthFilesScopedPoolModalOpen] = useState(false);
  const [lastBatchCheckScope, setLastBatchCheckScope] = useState<BatchCheckScope>('page');
  const [batchCheckActionPending, setBatchCheckActionPending] = useState<BatchCheckDirectAction | null>(null);
  const floatingBatchActionsRef = useRef<HTMLDivElement>(null);
  const batchActionAnimationRef = useRef<AnimationPlaybackControlsWithThen | null>(null);
  const previousSelectionCountRef = useRef(0);
  const selectionCountRef = useRef(0);

  const { keyStats, usageDetails, loadKeyStats, refreshKeyStats } = useAuthFilesStats();
  const {
    files,
    selectedFiles,
    selectionCount,
    loading,
    error,
    uploading,
    deleting,
    deletingAll,
    statusUpdating,
    batchStatusUpdating,
    fileInputRef,
    loadFiles,
    handleUploadClick,
    handleFileChange,
    handleDelete,
    handleDeleteAll,
    handleDownload,
    handleStatusToggle,
    toggleSelect,
    selectAllVisible,
    invertVisibleSelection,
    deselectAll,
    batchDownload,
    batchSetStatus,
    deleteFilesNow,
    batchDelete,
  } = useAuthFilesData({ refreshKeyStats });

  const statusBarCache = useAuthFilesStatusBarCache(files, usageDetails);

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
    checking: batchChecking,
    batchCheckJob,
    progress: batchCheckProgress,
    batchCheckResponse,
    resultsMap,
    skippedMap,
    lastRequestedNames,
    runBatchCheck,
  } = useAuthFilesBatchCheck();

  const {
    modelsModalOpen,
    modelsLoading,
    modelsList,
    modelsFileName,
    modelsFileType,
    modelsError,
    showModels,
    closeModelsModal,
  } = useAuthFilesModels();

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
    loadKeyStats: refreshKeyStats,
  });

  const disableControls = connectionStatus !== 'connected';
  const normalizedFilter = normalizeProviderKey(String(filter));
  const quotaFilterType: QuotaProviderType | null = QUOTA_PROVIDER_TYPES.has(
    normalizedFilter as QuotaProviderType
  )
    ? (normalizedFilter as QuotaProviderType)
    : null;
  const pageSize = compactMode ? pageSizeByMode.compact : pageSizeByMode.regular;

  useEffect(() => {
    const persistedCompactMode = readPersistedAuthFilesCompactMode();
    if (typeof persistedCompactMode === 'boolean') {
      setCompactMode(persistedCompactMode);
    }

    const persisted = readAuthFilesUiState();
    if (persisted) {
      if (typeof persisted.filter === 'string' && persisted.filter.trim()) {
        setFilter(persisted.filter);
      }
      if (typeof persisted.problemOnly === 'boolean') {
        setProblemOnly(persisted.problemOnly);
      }
      if (typeof persisted.enabledOnly === 'boolean') {
        setEnabledOnly(persisted.enabledOnly);
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
      problemOnly,
      enabledOnly,
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
    batchCheckConcurrency,
    compactMode,
    enabledOnly,
    filter,
    page,
    pageSize,
    pageSizeByMode,
    problemOnly,
    search,
    sortMode,
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

  const commitPageSizeInput = (rawValue: string) => {
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
  };

  const handlePageSizeChange = (event: ChangeEvent<HTMLInputElement>) => {
    const rawValue = event.currentTarget.value;
    setPageSizeInput(rawValue);

    const trimmed = rawValue.trim();
    if (!trimmed) return;

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return;

    const rounded = Math.round(parsed);
    if (rounded < MIN_CARD_PAGE_SIZE || rounded > MAX_CARD_PAGE_SIZE) return;

    setCurrentModePageSize(rounded);
    setPage(1);
  };

  const handleSortModeChange = useCallback(
    (value: string) => {
      if (!isAuthFilesSortMode(value) || value === sortMode) return;
      setSortMode(value);
      setPage(1);
      void loadFiles().catch(() => {});
    },
    [loadFiles, sortMode]
  );

  const handleHeaderRefresh = useCallback(async () => {
    await Promise.all([loadFiles(), refreshKeyStats(), loadExcluded(), loadModelAlias()]);
  }, [loadFiles, refreshKeyStats, loadExcluded, loadModelAlias]);

  useHeaderRefresh(handleHeaderRefresh);

  useEffect(() => {
    if (!isCurrentLayer) return;
    loadFiles();
    void loadKeyStats().catch(() => {});
    loadExcluded();
    loadModelAlias();
  }, [isCurrentLayer, loadFiles, loadKeyStats, loadExcluded, loadModelAlias]);

  useInterval(
    () => {
      void refreshKeyStats().catch(() => {});
    },
    isCurrentLayer ? 240_000 : null
  );

  const existingTypes = useMemo(() => {
    const types = new Set<string>(['all']);
    files.forEach((file) => {
      if (file.type) {
        types.add(file.type);
      }
    });
    return Array.from(types);
  }, [files]);

  const filesMatchingViewFilters = useMemo(
    () => (enabledOnly ? files.filter((file) => file.disabled !== true) : files),
    [enabledOnly, files]
  );

  const filesMatchingProblemFilter = useMemo(
    () =>
      problemOnly ? filesMatchingViewFilters.filter(hasAuthFileStatusMessage) : filesMatchingViewFilters,
    [filesMatchingViewFilters, problemOnly]
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
    const counts: Record<string, number> = { all: filesMatchingProblemFilter.length };
    filesMatchingProblemFilter.forEach((file) => {
      if (!file.type) return;
      counts[file.type] = (counts[file.type] || 0) + 1;
    });
    return counts;
  }, [filesMatchingProblemFilter]);

  const authFilesScopedPoolSummary = useMemo<AuthFileScopedPoolSummary | null>(() => {
    const entriesByState: Record<AuthFileScopedPoolState, AuthFileScopedPoolEntry[]> = {
      in_pool: [],
      standby: [],
      penalized: [],
      ejected: [],
      disabled: [],
      configured: [],
    };
    const providerMap = new Map<string, AuthFileScopedPoolProviderBucket>();
    let totalFileCount = 0;

    files.forEach((file) => {
      if (isRuntimeOnlyAuthFile(file)) return;
      totalFileCount += 1;

      const poolConfigured = readBooleanField(file.poolConfigured ?? file['pool_configured']) ?? false;
      const poolEnabled = readBooleanField(file.poolEnabled ?? file['pool_enabled']) ?? false;
      const poolState = readStringField(file.poolState ?? file['pool_state']);
      const poolReason = readStringField(file.poolReason ?? file['pool_reason']);
      const remainingPercent = readNumberField(
        file.poolRemainingPercent ?? file['pool_remaining_percent']
      );
      const lastQuotaCheckedAt = readDateField(
        file.poolLastQuotaCheckedAt ?? file['pool_last_quota_checked_at']
      );
      const managed = poolConfigured || poolEnabled || poolState !== '' || poolReason !== '';
      if (!managed) return;

      const providerKey =
        normalizeProviderKey(String(file.provider ?? file.type ?? 'unknown')) || 'unknown';
      const providerLabel = getTypeLabel(t, providerKey);
      const derivedStateKey = file.disabled
        ? 'disabled'
        : poolState
          ? getScopedPoolStateKey(poolState)
          : poolConfigured
            ? 'configured'
            : 'configured';
      const state: AuthFileScopedPoolState =
        derivedStateKey === 'in_pool' ||
        derivedStateKey === 'standby' ||
        derivedStateKey === 'penalized' ||
        derivedStateKey === 'ejected' ||
        derivedStateKey === 'disabled'
          ? derivedStateKey
          : 'configured';
      const reasonKey = getScopedPoolReasonKey(poolReason);
      const entry: AuthFileScopedPoolEntry = {
        name: file.name,
        providerKey,
        providerLabel,
        state,
        stateLabel: t(`auth_files.pool_state_${state}`),
        reasonKey,
        reasonLabel: reasonKey !== 'none' ? t(`auth_files.pool_reason_${reasonKey}`) : '',
        remainingPercent,
        lastQuotaCheckedAt,
      };

      entriesByState[state].push(entry);

      if (!providerMap.has(providerKey)) {
        providerMap.set(providerKey, {
          providerKey,
          providerLabel,
          managedCount: 0,
          activeCount: 0,
          standbyCount: 0,
          penalizedCount: 0,
          ejectedCount: 0,
          disabledCount: 0,
          entries: [],
        });
      }

      const providerBucket = providerMap.get(providerKey)!;
      providerBucket.managedCount += 1;
      providerBucket.entries.push(entry);
      if (state === 'in_pool') providerBucket.activeCount += 1;
      if (state === 'standby') providerBucket.standbyCount += 1;
      if (state === 'penalized') providerBucket.penalizedCount += 1;
      if (state === 'ejected') providerBucket.ejectedCount += 1;
      if (state === 'disabled') providerBucket.disabledCount += 1;
    });

    const sortEntries = (items: AuthFileScopedPoolEntry[]) =>
      [...items].sort((left, right) => {
        const providerCompare = left.providerLabel.localeCompare(right.providerLabel, undefined, {
          sensitivity: 'base',
        });
        if (providerCompare !== 0) return providerCompare;
        return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
      });

    const providerBuckets = Array.from(providerMap.values())
      .map((bucket) => ({
        ...bucket,
        entries: sortEntries(bucket.entries),
      }))
      .sort((left, right) => {
        if (right.activeCount !== left.activeCount) return right.activeCount - left.activeCount;
        if (right.managedCount !== left.managedCount) return right.managedCount - left.managedCount;
        return left.providerLabel.localeCompare(right.providerLabel, undefined, {
          sensitivity: 'base',
        });
      });

    const activeCount = entriesByState.in_pool.length;
    const standbyCount = entriesByState.standby.length;
    const penalizedCount = entriesByState.penalized.length;
    const ejectedCount = entriesByState.ejected.length;
    const disabledCount = entriesByState.disabled.length;
    const configuredCount = entriesByState.configured.length;
    const managedCount =
      activeCount + standbyCount + penalizedCount + ejectedCount + disabledCount + configuredCount;

    if (managedCount === 0) return null;

    return {
      totalFileCount,
      managedCount,
      providerCount: providerBuckets.length,
      activeProviderCount: providerBuckets.filter((bucket) => bucket.activeCount > 0).length,
      activeCount,
      standbyCount,
      penalizedCount,
      ejectedCount,
      disabledCount,
      configuredCount,
      effective: activeCount + standbyCount + penalizedCount + ejectedCount + disabledCount > 0,
      providerBuckets,
      entriesByState: {
        in_pool: sortEntries(entriesByState.in_pool),
        standby: sortEntries(entriesByState.standby),
        penalized: sortEntries(entriesByState.penalized),
        ejected: sortEntries(entriesByState.ejected),
        disabled: sortEntries(entriesByState.disabled),
        configured: sortEntries(entriesByState.configured),
      },
    };
  }, [files, t]);

  const authFilesScopedPoolMetrics = useMemo(() => {
    if (!authFilesScopedPoolSummary) return [];

    return [
      {
        key: 'in_pool',
        label: t('auth_files.scoped_pool_auth_active_count'),
        value: formatNumber(authFilesScopedPoolSummary.activeCount),
      },
      {
        key: 'standby',
        label: t('auth_files.scoped_pool_auth_standby_count'),
        value: formatNumber(authFilesScopedPoolSummary.standbyCount),
      },
      {
        key: 'penalized',
        label: t('auth_files.scoped_pool_auth_penalized_count'),
        value: formatNumber(authFilesScopedPoolSummary.penalizedCount),
      },
      {
        key: 'ejected',
        label: t('auth_files.scoped_pool_auth_ejected_count'),
        value: formatNumber(authFilesScopedPoolSummary.ejectedCount),
      },
      {
        key: 'disabled',
        label: t('auth_files.scoped_pool_auth_disabled_count'),
        value: formatNumber(authFilesScopedPoolSummary.disabledCount),
      },
      {
        key: 'managed',
        label: t('auth_files.scoped_pool_auth_managed_count'),
        value: formatNumber(authFilesScopedPoolSummary.managedCount),
      },
      {
        key: 'providers',
        label: t('auth_files.scoped_pool_auth_provider_count'),
        value: formatNumber(authFilesScopedPoolSummary.providerCount),
        hint: t('auth_files.scoped_pool_auth_provider_count_hint', {
          count: authFilesScopedPoolSummary.activeProviderCount,
        }),
      },
    ];
  }, [authFilesScopedPoolSummary, t]);

  const authFilesScopedPoolSections = useMemo(() => {
    if (!authFilesScopedPoolSummary) return [];

    return [
      {
        key: 'in_pool',
        label: t('auth_files.pool_state_in_pool'),
        description: t('auth_files.scoped_pool_auth_detail_in_pool_desc'),
        entries: authFilesScopedPoolSummary.entriesByState.in_pool,
      },
      {
        key: 'standby',
        label: t('auth_files.pool_state_standby'),
        description: t('auth_files.scoped_pool_auth_detail_standby_desc'),
        entries: authFilesScopedPoolSummary.entriesByState.standby,
      },
      {
        key: 'penalized',
        label: t('auth_files.pool_state_penalized'),
        description: t('auth_files.scoped_pool_auth_detail_penalized_desc'),
        entries: authFilesScopedPoolSummary.entriesByState.penalized,
      },
      {
        key: 'ejected',
        label: t('auth_files.pool_state_ejected'),
        description: t('auth_files.scoped_pool_auth_detail_ejected_desc'),
        entries: authFilesScopedPoolSummary.entriesByState.ejected,
      },
      {
        key: 'disabled',
        label: t('auth_files.pool_state_disabled'),
        description: t('auth_files.scoped_pool_auth_detail_disabled_desc'),
        entries: authFilesScopedPoolSummary.entriesByState.disabled,
      },
      {
        key: 'configured',
        label: t('auth_files.pool_state_configured'),
        description: t('auth_files.scoped_pool_auth_detail_configured_desc'),
        entries: authFilesScopedPoolSummary.entriesByState.configured,
      },
    ].filter((section) => section.entries.length > 0);
  }, [authFilesScopedPoolSummary, t]);

  const normalizedSearch = search.trim();
  const wildcardSearch = useMemo(() => buildWildcardSearch(normalizedSearch), [normalizedSearch]);

  const filtered = useMemo(() => {
    const normalizedTerm = normalizedSearch.toLowerCase();

    return filesMatchingProblemFilter.filter((item) => {
      const matchType = filter === 'all' || item.type === filter;
      const matchSearch =
        !normalizedSearch ||
        [item.name, item.type, item.provider].some((value) => {
          const content = (value || '').toString();
          return wildcardSearch
            ? wildcardSearch.test(content)
            : content.toLowerCase().includes(normalizedTerm);
        });
      return matchType && matchSearch;
    });
  }, [filesMatchingProblemFilter, filter, normalizedSearch, wildcardSearch]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    if (sortMode === 'default') {
      copy.sort((a, b) => {
        const providerA = normalizeProviderKey(String(a.provider ?? a.type ?? 'unknown'));
        const providerB = normalizeProviderKey(String(b.provider ?? b.type ?? 'unknown'));
        const providerCompare = providerA.localeCompare(providerB);
        if (providerCompare !== 0) return providerCompare;
        return a.name.localeCompare(b.name);
      });
    } else if (sortMode === 'az') {
      copy.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortMode === 'priority') {
      copy.sort((a, b) => {
        const pa = parsePriorityValue(a.priority ?? a['priority']) ?? 0;
        const pb = parsePriorityValue(b.priority ?? b['priority']) ?? 0;
        return pb - pa; // 高优先级排前面
      });
    }
    return copy;
  }, [filtered, sortMode]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageItems = sorted.slice(start, start + pageSize);
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
    switch (batchCheckScope) {
      case 'selected':
        return selectedNames;
      case 'filtered':
        return sorted.map((file) => file.name);
      case 'page':
      default:
        return batchCheckPageNames;
    }
  }, [batchCheckPageNames, batchCheckScope, selectedNames, sorted]);
  const selectedHasStatusUpdating = useMemo(
    () => selectedNames.some((name) => statusUpdating[name] === true),
    [selectedNames, statusUpdating]
  );
  const liveBatchCheckResponse = useMemo(
    () => buildBatchCheckLiveResponse(batchCheckResponse, files),
    [batchCheckResponse, files]
  );
  const batchCheckDisplaySummary = liveBatchCheckResponse?.summary ?? (batchCheckJob ? EMPTY_BATCH_CHECK_SUMMARY : null);
  const batchCheckDisplayAggregate =
    liveBatchCheckResponse?.aggregate ?? (batchCheckJob ? EMPTY_BATCH_CHECK_AGGREGATE : null);
  const hasBatchCheckSnapshot = Boolean(batchCheckDisplaySummary && batchCheckDisplayAggregate);
  const hasBatchCheckDisplayResults = Boolean(
    liveBatchCheckResponse &&
      ((liveBatchCheckResponse.results ?? []).length > 0 || (liveBatchCheckResponse.skipped ?? []).length > 0)
  );
  const batchCheckActionCandidates = batchCheckDisplayAggregate?.action_candidates ?? null;
  const batchCheckHeroMetrics = useMemo(() => {
    if (!batchCheckDisplaySummary || !batchCheckDisplayAggregate) return [];

    return [
      {
        key: 'remaining',
        label: t('auth_files.batch_check_total_remaining'),
        value: `${formatNumber(batchCheckDisplayAggregate.capacity_overview.remaining_total)} / ${formatNumber(batchCheckDisplayAggregate.capacity_overview.total_capacity)}`,
        hint: formatBatchCheckPercent(batchCheckDisplayAggregate.capacity_overview.remaining_percent),
      },
      {
        key: 'equivalent',
        label: t('auth_files.batch_check_equivalent_accounts'),
        value: formatBatchCheckNumber(batchCheckDisplayAggregate.capacity_overview.equivalent_full_accounts),
      },
      {
        key: 'available',
        label: t('auth_files.batch_check_available_count'),
        value: formatNumber(batchCheckDisplaySummary.available_count),
      },
      {
        key: 'processed',
        label: t('auth_files.batch_check_processed_count'),
        value: formatNumber(batchCheckDisplayAggregate.scope_overview.processed_count),
        hint: t('auth_files.batch_check_scope_count', { count: lastRequestedNames.length }),
      },
      {
        key: 'enabled',
        label: t('auth_files.batch_check_enabled_count'),
        value: formatNumber(batchCheckDisplayAggregate.scope_overview.enabled_count),
      },
      {
        key: 'disabled',
        label: t('auth_files.batch_check_disabled_count'),
        value: formatNumber(batchCheckDisplayAggregate.scope_overview.disabled_count),
      },
      {
        key: 'invalidated',
        label: t('auth_files.batch_check_invalidated_count'),
        value: formatNumber(batchCheckDisplayAggregate.risk_overview.invalidated_401_count),
      },
      {
        key: 'noQuota',
        label: t('auth_files.batch_check_no_quota_count'),
        value: formatNumber(batchCheckDisplayAggregate.risk_overview.no_quota_count),
      },
      {
        key: 'apiError',
        label: t('auth_files.batch_check_api_error_count'),
        value: formatNumber(batchCheckDisplayAggregate.risk_overview.api_error_count),
      },
      {
        key: 'requestFailed',
        label: t('auth_files.batch_check_request_failed_count'),
        value: formatNumber(batchCheckDisplayAggregate.risk_overview.request_failed_count),
      },
      {
        key: 'low129',
        label: t('auth_files.batch_check_low_remaining_1_29'),
        value: formatNumber(batchCheckDisplayAggregate.risk_overview.low_remaining_1_29_count),
      },
      {
        key: 'low149',
        label: t('auth_files.batch_check_low_remaining_1_49'),
        value: formatNumber(batchCheckDisplayAggregate.risk_overview.mid_low_remaining_1_49_count),
      },
    ];
  }, [batchCheckDisplayAggregate, batchCheckDisplaySummary, lastRequestedNames.length, t]);
  const batchCheckScopeOptions = useMemo(
    () => [
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
        label: t('auth_files.batch_check_scope_filtered', {
          count: sorted.length,
        }),
      },
    ],
    [batchCheckPageNames.length, selectedNames.length, sorted.length, t]
  );
  const lastBatchCheckScopeLabel = useMemo(() => {
    switch (lastBatchCheckScope) {
      case 'selected':
        return t('auth_files.batch_check_scope_selected_short');
      case 'filtered':
        return t('auth_files.batch_check_scope_filtered_short');
      case 'page':
      default:
        return t('auth_files.batch_check_scope_page_short');
    }
  }, [lastBatchCheckScope, t]);
  const batchStatusButtonsDisabled =
    disableControls ||
    selectedNames.length === 0 ||
    batchStatusUpdating ||
    selectedHasStatusUpdating;

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

  const handleOpenBatchCheckDetails = useCallback((name?: string) => {
    setBatchCheckFocusName(name ?? '');
    setBatchCheckModalOpen(true);
  }, []);

  const handleCloseBatchCheckDetails = useCallback(() => {
    setBatchCheckModalOpen(false);
    setBatchCheckFocusName('');
  }, []);

  const handleOpenAuthFilesScopedPoolDetails = useCallback(() => {
    setAuthFilesScopedPoolModalOpen(true);
  }, []);

  const handleCloseAuthFilesScopedPoolDetails = useCallback(() => {
    setAuthFilesScopedPoolModalOpen(false);
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
      () => deleteFilesNow(names),
      'danger'
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
    const names = batchCheckActionCandidates?.reenable_names ?? [];
    if (names.length === 0) return;

    handleBatchCheckSummaryAction(
      'reenable_recovered',
      t('auth_files.batch_check_action_reenable_recovered'),
      t('auth_files.batch_check_confirm_reenable_recovered', {
        count: names.length,
        bucket: t(
          `auth_files.batch_check_bucket_${batchCheckActionCandidates?.reenable_threshold_bucket ?? 'danger'}`
        ),
      }),
      () => batchSetStatus(names, true)
    );
  }, [batchCheckActionCandidates, batchSetStatus, handleBatchCheckSummaryAction, t]);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;

    const actionsEl = floatingBatchActionsRef.current;
    if (!actionsEl) {
      document.documentElement.style.removeProperty('--auth-files-action-bar-height');
      return;
    }

    const updatePadding = () => {
      const height = actionsEl.getBoundingClientRect().height;
      document.documentElement.style.setProperty('--auth-files-action-bar-height', `${height}px`);
    };

    updatePadding();
    window.addEventListener('resize', updatePadding);

    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updatePadding);
    ro?.observe(actionsEl);

    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', updatePadding);
      document.documentElement.style.removeProperty('--auth-files-action-bar-height');
    };
  }, [batchActionBarVisible, selectionCount]);

  useEffect(() => {
    selectionCountRef.current = selectionCount;
    if (selectionCount > 0) {
      setBatchActionBarVisible(true);
    }
  }, [selectionCount]);

  useLayoutEffect(() => {
    if (!batchActionBarVisible) return;
    const currentCount = selectionCount;
    const previousCount = previousSelectionCountRef.current;
    const actionsEl = floatingBatchActionsRef.current;
    if (!actionsEl) return;

    batchActionAnimationRef.current?.stop();
    batchActionAnimationRef.current = null;

    if (currentCount > 0 && previousCount === 0) {
      batchActionAnimationRef.current = animate(
        actionsEl,
        {
          transform: [BATCH_BAR_HIDDEN_TRANSFORM, BATCH_BAR_BASE_TRANSFORM],
          opacity: [0, 1],
        },
        {
          duration: 0.28,
          ease: easePower3Out,
          onComplete: () => {
            actionsEl.style.transform = BATCH_BAR_BASE_TRANSFORM;
            actionsEl.style.opacity = '1';
          },
        }
      );
    } else if (currentCount === 0 && previousCount > 0) {
      batchActionAnimationRef.current = animate(
        actionsEl,
        {
          transform: [BATCH_BAR_BASE_TRANSFORM, BATCH_BAR_HIDDEN_TRANSFORM],
          opacity: [1, 0],
        },
        {
          duration: 0.22,
          ease: easePower2In,
          onComplete: () => {
            if (selectionCountRef.current === 0) {
              setBatchActionBarVisible(false);
            }
          },
        }
      );
    }

    previousSelectionCountRef.current = currentCount;
  }, [batchActionBarVisible, selectionCount]);

  useEffect(
    () => () => {
      batchActionAnimationRef.current?.stop();
      batchActionAnimationRef.current = null;
    },
    []
  );

  const renderFilterTags = () => (
    <div className={styles.filterRail}>
      <div className={styles.filterTags}>
        {existingTypes.map((type) => {
          const isActive = filter === type;
          const iconSrc = getAuthFileIcon(type, resolvedTheme);
          const color =
            type === 'all'
              ? { bg: 'var(--bg-tertiary)', text: 'var(--text-primary)' }
              : getTypeColor(type, resolvedTheme);
          const buttonStyle = {
            '--filter-color': color.text,
            '--filter-surface': color.bg,
            '--filter-active-text': resolvedTheme === 'dark' ? '#111827' : '#ffffff',
          } as CSSProperties;

          return (
            <button
              key={type}
              className={`${styles.filterTag} ${isActive ? styles.filterTagActive : ''}`}
              style={buttonStyle}
              onClick={() => {
                setFilter(type);
                setPage(1);
              }}
            >
              <span className={styles.filterTagLabel}>
                {type === 'all' ? (
                  <span className={`${styles.filterTagIconWrap} ${styles.filterAllIconWrap}`}>
                    <IconFilterAll className={styles.filterAllIcon} size={16} />
                  </span>
                ) : (
                  <span className={styles.filterTagIconWrap}>
                    {iconSrc ? (
                      <img src={iconSrc} alt="" className={styles.filterTagIcon} />
                    ) : (
                      <span className={styles.filterTagIconFallback}>
                        {getTypeLabel(t, type).slice(0, 1).toUpperCase()}
                      </span>
                    )}
                  </span>
                )}
                <span className={styles.filterTagText}>{getTypeLabel(t, type)}</span>
              </span>
              <span className={styles.filterTagCount}>{typeCounts[type] ?? 0}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const titleNode = (
    <div className={styles.titleWrapper}>
      <span>{t('auth_files.title_section')}</span>
      {files.length > 0 && <span className={styles.countBadge}>{files.length}</span>}
    </div>
  );

  const deleteAllButtonLabel = problemOnly
    ? filter === 'all'
      ? t('auth_files.delete_problem_button')
      : t('auth_files.delete_problem_button_with_type', { type: getTypeLabel(t, filter) })
    : filter === 'all'
      ? t('auth_files.delete_all_button')
      : `${t('common.delete')} ${getTypeLabel(t, filter)}`;

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{t('auth_files.title')}</h1>
        <p className={styles.description}>{t('auth_files.description')}</p>
      </div>

      <Card
        title={titleNode}
        extra={
          <div className={styles.headerActions}>
            <Button variant="secondary" size="sm" onClick={handleHeaderRefresh} disabled={loading}>
              {t('common.refresh')}
            </Button>
            <Button
              size="sm"
              onClick={handleUploadClick}
              disabled={disableControls || uploading}
              loading={uploading}
            >
              {t('auth_files.upload_button')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() =>
                handleDeleteAll({
                  filter,
                  problemOnly,
                  onResetFilterToAll: () => setFilter('all'),
                  onResetProblemOnly: () => setProblemOnly(false),
                })
              }
              disabled={disableControls || loading || deletingAll}
              loading={deletingAll}
            >
              {deleteAllButtonLabel}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              multiple
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>
        }
      >
        {error && <div className={styles.errorBox}>{error}</div>}

        <div className={styles.batchCheckPanel}>
          <div className={styles.batchCheckPanelHeader}>
            <div className={styles.batchCheckPanelTitleWrap}>
              <h2 className={styles.batchCheckPanelTitle}>{t('auth_files.batch_check_title')}</h2>
              <p className={styles.batchCheckPanelDescription}>
                {t('auth_files.batch_check_description')}
              </p>
            </div>
            <div className={styles.batchCheckPanelActions}>
              <div className={styles.batchCheckInlineControls}>
                <div className={styles.batchCheckScopeControl}>
                  <span className={styles.batchCheckScopeLabel}>
                    {t('auth_files.batch_check_scope_label')}
                  </span>
                  <Select
                    value={batchCheckScope}
                    options={batchCheckScopeOptions}
                    onChange={(value) => setBatchCheckScope(value as BatchCheckScope)}
                    ariaLabel={t('auth_files.batch_check_scope_label')}
                    disabled={disableControls || batchChecking}
                  />
                </div>
                <div className={styles.batchCheckConcurrencyControl}>
                  <span className={styles.batchCheckScopeLabel}>
                    {t('auth_files.batch_check_concurrency_label')}
                  </span>
                  <input
                    className={styles.batchCheckConcurrencyInput}
                    type="number"
                    min={MIN_BATCH_CHECK_CONCURRENCY}
                    max={MAX_BATCH_CHECK_CONCURRENCY}
                    step={1}
                    value={batchCheckConcurrencyInput}
                    onChange={handleBatchCheckConcurrencyChange}
                    onBlur={(event) => commitBatchCheckConcurrencyInput(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.currentTarget.blur();
                      }
                    }}
                    disabled={disableControls || batchChecking}
                    aria-label={t('auth_files.batch_check_concurrency_label')}
                  />
                </div>
                <Button
                  className={styles.batchCheckStartButton}
                  size="sm"
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
            <div className={styles.batchCheckProgressSection}>
              <div className={styles.batchCheckPanelMeta}>
                <span>
                  {t('auth_files.batch_check_scope_label')}: {lastBatchCheckScopeLabel}
                </span>
                <span>
                  {t('auth_files.batch_check_scope_count', {
                    count: lastRequestedNames.length,
                  })}
                </span>
                <span>
                  {t('auth_files.batch_check_concurrency_label')}: {batchCheckJob.scope.concurrency}
                </span>
                <span>
                  {t('auth_files.batch_check_progress_status', {
                    status:
                      batchCheckJob.status === 'pending'
                        ? t('auth_files.batch_check_status_pending')
                        : t('auth_files.batch_check_status_running'),
                  })}
                </span>
              </div>
              <div className={styles.batchCheckProgressHeader}>
                <strong>{t('auth_files.batch_check_progress_title')}</strong>
                <span>{batchCheckProgress.percent}%</span>
              </div>
              <div className={styles.batchCheckProgressBar}>
                <div
                  className={styles.batchCheckProgressBarFill}
                  style={{ width: `${batchCheckProgress.percent}%` }}
                />
              </div>
              <div className={styles.batchCheckSummaryGrid}>
                <div className={styles.batchCheckSummaryCard}>
                  <span className={styles.batchCheckSummaryLabel}>
                    {t('auth_files.batch_check_progress_completed')}
                  </span>
                  <strong className={styles.batchCheckSummaryValue}>
                    {batchCheckProgress.completed}/{batchCheckProgress.total}
                  </strong>
                </div>
                <div className={styles.batchCheckSummaryCard}>
                  <span className={styles.batchCheckSummaryLabel}>
                    {t('auth_files.batch_check_progress_success')}
                  </span>
                  <strong className={styles.batchCheckSummaryValue}>
                    {batchCheckProgress.success}
                  </strong>
                </div>
                <div className={styles.batchCheckSummaryCard}>
                  <span className={styles.batchCheckSummaryLabel}>
                    {t('auth_files.batch_check_progress_failed')}
                  </span>
                  <strong className={styles.batchCheckSummaryValue}>
                    {batchCheckProgress.failed}
                  </strong>
                </div>
                <div className={styles.batchCheckSummaryCard}>
                  <span className={styles.batchCheckSummaryLabel}>
                    {t('auth_files.batch_check_skipped_count')}
                  </span>
                  <strong className={styles.batchCheckSummaryValue}>
                    {batchCheckProgress.skipped}
                  </strong>
                </div>
              </div>
              <div className={styles.batchCheckProgressHint}>
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

          {hasBatchCheckSnapshot && batchCheckDisplaySummary && batchCheckDisplayAggregate ? (
            <>
              <div className={styles.batchCheckPanelMeta}>
                <span>
                  {t('auth_files.batch_check_last_checked')}:{' '}
                  {liveBatchCheckResponse?.checked_at
                    ? formatDateTime(liveBatchCheckResponse.checked_at)
                    : t('common.not_set')}
                </span>
                <span>
                  {t('auth_files.batch_check_scope_label')}: {lastBatchCheckScopeLabel}
                </span>
                <span>
                  {t('auth_files.batch_check_scope_count', {
                    count: lastRequestedNames.length,
                  })}
                </span>
                <span>
                  {t('auth_files.batch_check_concurrency_label')}:{' '}
                  {batchCheckJob?.scope.concurrency ?? batchCheckConcurrency}
                </span>
                <span>
                  {t('auth_files.batch_check_next_refresh_at')}: {' '}
                  {batchCheckDisplayAggregate.refresh_overview.next_refresh_at
                    ? formatDateTime(batchCheckDisplayAggregate.refresh_overview.next_refresh_at)
                    : t('common.not_set')}
                </span>
              </div>

              <div className={styles.batchCheckHeroGrid}>
                {batchCheckHeroMetrics.map((item) => (
                  <div key={item.key} className={styles.batchCheckHeroCard}>
                    <span className={styles.batchCheckHeroLabel}>{item.label}</span>
                    <strong className={styles.batchCheckHeroValue}>{item.value}</strong>
                    {item.hint ? <span className={styles.batchCheckHeroHint}>{item.hint}</span> : null}
                  </div>
                ))}
              </div>

              <div className={styles.batchCheckActionBar}>
                <div className={styles.batchCheckActionHint}>
                  {t('auth_files.batch_check_summary_hint')}
                </div>
                <div className={styles.batchCheckActionButtons}>
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
                      batchStatusUpdating ||
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
                      batchStatusUpdating ||
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
                      batchStatusUpdating ||
                      batchCheckActionPending !== null ||
                      (batchCheckActionCandidates?.reenable_names.length ?? 0) === 0
                    }
                    loading={batchCheckActionPending === 'reenable_recovered'}
                  >
                    {`${t('auth_files.batch_check_action_reenable_recovered')} (${batchCheckActionCandidates?.reenable_names.length ?? 0})`}
                  </Button>
                </div>
              </div>
            </>
          ) : !batchChecking ? (
            <div className={styles.batchCheckEmptyHint}>
              {t('auth_files.batch_check_empty_desc')}
            </div>
          ) : null}
        </div>

        {authFilesScopedPoolSummary ? (
          <div className={styles.scopedPoolAuthPanel}>
            <div className={styles.scopedPoolAuthPanelHeader}>
              <div className={styles.batchCheckPanelTitleWrap}>
                <h2 className={styles.batchCheckPanelTitle}>
                  {t('auth_files.scoped_pool_auth_title')}
                </h2>
                <p className={styles.batchCheckPanelDescription}>
                  {t('auth_files.scoped_pool_auth_description')}
                </p>
              </div>
              <div className={styles.scopedPoolAuthPanelActions}>
                <span
                  className={`${styles.batchCheckBadge} ${
                    authFilesScopedPoolSummary.effective
                      ? styles.batchCheckBadgeSuccess
                      : styles.batchCheckBadgeMuted
                  }`}
                >
                  {authFilesScopedPoolSummary.effective
                    ? t('auth_files.scoped_pool_auth_effective')
                    : t('auth_files.scoped_pool_auth_configured')}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleOpenAuthFilesScopedPoolDetails}
                >
                  {t('auth_files.scoped_pool_auth_view_details')}
                </Button>
              </div>
            </div>

            <div className={styles.batchCheckPanelMeta}>
              <span>
                {t('auth_files.scoped_pool_auth_total_files', {
                  count: authFilesScopedPoolSummary.totalFileCount,
                })}
              </span>
              <span>
                {t('auth_files.scoped_pool_auth_managed_files', {
                  count: authFilesScopedPoolSummary.managedCount,
                })}
              </span>
              {authFilesScopedPoolSummary.configuredCount > 0 ? (
                <span>
                  {t('auth_files.scoped_pool_auth_configured_only', {
                    count: authFilesScopedPoolSummary.configuredCount,
                  })}
                </span>
              ) : null}
            </div>

            <div className={styles.batchCheckSummaryGrid}>
              {authFilesScopedPoolMetrics.map((item) => (
                <div key={item.key} className={styles.batchCheckSummaryCard}>
                  <span className={styles.batchCheckSummaryLabel}>{item.label}</span>
                  <strong className={styles.batchCheckSummaryValue}>{item.value}</strong>
                  {item.hint ? <span className={styles.batchCheckHeroHint}>{item.hint}</span> : null}
                </div>
              ))}
            </div>

            <div className={styles.scopedPoolAuthCategorySection}>
              <div className={styles.scopedPoolAuthCategoryHeader}>
                <span className={styles.batchCheckSummaryLabel}>
                  {t('auth_files.scoped_pool_auth_provider_groups')}
                </span>
              </div>
              <div className={styles.scopedPoolAuthCategoryList}>
                {authFilesScopedPoolSummary.providerBuckets.map((bucket) => (
                  <span key={bucket.providerKey} className={styles.scopedPoolAuthCategoryChip}>
                    <strong>{bucket.providerLabel}</strong>
                    <span>
                      {t('auth_files.scoped_pool_auth_provider_chip', {
                        active: bucket.activeCount,
                        standby: bucket.standbyCount,
                        total: bucket.managedCount,
                      })}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <div className={styles.filterSection}>
          {renderFilterTags()}

          <div className={styles.filterContent}>
            <div className={styles.filterControlsPanel}>
              <div className={styles.filterControls}>
                <div className={styles.filterItem}>
                  <label>{t('auth_files.search_label')}</label>
                  <Input
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    placeholder={t('auth_files.search_placeholder')}
                  />
                </div>
                <div className={styles.filterItem}>
                  <label>{t('auth_files.page_size_label')}</label>
                  <input
                    className={styles.pageSizeSelect}
                    type="number"
                    min={MIN_CARD_PAGE_SIZE}
                    max={MAX_CARD_PAGE_SIZE}
                    step={1}
                    value={pageSizeInput}
                    onChange={handlePageSizeChange}
                    onBlur={(e) => commitPageSizeInput(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur();
                      }
                    }}
                  />
                </div>
                <div className={styles.filterItem}>
                  <label>{t('auth_files.sort_label')}</label>
                  <Select
                    className={styles.sortSelect}
                    value={sortMode}
                    options={sortOptions}
                    onChange={handleSortModeChange}
                    ariaLabel={t('auth_files.sort_label')}
                    fullWidth
                  />
                </div>
                <div className={`${styles.filterItem} ${styles.filterToggleItem}`}>
                  <label>{t('auth_files.display_options_label')}</label>
                  <div className={styles.filterToggleGroup}>
                    <div className={styles.filterToggleCard}>
                      <ToggleSwitch
                        checked={problemOnly}
                        onChange={(value) => {
                          setProblemOnly(value);
                          setPage(1);
                        }}
                        ariaLabel={t('auth_files.problem_filter_only')}
                        label={
                          <span className={styles.filterToggleLabel}>
                            {t('auth_files.problem_filter_only')}
                          </span>
                        }
                      />
                    </div>
                    <div className={styles.filterToggleCard}>
                      <ToggleSwitch
                        checked={enabledOnly}
                        onChange={(value) => {
                          setEnabledOnly(value);
                          setPage(1);
                        }}
                        ariaLabel={t('auth_files.enabled_filter_only')}
                        label={
                          <span className={styles.filterToggleLabel}>
                            {t('auth_files.enabled_filter_only')}
                          </span>
                        }
                      />
                    </div>
                    <div className={styles.filterToggleCard}>
                      <ToggleSwitch
                        checked={compactMode}
                        onChange={(value) => setCompactMode(value)}
                        ariaLabel={t('auth_files.compact_mode_label')}
                        label={
                          <span className={styles.filterToggleLabel}>
                            {t('auth_files.compact_mode_label')}
                          </span>
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {loading ? (
              <div className={styles.hint}>{t('common.loading')}</div>
            ) : pageItems.length === 0 ? (
              <EmptyState
                title={t('auth_files.search_empty_title')}
                description={t('auth_files.search_empty_desc')}
              />
            ) : (
              <div
                className={`${styles.fileGrid} ${quotaFilterType ? styles.fileGridQuotaManaged : ''} ${compactMode ? styles.fileGridCompact : ''}`}
              >
                {pageItems.map((file) => (
                  <AuthFileCard
                    key={file.name}
                    file={file}
                    compact={compactMode}
                    selected={selectedFiles.has(file.name)}
                    resolvedTheme={resolvedTheme}
                    disableControls={disableControls}
                    deleting={deleting}
                    statusUpdating={statusUpdating}
                    quotaFilterType={quotaFilterType}
                    keyStats={keyStats}
                    statusBarCache={statusBarCache}
                    batchCheckResult={resultsMap.get(file.name) ?? null}
                    skippedReason={skippedMap.get(file.name)?.reason ?? null}
                    onShowModels={showModels}
                    onDownload={handleDownload}
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
          </div>
        </div>
      </Card>

      <OAuthExcludedCard
        disableControls={disableControls}
        excludedError={excludedError}
        excluded={excluded}
        onAdd={() => openExcludedEditor()}
        onEdit={openExcludedEditor}
        onDelete={deleteExcluded}
      />

      <OAuthModelAliasCard
        disableControls={disableControls}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
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

      <AuthFilesBatchCheckModal
        open={batchCheckModalOpen}
        response={liveBatchCheckResponse}
        focusName={batchCheckFocusName}
        onClose={handleCloseBatchCheckDetails}
      />

      <Modal
        open={authFilesScopedPoolModalOpen}
        onClose={handleCloseAuthFilesScopedPoolDetails}
        title={t('auth_files.scoped_pool_auth_modal_title')}
        width={980}
        className={styles.batchCheckModal}
        footer={
          <Button variant="secondary" onClick={handleCloseAuthFilesScopedPoolDetails}>
            {t('common.close')}
          </Button>
        }
      >
        {authFilesScopedPoolSummary ? (
          <div className={styles.scopedPoolAuthModalContent}>
            <div className={styles.batchCheckHeroGrid}>
              {authFilesScopedPoolMetrics.map((item) => (
                <div key={item.key} className={styles.batchCheckHeroCard}>
                  <span className={styles.batchCheckHeroLabel}>{item.label}</span>
                  <strong className={styles.batchCheckHeroValue}>{item.value}</strong>
                  {item.hint ? <span className={styles.batchCheckHeroHint}>{item.hint}</span> : null}
                </div>
              ))}
            </div>

            <div className={styles.batchCheckDetailModalGroup}>
              <div className={styles.batchCheckDetailModalHeader}>
                <div className={styles.batchCheckSectionTitleWrap}>
                  <span className={styles.batchCheckSectionTitle}>
                    {t('auth_files.scoped_pool_auth_provider_section_title')}
                  </span>
                  <span className={styles.batchCheckSectionDescription}>
                    {t('auth_files.scoped_pool_auth_provider_section_desc')}
                  </span>
                </div>
                <span className={styles.batchCheckDetailModalCount}>
                  {t('auth_files.scoped_pool_auth_provider_count_badge', {
                    count: authFilesScopedPoolSummary.providerCount,
                  })}
                </span>
              </div>
              <div className={styles.scopedPoolAuthProviderGrid}>
                {authFilesScopedPoolSummary.providerBuckets.map((bucket) => (
                  <div key={bucket.providerKey} className={styles.scopedPoolAuthProviderCard}>
                    <div className={styles.scopedPoolAuthProviderHeader}>
                      <div className={styles.batchCheckSectionTitleWrap}>
                        <span className={styles.batchCheckSectionTitle}>{bucket.providerLabel}</span>
                        <span className={styles.batchCheckSectionDescription}>
                          {t('auth_files.scoped_pool_auth_managed_files', {
                            count: bucket.managedCount,
                          })}
                        </span>
                      </div>
                      <span className={styles.batchCheckDetailModalCount}>
                        {bucket.activeCount > 0
                          ? t('auth_files.scoped_pool_auth_provider_active_badge', {
                              count: bucket.activeCount,
                            })
                          : bucket.standbyCount > 0
                            ? t('auth_files.scoped_pool_auth_provider_standby_badge', {
                                count: bucket.standbyCount,
                              })
                            : bucket.penalizedCount > 0
                              ? t('auth_files.scoped_pool_auth_provider_penalized_badge', {
                                  count: bucket.penalizedCount,
                                })
                              : bucket.ejectedCount > 0
                                ? t('auth_files.scoped_pool_auth_provider_ejected_badge', {
                                    count: bucket.ejectedCount,
                                  })
                                : t('auth_files.scoped_pool_auth_provider_disabled_badge', {
                                    count: bucket.disabledCount,
                                  })}
                      </span>
                    </div>
                    <div className={styles.batchCheckBadgeRow}>
                      <span className={`${styles.batchCheckBadge} ${styles.batchCheckBadgeSuccess}`}>
                        {t('auth_files.scoped_pool_auth_active_count')}: {bucket.activeCount}
                      </span>
                      <span className={`${styles.batchCheckBadge} ${styles.batchCheckBadgeOutline}`}>
                        {t('auth_files.scoped_pool_auth_standby_count')}: {bucket.standbyCount}
                      </span>
                      {bucket.penalizedCount > 0 ? (
                        <span className={`${styles.batchCheckBadge} ${styles.batchCheckBadgeWarning}`}>
                          {t('auth_files.scoped_pool_auth_penalized_count')}: {bucket.penalizedCount}
                        </span>
                      ) : null}
                      {bucket.ejectedCount > 0 ? (
                        <span className={`${styles.batchCheckBadge} ${styles.batchCheckBadgeDanger}`}>
                          {t('auth_files.scoped_pool_auth_ejected_count')}: {bucket.ejectedCount}
                        </span>
                      ) : null}
                      {bucket.disabledCount > 0 ? (
                        <span className={`${styles.batchCheckBadge} ${styles.batchCheckBadgeMuted}`}>
                          {t('auth_files.scoped_pool_auth_disabled_count')}: {bucket.disabledCount}
                        </span>
                      ) : null}
                    </div>
                    <div className={styles.scopedPoolAuthProviderNames}>
                      {bucket.activeCount > 0
                        ? t('auth_files.scoped_pool_auth_provider_active_names', {
                            names: bucket.entries
                              .filter((entry) => entry.state === 'in_pool')
                              .map((entry) => entry.name)
                              .join('、'),
                          })
                        : t('auth_files.scoped_pool_auth_provider_no_active_names')}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {authFilesScopedPoolSections.map((section) => (
              <div key={section.key} className={styles.batchCheckDetailModalGroup}>
                <div className={styles.batchCheckDetailModalHeader}>
                  <div className={styles.batchCheckSectionTitleWrap}>
                    <span className={styles.batchCheckSectionTitle}>{section.label}</span>
                    <span className={styles.batchCheckSectionDescription}>{section.description}</span>
                  </div>
                  <span className={styles.batchCheckDetailModalCount}>
                    {t('auth_files.scoped_pool_auth_section_count_badge', {
                      count: section.entries.length,
                    })}
                  </span>
                </div>
                <div className={styles.batchCheckDetailEntryList}>
                  {section.entries.map((entry) => (
                    <div key={`${section.key}-${entry.name}`} className={styles.batchCheckDetailEntry}>
                      <div className={styles.batchCheckDetailEntryHeader}>
                        <div className={styles.batchCheckDetailEntryTitleWrap}>
                          <span className={styles.batchCheckDetailEntryName}>{entry.name}</span>
                          <span className={styles.batchCheckDetailEntrySubtitle}>
                            {entry.providerLabel}
                          </span>
                        </div>
                        <div className={styles.batchCheckBadgeRow}>
                          <span
                            className={`${styles.batchCheckBadge} ${
                              entry.state === 'in_pool'
                                ? styles.batchCheckBadgeSuccess
                                : entry.state === 'standby' || entry.state === 'configured'
                                  ? styles.batchCheckBadgeOutline
                                  : entry.state === 'penalized'
                                    ? styles.batchCheckBadgeWarning
                                    : entry.state === 'ejected'
                                      ? styles.batchCheckBadgeDanger
                                      : styles.batchCheckBadgeMuted
                            }`}
                          >
                            {entry.stateLabel}
                          </span>
                          {entry.reasonLabel ? (
                            <span className={`${styles.batchCheckBadge} ${styles.batchCheckBadgeOutline}`}>
                              {entry.reasonLabel}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className={styles.batchCheckDetailFacts}>
                        <div className={styles.batchCheckDetailFact}>
                          <span className={styles.batchCheckMetricLabel}>
                            {t('auth_files.scoped_pool_auth_detail_provider_label')}
                          </span>
                          <span className={styles.batchCheckMetricValue}>{entry.providerLabel}</span>
                        </div>
                        <div className={styles.batchCheckDetailFact}>
                          <span className={styles.batchCheckMetricLabel}>
                            {t('auth_files.scoped_pool_auth_detail_state_label')}
                          </span>
                          <span className={styles.batchCheckMetricValue}>{entry.stateLabel}</span>
                        </div>
                        <div className={styles.batchCheckDetailFact}>
                          <span className={styles.batchCheckMetricLabel}>
                            {t('auth_files.scoped_pool_auth_detail_remaining_label')}
                          </span>
                          <span className={styles.batchCheckMetricValue}>
                            {typeof entry.remainingPercent === 'number'
                              ? formatBatchCheckPercent(entry.remainingPercent)
                              : t('common.not_set')}
                          </span>
                        </div>
                        <div className={styles.batchCheckDetailFact}>
                          <span className={styles.batchCheckMetricLabel}>
                            {t('auth_files.scoped_pool_auth_detail_last_quota_checked_label')}
                          </span>
                          <span className={styles.batchCheckMetricValue}>
                            {entry.lastQuotaCheckedAt
                              ? formatDateTime(entry.lastQuotaCheckedAt)
                              : t('common.not_set')}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title={t('auth_files.scoped_pool_auth_empty_title')}
            description={t('auth_files.scoped_pool_auth_empty_desc')}
          />
        )}
      </Modal>

      <AuthFilesPrefixProxyEditorModal
        disableControls={disableControls}
        editor={prefixProxyEditor}
        updatedText={prefixProxyUpdatedText}
        dirty={prefixProxyDirty}
        onClose={closePrefixProxyEditor}
        onCopyText={copyTextWithNotification}
        onSave={handlePrefixProxySave}
        onChange={handlePrefixProxyChange}
      />

      {batchActionBarVisible && typeof document !== 'undefined'
        ? createPortal(
            <div className={styles.batchActionContainer} ref={floatingBatchActionsRef}>
              <div className={styles.batchActionBar}>
                <div className={styles.batchActionLeft}>
                  <span className={styles.batchSelectionText}>
                    {t('auth_files.batch_selected', { count: selectionCount })}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => selectAllVisible(pageItems)}
                    disabled={selectablePageItems.length === 0}
                  >
                    {t('auth_files.batch_select_page')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => selectAllVisible(sorted)}
                    disabled={selectableFilteredItems.length === 0}
                  >
                    {t('auth_files.batch_select_filtered')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => invertVisibleSelection(pageItems)}
                    disabled={selectablePageItems.length === 0}
                  >
                    {t('auth_files.batch_invert_page')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={deselectAll}>
                    {t('auth_files.batch_deselect')}
                  </Button>
                </div>
                <div className={styles.batchActionRight}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void batchDownload(selectedNames)}
                    disabled={disableControls || selectedNames.length === 0}
                  >
                    {t('auth_files.batch_download')}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => batchSetStatus(selectedNames, true)}
                    disabled={batchStatusButtonsDisabled}
                  >
                    {t('auth_files.batch_enable')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => batchSetStatus(selectedNames, false)}
                    disabled={batchStatusButtonsDisabled}
                  >
                    {t('auth_files.batch_disable')}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => batchDelete(selectedNames)}
                    disabled={disableControls || selectedNames.length === 0}
                  >
                    {t('common.delete')}
                  </Button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
