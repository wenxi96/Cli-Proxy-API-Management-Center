import { describe, expect, test } from 'bun:test';
import {
  normalizeUsageDetail,
  normalizeUsageTokens,
  resolveWindowUsageCoverageStatus,
} from './normalization';

describe('usage normalization', () => {
  test('normalizes v2 token detail without double-counting reasoning or cache splits', () => {
    const detail = normalizeUsageDetail({
      request_id: 'req-1',
      timestamp: '2026-07-09T00:00:00.000Z',
      model: 'gpt-5-codex',
      provider: 'openai',
      tokens: {
        input_tokens: 1_000,
        output_tokens: 200,
        reasoning_tokens: 50,
        cached_tokens: 999,
        cache_read_tokens: 300,
        cache_creation_tokens: 100,
        reported_total_tokens: 1_200,
        token_usage_source: 'backend',
        cache_split_status: 'split',
      },
    });

    expect(detail.requestId).toBe('req-1');
    expect(detail.provider).toBe('openai');
    expect(detail.tokens.inputTokens).toBe(1_000);
    expect(detail.tokens.outputTokens).toBe(200);
    expect(detail.tokens.reasoningTokens).toBe(50);
    expect(detail.tokens.cacheReadTokens).toBe(300);
    expect(detail.tokens.cacheCreationTokens).toBe(100);
    expect(detail.tokens.cachedTokens).toBe(400);
    expect(detail.tokens.computedTotalTokens).toBe(1_200);
    expect(detail.tokens.totalTokens).toBe(1_200);
    expect(detail.tokens.cacheRatioNumeratorTokens).toBe(300);
    expect(detail.tokens.cacheRatio).toBe(0.3);
    expect(detail.tokens.hasKnownUsage).toBe(true);
  });

  test('normalizes legacy token detail without adding cached tokens to total', () => {
    const tokens = normalizeUsageTokens({
      input_tokens: 100,
      output_tokens: 20,
      reasoning_tokens: 10,
      cache_tokens: 50,
    });

    expect(tokens.cachedTokens).toBe(50);
    expect(tokens.reasoningTokens).toBe(10);
    expect(tokens.computedTotalTokens).toBe(120);
    expect(tokens.totalTokens).toBe(120);
    expect(tokens.cacheSplitStatus).toBe('unsplit');
  });

  test('normalizes unsplit cache aliases by maximum non-negative value', () => {
    const tokens = normalizeUsageTokens({
      input_tokens: 100,
      output_tokens: 20,
      cached_tokens: 0,
      cache_tokens: 50,
    });

    expect(tokens.cachedTokens).toBe(50);
    expect(tokens.cacheSplitStatus).toBe('unsplit');
    expect(tokens.cacheRatio).toBe(0.5);
  });

  test('preserves a more complete cache total when only a partial split is available', () => {
    const tokens = normalizeUsageTokens({
      input_tokens: 200,
      output_tokens: 20,
      cached_tokens: 100,
      cache_read_tokens: 60,
    });

    expect(tokens.cachedTokens).toBe(100);
    expect(tokens.cacheReadTokens).toBe(60);
    expect(tokens.cacheSplitStatus).toBe('partial');
    expect(tokens.cacheRatioNumeratorTokens).toBe(60);
    expect(tokens.cacheRatio).toBe(0.3);
  });

  test('does not count cache creation tokens as cache hits', () => {
    const openai = normalizeUsageTokens(
      { input_tokens: 100, cache_creation_tokens: 100 },
      'openai'
    );
    const claude = normalizeUsageTokens(
      { input_tokens: 100, cache_creation_tokens: 100 },
      'claude'
    );

    expect(openai.cacheRatioNumeratorTokens).toBe(0);
    expect(openai.cacheRatio).toBe(0);
    expect(claude.cacheRatioNumeratorTokens).toBe(0);
    expect(claude.cacheRatio).toBe(0);
  });

  test('preserves unknown usage when a normalized detail is normalized again', () => {
    const first = normalizeUsageDetail({
      timestamp: '2026-07-09T00:00:00.000Z',
      model: 'unknown',
      tokens: {},
    });
    const second = normalizeUsageDetail(first);

    expect(first.tokens.hasKnownUsage).toBe(false);
    expect(second.tokens.hasKnownUsage).toBe(false);
    expect(second.tokens.totalTokens).toBe(0);
  });

  test('treats backend missing_usage zero fields as unknown instead of known zero', () => {
    const detail = normalizeUsageDetail({
      provider: 'codex',
      model: 'gpt-5.4',
      tokens: {
        input_tokens: 0,
        output_tokens: 0,
        reasoning_tokens: 0,
        cached_tokens: 0,
        cache_read_tokens: 0,
        cache_creation_tokens: 0,
        total_tokens: 0,
        reported_total_tokens: 0,
        computed_total_tokens: 0,
        token_usage_source: 'missing_usage',
      },
    });

    expect(detail.tokens.hasKnownUsage).toBe(false);
    expect(detail.tokens.tokenUsageSource).toBe('unknown');
  });

  test('treats backend provider_usage zero fields as a known zero', () => {
    const detail = normalizeUsageDetail({
      provider: 'codex',
      model: 'gpt-5.4',
      tokens: {
        input_tokens: 0,
        output_tokens: 0,
        token_usage_source: 'provider_usage',
      },
    });

    expect(detail.tokens.hasKnownUsage).toBe(true);
    expect(detail.tokens.tokenUsageSource).toBe('backend');
  });

  test('uses additive cache denominator for Claude cache ratio', () => {
    const detail = normalizeUsageDetail({
      provider: 'claude',
      tokens: {
        input_tokens: 100,
        cache_read_tokens: 80,
      },
    });

    expect(Math.abs((detail.tokens.cacheRatio ?? 0) - 80 / 180)).toBeLessThan(0.0000001);
  });

  test('includes additive Claude cache in computed total when explicit totals are absent', () => {
    const detail = normalizeUsageDetail({
      provider: 'claude',
      tokens: {
        input_tokens: 100,
        output_tokens: 20,
        cache_read_tokens: 80,
      },
    });

    expect(detail.tokens.computedTotalTokens).toBe(200);
    expect(detail.tokens.totalTokens).toBe(200);
  });

  test('includes separate Gemini reasoning in computed total when explicit totals are absent', () => {
    const detail = normalizeUsageDetail({
      provider: 'gemini',
      tokens: {
        input_tokens: 100,
        output_tokens: 20,
        reasoning_tokens: 30,
      },
    });

    expect(detail.tokens.reasoningCostMode).toBe('separate');
    expect(detail.tokens.computedTotalTokens).toBe(150);
    expect(detail.tokens.totalTokens).toBe(150);
  });

  test('does not infer known usage from unlabelled aggregate zero fields', () => {
    const tokens = normalizeUsageTokens({
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
    });

    expect(tokens.hasKnownUsage).toBe(false);
  });

  test('prefers backend final total over a zero provider-reported total', () => {
    const tokens = normalizeUsageTokens({
      input_tokens: 150,
      output_tokens: 50,
      reported_total_tokens: 0,
      computed_total_tokens: 200,
      total_tokens: 200,
      token_usage_source: 'provider_usage',
    });

    expect(tokens.reportedTotalTokens).toBe(0);
    expect(tokens.computedTotalTokens).toBe(200);
    expect(tokens.totalTokens).toBe(200);
  });

  test('rejects boolean and structured token values while accepting numeric strings', () => {
    const invalid = normalizeUsageTokens({
      input_tokens: true,
      output_tokens: [5],
      reasoning_tokens: { value: 3 },
      cache_read_tokens: [],
      cached_tokens: { value: 4 },
      total_tokens: false,
    });

    expect(invalid.inputTokens).toBe(0);
    expect(invalid.outputTokens).toBe(0);
    expect(invalid.reasoningTokens).toBe(0);
    expect(invalid.cacheReadTokens).toBe(0);
    expect(invalid.cachedTokens).toBe(0);
    expect(invalid.hasKnownUsage).toBe(false);

    const compatible = normalizeUsageTokens({
      input_tokens: ' 12 ',
      output_tokens: '3',
      cached_tokens: '4.5',
    });

    expect(compatible.inputTokens).toBe(12);
    expect(compatible.outputTokens).toBe(3);
    expect(compatible.cachedTokens).toBe(4.5);
    expect(compatible.hasKnownUsage).toBe(true);
  });

  test('distinguishes empty, unlocatable, and partial window usage coverage', () => {
    expect(resolveWindowUsageCoverageStatus(true, 0, 0, 0, true)).toBe('complete');
    expect(resolveWindowUsageCoverageStatus(true, 0, 0, 3)).toBe('unknown');
    expect(resolveWindowUsageCoverageStatus(false, 1, 0, 0)).toBe('unknown');
    expect(resolveWindowUsageCoverageStatus(true, 1, 1, 0)).toBe('partial');
    expect(resolveWindowUsageCoverageStatus(true, 1, 0, 0)).toBe('complete');
  });
});
