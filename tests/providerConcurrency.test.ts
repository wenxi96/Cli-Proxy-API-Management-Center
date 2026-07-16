import { describe, expect, test } from 'bun:test';
import {
  appendLatestProviderRecord,
  deleteLatestOpenAIProviderRecord,
  patchLatestOpenAIProviderRecord,
  replaceLatestProviderRecord,
} from '../src/services/api/providers';

const mergeRecord = (raw: unknown, payload: Record<string, unknown>) => ({
  ...(raw as Record<string, unknown> | undefined),
  ...payload,
});

describe('provider list concurrency', () => {
  test('preserves concurrent additions while appending a provider', () => {
    const latest = [
      { 'api-key': 'existing', custom: 'keep' },
      { 'api-key': 'concurrent', custom: 'also-keep' },
    ];

    expect(appendLatestProviderRecord(latest, { 'api-key': 'created' }, mergeRecord)).toEqual([
      { 'api-key': 'existing', custom: 'keep' },
      { 'api-key': 'concurrent', custom: 'also-keep' },
      { 'api-key': 'created' },
    ]);
  });

  test('replaces only the selected provider in the latest list', () => {
    const latest = [
      { 'api-key': 'existing', custom: 'keep' },
      { 'api-key': 'concurrent', custom: 'also-keep' },
    ];

    expect(
      replaceLatestProviderRecord(
        latest,
        (record) => record['api-key'] === 'existing',
        { 'api-key': 'updated' },
        mergeRecord
      )
    ).toEqual([
      { 'api-key': 'updated', custom: 'keep' },
      { 'api-key': 'concurrent', custom: 'also-keep' },
    ]);
  });

  test('patches and deletes the expected OpenAI provider only when name and index still match', () => {
    const latest = [
      { name: 'first', disabled: false, custom: 'keep-first' },
      { name: 'target', disabled: false, custom: 'keep-target' },
    ];

    expect(patchLatestOpenAIProviderRecord(latest, 'target', 1, { disabled: true })).toEqual([
      latest[0],
      { name: 'target', disabled: true, custom: 'keep-target' },
    ]);
    expect(deleteLatestOpenAIProviderRecord(latest, 'target', 1)).toEqual([latest[0]]);
  });

  test('rejects stale OpenAI provider indexes after concurrent insertion or reorder', () => {
    const concurrentlyInserted = [{ name: 'new-first' }, { name: 'first' }, { name: 'target' }];
    const reordered = [{ name: 'target' }, { name: 'first' }];

    expect(() => patchLatestOpenAIProviderRecord(concurrentlyInserted, 'target', 1, {})).toThrow(
      'Provider configuration changed; refresh and try again.'
    );
    expect(() => deleteLatestOpenAIProviderRecord(reordered, 'target', 1)).toThrow(
      'Provider configuration changed; refresh and try again.'
    );
  });
});
