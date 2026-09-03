export interface UsageEventFilterRow {
  model: string;
  sourceKey: string;
  authIndex: string;
}

export interface UsageEventFilterSelection {
  model: string;
  source: string;
  authIndex: string;
}

export const filterUsageEventRows = <T extends UsageEventFilterRow>(
  rows: readonly T[],
  filters: UsageEventFilterSelection,
  allFilter: string
): T[] => rows.filter((row) => {
  const modelMatched = filters.model === allFilter || row.model === filters.model;
  const sourceMatched = filters.source === allFilter || row.sourceKey === filters.source;
  const authIndexMatched = filters.authIndex === allFilter || row.authIndex === filters.authIndex;
  return modelMatched && sourceMatched && authIndexMatched;
});
