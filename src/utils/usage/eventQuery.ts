import type { UsageEventsRequestOptions } from '@/services/api/usage';
import { buildUsageRangeQuery } from './serverRange';

export interface UsageEventQueryFilters {
  model?: string;
  source?: string;
  authIndex?: string;
}

export const buildUsageEventQueryOptions = (
  window: string | undefined,
  anchor: string | null | undefined,
  filters: UsageEventQueryFilters,
  limit?: number
): UsageEventsRequestOptions | null => {
  // An anchor is only meaningful with the window that minted it. Do not let
  // the backend silently apply its default window to a pinned query.
  if (anchor && !window) return null;

  return {
    ...(window ? { window } : {}),
    ...(anchor ? { anchor } : {}),
    ...(Number.isFinite(limit) ? { limit: Number(limit) } : {}),
    ...(filters.model ? { model: filters.model } : {}),
    ...(filters.source ? { source: filters.source } : {}),
    ...(filters.authIndex ? { auth_index: filters.authIndex } : {}),
  };
};

export const buildUsageEventQueryOptionsFromRange = (
  range: Record<string, unknown> | null | undefined,
  window: string | undefined,
  anchor: string | null | undefined,
  filters: UsageEventQueryFilters,
  limit?: number
): UsageEventsRequestOptions | null => {
  const rangeQuery = buildUsageRangeQuery(range, window, anchor);
  if (!rangeQuery) return null;
  return {
    ...rangeQuery,
    ...(Number.isFinite(limit) ? { limit: Number(limit) } : {}),
    ...(filters.model ? { model: filters.model } : {}),
    ...(filters.source ? { source: filters.source } : {}),
    ...(filters.authIndex ? { auth_index: filters.authIndex } : {}),
  };
};
