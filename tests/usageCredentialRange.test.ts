import { describe, expect, test } from 'bun:test';
import { buildCredentialRequestWindow } from '../src/utils/usage/serverRange';

describe('summary server range for credential details', () => {
  test('passes the exact half-open summary range with exclusive offset semantics', () => {
    expect(buildCredentialRequestWindow({
      from: '2026-08-13T00:00:00.123456789Z',
      to: '2026-08-14T00:00:00.987654321Z',
    })).toEqual({
      from: '2026-08-13T00:00:00.123456789Z',
      to: '2026-08-14T00:00:00.987654321Z',
      to_exclusive: true,
    });
  });

  test('does not invent a client-clock range when server bounds are absent', () => {
    expect(buildCredentialRequestWindow({ from: 'not-a-range' })).toBeUndefined();
    expect(buildCredentialRequestWindow(null)).toBeUndefined();
  });
});
