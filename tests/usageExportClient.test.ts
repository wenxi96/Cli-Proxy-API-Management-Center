import { describe, expect, test } from 'bun:test';
import {
  createBlobSink,
  deriveClientBytes,
  getExportSinkSuccessTranslationKey,
  nextExportByteCount,
  triggerServiceWorkerDownload,
  validateExportControlRecord,
} from '../src/utils/usage/exportClient';
import {
  EXPORT_DERIVATION_PROFILE,
  EXPORT_SCHEMA_VERSION,
  type ExportProfileSnapshot,
} from '../src/utils/usage/exportProfile';

const estimate = {
  export_snapshot_id: 'snapshot-1',
  snapshot_facts_hash: 'a'.repeat(64),
  format: 'json' as const,
  export_schema_version: EXPORT_SCHEMA_VERSION,
  export_derivation_profile: EXPORT_DERIVATION_PROFILE,
  export_snapshot_expires_at: '2026-08-13T00:05:00Z',
  event_count_upper_bound: 1,
  event_count_exact: true,
  matched_source_id_counts: { 'source-1': 1 },
  matched_model_counts: { 'gpt-5': 1 },
  server_bytes_upper_bound: 100,
  server_bytes_upper_bound_complete: true,
  catalog_fingerprint: 'projection-catalog-v1',
  price_snapshot_fingerprint: 'client-owned',
  profile_fingerprint: EXPORT_DERIVATION_PROFILE,
};

const catalog = {
  billable_policy_version: 'v1',
  source_key_algorithm: 'usage_source_key_v1',
  sources: [{ source_id: 'source-1', source_key: 'auth-1', label: 'Primary' }],
  models: [{ id: 'gpt-5', label: 'GPT-5', price_key: 'openai:gpt-5' }],
};

describe('usage-events-v2 export client protocol', () => {
  test('only maps atomic sinks to the saved completion message', () => {
    const blobSink = createBlobSink('usage-events.json', 'application/json;charset=utf-8');

    expect(getExportSinkSuccessTranslationKey({ atomicCommit: true })).toBe('usage_stats.export_saved');
    expect(blobSink.atomicCommit).toBe(false);
    expect(getExportSinkSuccessTranslationKey(blobSink)).toBe(
      'usage_stats.export_download_stream_complete'
    );
  });

  test('starts the non-atomic service-worker download using the receiver URL', () => {
    let clicked = false;
    const anchor = {
      href: '',
      download: '',
      rel: '',
      click: () => {
        clicked = true;
      },
    };
    const fakeDocument = {
      createElement: () => anchor,
      body: {
        appendChild: () => undefined,
        removeChild: () => undefined,
      },
    };

    triggerServiceWorkerDownload(
      '/__usage-events-v2-sink?sink_id=opaque-1',
      'usage-events.json',
      fakeDocument
    );

    expect(anchor.href).toBe('/__usage-events-v2-sink?sink_id=opaque-1');
    expect(anchor.download).toBe('usage-events.json');
    expect(anchor.rel).toBe('noopener');
    expect(clicked).toBe(true);
  });

  test('requires complete immutable catalog and model/source counts', () => {
    const result = deriveClientBytes(estimate, catalog, {});
    expect(result.complete).toBe(true);
    expect(result.bytes).toBeGreaterThan(0);
    expect(result.snapshot.strictMappings).toBe(true);

    const incomplete = deriveClientBytes({
      ...estimate,
      matched_model_counts: { 'missing-model': 1 },
    }, catalog, {});
    expect(incomplete.complete).toBe(false);
  });

  test('rejects missing end and mismatched control facts', () => {
    const profile: ExportProfileSnapshot = {
      ...deriveClientBytes(estimate, catalog, {}).snapshot,
      snapshotFactsHash: estimate.snapshot_facts_hash,
      profileFingerprint: EXPORT_DERIVATION_PROFILE,
      catalogFingerprint: 'projection-catalog-v1',
      priceSnapshotFingerprint: 'client-owned',
      eventCountUpperBound: 1,
      eventCountExact: true,
      serverBytesUpperBound: 100,
      serverBytesUpperBoundComplete: true,
    };
    expect(validateExportControlRecord({ record_type: 'event' }, profile, 1)).toBe('export_missing_end');
    expect(validateExportControlRecord({
      record_type: 'end',
      schema_version: 1,
      export_schema_version: EXPORT_SCHEMA_VERSION,
      export_derivation_profile: EXPORT_DERIVATION_PROFILE,
      complete: true,
      event_count: 1,
      snapshot_facts_hash: 'b'.repeat(64),
      export_snapshot_id: 'snapshot-1',
      server_bytes_upper_bound: 100,
      profile_fingerprint: EXPORT_DERIVATION_PROFILE,
      catalog_fingerprint: 'projection-catalog-v1',
      price_snapshot_fingerprint: 'client-owned',
    }, profile, 1)).toBe('export_snapshot_facts_mismatch');

    expect(validateExportControlRecord({
      record_type: 'end',
      schema_version: 1,
      export_schema_version: EXPORT_SCHEMA_VERSION,
      export_derivation_profile: EXPORT_DERIVATION_PROFILE,
      complete: true,
      event_count: 1,
      export_snapshot_id: 'other-snapshot',
      snapshot_facts_hash: estimate.snapshot_facts_hash,
      profile_fingerprint: EXPORT_DERIVATION_PROFILE,
      catalog_fingerprint: 'projection-catalog-v1',
      price_snapshot_fingerprint: 'client-owned',
    }, {
      ...profile,
      exportSnapshotId: 'snapshot-1',
    }, 1)).toBe('export_snapshot_mismatch');
  });

  test('counts UTF-8 bytes and rejects a chunk before it exceeds the bound', () => {
    expect(nextExportByteCount(0, 'é', 2)).toBe(2);
    expect(nextExportByteCount(2, 'x', 2)).toBeNull();
    expect(nextExportByteCount(0, 'x', 1)).toBe(1);
  });
});
