import { beforeEach, describe, expect, test } from 'bun:test';
import { normalizeUsageDetail } from './normalization';
import {
  aggregateUsageCosts,
  calculateUsageCost,
  loadModelPrices,
  resolveModelPrice,
  type ModelPriceOverrides,
} from './cost';
import { buildPriceKey } from './pricingDefaults';
import { buildPriceOverride, priceOptionToFormState } from './priceForm';
import {
  buildDailyCostSeries,
  buildDailySeriesByModel,
  buildDailyTokenBreakdown,
  buildHourlyCostSeries,
  buildHourlySeriesByModel,
  formatUsd,
  getApiStats,
  getModelStats,
} from '../usage';
import {
  addCredentialTokenStats,
  normalizeCredentialTokenStats,
} from '../../components/usage/credentialUsage';

const expectClose = (actual: number | null, expected: number) => {
  expect(actual).not.toBeNull();
  expect(Math.abs((actual ?? 0) - expected)).toBeLessThan(0.0000001);
};

const installLocalStorage = () => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    },
    configurable: true,
  });
  return storage;
};

describe('usage cost', () => {
  beforeEach(() => {
    installLocalStorage();
  });

  test('calculates complete official exact-key cost without cache double-counting', () => {
    const detail = normalizeUsageDetail({
      timestamp: '2026-07-09T00:00:00.000Z',
      provider: 'openai',
      model: 'gpt-5-codex',
      tokens: {
        input_tokens: 1_000,
        output_tokens: 100,
        cache_read_tokens: 100,
      },
    });

    const cost = calculateUsageCost(detail, {});

    expect(cost.costStatus).toBe('complete');
    expect(cost.priceSource).toBe('official_default');
    expectClose(cost.inputCostUsd, (900 / 1_000_000) * 1.25);
    expectClose(cost.cacheCostUsd, (100 / 1_000_000) * 0.125);
    expectClose(cost.outputCostUsd, (100 / 1_000_000) * 10);
    expectClose(
      cost.totalCostUsd,
      (900 / 1_000_000) * 1.25 + (100 / 1_000_000) * 0.125 + (100 / 1_000_000) * 10
    );
  });

  test('uses exact user override before official defaults', () => {
    const overrides: ModelPriceOverrides = {
      [buildPriceKey('openai', 'gpt-5-codex')]: {
        inputUsdPer1M: 2,
        outputUsdPer1M: 4,
        cacheReadUsdPer1M: 1,
      },
    };
    const detail = normalizeUsageDetail({
      timestamp: '2026-07-09T00:00:00.000Z',
      provider: 'openai',
      model: 'gpt-5-codex',
      tokens: {
        input_tokens: 10,
        output_tokens: 10,
      },
    });

    const cost = calculateUsageCost(detail, overrides);

    expect(cost.priceSource).toBe('user_override');
    expectClose(cost.totalCostUsd, (10 / 1_000_000) * 2 + (10 / 1_000_000) * 4);
  });

  test('resolves Codex provider models against official model pricing', () => {
    const detail = normalizeUsageDetail({
      provider: 'codex',
      model: 'gpt-5.4',
      tokens: { input_tokens: 1_000, output_tokens: 100 },
    });

    const cost = calculateUsageCost(detail, {});

    expect(cost.priceKey).toBe('codex:gpt-5.4');
    expect(cost.priceSource).toBe('official_default');
    expect(cost.costStatus).toBe('complete');
  });

  test('keeps Claude cache tokens additive to uncached input cost', () => {
    const overrides: ModelPriceOverrides = {
      [buildPriceKey('claude', 'claude-test')]: {
        inputUsdPer1M: 2,
        outputUsdPer1M: 4,
        cacheReadUsdPer1M: 1,
      },
    };
    const detail = normalizeUsageDetail({
      provider: 'claude',
      model: 'claude-test',
      tokens: {
        input_tokens: 100,
        output_tokens: 20,
        cache_read_tokens: 80,
      },
    });

    const cost = calculateUsageCost(detail, overrides);

    expectClose(cost.inputCostUsd, (100 / 1_000_000) * 2);
    expectClose(cost.cacheCostUsd, (80 / 1_000_000) * 1);
    expectClose(cost.outputCostUsd, (20 / 1_000_000) * 4);
  });

  test('aggregates Claude cache ratio with additive denominators', () => {
    const first = normalizeUsageDetail({
      provider: 'claude',
      tokens: { input_tokens: 100, cache_read_tokens: 80 },
    });
    const second = normalizeUsageDetail({
      provider: 'claude',
      tokens: { input_tokens: 100, cache_read_tokens: 80 },
    });

    const aggregate = addCredentialTokenStats(
      normalizeCredentialTokenStats(first.tokens),
      normalizeCredentialTokenStats(second.tokens)
    );

    expect(aggregate.cacheRatioDenominatorTokens).toBe(360);
    expect(aggregate.cacheRatioNumeratorTokens).toBe(160);
    expect(Math.abs((aggregate.cacheRatio ?? 0) - 160 / 360)).toBeLessThan(0.0000001);
  });

  test('uses normalized cache ratio denominators in token breakdown series', () => {
    const timestamp = new Date().toISOString();
    const usage = {
      apis: {
        'POST /v1/messages': {
          models: {
            'claude-sonnet': {
              details: [
                {
                  timestamp,
                  provider: 'claude',
                  tokens: {
                    input_tokens: 100,
                    output_tokens: 20,
                    cache_read_tokens: 80,
                  },
                },
              ],
            },
          },
        },
      },
    };

    const series = buildDailyTokenBreakdown(usage);
    expect(series.dataByCategory.cached[0]).toBe(80);
    expect(series.cacheRatioNumeratorTokens[0]).toBe(80);
    expect(series.cacheRatioDenominatorTokens[0]).toBe(180);
    expect(series.coverageStatus).toBe('complete');
  });

  test('marks token breakdown series as partial when some usage is missing', () => {
    const timestamp = new Date().toISOString();
    const usage = {
      apis: {
        'POST /v1/responses': {
          models: {
            'gpt-5.4': {
              details: [
                {
                  timestamp,
                  provider: 'codex',
                  tokens: {
                    input_tokens: 10,
                    token_usage_source: 'provider_usage',
                  },
                },
                {
                  timestamp,
                  provider: 'codex',
                  tokens: {
                    input_tokens: 0,
                    token_usage_source: 'missing_usage',
                  },
                },
              ],
            },
          },
        },
      },
    };

    const series = buildDailyTokenBreakdown(usage);
    expect(series.coverageStatus).toBe('partial');
    expect(series.knownUsageCount).toBe(1);
    expect(series.unknownUsageCount).toBe(1);
  });

  test('formats small request costs without rounding them to zero', () => {
    expect(formatUsd(0.00225)).toBe('$0.002250');
  });

  test('does not use legacy fallback when provider is present', () => {
    const overrides: ModelPriceOverrides = {
      [buildPriceKey(null, 'custom-model')]: {
        inputUsdPer1M: 1,
        outputUsdPer1M: 1,
      },
    };
    const exactDetail = normalizeUsageDetail({
      timestamp: '2026-07-09T00:00:00.000Z',
      provider: 'openai',
      model: 'custom-model',
      tokens: {
        input_tokens: 10,
      },
    });
    const legacyDetail = normalizeUsageDetail({
      timestamp: '2026-07-09T00:00:00.000Z',
      model: 'custom-model',
      tokens: {
        input_tokens: 10,
      },
    });

    expect(calculateUsageCost(exactDetail, overrides).costStatus).toBe('unconfigured');
    expect(resolveModelPrice('', 'custom-model', overrides).source).toBe('legacy_fallback');
    expect(calculateUsageCost(legacyDetail, overrides).costStatus).toBe('complete');
  });

  test('reports missing cache creation price as partial instead of zero', () => {
    const detail = normalizeUsageDetail({
      timestamp: '2026-07-09T00:00:00.000Z',
      provider: 'openai',
      model: 'gpt-5-codex',
      tokens: {
        input_tokens: 1_000,
        output_tokens: 100,
        cache_creation_tokens: 100,
      },
    });

    const cost = calculateUsageCost(detail, {});

    expect(cost.costStatus).toBe('partial');
    expect(cost.cacheCostUsd).toBeNull();
    expect(cost.missingPriceComponents).toContain('openai:gpt-5-codex:cache_creation');
    expect(cost.totalCostUsd).not.toBeNull();
  });

  test('keeps an unclassified partial cache split out of uncached input cost', () => {
    const key = buildPriceKey('custom', 'partial-cache');
    const detail = normalizeUsageDetail({
      timestamp: '2026-07-09T00:00:00.000Z',
      provider: 'custom',
      model: 'partial-cache',
      tokens: {
        input_tokens: 200,
        cached_tokens: 100,
        cache_read_tokens: 60,
      },
    });

    const cost = calculateUsageCost(detail, {
      [key]: {
        inputUsdPer1M: 2,
        outputUsdPer1M: 4,
        cacheReadUsdPer1M: 1,
      },
    });

    expect(cost.costStatus).toBe('partial');
    expect(cost.missingPriceComponents).toContain(`${key}:cache_unsplit`);
    expectClose(cost.inputCostUsd, (100 / 1_000_000) * 2);
    expectClose(cost.cacheCostUsd, (60 / 1_000_000) * 1);
  });

  test('keeps missing-only price components as partial unknown totals', () => {
    const detail = normalizeUsageDetail({
      timestamp: '2026-07-09T00:00:00.000Z',
      provider: 'openai',
      model: 'gpt-5-codex',
      tokens: {
        cache_creation_tokens: 100,
      },
    });

    const cost = calculateUsageCost(detail, {});

    expect(cost.costStatus).toBe('partial');
    expect(cost.cacheCostUsd).toBeNull();
    expect(cost.totalCostUsd).toBeNull();
    expect(cost.missingPriceComponents).toContain('openai:gpt-5-codex:cache_creation');
  });

  test('keeps partial zero subtotal unresolved when another component price is missing', () => {
    const overrides: ModelPriceOverrides = {
      [buildPriceKey('custom', 'partial-zero')]: {
        inputUsdPer1M: 0,
      },
    };
    const detail = normalizeUsageDetail({
      provider: 'custom',
      model: 'partial-zero',
      tokens: { input_tokens: 100, output_tokens: 50 },
    });

    const cost = calculateUsageCost(detail, overrides);

    expect(cost.costStatus).toBe('partial');
    expect(cost.inputCostUsd).toBe(0);
    expect(cost.outputCostUsd).toBeNull();
    expect(cost.totalCostUsd).toBeNull();
  });

  test('keeps missing usage as unknown usage', () => {
    const detail = normalizeUsageDetail({
      timestamp: '2026-07-09T00:00:00.000Z',
      provider: 'openai',
      model: 'gpt-5-codex',
      tokens: {},
    });

    const cost = calculateUsageCost(detail, {});

    expect(cost.costStatus).toBe('unknown_usage');
    expect(cost.totalCostUsd).toBeNull();
  });

  test('keeps total-only usage cost unknown instead of complete zero', () => {
    const detail = normalizeUsageDetail({
      timestamp: '2026-07-09T00:00:00.000Z',
      provider: 'openai',
      model: 'gpt-5-codex',
      tokens: {
        total_tokens: 1_000,
      },
    });

    const cost = calculateUsageCost(detail, {});

    expect(detail.tokens.totalTokens).toBe(1_000);
    expect(detail.tokens.inputTokens).toBe(0);
    expect(detail.tokens.outputTokens).toBe(0);
    expect(cost.costStatus).toBe('unknown_usage');
    expect(cost.totalCostUsd).toBeNull();
  });

  test('uses output price for separate reasoning when no dedicated price is configured', () => {
    const detail = normalizeUsageDetail({
      timestamp: '2026-07-09T00:00:00.000Z',
      provider: 'openai',
      model: 'gpt-5-codex',
      tokens: {
        reasoning_tokens: 100,
        reasoning_cost_mode: 'separate',
      },
    });

    const cost = calculateUsageCost(detail, {});

    expect(cost.costStatus).toBe('complete');
    expectClose(cost.outputCostUsd, (100 / 1_000_000) * 10);
    expectClose(cost.totalCostUsd, (100 / 1_000_000) * 10);
    expect(cost.missingPriceComponents.includes('openai:gpt-5-codex:reasoning')).toBe(false);
  });

  test('calculates separate reasoning cost when reasoning price is configured', () => {
    const overrides: ModelPriceOverrides = {
      [buildPriceKey('custom', 'reasoning-model')]: {
        reasoningUsdPer1M: 20,
      },
    };
    const detail = normalizeUsageDetail({
      timestamp: '2026-07-09T00:00:00.000Z',
      provider: 'custom',
      model: 'reasoning-model',
      tokens: {
        reasoning_tokens: 100,
        reasoning_cost_mode: 'separate',
      },
    });

    const cost = calculateUsageCost(detail, overrides);

    expect(cost.costStatus).toBe('complete');
    expectClose(cost.outputCostUsd, (100 / 1_000_000) * 20);
    expectClose(cost.totalCostUsd, (100 / 1_000_000) * 20);
  });

  test('does not double-count reasoning when reasoning is included in output', () => {
    const detail = normalizeUsageDetail({
      timestamp: '2026-07-09T00:00:00.000Z',
      provider: 'openai',
      model: 'gpt-5-codex',
      tokens: {
        output_tokens: 100,
        reasoning_tokens: 50,
        reasoning_cost_mode: 'included',
      },
    });

    const cost = calculateUsageCost(detail, {});

    expect(cost.costStatus).toBe('complete');
    expectClose(cost.outputCostUsd, (100 / 1_000_000) * 10);
    expectClose(cost.totalCostUsd, (100 / 1_000_000) * 10);
  });

  test('aggregates cost status by unknown, unconfigured, partial, complete priority', () => {
    const complete = calculateUsageCost(
      normalizeUsageDetail({
        timestamp: '2026-07-09T00:00:00.000Z',
        provider: 'openai',
        model: 'gpt-5-codex',
        tokens: { input_tokens: 10, output_tokens: 10 },
      }),
      {}
    );
    const partial = calculateUsageCost(
      normalizeUsageDetail({
        timestamp: '2026-07-09T00:00:00.000Z',
        provider: 'openai',
        model: 'gpt-5-codex',
        tokens: { cache_creation_tokens: 10 },
      }),
      {}
    );
    const unconfigured = calculateUsageCost(
      normalizeUsageDetail({
        timestamp: '2026-07-09T00:00:00.000Z',
        provider: 'openai',
        model: 'missing-price-model',
        tokens: { input_tokens: 10 },
      }),
      {}
    );
    const unknown = calculateUsageCost(
      normalizeUsageDetail({
        timestamp: '2026-07-09T00:00:00.000Z',
        provider: 'openai',
        model: 'gpt-5-codex',
        tokens: {},
      }),
      {}
    );

    expect(aggregateUsageCosts([complete, partial]).costStatus).toBe('partial');
    expect(aggregateUsageCosts([complete, partial]).totalCostUsd).not.toBeNull();
    expect(aggregateUsageCosts([unconfigured]).costStatus).toBe('unconfigured');
    expect(aggregateUsageCosts([unconfigured]).totalCostUsd).toBeNull();
    expect(aggregateUsageCosts([unknown]).costStatus).toBe('unknown_usage');
    expect(aggregateUsageCosts([unknown]).totalCostUsd).toBeNull();
    expect(aggregateUsageCosts([complete, unconfigured, partial]).costStatus).toBe('partial');
    expect(aggregateUsageCosts([complete, unconfigured, partial]).totalCostUsd).not.toBeNull();
    expect(aggregateUsageCosts([complete, unconfigured, partial, unknown]).costStatus).toBe('partial');
    expect(aggregateUsageCosts([complete, unconfigured, partial, unknown]).totalCostUsd).not.toBeNull();
  });

  test('preserves known cost sum when aggregate includes unconfigured details', () => {
    const complete = calculateUsageCost(
      normalizeUsageDetail({
        timestamp: '2026-07-09T00:00:00.000Z',
        provider: 'openai',
        model: 'gpt-5-codex',
        tokens: { input_tokens: 1_000, output_tokens: 100 },
      }),
      {}
    );
    const unconfigured = calculateUsageCost(
      normalizeUsageDetail({
        timestamp: '2026-07-09T00:00:00.000Z',
        provider: 'custom',
        model: 'missing-price-model',
        tokens: { input_tokens: 500 },
      }),
      {}
    );

    const aggregate = aggregateUsageCosts([complete, unconfigured]);

    expect(aggregate.costStatus).toBe('partial');
    expectClose(aggregate.totalCostUsd, complete.totalCostUsd ?? 0);
    expect(aggregate.missingPriceModels).toContain('custom:missing-price-model');
  });

  test('preserves partial cost status in API and model summaries', () => {
    const usage = {
      apis: {
        'POST /v1/responses': {
          total_requests: 2,
          total_tokens: 30,
          models: {
            'gpt-5.4': {
              total_requests: 2,
              total_tokens: 30,
              details: [
                {
                  timestamp: '2026-07-13T00:00:00Z',
                  provider: 'openai',
                  model: 'gpt-5.4',
                  tokens: { input_tokens: 10, output_tokens: 5 },
                },
                {
                  timestamp: '2026-07-13T00:01:00Z',
                  provider: 'custom',
                  model: 'gpt-5.4',
                  tokens: { input_tokens: 10, output_tokens: 5 },
                },
              ],
            },
          },
        },
      },
    };

    const api = getApiStats(usage, {})[0];
    const model = getModelStats(usage, {})[0];

    expect(api.costStatus).toBe('partial');
    expect(api.totalCost).not.toBeNull();
    expect(api.missingPriceModels).toContain('custom:gpt-5.4');
    expect(model.costStatus).toBe('partial');
    expect(model.cost).not.toBeNull();
    expect(model.missingPriceModels).toContain('custom:gpt-5.4');
  });

  test('preserves partial token coverage in trends, API, and model summaries', () => {
    const timestamp = new Date().toISOString();
    const usage = {
      total_tokens: 1_000,
      apis: {
        'POST /v1/responses': {
          total_requests: 2,
          total_tokens: 1_000,
          models: {
            'gpt-5.4': {
              total_requests: 2,
              total_tokens: 1_000,
              details: [
                {
                  timestamp,
                  provider: 'codex',
                  tokens: {
                    input_tokens: 1_000,
                    total_tokens: 1_000,
                    token_usage_source: 'provider_usage',
                  },
                },
                {
                  timestamp,
                  provider: 'codex',
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
    };

    const daily = buildDailySeriesByModel(usage, 'tokens');
    const hourly = buildHourlySeriesByModel(usage, 'tokens', 1);
    const api = getApiStats(usage, {})[0];
    const model = getModelStats(usage, {})[0];

    expect(daily.coverageStatus).toBe('partial');
    expect(hourly.coverageStatus).toBe('partial');
    expect(api.tokenCoverageStatus).toBe('partial');
    expect(model.tokenCoverageStatus).toBe('partial');
  });

  test('keeps partial aggregate zero subtotal unknown when incomplete details remain', () => {
    const completeZero = calculateUsageCost(
      normalizeUsageDetail({
        timestamp: '2026-07-09T00:00:00.000Z',
        provider: 'openai',
        model: 'gpt-5-codex',
        tokens: {
          input_tokens: 0,
          output_tokens: 0,
          token_usage_source: 'provider_usage',
        },
      }),
      {}
    );
    const unconfigured = calculateUsageCost(
      normalizeUsageDetail({
        timestamp: '2026-07-09T00:00:00.000Z',
        provider: 'custom',
        model: 'missing-price-model',
        tokens: { input_tokens: 500 },
      }),
      {}
    );
    const unknown = calculateUsageCost(
      normalizeUsageDetail({
        timestamp: '2026-07-09T00:00:00.000Z',
        provider: 'openai',
        model: 'gpt-5-codex',
        tokens: {},
      }),
      {}
    );

    expect(completeZero.costStatus).toBe('complete');
    expect(completeZero.totalCostUsd).toBe(0);
    const withUnconfigured = aggregateUsageCosts([completeZero, unconfigured]);
    const withUnknown = aggregateUsageCosts([completeZero, unknown]);

    expect(withUnconfigured.costStatus).toBe('partial');
    expect(withUnconfigured.totalCostUsd).toBeNull();
    expect(withUnknown.costStatus).toBe('partial');
    expect(withUnknown.totalCostUsd).toBeNull();
  });

  test('keeps cost series buckets unresolved for partial null without positive subtotal', () => {
    const timestamp = new Date().toISOString();
    const usage = {
      apis: {
        'POST /v1/responses': {
          models: {
            'gpt-5-codex': {
              details: [
                {
                  timestamp,
                  provider: 'openai',
                  tokens: { input_tokens: 0, output_tokens: 0 },
                },
                {
                  timestamp,
                  provider: 'openai',
                  tokens: { cache_creation_tokens: 100 },
                },
              ],
            },
          },
        },
      },
    };

    const daily = buildDailyCostSeries(usage, {});
    const hourly = buildHourlyCostSeries(usage, {}, 1);

    expect(daily.data).toContain(null);
    expect(hourly.data).toContain(null);
  });

  test('keeps known positive subtotal in cost series buckets with partial null details', () => {
    const timestamp = new Date().toISOString();
    const usage = {
      apis: {
        'POST /v1/responses': {
          models: {
            'gpt-5-codex': {
              details: [
                {
                  timestamp,
                  provider: 'openai',
                  tokens: { input_tokens: 1_000 },
                },
                {
                  timestamp,
                  provider: 'openai',
                  tokens: { cache_creation_tokens: 100 },
                },
              ],
            },
          },
        },
      },
    };

    const daily = buildDailyCostSeries(usage, {});
    const hourly = buildHourlyCostSeries(usage, {}, 1);

    expect(daily.data.some((value) => typeof value === 'number' && value > 0)).toBe(true);
    expect(hourly.data.some((value) => typeof value === 'number' && value > 0)).toBe(true);
    expect(daily.coverageStatus).toBe('partial');
    expect(hourly.coverageStatus).toBe('partial');
  });

  test('reports unconfigured cost series when model pricing is missing', () => {
    const timestamp = new Date().toISOString();
    const usage = {
      apis: {
        'POST /v1/custom': {
          models: {
            'custom-model': {
              details: [
                {
                  timestamp,
                  provider: 'custom',
                  tokens: { input_tokens: 1_000 },
                },
              ],
            },
          },
        },
      },
    };

    const daily = buildDailyCostSeries(usage, {});
    const hourly = buildHourlyCostSeries(usage, {}, 1);

    expect(daily.hasData).toBe(false);
    expect(hourly.hasData).toBe(false);
    expect(daily.costStatus).toBe('unconfigured');
    expect(hourly.costStatus).toBe('unconfigured');
  });

  test('has official defaults for current OpenAI GPT-5.6 and GPT-5.4 models', () => {
    expect(resolveModelPrice('openai', 'gpt-5.6-sol', {}).source).toBe('official_default');
    expect(resolveModelPrice('openai', 'gpt-5.4-mini', {}).source).toBe('official_default');
  });

  test('calculates GPT-5.6 cache creation with official standard pricing', () => {
    const detail = normalizeUsageDetail({
      timestamp: '2026-07-09T00:00:00.000Z',
      provider: 'openai',
      model: 'gpt-5.6-sol',
      tokens: {
        cache_creation_tokens: 1_000_000,
      },
    });

    const cost = calculateUsageCost(detail, {});

    expect(cost.costStatus).toBe('complete');
    expectClose(cost.cacheCostUsd, 6.25);
    expectClose(cost.totalCostUsd, 6.25);
  });

  test('leaves specialized models unconfigured when standard pricing is not confirmed', () => {
    expect(resolveModelPrice('openai', 'o3-deep-research', {}).source).toBe('unconfigured');
    expect(resolveModelPrice('openai', 'o4-mini-deep-research', {}).source).toBe('unconfigured');
    expect(resolveModelPrice('openai', 'computer-use-preview', {}).source).toBe('unconfigured');
  });

  test('preserves separate cache read and cache creation values in price form overrides', () => {
    const option = resolveModelPrice('openai', 'gpt-5.6-sol', {});
    const form = priceOptionToFormState({
      key: option.key,
      model: 'gpt-5.6-sol',
      provider: 'openai',
      label: 'openai:gpt-5.6-sol',
      source: option.source,
      price: option.price,
      hasOfficialDefault: option.hasOfficialDefault,
      hasUserOverride: false,
    });
    const override = buildPriceOverride(form);

    expect(form.cacheRead).toBe('0.5');
    expect(form.cacheCreation).toBe('6.25');
    expect(override?.cacheReadUsdPer1M).toBe(0.5);
    expect(override?.cacheCreationUsdPer1M).toBe(6.25);
  });

  test('rejects non-decimal price form syntax', () => {
    const invalid = buildPriceOverride({
      input: '1e3',
      output: '0x10',
      cacheRead: '.5',
      cacheCreation: '1.',
    });
    const valid = buildPriceOverride({
      input: ' 1.25 ',
      output: '10',
      cacheRead: '0.125',
      cacheCreation: '',
    });

    expect(invalid).toBeNull();
    expect(valid?.inputUsdPer1M).toBe(1.25);
    expect(valid?.outputUsdPer1M).toBe(10);
    expect(valid?.cacheReadUsdPer1M).toBe(0.125);
  });

  test('migrates legacy prompt/completion/cache storage into legacy user overrides', () => {
    localStorage.setItem(
      'cli-proxy-model-prices-v2',
      JSON.stringify({
        'legacy-model': {
          prompt: 1,
          completion: 2,
          cache: 0,
        },
      })
    );

    const prices = loadModelPrices();
    const migrated = prices['legacy:legacy-model'];

    expect(migrated.inputUsdPer1M).toBe(1);
    expect(migrated.outputUsdPer1M).toBe(2);
    expect(migrated.cacheReadUsdPer1M).toBe(0);
    expect(migrated.cacheCreationUsdPer1M).toBe(0);
  });

  test('rejects boolean and structured stored prices while accepting numeric strings', () => {
    localStorage.setItem(
      'cli-proxy-model-prices-v3',
      JSON.stringify({
        version: 3,
        userOverrides: {
          'openai:strict-values': {
            inputUsdPer1M: true,
            outputUsdPer1M: [5],
            cacheReadUsdPer1M: { value: 1 },
            cacheCreationUsdPer1M: '0.25',
            reasoningUsdPer1M: ' 1.5 ',
          },
          'openai:all-invalid': {
            inputUsdPer1M: false,
          },
        },
      })
    );

    const prices = loadModelPrices();
    const strict = prices['openai:strict-values'];

    expect(strict.inputUsdPer1M).toBeUndefined();
    expect(strict.outputUsdPer1M).toBeUndefined();
    expect(strict.cacheReadUsdPer1M).toBeUndefined();
    expect(strict.cacheCreationUsdPer1M).toBe(0.25);
    expect(strict.reasoningUsdPer1M).toBe(1.5);
    expect(prices['openai:all-invalid']).toBeUndefined();
  });

  test('rejects structured aggregate token totals while accepting numeric strings', () => {
    const usage = {
      apis: {
        'POST /invalid': {
          total_requests: 1,
          total_tokens: [5],
          models: {
            invalid: {
              total_requests: 1,
              total_tokens: true,
            },
            object: {
              total_requests: 1,
              total_tokens: { value: 5 },
            },
          },
        },
        'POST /valid': {
          total_requests: 1,
          total_tokens: '12',
          models: {
            valid: {
              total_requests: 1,
              total_tokens: '12',
            },
          },
        },
      },
    };

    const apis = getApiStats(usage, {});
    const models = getModelStats(usage, {});

    expect(apis.find((item) => item.endpoint === 'POST /invalid')?.totalTokens).toBe(0);
    expect(apis.find((item) => item.endpoint === 'POST /invalid')?.tokenCoverageStatus).toBe(
      'unknown'
    );
    expect(apis.find((item) => item.endpoint === 'POST /valid')?.totalTokens).toBe(12);
    expect(apis.find((item) => item.endpoint === 'POST /valid')?.tokenCoverageStatus).toBe(
      'complete'
    );
    expect(models.find((item) => item.model === 'invalid')?.tokens).toBe(0);
    expect(models.find((item) => item.model === 'object')?.tokens).toBe(0);
    expect(models.find((item) => item.model === 'valid')?.tokens).toBe(12);
  });
});
