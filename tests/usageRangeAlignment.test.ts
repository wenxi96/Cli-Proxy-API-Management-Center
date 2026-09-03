import { describe, expect, test } from 'bun:test';
import {
  buildUsageRangeQuery,
  isUsageWindowAligned,
} from '../src/utils/usage/serverRange';

describe('usage events range alignment', () => {
  test('accepts a non-empty summary window that matches the selected window', () => {
    expect(isUsageWindowAligned('24h', '24h')).toBe(true);
  });

  test('rejects a stale summary window after the selected window changes', () => {
    expect(isUsageWindowAligned('24h', '7d')).toBe(false);
  });

  test('fails closed when either window is missing', () => {
    expect(isUsageWindowAligned(null, '24h')).toBe(false);
    expect(isUsageWindowAligned('24h', undefined)).toBe(false);
    expect(isUsageWindowAligned('', '24h')).toBe(false);
  });

  test('builds an exact absolute range query for summary-backed events', () => {
    expect(
      buildUsageRangeQuery(
        {
          from: '2026-08-13T00:00:00.123456789Z',
          to: '2026-08-14T00:00:00.123456789Z',
        },
        '24h',
        'stale-anchor'
      )
    ).toEqual({
      from: '2026-08-13T00:00:00.123456789Z',
      to: '2026-08-14T00:00:00.123456789Z',
    });
  });

  test('keeps rolling queries pinned to the selected window and anchor', () => {
    expect(buildUsageRangeQuery({ window: '24h' }, '24h', 'anchor-1')).toEqual({
      window: '24h',
      anchor: 'anchor-1',
    });
  });
});
