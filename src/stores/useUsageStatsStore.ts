import { create } from 'zustand';
import {
  isUsageCapabilityFallbackStatus,
  usageApi,
  type UsageSummaryRequestOptions,
  type UsageEventsRequestOptions,
  type UsageEventItem,
} from '@/services/api';
import { useAuthStore } from '@/stores/useAuthStore';
import {
  collectUsageDetails,
  computeKeyStatsFromDetails,
  type KeyStats,
  type UsageDetail,
} from '@/utils/usage';
import i18n from '@/i18n';
import { usageEventIdentityKey } from '@/utils/usage/eventIdentity';

export const USAGE_STATS_STALE_TIME_MS = 240_000;

export type LoadUsageStatsOptions = {
  force?: boolean;
  staleTimeMs?: number;
};

type UsageStatsSnapshot = Record<string, unknown>;
type UsageSummarySnapshot = Record<string, unknown>;

export type UsageSummaryStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'not_modified'
  | 'legacy_degraded'
  | 'unavailable'
  | 'error';

export type UsageEventsStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'not_modified'
  | 'legacy_degraded'
  | 'unavailable'
  | 'error';

export const isProjectionUnavailableError = (error: unknown): boolean => {
  const seen = new Set<object>();
  let current: unknown = error;
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const candidate = current as {
      status?: unknown;
      apiCode?: unknown;
      cause?: unknown;
    };
    if (candidate.status === 503 && candidate.apiCode === 'projection_unavailable') {
      return true;
    }
    current = candidate.cause;
  }
  return false;
};

type UsageStatsState = {
  usage: UsageStatsSnapshot | null;
  summary: UsageSummarySnapshot | null;
  summaryRange: Record<string, unknown> | null;
  summaryAnchor: string | null;
  summaryEtag: string | null;
  summaryRevision: string | null;
  summaryStatus: UsageSummaryStatus;
  summaryError: string | null;
  summaryLastRefreshedAt: number | null;
  summaryScopeKey: string;
  summaryQueryKey: string | null;
  events: UsageEventItem[];
  eventsNextCursor: string | null;
  eventsHasMore: boolean;
  eventsSnapshot: Record<string, unknown> | null;
  eventsEtag: string | null;
  eventsRevision: string | null;
  eventsStatus: UsageEventsStatus;
  eventsError: string | null;
  eventsQueryKey: string | null;
  eventsScopeKey: string;
  catalog: Record<string, unknown> | null;
  catalogEtag: string | null;
  catalogScopeKey: string;
  catalogStatus: 'idle' | 'loading' | 'ready' | 'not_modified' | 'unavailable' | 'error';
  catalogError: string | null;
  keyStats: KeyStats;
  usageDetails: UsageDetail[];
  loading: boolean;
  error: string | null;
  lastRefreshedAt: number | null;
  scopeKey: string;
  loadUsageStats: (options?: LoadUsageStatsOptions) => Promise<void>;
  loadUsageSummary: (options?: UsageSummaryRequestOptions) => Promise<void>;
  loadUsageEvents: (options?: UsageEventsRequestOptions & { append?: boolean }) => Promise<void>;
  loadUsageCatalog: (options?: { force?: boolean }) => Promise<void>;
  clearUsageStats: () => void;
};

const createEmptyKeyStats = (): KeyStats => ({ bySource: {}, byAuthIndex: {} });

let usageRequestToken = 0;
let inFlightUsageRequest: { id: number; scopeKey: string; promise: Promise<void> } | null = null;
let summaryRequestToken = 0;
let inFlightSummaryRequest: { id: number; scopeKey: string; queryKey: string; promise: Promise<void> } | null = null;
let eventsRequestToken = 0;
let inFlightEventsRequest: { id: number; scopeKey: string; queryKey: string; promise: Promise<void> } | null = null;
let catalogRequestToken = 0;
let inFlightCatalogRequest: { id: number; scopeKey: string; promise: Promise<void> } | null = null;

const getErrorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : i18n.t('usage_stats.loading_error');

const buildSummaryQueryKey = (options: UsageSummaryRequestOptions = {}): string =>
  JSON.stringify({
    window: options.window ?? '',
    anchor: options.anchor ?? '',
    timezone: options.timezone ?? '',
    from: options.from ?? '',
    to: options.to ?? '',
  });

export const useUsageStatsStore = create<UsageStatsState>((set, get) => {
  const resetUsageScope = (scopeKey: string) => {
    usageRequestToken += 1;
    inFlightUsageRequest = null;
    summaryRequestToken += 1;
    inFlightSummaryRequest = null;
    eventsRequestToken += 1;
    inFlightEventsRequest = null;
    catalogRequestToken += 1;
    inFlightCatalogRequest = null;
    set({
      usage: null,
      summary: null,
      summaryRange: null,
      summaryAnchor: null,
      summaryEtag: null,
      summaryRevision: null,
      summaryStatus: 'idle',
      summaryError: null,
      summaryLastRefreshedAt: null,
      summaryScopeKey: scopeKey,
      summaryQueryKey: null,
      events: [],
      eventsNextCursor: null,
      eventsHasMore: false,
      eventsSnapshot: null,
      eventsEtag: null,
      eventsRevision: null,
      eventsStatus: 'idle',
      eventsError: null,
      eventsQueryKey: null,
      eventsScopeKey: scopeKey,
      catalog: null,
      catalogEtag: null,
      catalogScopeKey: scopeKey,
      catalogStatus: 'idle',
      catalogError: null,
      keyStats: createEmptyKeyStats(),
      usageDetails: [],
      loading: false,
      error: null,
      lastRefreshedAt: null,
      scopeKey,
    });
  };

  return ({
  usage: null,
  summary: null,
  summaryRange: null,
  summaryAnchor: null,
  summaryEtag: null,
  summaryRevision: null,
  summaryStatus: 'idle',
  summaryError: null,
  summaryLastRefreshedAt: null,
  summaryScopeKey: '',
  summaryQueryKey: null,
  events: [],
  eventsNextCursor: null,
  eventsHasMore: false,
  eventsSnapshot: null,
  eventsEtag: null,
  eventsRevision: null,
  eventsStatus: 'idle',
  eventsError: null,
  eventsQueryKey: null,
  eventsScopeKey: '',
  catalog: null,
  catalogEtag: null,
  catalogScopeKey: '',
  catalogStatus: 'idle',
  catalogError: null,
  keyStats: createEmptyKeyStats(),
  usageDetails: [],
  loading: false,
  error: null,
  lastRefreshedAt: null,
  scopeKey: '',

  loadUsageStats: async (options = {}) => {
    const force = options.force === true;
    const staleTimeMs = options.staleTimeMs ?? USAGE_STATS_STALE_TIME_MS;
    const { apiBase = '', managementKey = '' } = useAuthStore.getState();
    const scopeKey = `${apiBase}::${managementKey}`;
    const state = get();
    const scopeChanged = state.scopeKey !== scopeKey;
    const knownConnectionScope =
      state.scopeKey || state.summaryScopeKey || state.eventsScopeKey || state.catalogScopeKey;
    const connectionScopeChanged = Boolean(knownConnectionScope && knownConnectionScope !== scopeKey);

    // 先复用同源 in-flight 请求，避免多个页面同时发起重复 /usage。
    if (inFlightUsageRequest && inFlightUsageRequest.scopeKey === scopeKey) {
      await inFlightUsageRequest.promise;
      return;
    }

    // 连接目标变化时，旧请求结果必须失效。
    if (inFlightUsageRequest && inFlightUsageRequest.scopeKey !== scopeKey) {
      usageRequestToken += 1;
      inFlightUsageRequest = null;
    }

    const fresh =
      !scopeChanged &&
      state.lastRefreshedAt !== null &&
      Date.now() - state.lastRefreshedAt < staleTimeMs;

    if (!force && fresh) {
      return;
    }

    if (connectionScopeChanged) {
      resetUsageScope(scopeKey);
    } else if (scopeChanged) {
      set({
        usage: null,
        keyStats: createEmptyKeyStats(),
        usageDetails: [],
        error: null,
        lastRefreshedAt: null,
        scopeKey,
      });
    }

    const requestId = (usageRequestToken += 1);
    set({ loading: true, error: null, scopeKey });

    const requestPromise = (async () => {
      try {
        const usageResponse = await usageApi.getUsage();
        const rawUsage = usageResponse?.usage ?? usageResponse;
        const usage =
          rawUsage && typeof rawUsage === 'object' ? (rawUsage as UsageStatsSnapshot) : null;

        if (requestId !== usageRequestToken) return;

        const usageDetails = collectUsageDetails(usage);
        set({
          usage,
          keyStats: computeKeyStatsFromDetails(usageDetails),
          usageDetails,
          loading: false,
          error: null,
          summaryError: null,
          lastRefreshedAt: Date.now(),
          scopeKey,
        });
      } catch (error: unknown) {
        if (requestId !== usageRequestToken) return;
        const message = getErrorMessage(error);
        set({
          loading: false,
          error: message,
          scopeKey,
        });
        throw new Error(message, { cause: error });
      } finally {
        if (inFlightUsageRequest?.id === requestId) {
          inFlightUsageRequest = null;
        }
      }
    })();

    inFlightUsageRequest = { id: requestId, scopeKey, promise: requestPromise };
    await requestPromise;
  },

  loadUsageSummary: async (options = {}) => {
    const { apiBase = '', managementKey = '' } = useAuthStore.getState();
    const scopeKey = `${apiBase}::${managementKey}`;
    const queryKey = buildSummaryQueryKey(options);
    const state = get();
    const knownConnectionScope =
      state.scopeKey || state.summaryScopeKey || state.eventsScopeKey || state.catalogScopeKey;
    const connectionScopeChanged = Boolean(knownConnectionScope && knownConnectionScope !== scopeKey);

    if (
      inFlightSummaryRequest &&
      inFlightSummaryRequest.scopeKey === scopeKey &&
      inFlightSummaryRequest.queryKey === queryKey
    ) {
      await inFlightSummaryRequest.promise;
      return;
    }

    if (inFlightSummaryRequest && inFlightSummaryRequest.scopeKey !== scopeKey) {
      summaryRequestToken += 1;
      inFlightSummaryRequest = null;
    }

    if (connectionScopeChanged) {
      resetUsageScope(scopeKey);
    } else if (state.summaryScopeKey !== scopeKey) {
      set({
        summary: null,
        summaryRange: null,
        summaryAnchor: null,
        summaryEtag: null,
        summaryRevision: null,
        summaryStatus: 'idle',
        summaryError: null,
        summaryLastRefreshedAt: null,
        summaryScopeKey: scopeKey,
        summaryQueryKey: null,
      });
    }

    const requestId = (summaryRequestToken += 1);
    const requestOptions: UsageSummaryRequestOptions = {
      ...options,
      etag:
        options.etag ??
        (state.summaryScopeKey === scopeKey && state.summaryQueryKey === queryKey
          ? state.summaryEtag ?? undefined
          : undefined),
    };
    set({
      summaryStatus: 'loading',
      summaryError: null,
      summaryScopeKey: scopeKey,
      summaryQueryKey: queryKey,
    });

    const requestPromise = (async () => {
      const perform = async (
        currentOptions: UsageSummaryRequestOptions,
        allowAnchorRetry: boolean
      ): Promise<void> => {
        try {
          const response = await usageApi.getUsageSummary(currentOptions);
          if (requestId !== summaryRequestToken) return;
          const currentQueryKey = buildSummaryQueryKey(currentOptions);

          if (response.status === 304) {
            set({
              summaryStatus: 'not_modified',
              summaryError: null,
              summaryLastRefreshedAt: Date.now(),
              summaryQueryKey: currentQueryKey,
            });
            return;
          }

          const summary =
            response.data && typeof response.data === 'object'
              ? (response.data as UsageSummarySnapshot)
              : null;
          const range =
            summary?.range && typeof summary.range === 'object'
              ? (summary.range as Record<string, unknown>)
              : null;
          const anchor = typeof range?.window_anchor === 'string' ? range.window_anchor : null;
          set({
            summary,
            summaryRange: range,
            summaryAnchor: anchor,
            summaryEtag: response.headers.etag ?? null,
            summaryRevision: response.headers['x-usage-revision'] ?? null,
            summaryStatus: 'ready',
            summaryError: null,
            summaryLastRefreshedAt: Date.now(),
            summaryScopeKey: scopeKey,
            summaryQueryKey: currentQueryKey,
          });
        } catch (error: unknown) {
          if (requestId !== summaryRequestToken) return;
          const status =
            typeof error === 'object' && error !== null && 'status' in error
              ? (error as { status?: unknown }).status
              : undefined;
          const apiCode =
            typeof error === 'object' && error !== null && 'apiCode' in error
              ? (error as { apiCode?: unknown }).apiCode
              : undefined;
          if (allowAnchorRetry && status === 409 && apiCode === 'window_anchor_expired') {
            set({ summaryAnchor: null, summaryStatus: 'loading', summaryError: null });
            const remintedOptions = { ...currentOptions };
            delete remintedOptions.etag;
            delete remintedOptions.anchor;
            await perform(remintedOptions, false);
            return;
          }

          const message = getErrorMessage(error);
          const statusValue =
            typeof status === 'number' ? status : undefined;
          set({
            summaryStatus:
              isUsageCapabilityFallbackStatus(statusValue)
                ? 'legacy_degraded'
                : statusValue === 503
                  ? 'unavailable'
                  : 'error',
            summaryError: message,
          });
          throw new Error(message, { cause: error });
        }
      };

      try {
        await perform(requestOptions, Boolean(requestOptions.anchor));
      } finally {
        if (inFlightSummaryRequest?.id === requestId) {
          inFlightSummaryRequest = null;
        }
      }
    })();

    inFlightSummaryRequest = { id: requestId, scopeKey, queryKey, promise: requestPromise };
    await requestPromise;
  },

  loadUsageEvents: async (options = {}) => {
    const { apiBase = '', managementKey = '' } = useAuthStore.getState();
    const scopeKey = `${apiBase}::${managementKey}`;
    const append = options.append === true;
    const queryOptions = { ...options };
    delete queryOptions.append;
    const requestedEtag = queryOptions.etag;
    delete queryOptions.etag;
    const queryKey = JSON.stringify(queryOptions);
    const state = get();
    const scopeChanged = state.eventsScopeKey !== scopeKey;
    const sameQuery = state.eventsScopeKey === scopeKey && state.eventsQueryKey === queryKey;
    const knownConnectionScope =
      state.scopeKey || state.summaryScopeKey || state.eventsScopeKey || state.catalogScopeKey;
    const connectionScopeChanged = Boolean(knownConnectionScope && knownConnectionScope !== scopeKey);

    if (connectionScopeChanged || (inFlightEventsRequest && inFlightEventsRequest.scopeKey !== scopeKey)) {
      if (connectionScopeChanged) resetUsageScope(scopeKey);
      eventsRequestToken += 1;
      inFlightEventsRequest = null;
    }
    if (inFlightEventsRequest && inFlightEventsRequest.scopeKey === scopeKey && inFlightEventsRequest.queryKey === queryKey) {
      await inFlightEventsRequest.promise;
      return;
    }

    const cursor = append && sameQuery ? state.eventsNextCursor ?? undefined : undefined;
    const conditionalEtag = !append && sameQuery ? state.eventsEtag ?? undefined : undefined;
    const retainedPage = !append && sameQuery
      ? {
          events: state.events,
          eventsNextCursor: state.eventsNextCursor,
          eventsHasMore: state.eventsHasMore,
          eventsSnapshot: state.eventsSnapshot,
          eventsEtag: state.eventsEtag,
          eventsRevision: state.eventsRevision,
        }
      : null;
    const requestId = (eventsRequestToken += 1);
    if (!append || !sameQuery) {
      set({
        // Keep the previous page visible while a same-scope filter/window request is pending.
        events: !scopeChanged && state.events.length > 0 ? state.events : [],
        eventsNextCursor: null,
        eventsHasMore: false,
        eventsSnapshot: null,
        eventsEtag: null,
        eventsRevision: null,
        eventsError: null,
        eventsStatus: 'loading',
        eventsScopeKey: scopeKey,
        eventsQueryKey: queryKey,
      });
    } else {
      set({ eventsStatus: 'loading', eventsError: null });
    }

    const requestPromise = (async () => {
      const perform = async (
        requestOptions: UsageEventsRequestOptions,
        currentAppend: boolean,
        allowCursorRetry: boolean
      ): Promise<void> => {
        try {
          const response = await usageApi.getUsageEvents(requestOptions);
          if (requestId !== eventsRequestToken) return;
          if (response.status === 304) {
            set({
              ...(retainedPage ?? {}),
              eventsStatus: 'not_modified',
              eventsError: null,
            });
            return;
          }
          const payload = response.data && typeof response.data === 'object' ? response.data : {};
          const incoming = Array.isArray(payload.items) ? payload.items : [];
          const seen = new Set<string>();
          const currentPage = incoming.filter((item) => {
            const id = usageEventIdentityKey(item);
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
          });
          const nextCursor =
            typeof payload.next_cursor === 'string' && payload.next_cursor ? payload.next_cursor : null;
          set({
            // Keep only the server page in the render cache. The cursor remains
            // the navigation state; retaining prior pages would grow the DOM.
            events: currentPage,
            eventsNextCursor: nextCursor,
            eventsHasMore: payload.has_more === true,
            eventsSnapshot:
              payload.snapshot && typeof payload.snapshot === 'object'
                ? (payload.snapshot as Record<string, unknown>)
                : null,
            // A cursor page is a different representation from the first page.
            // Do not reuse its ETag for a later first-page conditional request.
            eventsEtag: currentAppend ? null : response.headers.etag ?? null,
            eventsRevision: response.headers['x-usage-revision'] ?? null,
            eventsStatus: 'ready',
            eventsError: null,
            eventsScopeKey: scopeKey,
            eventsQueryKey: queryKey,
          });
        } catch (error: unknown) {
          if (requestId !== eventsRequestToken) return;
          const status =
            typeof error === 'object' && error !== null && 'status' in error
              ? (error as { status?: unknown }).status
              : undefined;
          const apiCode =
            typeof error === 'object' && error !== null && 'apiCode' in error
              ? (error as { apiCode?: unknown }).apiCode
              : undefined;
          const cursorInvalidated =
            (status === 409 && apiCode === 'cursor_expired') ||
            (status === 410 && apiCode === 'dataset_epoch_gone');
          if (currentAppend && allowCursorRetry && cursorInvalidated) {
            set({
              events: [],
              eventsNextCursor: null,
              eventsHasMore: false,
              eventsSnapshot: null,
              eventsEtag: null,
              eventsRevision: null,
              eventsStatus: 'loading',
              eventsError: null,
              eventsScopeKey: scopeKey,
              eventsQueryKey: queryKey,
            });
            await perform({ ...queryOptions }, false, false);
            return;
          }

          const message = getErrorMessage(error);
          set({
            eventsNextCursor: null,
            eventsHasMore: false,
            eventsStatus:
              isUsageCapabilityFallbackStatus(typeof status === 'number' ? status : undefined)
                ? 'legacy_degraded'
                : status === 503
                  ? 'unavailable'
                  : 'error',
            eventsError: message,
          });
          throw new Error(message, { cause: error });
        }
      };

      try {
        await perform(
          {
            ...queryOptions,
            ...(cursor ? { cursor } : {}),
            ...((requestedEtag ?? conditionalEtag) ? { etag: requestedEtag ?? conditionalEtag } : {}),
          },
          append,
          true
        );
      } finally {
        if (inFlightEventsRequest?.id === requestId) inFlightEventsRequest = null;
      }
    })();
    inFlightEventsRequest = { id: requestId, scopeKey, queryKey, promise: requestPromise };
    await requestPromise;
  },

  loadUsageCatalog: async (options = {}) => {
    const { apiBase = '', managementKey = '' } = useAuthStore.getState();
    const scopeKey = `${apiBase}::${managementKey}`;
    const state = get();
    const force = options.force === true;
    const scopeChanged = state.catalogScopeKey !== scopeKey;
    if (inFlightCatalogRequest && !force && inFlightCatalogRequest.scopeKey === scopeKey) {
      await inFlightCatalogRequest.promise;
      return;
    }
    if (inFlightCatalogRequest && (force || inFlightCatalogRequest.scopeKey !== scopeKey)) {
      catalogRequestToken += 1;
      inFlightCatalogRequest = null;
    }
    if (!force && !scopeChanged && ['ready', 'not_modified'].includes(state.catalogStatus) && state.catalog) {
      return;
    }
    const knownCatalogConnectionScope =
      state.scopeKey || state.summaryScopeKey || state.eventsScopeKey || state.catalogScopeKey;
    const catalogConnectionScopeChanged = Boolean(
      knownCatalogConnectionScope && knownCatalogConnectionScope !== scopeKey
    );
    if (catalogConnectionScopeChanged) {
      resetUsageScope(scopeKey);
    } else if (scopeChanged) {
      catalogRequestToken += 1;
      set({
        catalog: null,
        catalogEtag: null,
        catalogScopeKey: scopeKey,
        catalogStatus: 'idle',
        catalogError: null,
      });
    }
    const requestId = (catalogRequestToken += 1);
    set({ catalogStatus: 'loading', catalogError: null });
    const requestPromise = (async () => {
      try {
        const current = get();
        const response = await usageApi.getUsageCatalog({
          etag: !scopeChanged || catalogConnectionScopeChanged ? current.catalogEtag ?? undefined : undefined,
        });
        if (requestId !== catalogRequestToken) return;
        if (response.status === 304) {
          set({ catalogStatus: 'not_modified', catalogError: null, catalogScopeKey: scopeKey });
          return;
        }
        const data = response.data && typeof response.data === 'object' ? response.data : null;
        set({
          catalog: data,
          catalogEtag: response.headers.etag ?? null,
          catalogStatus: 'ready',
          catalogError: null,
          catalogScopeKey: scopeKey,
        });
      } catch (error: unknown) {
        if (requestId !== catalogRequestToken) return;
        const status =
          typeof error === 'object' && error !== null && 'status' in error
            ? (error as { status?: unknown }).status
            : undefined;
        const message = getErrorMessage(error);
        set({
          catalogStatus: status === 503 ? 'unavailable' : 'error',
          catalogError: message,
          catalogScopeKey: scopeKey,
        });
        throw new Error(message, { cause: error });
      } finally {
        if (inFlightCatalogRequest?.id === requestId) inFlightCatalogRequest = null;
      }
    })();
    inFlightCatalogRequest = { id: requestId, scopeKey, promise: requestPromise };
    await requestPromise;
  },

  clearUsageStats: () => resetUsageScope(''),
  });
});
