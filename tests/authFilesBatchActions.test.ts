import { describe, expect, test } from 'bun:test';
import { buildReenableTiers } from '../src/features/authFiles/components/ReenableTieredModal';
import { buildBatchCheckLiveResponse } from '../src/features/authFiles/hooks/useAuthFilesBatchCheck';
import { downloadAuthFileArchive } from '../src/features/authFiles/hooks/useAuthFilesData';
import {
  createAuthFileDownloadPlan,
  executeAuthFileDownloadPlan,
  mergeVisibleAuthFileSelection,
} from '../src/features/authFiles/logic';
import type { AuthFileBatchCheckResult, AuthFilesBatchCheckResponse, AuthFileItem } from '../src/types';

const result = (name: string, remainingPercent: number): AuthFileBatchCheckResult => ({
  name,
  provider: 'codex',
  disabled: true,
  unavailable: false,
  available: true,
  classification: 'ok',
  remaining_percent: remainingPercent,
  bucket: 'full',
  checked_at: '2026-09-03T00:00:00Z',
});

const response = (results: AuthFileBatchCheckResult[]): AuthFilesBatchCheckResponse => ({
  checked_at: '2026-09-03T00:00:00Z',
  results,
  skipped: [],
  summary: {
    checked_count: results.length,
    available_count: results.length,
    available_provider_count: 1,
    skipped_count: 0,
    classification_counts: { ok: results.length },
    bucket_counts: { full: results.length },
  },
  aggregate: {
    capacity_overview: {
      remaining_total: 0,
      total_capacity: 0,
      remaining_percent: 0,
      used_total: 0,
      used_percent: 0,
      equivalent_full_accounts: 0,
      unknown_remaining_count: 0,
    },
    risk_overview: {
      invalidated_401_count: 0,
      no_quota_count: 0,
      api_error_count: 0,
      request_failed_count: 0,
      exhausted_count: 0,
      low_remaining_1_29_count: 0,
      mid_low_remaining_1_49_count: 0,
    },
    health_buckets: {},
    scope_overview: {
      total_count: results.length,
      enabled_count: 0,
      disabled_count: results.length,
      processed_count: results.length,
      skipped_count: 0,
    },
    refresh_overview: { highlight_windows: [], refresh_window_counts: {} },
    plan_distribution: {
      plan_type_counts: {},
      primary_cycle_counts: {},
      secondary_cycle_counts: {},
    },
    diagnosis: [],
    action_candidates: {
      invalidated_401_names: [],
      disable_exhausted_names: [],
      reenable_names: [],
      reenable_threshold_bucket: 'danger',
    },
  },
});

describe('auth-file batch actions', () => {
  test('uses a direct download plan for one file and a deduplicated archive plan for many files', () => {
    expect(createAuthFileDownloadPlan([' one.json '])).toEqual({ kind: 'single', name: 'one.json' });
    expect(createAuthFileDownloadPlan(['one.json', 'two.json', 'one.json', ' '])).toEqual({
      kind: 'archive',
      names: ['one.json', 'two.json'],
    });
  });

  test('executes the single-file and archive download actions selected by the production plan', async () => {
    const singleDownloads: string[] = [];
    const archiveDownloads: string[][] = [];
    const actions = {
      downloadSingle: async (name: string) => {
        singleDownloads.push(name);
      },
      downloadArchive: async (names: string[]) => {
        archiveDownloads.push(names);
      },
    };

    await executeAuthFileDownloadPlan(['one.json'], actions);
    await executeAuthFileDownloadPlan(['one.json', 'two.json', 'one.json'], actions);

    expect(singleDownloads).toEqual(['one.json']);
    expect(archiveDownloads).toEqual([['one.json', 'two.json']]);
  });

  test('requests the archive and saves the returned blob with its deterministic ZIP name', async () => {
    const requestedNames: string[][] = [];
    const saved: { filename: string; blob: Blob }[] = [];

    await downloadAuthFileArchive(['one.json', 'two.json'], {
      requestArchive: async (names) => {
        requestedNames.push(names);
        return { data: new Blob(['zip-data'], { type: 'application/zip' }) };
      },
      saveBlob: (options) => {
        saved.push(options);
      },
    });

    expect(requestedNames).toEqual([['one.json', 'two.json']]);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.filename).toBe('auth-files-2.zip');
    expect(saved[0]?.blob.type).toBe('application/zip');
  });

  test('keeps selections from separate pages and excludes runtime-only entries', () => {
    const pageOne: AuthFileItem[] = [
      { name: 'one.json', type: 'codex' },
      { name: 'runtime.json', type: 'codex', runtimeOnly: true },
    ];
    const pageTwo: AuthFileItem[] = [{ name: 'two.json', type: 'claude' }];

    const afterFirstPage = mergeVisibleAuthFileSelection(new Set(), pageOne);
    const afterSecondPage = mergeVisibleAuthFileSelection(afterFirstPage, pageTwo);

    expect([...afterSecondPage]).toEqual(['one.json', 'two.json']);
  });

  test('retains batch-check records from all selected pages', () => {
    const files: AuthFileItem[] = [
      { name: 'one.json', type: 'codex', disabled: true },
      { name: 'two.json', type: 'claude', disabled: true },
    ];
    const live = buildBatchCheckLiveResponse(response([result('one.json', 100), result('two.json', 60)]), files);

    expect(live?.results.map((item) => item.name)).toEqual(['one.json', 'two.json']);
    expect(live?.aggregate.action_candidates.reenable_names).toEqual(['one.json', 'two.json']);
  });

  test('places only known re-enable candidates into full, substantial, and some tiers', () => {
    const tiers = buildReenableTiers(
      [result('full.json', 100), result('substantial.json', 60), result('some.json', 10), result('low.json', 9)],
      ['full.json', 'substantial.json', 'some.json', 'low.json', 'unknown.json']
    );

    expect(tiers.map((tier) => [tier.id, tier.accounts.map((account) => account.name)])).toEqual([
      ['full', ['full.json']],
      ['substantial', ['substantial.json']],
      ['some', ['some.json']],
    ]);
  });
});
