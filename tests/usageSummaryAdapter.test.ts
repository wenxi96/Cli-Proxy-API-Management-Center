import { describe, expect, test } from 'bun:test';
import { buildSummaryDashboard, buildSummaryChartData, buildSummaryHealthData } from '../src/utils/usage/summaryAdapter';

const summary = {
  schema_version: 1,
  billable_policy_version: 'v1',
  range: { from: '2026-08-13T00:00:00Z', to: '2026-08-14T00:00:00Z' },
  totals: {
    requests: 12,
    success: 10,
    failure: 2,
    latency_ms_sum: 1200,
    tokens: {
      input_tokens: 100,
      output_tokens: 60,
      reasoning_tokens: 20,
      cached_tokens: 40,
      cache_read_tokens: 30,
      cache_creation_tokens: 10,
      total_tokens: 180,
    },
    token_coverage: { details: 12, with_any_usage: 12, unknown_usage: 0 },
  },
  models: [
    {
      id: 'gpt-5',
      label: 'gpt-5',
      requests: 12,
      success: 10,
      failure: 2,
      latency_ms_sum: 1200,
      tokens: { total_tokens: 180, input_tokens: 100, output_tokens: 60, reasoning_tokens: 20, cached_tokens: 40 },
      token_coverage: { details: 12, with_any_usage: 12, unknown_usage: 0 },
      pricing_groups: [
        {
          key: 'model:gpt-5',
          price_key: 'openai:gpt-5',
          billable_policy_version: 'v1',
          provider: 'openai',
          model: 'gpt-5',
          billable_tokens: { input: 100, output: 60, reasoning: 20, cache_read: 30, cache_creation: 10, unsplit_cache: 0 },
          component_counts: { input: 12, output: 12 },
          priceable_detail_count: 12,
        },
      ],
    },
  ],
  apis: [
    {
      id: 'POST /v1/chat/completions',
      label: 'POST /v1/chat/completions',
      requests: 12,
      success: 10,
      failure: 2,
      latency_ms_sum: 1200,
      tokens: { total_tokens: 180 },
      token_coverage: { details: 12, with_any_usage: 12, unknown_usage: 0 },
      pricing_groups: [],
    },
  ],
  providers: [],
  auths: [],
  sources: [],
  facets: { models: [{ id: 'gpt-5', count: 12 }], providers: [], sources: [], auths: [], failed: [true, false] },
  series: {
    series_granularity: 'hour',
    series_point_count: 2,
    series_availability: 'complete',
    requests: [
      { start: '2026-08-13T00:00:00Z', end: '2026-08-13T01:00:00Z', complete: true, requests: 5, success: 4, failure: 1, latency_ms_sum: 500 },
      { start: '2026-08-13T01:00:00Z', end: '2026-08-13T02:00:00Z', complete: true, requests: 7, success: 6, failure: 1, latency_ms_sum: 700 },
    ],
    tokens: [
      { start: '2026-08-13T00:00:00Z', end: '2026-08-13T01:00:00Z', complete: true, tokens: { input_tokens: 40, output_tokens: 20, reasoning_tokens: 10, cached_tokens: 8, total_tokens: 70 } },
      { start: '2026-08-13T01:00:00Z', end: '2026-08-13T02:00:00Z', complete: true, tokens: { input_tokens: 60, output_tokens: 40, reasoning_tokens: 10, cached_tokens: 32, total_tokens: 110 } },
    ],
    health: [
      { start: '2026-08-13T00:00:00Z', end: '2026-08-13T00:15:00Z', complete: true, requests: 2, success: 2, failure: 0, latency_ms_sum: 200, tokens: { total_tokens: 10 } },
    ],
  },
};

