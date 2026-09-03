import { describe, expect, test } from 'bun:test';
import {
  compareUsageEventIdentity,
  usageEventIdentityKey,
  usageEventOccurrenceKey,
} from '../src/utils/usage/eventIdentity';

describe('usage event identity', () => {
  test('keeps payload fallback stable across object property order', () => {
    const first = { model: 'gpt-5', timestamp: '2026-08-14T00:00:00Z', failed: false };
    const second = { failed: false, timestamp: '2026-08-14T00:00:00Z', model: 'gpt-5' };

    expect(usageEventIdentityKey(first)).toBe(usageEventIdentityKey(second));
    expect(compareUsageEventIdentity(first, second)).toBe(0);
  });

  test('keeps role/sequence variants distinct and gives duplicate legacy rows stable occurrence keys', () => {
    const primary = { request_id: 'request-1', detail_role: 'primary', detail_sequence: '1' };
    const secondary = { request_id: 'request-1', detail_role: 'secondary', detail_sequence: '2' };
    const legacy = { model: 'gpt-5', timestamp: '2026-08-14T00:00:00Z' };

    expect(usageEventIdentityKey(primary)).not.toBe(usageEventIdentityKey(secondary));
    expect(usageEventOccurrenceKey(legacy, 0)).not.toBe(usageEventOccurrenceKey(legacy, 1));
    expect(usageEventOccurrenceKey(primary, 0)).toBe(usageEventIdentityKey(primary));
  });
});
