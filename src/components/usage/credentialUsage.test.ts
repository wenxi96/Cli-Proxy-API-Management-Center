import { describe, expect, test } from 'bun:test';
import { normalizeUsageDetail } from '@/utils/usage';
import {
  buildCredentialRequestRowsFromDetails,
  buildCredentialUsageRows,
} from './credentialUsage';

const context = {
  sourceInfoMap: {
    byAuthIndex: new Map(),
    bySource: new Map(),
  },
  authFileMap: new Map(),
  modelPrices: {},
};

describe('credential usage rows', () => {
  test('preserves endpoint metadata in local fallback rows', () => {
    const detail = normalizeUsageDetail({
      timestamp: '2026-07-13T00:00:00Z',
      endpoint: 'POST /v1/responses',
      model: 'gpt-5.4',
      provider: 'codex',
      auth_index: 'auth-1',
      tokens: {
        input_tokens: 10,
        output_tokens: 5,
        token_usage_source: 'provider_usage',
      },
    });

    const rows = buildCredentialRequestRowsFromDetails([detail], context);

    expect(rows.length).toBe(1);
    expect(rows[0]?.endpoint).toBe('POST /v1/responses');
  });

  test('preserves missing usage when backend auth aggregates contain unlabelled zeros', () => {
    const rows = buildCredentialUsageRows(
      {
        apis: {
          'POST /v1/responses': {
            models: {
              'gpt-5.4': {
                details: [
                  {
                    timestamp: '2026-07-13T00:00:00Z',
                    model: 'gpt-5.4',
                    provider: 'codex',
                    auth_index: 'auth-1',
                    tokens: {
                      input_tokens: 0,
                      output_tokens: 0,
                      total_tokens: 0,
                      token_usage_source: 'missing_usage',
                    },
                  },
                ],
              },
            },
          },
        },
        auths: {
          'auth-1': {
            auth_index: 'auth-1',
            total_requests: 1,
            success_count: 1,
            failure_count: 0,
            tokens: {
              input_tokens: 0,
              output_tokens: 0,
              total_tokens: 0,
            },
          },
        },
      },
      context
    );

    expect(rows.length).toBe(1);
    expect(rows[0]?.tokens.hasKnownUsage).toBe(false);
    expect(rows[0]?.tokens.usageCoverageStatus).toBe('unknown');
    expect(rows[0]?.cost.costStatus).toBe('unknown_usage');
  });

  test('marks mixed known and missing request usage as a partial subtotal', () => {
    const rows = buildCredentialUsageRows(
      {
        apis: {
          'POST /v1/responses': {
            models: {
              'gpt-5.4': {
                details: [
                  {
                    timestamp: '2026-07-13T00:00:00Z',
                    model: 'gpt-5.4',
                    provider: 'codex',
                    auth_index: 'auth-1',
                    tokens: {
                      input_tokens: 10,
                      total_tokens: 10,
                      token_usage_source: 'provider_usage',
                    },
                  },
                  {
                    timestamp: '2026-07-13T00:01:00Z',
                    model: 'gpt-5.4',
                    provider: 'codex',
                    auth_index: 'auth-1',
                    tokens: {
                      input_tokens: 0,
                      total_tokens: 0,
                      token_usage_source: 'missing_usage',
                    },
                  },
                ],
              },
            },
          },
        },
        auths: {
          'auth-1': {
            auth_index: 'auth-1',
            total_requests: 2,
            success_count: 2,
            failure_count: 0,
            tokens: { input_tokens: 10, total_tokens: 10 },
          },
        },
      },
      context
    );

    expect(rows.length).toBe(1);
    expect(rows[0]?.tokens.totalTokens).toBe(10);
    expect(rows[0]?.tokens.usageCoverageStatus).toBe('partial');
    expect(rows[0]?.tokens.knownUsageCount).toBe(1);
    expect(rows[0]?.tokens.unknownUsageCount).toBe(1);
  });
});