describe('summary dashboard adapter', () => {
  test('maps totals and dimensions without creating request detail rows', () => {
    const dashboard = buildSummaryDashboard(summary, {
      'openai:gpt-5': {
        inputUsdPer1M: 1,
        outputUsdPer1M: 2,
        reasoningUsdPer1M: 3,
        cacheReadUsdPer1M: 0.5,
        cacheCreationUsdPer1M: 0.75,
      },
    });

    expect(dashboard.totalRequests).toBe(12);
    expect(dashboard.totalTokens).toBe(180);
    expect(dashboard.apiStats[0]?.totalRequests).toBe(12);
    expect(dashboard.modelStats[0]?.model).toBe('gpt-5');
    expect(dashboard.modelStats[0]?.costStatus).toBe('complete');
    expect(dashboard.usage.apis).toBeUndefined();
    expect(dashboard.usage.auths).toEqual([]);
  });

  test('fails closed for integer counters beyond JavaScript safe precision', () => {
    const dashboard = buildSummaryDashboard({
      totals: {
        requests: '9007199254740993',
        success: '9007199254740992',
        failure: 1,
        tokens: { total_tokens: '9007199254740993' },
      },
      models: [],
      apis: [],
      providers: [],
      auths: [],
      sources: [],
    });
    expect(dashboard.totalRequests).toBe(0);
    expect(dashboard.totalTokens).toBe(0);
    expect(dashboard.numericDataComplete).toBe(false);
  });

  test('fails closed for unsafe pricing-group billable counters', () => {
    const dashboard = buildSummaryDashboard({
      billable_policy_version: 'v1',
      totals: { requests: 1, tokens: { total_tokens: 1 } },
      models: [{
        id: 'gpt-5',
        requests: 1,
        pricing_groups: [{
          price_key: 'openai:gpt-5',
          billable_policy_version: 'v1',
          billable_tokens: { input: '9007199254740993' },
        }],
      }],
      apis: [],
      providers: [],
      auths: [],
      sources: [],
    });

    expect(dashboard.numericDataComplete).toBe(false);
    expect(dashboard.totalCost).toBeNull();
  });

  test('does not treat unavailable series as an empty zero-valued series', () => {
    const chart = buildSummaryChartData({
      totals: { requests: '12' },
      series: {
        series_availability: 'unavailable',
        series_error: { code: 'series_point_limit_exceeded' },
        requests: [],
        tokens: [],
      },
    }, 'requests');

    expect(chart.availability).toBe('unavailable');
    expect(chart.seriesError).toEqual({ code: 'series_point_limit_exceeded' });
    expect(chart.hasData).toBe(false);
  });

  test('marks invalid known numeric values incomplete instead of presenting exact zero', () => {
    const dashboard = buildSummaryDashboard({
      totals: { requests: 'not-a-counter', tokens: { total_tokens: 'not-a-token-count' } },
      models: [],
      apis: [],
      providers: [],
      auths: [],
      sources: [],
    });

    expect(dashboard.numericDataComplete).toBe(false);
  });

  test('fails closed for unsafe series counters instead of plotting zero', () => {
    const chart = buildSummaryChartData({
      totals: { requests: 1 },
      series: {
        requests: [{ start: '2026-08-13T00:00:00Z', requests: '9007199254740993' }],
      },
    }, 'requests');

    expect(chart.availability).toBe('unavailable');
    expect(chart.seriesError).toEqual({ code: 'numeric_data_incomplete' });
    expect(chart.hasData).toBe(false);
  });

  test('does not render safe series points alongside an unsafe counter', () => {
    const chart = buildSummaryChartData({
      totals: { requests: 2 },
      series: {
        requests: [
          { start: '2026-08-13T00:00:00Z', requests: 1 },
          { start: '2026-08-13T01:00:00Z', requests: '9007199254740993' },
        ],
      },
    }, 'requests');

    expect(chart.availability).toBe('unavailable');
    expect(chart.labels).toEqual([]);
    expect(chart.datasets[0]?.data).toEqual([]);
    expect(chart.hasData).toBe(false);
  });

  test('uses summary series for bounded request and token charts', () => {
    const requests = buildSummaryChartData(summary, 'requests');
    const tokens = buildSummaryChartData(summary, 'tokens');

    expect(requests.labels).toEqual(['2026-08-13T00:00:00Z', '2026-08-13T01:00:00Z']);
    expect(requests.datasets[0]?.data).toEqual([5, 7]);
    expect(tokens.datasets[0]?.data).toEqual([70, 110]);
  });

  test('fails closed when health does not contain exactly 672 buckets', () => {
    const health = buildSummaryHealthData(summary);

    expect(health.healthDataComplete).toBe(false);
    expect(health.blockDetails).toEqual([]);
    expect(health.totalSuccess).toBe(0);
    expect(health.totalFailure).toBe(0);
  });

  test('maps a complete 672-bucket health series to status blocks', () => {
    const healthSeries = Array.from({ length: 672 }, (_, index) => ({
      start: new Date(Date.parse('2026-08-13T00:00:00Z') + index * 15 * 60 * 1000).toISOString(),
      end: new Date(Date.parse('2026-08-13T00:00:00Z') + (index + 1) * 15 * 60 * 1000).toISOString(),
      complete: true,
      requests: index === 0 ? 2 : 0,
      success: index === 0 ? 2 : 0,
      failure: 0,
      latency_ms_sum: index === 0 ? 200 : 0,
    }));
    const health = buildSummaryHealthData({
      ...summary,
      health_range: { bucket_count: 672 },
      series: { ...summary.series, health: healthSeries },
    });

    expect(health.healthDataComplete).toBe(true);
    expect(health.totalSuccess).toBe(2);
    expect(health.totalFailure).toBe(0);
    expect(health.blockDetails[0]).toMatchObject({ success: 2, failure: 0 });
    expect(health.blockDetails).toHaveLength(672);
  });
});
