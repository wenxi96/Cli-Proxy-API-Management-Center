import { describe, expect, test } from 'bun:test';
import {
  buildUsageEventQueryOptions,
  buildUsageEventQueryOptionsFromRange,
} from '../src/utils/usage/eventQuery';

describe('usage event query options', () => {
  test('omits filters that were reset to the effective all option', () => {
    expect(
      buildUsageEventQueryOptions('24h', 'anchor-1', {
        model: undefined,
        source: undefined,
        authIndex: undefined,
      }, 50)
    ).toEqual({ window: '24h', anchor: 'anchor-1', limit: 50 });
  });

  test('preserves only active effective filters for the server query', () => {
    expect(
      buildUsageEventQueryOptions('7d', null, {
        model: 'gpt-5',
        source: undefined,
        authIndex: 'auth-2',
      }, 50)
    ).toEqual({ window: '7d', limit: 50, model: 'gpt-5', auth_index: 'auth-2' });
  });

  test('omits the page limit for an export query', () => {
    expect(
      buildUsageEventQueryOptions('24h', 'anchor-1', { source: 'source-1' })
    ).toEqual({ window: '24h', anchor: 'anchor-1', source: 'source-1' });
  });

  test('omits the window when the component has no selected window yet', () => {
    expect(
      buildUsageEventQueryOptions(undefined, null, {})
    ).toEqual({});
  });

  test('rejects an anchor without the window that minted it', () => {
    expect(buildUsageEventQueryOptions(undefined, 'anchor-1', {})).toBeNull();
  });

  test('uses an absolute summary range instead of silently falling back to a rolling window', () => {
    expect(
      buildUsageEventQueryOptionsFromRange(
        {
          from: '2026-08-13T00:00:00.123456789Z',
          to: '2026-08-14T00:00:00.123456789Z',
        },
        '24h',
        'stale-anchor',
        { model: 'gpt-5' },
        50
      )
    ).toEqual({
      from: '2026-08-13T00:00:00.123456789Z',
      to: '2026-08-14T00:00:00.123456789Z',
      limit: 50,
      model: 'gpt-5',
    });
  });
});
