import { describe, expect, test } from 'bun:test';
import {
  EXPORT_DERIVATION_PROFILE,
  EXPORT_SCHEMA_VERSION,
  buildExportRow,
  serializeCsvHeader,
  serializeCsvRow,
  serializeJsonRow,
  canonicalDecimal,
} from '../src/utils/usage/exportProfile';

describe('usage-events-v2-client-v1 export profile', () => {
  test('uses the frozen schema and fixed JSON member order', () => {
    const row = buildExportRow(
      {
        request_id: 'request-1',
        timestamp: '2026-08-13T00:00:00Z',
        model: 'gpt-5',
        source_id: 'source-1',
        source_key: 'auth-1',
        auth_index: '1',
        failed: false,
        latency_ms: null,
        billable_policy_version: 'v1',
        tokens: { input_tokens: 10, output_tokens: 2, total_tokens: 12 },
      },
      { sourceLabels: { 'source-1': 'Primary' }, priceOverrides: {} }
    );

    expect(EXPORT_SCHEMA_VERSION).toBe('usage-events-v2');
    expect(EXPORT_DERIVATION_PROFILE).toBe('usage-events-v2-client-v1');
    expect(Object.keys(row)).toEqual([
      'timestamp', 'model', 'source', 'source_raw', 'auth_index', 'failed',
      'latency_ms', 'thinking', 'thinking_coverage', 'tokens', 'cost',
    ]);
    expect(serializeJsonRow(row)).toContain('"thinking":null');
  });

  test('uses CRLF and fixed CSV header order', () => {
    expect(serializeCsvHeader()).toBe(
      'timestamp,model,source,source_raw,auth_index,result,latency_ms,thinking_intensity,thinking_mode,thinking_level,thinking_budget,input_tokens,output_tokens,reasoning_tokens,cache_read_tokens,cache_creation_tokens,cached_tokens,cache_ratio,total_tokens,reported_total_tokens,computed_total_tokens,input_cost_usd,output_cost_usd,cache_cost_usd,total_cost_usd,cost_status,missing_price_models,missing_price_components\r\n'
    );
  });

  test('rejects exponent and non-finite decimal forms', () => {
    expect(canonicalDecimal(1.25)).toBe('1.25');
    expect(canonicalDecimal(1e-9)).toBeNull();
    expect(canonicalDecimal(Number.POSITIVE_INFINITY)).toBeNull();
  });

  test('fails closed instead of truncating missing price lists', () => {
    const row = buildExportRow({
      model: 'gpt-5',
      source_id: 'source-1',
      source_key: 'auth-1',
      billable_policy_version: 'v1',
      tokens: { input_tokens: 1 },
    }, {
      sourceLabels: { 'source-1': 'Primary' },
      sourceKeys: { 'source-1': 'auth-1' },
      modelLabels: { 'gpt-5': 'GPT-5' },
      modelPriceKeys: { 'gpt-5': 'openai:gpt-5' },
      priceOverrides: {},
      billablePolicyVersion: 'v1',
      strictMappings: true,
    });
    row.cost.missing_price_components = Array.from({ length: 7 }, (_, index) => `component-${index}`);
    expect(() => serializeJsonRow(row)).toThrow('export_missing_price_components_overflow');
  });

  test('does not silently write an invalid decimal as an empty CSV field', () => {
    const row = buildExportRow({
      model: 'gpt-5',
      source_id: 'source-1',
      source_key: 'auth-1',
      billable_policy_version: 'v1',
      tokens: { input_tokens: 1 },
    }, {
      sourceLabels: { 'source-1': 'Primary' },
      sourceKeys: { 'source-1': 'auth-1' },
      modelLabels: { 'gpt-5': 'GPT-5' },
      modelPriceKeys: { 'gpt-5': 'openai:gpt-5' },
      priceOverrides: {},
      billablePolicyVersion: 'v1',
      strictMappings: true,
    });
    expect(() => serializeCsvRow({
      ...row,
      latency_ms: 1e-9,
    })).toThrow('canonical_decimal_unavailable');
  });

  test('fails closed when a v2 event has an unsupported policy or missing mapping', () => {
    const snapshot = {
      sourceLabels: { 'source-1': 'Primary' },
      sourceKeys: { 'source-1': 'auth-1' },
      modelLabels: { 'gpt-5': 'GPT-5' },
      modelPriceKeys: { 'gpt-5': 'openai:gpt-5' },
      priceOverrides: {},
      billablePolicyVersion: 'v1',
      strictMappings: true,
    };
    expect(() => buildExportRow({
      model: 'gpt-5',
      source_id: 'source-1',
      source_key: 'auth-1',
      billable_policy_version: 'v2',
      tokens: { input_tokens: 1 },
    }, snapshot)).toThrow('export_billable_policy_unavailable');
    expect(() => buildExportRow({
      model: 'gpt-5',
      source_id: 'unknown-source',
      source_key: 'auth-1',
      billable_policy_version: 'v1',
      tokens: { input_tokens: 1 },
    }, snapshot)).toThrow('export_source_mapping_unavailable');
  });

  test('keeps the server-owned model id when the catalog label is longer', () => {
    const row = buildExportRow({
      model: 'm',
      source_id: 'source-1',
      source_key: 'auth-1',
      billable_policy_version: 'v1',
      tokens: { input_tokens: 1 },
    }, {
      sourceLabels: { 'source-1': 'Primary' },
      sourceKeys: { 'source-1': 'auth-1' },
      modelLabels: { m: 'A much longer catalog display label for m' },
      modelPriceKeys: { m: 'legacy:m' },
      priceOverrides: {},
      billablePolicyVersion: 'v1',
      strictMappings: true,
    });

    expect(row.model).toBe('m');
  });
});
