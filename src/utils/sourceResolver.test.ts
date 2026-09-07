import { describe, expect, test } from 'bun:test';
import { buildCandidateUsageSourceIds, collectUsageDetails } from './usage';
import { buildSourceInfoMap, resolveSourceDisplay } from './sourceResolver';

describe('usage source resolver', () => {
  test('resolves canonical key source ids to a configured Codex display name', () => {
    const apiKey = 'sk-codex-display-name';
    const sourceId = buildCandidateUsageSourceIds({ apiKey }).find((id) => id.startsWith('k:'));
    if (!sourceId) throw new Error('expected a canonical key source id');

    const usage = {
      apis: {
        'POST /v1/responses': {
          models: {
            'gpt-5.4': {
              details: [
                {
                  timestamp: '2026-09-07T00:00:00.000Z',
                  source: sourceId,
                  provider: 'codex',
                  tokens: { input_tokens: 1, output_tokens: 1 },
                },
              ],
            },
          },
        },
      },
    };
    const detail = collectUsageDetails(usage)[0];
    const sourceInfoMap = buildSourceInfoMap({
      codexApiKeys: [{ apiKey, displayName: 'Codex Production' }],
    });

    expect(detail?.source).toBe(sourceId);
    expect(
      resolveSourceDisplay(detail?.source ?? '', undefined, sourceInfoMap, new Map()).displayName
    ).toBe('Codex Production');
  });
});
