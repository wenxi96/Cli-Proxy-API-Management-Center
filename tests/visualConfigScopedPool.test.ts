import { describe, expect, test } from 'bun:test';
import { createElement, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse as parseYaml } from 'yaml';
import { getVisualConfigValidationErrors, useVisualConfig } from '../src/hooks/useVisualConfig';
import { DEFAULT_VISUAL_VALUES, type VisualConfigValues } from '../src/types/visualConfig';

function applyScopedPoolEdit(
  yaml: string,
  edit: (values: VisualConfigValues) => Partial<VisualConfigValues>,
  observe?: (values: VisualConfigValues) => void
): string {
  let result = '';

  function Harness() {
    const visualConfig = useVisualConfig();
    const [phase, setPhase] = useState(0);

    if (phase === 0) {
      expect(visualConfig.loadVisualValuesFromYaml(yaml).ok).toBe(true);
      setPhase(1);
      return null;
    }

    if (phase === 1) {
      observe?.(visualConfig.visualValues);
      visualConfig.setVisualValues(edit(visualConfig.visualValues));
      setPhase(2);
      return null;
    }

    result = visualConfig.applyVisualChangesToYaml(yaml);
    return null;
  }

  renderToStaticMarkup(createElement(Harness));
  return result;
}

const scopedPoolYaml = `custom-top-level:
  retained: true
routing:
  strategy: round-robin
  scoped-pool:
    enabled: true
    defaults:
      limit: 4
    providers:
      CustomProvider:
        enabled: true
        limit: 3
        vendor-settings:
          nested: retained
      codex:
        enabled: false
        quota-threshold-percent: 5
`;

