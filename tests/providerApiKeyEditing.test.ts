import { describe, expect, test } from 'bun:test';
import type { OpenAIProviderConfig, ProviderKeyConfig } from '../src/types';
import type { ProviderEntryFormInput } from '../src/features/providers/types';
import {
  buildOpenAIConfig,
  buildProviderKeyConfig,
} from '../src/features/providers/useProviderWorkbench';

const baseForm = (): ProviderEntryFormInput => ({
  apiKey: '',
  apiKeyEdited: false,
  name: 'provider',
  displayName: '',
  baseUrl: 'https://example.com/v1',
  proxyUrl: '',
  prefix: '',
  disabled: false,
  models: [],
  headers: [],
  excludedModelsText: '',
});

describe('provider API key editing', () => {
  test('distinguishes untouched, edited, and cleared single API keys', () => {
    const existing: ProviderKeyConfig = { apiKey: 'existing-key' };

    expect(buildProviderKeyConfig('codex', baseForm(), existing).apiKey).toBe('existing-key');
    expect(
      buildProviderKeyConfig('codex', { ...baseForm(), apiKey: '', apiKeyEdited: true }, existing)
        .apiKey
    ).toBe('');
    expect(
      buildProviderKeyConfig(
        'codex',
        { ...baseForm(), apiKey: 'replacement', apiKeyEdited: true },
        existing
      ).apiKey
    ).toBe('replacement');
  });

  test('does not fall back by array index after deleting and appending OpenAI entries', () => {
    const existing: OpenAIProviderConfig = {
      name: 'provider',
      baseUrl: 'https://example.com/v1',
      apiKeyEntries: [{ apiKey: 'key-a' }, { apiKey: 'key-b' }, { apiKey: 'key-c' }],
    };
    const input: ProviderEntryFormInput = {
      ...baseForm(),
      apiKeyEntries: [
        { apiKey: '', existingApiKey: 'key-a', proxyUrl: '' },
        { apiKey: '', existingApiKey: 'key-c', proxyUrl: '' },
        { apiKey: '', proxyUrl: '' },
      ],
    };

    expect(buildOpenAIConfig(input, existing).apiKeyEntries?.map((entry) => entry.apiKey)).toEqual([
      'key-a',
      'key-c',
    ]);
  });

  test('persists an explicitly cleared OpenAI entry instead of restoring its old key', () => {
    const existing: OpenAIProviderConfig = {
      name: 'provider',
      baseUrl: 'https://example.com/v1',
      apiKeyEntries: [{ apiKey: 'key-a' }, { apiKey: 'key-b' }],
    };
    const input: ProviderEntryFormInput = {
      ...baseForm(),
      apiKeyEntries: [
        { apiKey: '', existingApiKey: 'key-a', proxyUrl: '' },
        { apiKey: '', apiKeyEdited: true, proxyUrl: '' },
      ],
    };

    expect(buildOpenAIConfig(input, existing).apiKeyEntries?.map((entry) => entry.apiKey)).toEqual([
      'key-a',
    ]);
  });
});
