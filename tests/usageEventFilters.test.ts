import { describe, expect, test } from 'bun:test';
import { filterUsageEventRows } from '../src/utils/usage/eventFilters';

const allFilter = '__all__';

describe('usage event row filters', () => {
  test('applies the current filter to retained stale rows', () => {
    const rows = [
      { model: 'old-model', sourceKey: 'source-a', authIndex: 'auth-a' },
      { model: 'new-model', sourceKey: 'source-b', authIndex: 'auth-b' },
    ];

    expect(
      filterUsageEventRows(rows, {
        model: 'new-model',
        source: allFilter,
        authIndex: allFilter,
      }, allFilter)
    ).toEqual([rows[1]]);
  });
});
