import { describe, expect, test } from 'bun:test';
import { createElement, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse as parseYaml } from 'yaml';
import { useVisualConfig } from '../src/hooks/useVisualConfig';

describe('visual config concurrency', () => {
  test('only applies dirty visual fields to the latest server YAML', () => {
    function Harness() {
      const visualConfig = useVisualConfig();
      const [phase, setPhase] = useState(0);

      if (phase === 0) {
        visualConfig.loadVisualValuesFromYaml(
          'debug: false\nproxy-url: http://old-proxy.example\n'
        );
        setPhase(1);
      } else if (phase === 1) {
        visualConfig.setVisualValues({ proxyUrl: 'http://localhost:8080' });
        setPhase(2);
      } else {
        return createElement(
          'pre',
          null,
          visualConfig.applyVisualChangesToYaml(
            'debug: true\nproxy-url: http://old-proxy.example\n'
          )
        );
      }

      return null;
    }

    const markup = renderToStaticMarkup(createElement(Harness));
    const merged = markup.slice('<pre>'.length, -'</pre>'.length);

    expect(parseYaml(merged)).toEqual({
      debug: true,
      'proxy-url': 'http://localhost:8080',
    });
  });

  test('preserves concurrent quota and scoped-pool fields while applying fork dirty fields', () => {
    function Harness() {
      const visualConfig = useVisualConfig();
      const [phase, setPhase] = useState(0);

      if (phase === 0) {
        visualConfig.loadVisualValuesFromYaml(`
quota-exceeded:
  switch-project: true
  auto-disable-auth-file-quota-threshold-percent: 5
routing:
  scoped-pool:
    enabled: true
    defaults:
      limit: 2
    custom-upstream-field: keep-me
`);
        setPhase(1);
      } else if (phase === 1) {
        visualConfig.setVisualValues({
          quotaAutoDisableAuthFileQuotaThresholdPercent: '10',
          routingScopedPoolDefaultsLimit: '4',
        });
        setPhase(2);
      } else {
        return createElement(
          'pre',
          null,
          visualConfig.applyVisualChangesToYaml(`
quota-exceeded:
  switch-project: false
  auto-disable-auth-file-quota-threshold-percent: 5
  concurrent-field: keep-quota
routing:
  scoped-pool:
    enabled: true
    defaults:
      limit: 2
      concurrent-default: 9
    custom-upstream-field: keep-me
`)
        );
      }

      return null;
    }

    const markup = renderToStaticMarkup(createElement(Harness));
    const merged = parseYaml(markup.slice('<pre>'.length, -'</pre>'.length)) as {
      'quota-exceeded': Record<string, unknown>;
      routing: { 'scoped-pool': Record<string, unknown> };
    };

    expect(merged['quota-exceeded']).toEqual({
      'switch-project': false,
      'auto-disable-auth-file-quota-threshold-percent': 10,
      'concurrent-field': 'keep-quota',
    });
    expect(merged.routing['scoped-pool']).toEqual({
      enabled: true,
      defaults: { limit: 4, 'concurrent-default': 9 },
      'custom-upstream-field': 'keep-me',
    });
  });
});
