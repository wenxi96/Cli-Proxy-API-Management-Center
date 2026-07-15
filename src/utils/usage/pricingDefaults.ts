export type PriceKey = `${string}:${string}`;
export type PriceSource = 'official_default' | 'user_override' | 'legacy_fallback' | 'unconfigured';

export interface UsageModelPrice {
  inputUsdPer1M?: number;
  outputUsdPer1M?: number;
  cacheReadUsdPer1M?: number;
  cacheCreationUsdPer1M?: number;
  reasoningUsdPer1M?: number;
  sourceLabel?: string;
  defaultsVersion?: string;
}

export type OfficialModelPrice = Required<
  Pick<UsageModelPrice, 'inputUsdPer1M' | 'outputUsdPer1M' | 'defaultsVersion' | 'sourceLabel'>
> &
  Partial<Pick<UsageModelPrice, 'cacheReadUsdPer1M' | 'cacheCreationUsdPer1M' | 'reasoningUsdPer1M'>>;

export type UserModelPriceOverride = UsageModelPrice;

export const OFFICIAL_DEFAULTS_VERSION = '2026-07-13-openai-pricing';
const OPENAI_SOURCE_LABEL = 'OpenAI API pricing';

const openaiPrice = (
  inputUsdPer1M: number,
  cacheReadUsdPer1M: number | null,
  outputUsdPer1M: number,
  cacheCreationUsdPer1M: number | null = null
): OfficialModelPrice => ({
  inputUsdPer1M,
  outputUsdPer1M,
  ...(cacheReadUsdPer1M !== null ? { cacheReadUsdPer1M } : {}),
  ...(cacheCreationUsdPer1M !== null ? { cacheCreationUsdPer1M } : {}),
  defaultsVersion: OFFICIAL_DEFAULTS_VERSION,
  sourceLabel: OPENAI_SOURCE_LABEL,
});

const openAIOfficialDefaults: Record<PriceKey, OfficialModelPrice> = {
  'openai:gpt-5.6-sol': openaiPrice(5, 0.5, 30, 6.25),
  'openai:gpt-5.6-terra': openaiPrice(2.5, 0.25, 15, 3.125),
  'openai:gpt-5.6-luna': openaiPrice(1, 0.1, 6, 1.25),
  'openai:gpt-5.5': openaiPrice(5, 0.5, 30),
  'openai:gpt-5.5-pro': openaiPrice(30, null, 180),
  'openai:gpt-5.4': openaiPrice(2.5, 0.25, 15),
  'openai:gpt-5.4-mini': openaiPrice(0.75, 0.075, 4.5),
  'openai:gpt-5.4-nano': openaiPrice(0.2, 0.02, 1.25),
  'openai:gpt-5.4-pro': openaiPrice(30, null, 180),
  'openai:chat-latest': openaiPrice(5, 0.5, 30),
  'openai:gpt-5.3-chat-latest': openaiPrice(1.75, 0.175, 14),
  'openai:gpt-5.2-chat-latest': openaiPrice(1.75, 0.175, 14),
  'openai:gpt-5.1-chat-latest': openaiPrice(1.25, 0.125, 10),
  'openai:gpt-5-chat-latest': openaiPrice(1.25, 0.125, 10),
  'openai:chatgpt-4o-latest': openaiPrice(5, null, 15),
  'openai:gpt-5.3-codex': openaiPrice(1.75, 0.175, 14),
  'openai:gpt-5.2-codex': openaiPrice(1.75, 0.175, 14),
  'openai:gpt-5.1-codex-max': openaiPrice(1.25, 0.125, 10),
  'openai:gpt-5.1-codex': openaiPrice(1.25, 0.125, 10),
  'openai:gpt-5-codex': openaiPrice(1.25, 0.125, 10),
  'openai:gpt-5.1-codex-mini': openaiPrice(0.25, 0.025, 2),
  'openai:codex-mini-latest': openaiPrice(1.5, 0.375, 6),
  'openai:gpt-5-search-api': openaiPrice(1.25, 0.125, 10),
  'openai:gpt-4o-search-preview': openaiPrice(2.5, null, 10),
};

export const officialDefaults: Record<PriceKey, OfficialModelPrice> = {
  ...openAIOfficialDefaults,
};

const normalizePart = (value: unknown): string => {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).trim().toLowerCase();
};

export function buildPriceKey(provider: unknown, model: unknown): PriceKey {
  const modelPart = normalizePart(model) || '-';
  const providerPart = normalizePart(provider);
  return `${providerPart || 'legacy'}:${modelPart}` as PriceKey;
}

export function isLegacyPriceKey(key: string): boolean {
  return key.startsWith('legacy:');
}

export function getOfficialDefault(key: string): OfficialModelPrice | undefined {
  if (isLegacyPriceKey(key)) return undefined;
  if (key.startsWith('codex:')) {
    return officialDefaults[`openai:${key.slice('codex:'.length)}` as PriceKey];
  }
  return officialDefaults[key as PriceKey];
}
