import { describe, expect, test } from 'bun:test';
import { apiClient } from './client';
import { providersApi } from './providers';

describe('provider display-name persistence', () => {
  test('sends and clears Codex display-name through the provider update path', async () => {
    const originalGet = apiClient.get;
    const originalPut = apiClient.put;
    let requestBody: unknown;

    try {
      apiClient.get = (async <T = unknown>() =>
        ({
          'codex-api-key': [
            {
              'api-key': 'sk-codex-display-name',
              'base-url': 'https://codex.example.com',
              'display-name': 'Old name',
            },
          ],
        }) as T) as typeof apiClient.get;
      apiClient.put = (async <T = unknown>(_url: string, data?: unknown) => {
        requestBody = data;
        return {} as T;
      }) as typeof apiClient.put;

      await providersApi.updateCodexConfig(
        'sk-codex-display-name',
        'https://codex.example.com',
        {
          apiKey: 'sk-codex-display-name',
          baseUrl: 'https://codex.example.com',
          displayName: '  Codex Production  ',
        }
      );
      expect((requestBody as Array<Record<string, unknown>>)[0]?.['display-name']).toBe(
        'Codex Production'
      );

      await providersApi.updateCodexConfig(
        'sk-codex-display-name',
        'https://codex.example.com',
        {
          apiKey: 'sk-codex-display-name',
          baseUrl: 'https://codex.example.com',
          displayName: '   ',
        }
      );
      expect((requestBody as Array<Record<string, unknown>>)[0]?.['display-name']).toBeUndefined();
    } finally {
      apiClient.get = originalGet;
      apiClient.put = originalPut;
    }
  });
});
