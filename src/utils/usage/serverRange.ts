export interface CredentialRequestWindow {
  from: string;
  to: string;
  to_exclusive: true;
}

export interface UsageRangeQueryOptions {
  window?: string;
  anchor?: string;
  from?: string;
  to?: string;
}

const isRangeValue = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export const isUsageWindowAligned = (summaryRangeWindow: unknown, usageWindow: unknown): boolean =>
  isRangeValue(summaryRangeWindow) && isRangeValue(usageWindow) && summaryRangeWindow === usageWindow;

export const buildUsageRangeQuery = (
  range: Record<string, unknown> | null | undefined,
  usageWindow: unknown,
  anchor?: string | null
): UsageRangeQueryOptions | null => {
  const summaryWindow = range?.window;
  if (isRangeValue(summaryWindow)) {
    if (!isUsageWindowAligned(summaryWindow, usageWindow)) return null;
    return {
      window: String(usageWindow).trim(),
      ...(anchor ? { anchor } : {}),
    };
  }

  if (!range || !isRangeValue(range.from) || !isRangeValue(range.to)) return null;
  return {
    from: String(range.from).trim(),
    to: String(range.to).trim(),
  };
};

export const buildCredentialRequestWindow = (
  range: Record<string, unknown> | null | undefined
): CredentialRequestWindow | undefined => {
  if (!range || !isRangeValue(range.from) || !isRangeValue(range.to)) return undefined;
  return {
    from: range.from,
    to: range.to,
    to_exclusive: true,
  };
};