describe('visual config scoped pool', () => {
  test('parses raw provider keys and preserves unrelated provider fields on an edit', () => {
    let observedProvider = '';
    const result = applyScopedPoolEdit(
      scopedPoolYaml,
      (values) => ({
        routingScopedPoolProviders: values.routingScopedPoolProviders.map((entry) =>
          entry.provider === 'CustomProvider' ? { ...entry, limit: '9' } : entry
        ),
      }),
      (values) => {
        observedProvider = values.routingScopedPoolProviders[0]?.provider ?? '';
      }
    );

    expect(observedProvider).toBe('CustomProvider');
    const parsed = parseYaml(result);
    expect(parsed['custom-top-level']).toEqual({ retained: true });
    expect(parsed.routing['scoped-pool'].providers.CustomProvider).toEqual({
      enabled: true,
      limit: 9,
      'vendor-settings': { nested: 'retained' },
    });
  });

  test('deleting a provider removes its complete YAML map', () => {
    const result = applyScopedPoolEdit(scopedPoolYaml, (values) => ({
      routingScopedPoolProviders: values.routingScopedPoolProviders.filter(
        (entry) => entry.provider !== 'CustomProvider'
      ),
    }));

    const parsed = parseYaml(result);
    expect(parsed.routing['scoped-pool'].providers.CustomProvider).toBeUndefined();
    expect(parsed.routing['scoped-pool'].providers.codex).toEqual({
      enabled: false,
      'quota-threshold-percent': 5,
    });
  });

  test('renaming a provider is delete-plus-create and does not carry unknown fields', () => {
    const result = applyScopedPoolEdit(scopedPoolYaml, (values) => ({
      routingScopedPoolProviders: values.routingScopedPoolProviders.map((entry) =>
        entry.provider === 'CustomProvider' ? { ...entry, provider: 'renamed-provider' } : entry
      ),
    }));

    const parsed = parseYaml(result);
    expect(parsed.routing['scoped-pool'].providers.CustomProvider).toBeUndefined();
    expect(parsed.routing['scoped-pool'].providers['renamed-provider']).toEqual({
      enabled: true,
      limit: 3,
    });
  });

  test('loads every scoped-pool visual field and rewrites changed legacy defaults canonically', () => {
    const legacyDefaultsYaml = `routing:
  strategy: round-robin
  scoped-pool:
    enabled: true
    defaults:
      limit: 4
      quotaThresholdPercent: 5
      consecutiveErrorThreshold: 6
      penaltyWindowSeconds: 7
      quotaSnapshotTTLSeconds: 8
      idleLogThrottleSeconds: 9
      future-default: retained
    providers:
      codex:
        enabled: true
        limit: 2
`;
    let observed: Partial<VisualConfigValues> = {};
    const result = applyScopedPoolEdit(
      legacyDefaultsYaml,
      () => ({ routingScopedPoolDefaultsQuotaThresholdPercent: '11' }),
      (values) => {
        observed = {
          routingScopedPoolEnabled: values.routingScopedPoolEnabled,
          routingScopedPoolDefaultsLimit: values.routingScopedPoolDefaultsLimit,
          routingScopedPoolDefaultsQuotaThresholdPercent:
            values.routingScopedPoolDefaultsQuotaThresholdPercent,
          routingScopedPoolDefaultsConsecutiveErrorThreshold:
            values.routingScopedPoolDefaultsConsecutiveErrorThreshold,
          routingScopedPoolDefaultsPenaltyWindowSeconds:
            values.routingScopedPoolDefaultsPenaltyWindowSeconds,
          routingScopedPoolDefaultsQuotaSnapshotTTLSeconds:
            values.routingScopedPoolDefaultsQuotaSnapshotTTLSeconds,
          routingScopedPoolDefaultsIdleLogThrottleSeconds:
            values.routingScopedPoolDefaultsIdleLogThrottleSeconds,
          routingScopedPoolProviders: values.routingScopedPoolProviders,
        };
      }
    );

    expect(observed).toMatchObject({
      routingScopedPoolEnabled: true,
      routingScopedPoolDefaultsLimit: '4',
      routingScopedPoolDefaultsQuotaThresholdPercent: '5',
      routingScopedPoolDefaultsConsecutiveErrorThreshold: '6',
      routingScopedPoolDefaultsPenaltyWindowSeconds: '7',
      routingScopedPoolDefaultsQuotaSnapshotTTLSeconds: '8',
      routingScopedPoolDefaultsIdleLogThrottleSeconds: '9',
      routingScopedPoolProviders: [{ provider: 'codex', limit: '2' }],
    });

    const defaults = parseYaml(result).routing['scoped-pool'].defaults;
    expect(defaults).toEqual({
      limit: 4,
      'quota-threshold-percent': 11,
      consecutiveErrorThreshold: 6,
      penaltyWindowSeconds: 7,
      quotaSnapshotTTLSeconds: 8,
      idleLogThrottleSeconds: 9,
      'future-default': 'retained',
    });
  });

  test('blocks invalid defaults and case-insensitive duplicate provider keys', () => {
    const values = structuredClone(DEFAULT_VISUAL_VALUES);
    values.routingStrategy = 'round-robin';
    values.routingScopedPoolEnabled = true;
    values.routingScopedPoolDefaultsLimit = '-1';
    values.routingScopedPoolProviders = [
      {
        id: 'one',
        provider: 'Codex',
        enabled: true,
        limit: '',
        quotaThresholdPercent: '',
        consecutiveErrorThreshold: '',
        penaltyWindowSeconds: '',
        quotaSnapshotTTLSeconds: '',
        idleLogThrottleSeconds: '',
      },
      {
        id: 'two',
        provider: 'codex',
        enabled: true,
        limit: '',
        quotaThresholdPercent: '',
        consecutiveErrorThreshold: '',
        penaltyWindowSeconds: '',
        quotaSnapshotTTLSeconds: '',
        idleLogThrottleSeconds: '',
      },
    ];

    const errors = getVisualConfigValidationErrors(values);
    expect(errors.routingScopedPoolDefaultsLimit).toBe('non_negative_integer');
    expect(errors.routingScopedPoolProviders).toBe('duplicate_provider_key');
  });
});
