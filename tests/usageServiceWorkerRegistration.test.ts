import { describe, expect, test } from 'bun:test';
import {
  getUsageExportServiceWorkerScope,
  getUsageExportServiceWorkerURL,
  registerUsageExportServiceWorker,
} from '../src/utils/usage/serviceWorkerRegistration';

describe('usage export service-worker registration', () => {
  test('registers a module worker for the current document scope', async () => {
    const calls: Array<{ scriptURL: string | URL; options?: Record<string, unknown> }> = [];
    const registration = { active: { state: 'activated' } };
    const container = {
      register: async (scriptURL: string | URL, options?: Record<string, unknown>) => {
        calls.push({ scriptURL, options });
        return registration;
      },
    };

    const result = await registerUsageExportServiceWorker(container);

    expect(result).toBe(registration);
    expect(calls).toHaveLength(1);
    expect(String(calls[0].scriptURL)).toContain('usageExportSink.service-worker');
    expect(calls[0].options).toMatchObject({ type: 'module', updateViaCache: 'none' });
    expect(typeof calls[0].options?.scope).toBe('string');
  });

  test('keeps worker script and scope under a non-root deployment path', () => {
    const baseURI = 'https://app.test/management/index.html';

    expect(getUsageExportServiceWorkerScope(baseURI)).toBe('/management/');
    expect(getUsageExportServiceWorkerURL(baseURI)).toBe(
      '/management/usageExportSink.service-worker.js'
    );
  });

  test('returns null when service workers are unavailable or registration fails', async () => {
    expect(await registerUsageExportServiceWorker(null)).toBeNull();
    const container = {
      register: async () => {
        throw new Error('unsupported');
      },
    };
    expect(await registerUsageExportServiceWorker(container)).toBeNull();
  });
});
