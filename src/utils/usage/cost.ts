import {
  isCacheAdditiveProvider,
  parseNonNegativeNumber,
  type CostStatus,
  type NormalizedUsageCost,
  type NormalizedUsageDetail,
} from './normalization';
import {
  buildPriceKey,
  getOfficialDefault,
  isLegacyPriceKey,
  officialDefaults,
  type PriceKey,
  type PriceSource,
  type UsageModelPrice,
  type UserModelPriceOverride,
} from './pricingDefaults';

export { buildPriceKey } from './pricingDefaults';
export type { PriceKey, PriceSource, UserModelPriceOverride } from './pricingDefaults';

export type ModelPrice = UserModelPriceOverride;
export type ModelPriceOverrides = Record<PriceKey, UserModelPriceOverride>;

export interface ResolvedModelPrice {
  key: PriceKey;
  price: UsageModelPrice | null;
  source: PriceSource;
  hasOfficialDefault: boolean;
}

export interface PriceOption {
  key: PriceKey;
  model: string;
  provider: string;
  label: string;
  source: PriceSource;
  price: UsageModelPrice | null;
  hasOfficialDefault: boolean;
  hasUserOverride: boolean;
}

export interface AggregateUsageCost extends NormalizedUsageCost {
  knownDetailCount: number;
  unknownUsageCount: number;
  unconfiguredCount: number;
  partialCount: number;
  completeCount: number;
}

const TOKENS_PER_PRICE_UNIT = 1_000_000;
const MODEL_PRICE_STORAGE_KEY = 'cli-proxy-model-prices-v3';
const LEGACY_MODEL_PRICE_STORAGE_KEY = 'cli-proxy-model-prices-v2';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const toPriceComponent = (value: unknown): number | undefined => {
  const parsed = parseNonNegativeNumber(value);
  return parsed === null ? undefined : parsed;
};

const normalizeOverride = (value: unknown): UserModelPriceOverride | null => {
  if (!isRecord(value)) return null;
  const inputUsdPer1M = toPriceComponent(value.inputUsdPer1M ?? value.input);
  const outputUsdPer1M = toPriceComponent(value.outputUsdPer1M ?? value.output);
  const cacheReadUsdPer1M = toPriceComponent(value.cacheReadUsdPer1M ?? value.cacheRead);
  const cacheCreationUsdPer1M = toPriceComponent(
    value.cacheCreationUsdPer1M ?? value.cacheCreation
  );
  const reasoningUsdPer1M = toPriceComponent(value.reasoningUsdPer1M ?? value.reasoning);

  if (
    inputUsdPer1M === undefined &&
    outputUsdPer1M === undefined &&
    cacheReadUsdPer1M === undefined &&
    cacheCreationUsdPer1M === undefined &&
    reasoningUsdPer1M === undefined
  ) {
    return null;
  }

  return {
    ...(inputUsdPer1M !== undefined ? { inputUsdPer1M } : {}),
    ...(outputUsdPer1M !== undefined ? { outputUsdPer1M } : {}),
    ...(cacheReadUsdPer1M !== undefined ? { cacheReadUsdPer1M } : {}),
    ...(cacheCreationUsdPer1M !== undefined ? { cacheCreationUsdPer1M } : {}),
    ...(reasoningUsdPer1M !== undefined ? { reasoningUsdPer1M } : {}),
    ...(typeof value.sourceLabel === 'string' ? { sourceLabel: value.sourceLabel } : {}),
  };
};

const normalizeLegacyOverride = (value: unknown): UserModelPriceOverride | null => {
  if (!isRecord(value)) return null;
  const inputUsdPer1M = toPriceComponent(value.prompt);
  const outputUsdPer1M = toPriceComponent(value.completion);
  const cache = toPriceComponent(value.cache);

  if (inputUsdPer1M === undefined && outputUsdPer1M === undefined && cache === undefined) {
    return null;
  }

  return {
    ...(inputUsdPer1M !== undefined ? { inputUsdPer1M } : {}),
    ...(outputUsdPer1M !== undefined ? { outputUsdPer1M } : {}),
    ...(cache !== undefined ? { cacheReadUsdPer1M: cache, cacheCreationUsdPer1M: cache } : {}),
    sourceLabel: 'Legacy user override',
  };
};

const normalizeStorageRecord = (value: unknown): ModelPriceOverrides => {
  const overrides = isRecord(value) && isRecord(value.userOverrides) ? value.userOverrides : value;
  if (!isRecord(overrides)) return {};

  const normalized: ModelPriceOverrides = {};
  Object.entries(overrides).forEach(([key, price]) => {
    const normalizedKey = key.includes(':') ? (key.trim().toLowerCase() as PriceKey) : buildPriceKey(null, key);
    if (!normalizedKey) return;
    const normalizedPrice = normalizeOverride(price);
    if (normalizedPrice) {
      normalized[normalizedKey] = normalizedPrice;
    }
  });
  return normalized;
};

const normalizeLegacyStorageRecord = (value: unknown): ModelPriceOverrides => {
  if (!isRecord(value)) return {};
  const normalized: ModelPriceOverrides = {};
  Object.entries(value).forEach(([model, price]) => {
    const key = buildPriceKey(null, model);
    const normalizedPrice = normalizeLegacyOverride(price);
    if (normalizedPrice) {
      normalized[key] = normalizedPrice;
    }
  });
  return normalized;
};

export function loadModelPrices(): ModelPriceOverrides {
  try {
    if (typeof localStorage === 'undefined') return {};

    const raw = localStorage.getItem(MODEL_PRICE_STORAGE_KEY);
    if (raw) {
      return normalizeStorageRecord(JSON.parse(raw));
    }

    const legacyRaw = localStorage.getItem(LEGACY_MODEL_PRICE_STORAGE_KEY);
    if (!legacyRaw) return {};

    const migrated = normalizeLegacyStorageRecord(JSON.parse(legacyRaw));
    if (Object.keys(migrated).length > 0) {
      saveModelPrices(migrated);
    }
    return migrated;
  } catch {
    return {};
  }
}

export function saveModelPrices(prices: ModelPriceOverrides): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(
      MODEL_PRICE_STORAGE_KEY,
      JSON.stringify({
        version: 3,
        userOverrides: normalizeStorageRecord(prices),
      })
    );
  } catch {
    console.warn('Failed to save model prices');
  }
}

export function resolveModelPrice(
  provider: unknown,
  model: unknown,
  userOverrides: ModelPriceOverrides
): ResolvedModelPrice {
  const key = buildPriceKey(provider, model);
  const override = userOverrides[key];
  if (override) {
    return {
      key,
      price: override,
      source: isLegacyPriceKey(key) ? 'legacy_fallback' : 'user_override',
      hasOfficialDefault: Boolean(getOfficialDefault(key)),
    };
  }

  const officialDefault = getOfficialDefault(key);
  if (officialDefault) {
    return {
      key,
      price: officialDefault,
      source: 'official_default',
      hasOfficialDefault: true,
    };
  }

  return {
    key,
    price: null,
    source: 'unconfigured',
    hasOfficialDefault: false,
  };
}

const componentCost = (tokens: number, priceUsdPer1M: number): number =>
  (tokens / TOKENS_PER_PRICE_UNIT) * priceUsdPer1M;

const getPrice = (price: UsageModelPrice, component: keyof UsageModelPrice): number | null => {
  const value = price[component];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
};

const addMissing = (missing: Set<string>, key: PriceKey, component: string) => {
  missing.add(`${key}:${component}`);
};

const sumKnown = (...values: Array<number | null>): number | null => {
  const known = values.filter((value): value is number => typeof value === 'number');
  if (!known.length) return null;
  return known.reduce((sum, value) => sum + value, 0);
};

const sumKnownFromList = (values: Array<number | null>): number | null => sumKnown(...values);

const aggregateKnownSubtotal = (
  status: CostStatus,
  costs: NormalizedUsageCost[],
  select: (cost: NormalizedUsageCost) => number | null
): number | null => {
  if (status === 'unknown_usage' || status === 'unconfigured') return null;
  const values = costs.map(select);
  const known = sumKnownFromList(values);
  if (status === 'partial' && costs.some((cost) => cost.costStatus !== 'complete')) {
    const hasPositiveKnownSubtotal = values.some(
      (value) => typeof value === 'number' && value > 0
    );
    if (!hasPositiveKnownSubtotal) return null;
  }
  return known;
};

const buildEmptyCost = (
  costStatus: CostStatus,
  missingPriceModels: string[] = [],
  missingPriceComponents: string[] = [],
  priceKey?: PriceKey,
  priceSource?: PriceSource
): NormalizedUsageCost => ({
  inputCostUsd: null,
  outputCostUsd: null,
  cacheCostUsd: null,
  totalCostUsd: null,
  costStatus,
  missingPriceModels,
  missingPriceComponents,
  ...(priceKey ? { priceKey } : {}),
  ...(priceSource ? { priceSource } : {}),
});

export const isCostUnresolved = (cost: NormalizedUsageCost): boolean =>
  cost.totalCostUsd === null && cost.costStatus !== 'complete';

const getBillableTokenComponents = (detail: NormalizedUsageDetail) => {
  const tokens = detail.tokens;
  const splitCacheTokens = tokens.cacheReadTokens + tokens.cacheCreationTokens;
  const hasSplitCache = splitCacheTokens > 0;
  const cacheReadTokens = hasSplitCache ? tokens.cacheReadTokens : tokens.cachedTokens;
  const cacheCreationTokens = tokens.cacheCreationTokens;
  const unclassifiedCacheTokens = hasSplitCache
    ? Math.max(tokens.cachedTokens - splitCacheTokens, 0)
    : 0;
  const cachedTokensForInput = tokens.cachedTokens;
  const inputTokens = isCacheAdditiveProvider(detail.provider)
    ? tokens.inputTokens
    : Math.max(tokens.inputTokens - cachedTokensForInput, 0);
  const reasoningSeparate = tokens.reasoningCostMode === 'separate';
  const outputTokens =
    tokens.outputTokens > 0 ? tokens.outputTokens : reasoningSeparate ? 0 : tokens.reasoningTokens;
  const reasoningTokens = reasoningSeparate ? tokens.reasoningTokens : 0;

  return {
    inputTokens,
    outputTokens,
    reasoningTokens,
    cacheReadTokens,
    cacheCreationTokens,
    unclassifiedCacheTokens,
  };
};

export function calculateUsageCost(
  detail: NormalizedUsageDetail,
  userOverrides: ModelPriceOverrides
): NormalizedUsageCost {
  const tokens = detail.tokens;
  if (
    detail.billablePolicyVersion !== undefined &&
    detail.billablePolicyVersion.trim().toLowerCase() !== 'v1'
  ) {
    return buildEmptyCost('policy_unavailable');
  }
  if (!tokens.hasKnownUsage) {
    return buildEmptyCost('unknown_usage');
  }

  const billable = getBillableTokenComponents(detail);
  const requiredTokenCount =
    billable.inputTokens +
    billable.outputTokens +
    billable.reasoningTokens +
    billable.cacheReadTokens +
    billable.cacheCreationTokens +
    billable.unclassifiedCacheTokens;

  const resolved = resolveModelPrice(detail.provider, detail.model, userOverrides);
  if (requiredTokenCount <= 0) {
    if (tokens.totalTokens > 0) {
      return buildEmptyCost('unknown_usage', [], [], resolved.key, resolved.source);
    }
    return {
      inputCostUsd: 0,
      outputCostUsd: 0,
      cacheCostUsd: 0,
      totalCostUsd: 0,
      costStatus: 'complete',
      missingPriceModels: [],
      missingPriceComponents: [],
      priceKey: resolved.key,
      priceSource: resolved.source,
    };
  }

  if (!resolved.price) {
    const missingComponents = new Set<string>();
    if (billable.inputTokens > 0) addMissing(missingComponents, resolved.key, 'input');
    if (billable.outputTokens > 0) addMissing(missingComponents, resolved.key, 'output');
    if (billable.reasoningTokens > 0) addMissing(missingComponents, resolved.key, 'reasoning');
    if (billable.cacheReadTokens > 0) addMissing(missingComponents, resolved.key, 'cache_read');
    if (billable.cacheCreationTokens > 0) {
      addMissing(missingComponents, resolved.key, 'cache_creation');
    }
    if (billable.unclassifiedCacheTokens > 0) {
      addMissing(missingComponents, resolved.key, 'cache_unsplit');
    }
    return buildEmptyCost(
      'unconfigured',
      [resolved.key],
      Array.from(missingComponents).sort(),
      resolved.key,
      resolved.source
    );
  }

  const missingComponents = new Set<string>();
  const inputPrice = getPrice(resolved.price, 'inputUsdPer1M');
  const outputPrice = getPrice(resolved.price, 'outputUsdPer1M');
  const configuredReasoningPrice = getPrice(resolved.price, 'reasoningUsdPer1M');
  const reasoningPrice = configuredReasoningPrice ?? outputPrice;
  const cacheReadPrice = getPrice(resolved.price, 'cacheReadUsdPer1M');
  const cacheCreationPrice = getPrice(resolved.price, 'cacheCreationUsdPer1M');

  const inputCost =
    billable.inputTokens <= 0
      ? 0
      : inputPrice === null
        ? (addMissing(missingComponents, resolved.key, 'input'), null)
        : componentCost(billable.inputTokens, inputPrice);
  const outputBaseCost =
    billable.outputTokens <= 0
      ? 0
      : outputPrice === null
        ? (addMissing(missingComponents, resolved.key, 'output'), null)
        : componentCost(billable.outputTokens, outputPrice);
  const reasoningCost =
    billable.reasoningTokens <= 0
      ? 0
      : reasoningPrice === null
        ? (addMissing(missingComponents, resolved.key, 'reasoning'), null)
        : componentCost(billable.reasoningTokens, reasoningPrice);
  const cacheReadCost =
    billable.cacheReadTokens <= 0
      ? 0
      : cacheReadPrice === null
        ? (addMissing(missingComponents, resolved.key, 'cache_read'), null)
        : componentCost(billable.cacheReadTokens, cacheReadPrice);
  const cacheCreationCost =
    billable.cacheCreationTokens <= 0
      ? 0
      : cacheCreationPrice === null
        ? (addMissing(missingComponents, resolved.key, 'cache_creation'), null)
        : componentCost(billable.cacheCreationTokens, cacheCreationPrice);
  if (billable.unclassifiedCacheTokens > 0) {
    addMissing(missingComponents, resolved.key, 'cache_unsplit');
  }

  const missingPriceComponents = Array.from(missingComponents).sort();
  const outputCostRaw = sumKnown(outputBaseCost, reasoningCost);
  const cacheCostRaw = sumKnown(cacheReadCost, cacheCreationCost);
  const outputMissing = missingPriceComponents.some((component) =>
    component.endsWith(':output') || component.endsWith(':reasoning')
  );
  const cacheMissing = missingPriceComponents.some((component) =>
    component.endsWith(':cache_read') ||
    component.endsWith(':cache_creation') ||
    component.endsWith(':cache_unsplit')
  );
  const outputCost = outputMissing && outputCostRaw === 0 ? null : outputCostRaw;
  const cacheCost = cacheMissing && cacheCostRaw === 0 ? null : cacheCostRaw;
  const knownBillableCosts = [
    billable.inputTokens > 0 ? inputCost : null,
    billable.outputTokens > 0 ? outputBaseCost : null,
    billable.reasoningTokens > 0 ? reasoningCost : null,
    billable.cacheReadTokens > 0 ? cacheReadCost : null,
    billable.cacheCreationTokens > 0 ? cacheCreationCost : null,
  ];
  const hasMissing = missingPriceComponents.length > 0;
  const knownBillableSubtotal = sumKnownFromList(knownBillableCosts);
  const totalCost =
    hasMissing && (knownBillableSubtotal === null || knownBillableSubtotal <= 0)
      ? null
      : sumKnown(inputCost, outputCost, cacheCost);

  return {
    inputCostUsd: inputCost,
    outputCostUsd: outputCost,
    cacheCostUsd: cacheCost,
    totalCostUsd: totalCost,
    costStatus: hasMissing ? 'partial' : 'complete',
    missingPriceModels: [],
    missingPriceComponents,
    priceKey: resolved.key,
    priceSource: resolved.source,
  };
}

const mergeStatus = (summaries: NormalizedUsageCost[]): CostStatus => {
  if (summaries.some((summary) => summary.costStatus === 'policy_unavailable')) {
    return 'policy_unavailable';
  }
  const hasKnownCost = summaries.some((summary) => summary.totalCostUsd !== null);
  const hasIncomplete = summaries.some((summary) => summary.costStatus !== 'complete');
  if (hasKnownCost && hasIncomplete) return 'partial';
  if (summaries.some((summary) => summary.costStatus === 'unknown_usage')) return 'unknown_usage';
  if (summaries.some((summary) => summary.costStatus === 'unconfigured')) return 'unconfigured';
  if (summaries.some((summary) => summary.costStatus === 'partial')) return 'partial';
  return 'complete';
};

export function aggregateUsageCosts(costs: NormalizedUsageCost[]): AggregateUsageCost {
  if (!costs.length) {
    return {
      ...buildEmptyCost('unknown_usage'),
      knownDetailCount: 0,
      unknownUsageCount: 0,
      unconfiguredCount: 0,
      partialCount: 0,
      completeCount: 0,
    };
  }

  const status = mergeStatus(costs);
  const totalCostUsd = aggregateKnownSubtotal(status, costs, (cost) => cost.totalCostUsd);
  const inputCostUsd = aggregateKnownSubtotal(status, costs, (cost) => cost.inputCostUsd);
  const outputCostUsd = aggregateKnownSubtotal(status, costs, (cost) => cost.outputCostUsd);
  const cacheCostUsd = aggregateKnownSubtotal(status, costs, (cost) => cost.cacheCostUsd);

  return {
    inputCostUsd,
    outputCostUsd,
    cacheCostUsd,
    totalCostUsd,
    costStatus: status,
    missingPriceModels: Array.from(new Set(costs.flatMap((cost) => cost.missingPriceModels))).sort(),
    missingPriceComponents: Array.from(
      new Set(costs.flatMap((cost) => cost.missingPriceComponents))
    ).sort(),
    knownDetailCount: costs.filter((cost) => cost.totalCostUsd !== null).length,
    unknownUsageCount: costs.filter((cost) => cost.costStatus === 'unknown_usage').length,
    unconfiguredCount: costs.filter((cost) => cost.costStatus === 'unconfigured').length,
    partialCount: costs.filter((cost) => cost.costStatus === 'partial').length,
    completeCount: costs.filter((cost) => cost.costStatus === 'complete').length,
  };
}

export function getPriceOptionsFromUsage(
  details: NormalizedUsageDetail[],
  userOverrides: ModelPriceOverrides
): PriceOption[] {
  const keys = new Set<PriceKey>();
  details.forEach((detail) => {
    if (detail.model) {
      keys.add(buildPriceKey(detail.provider, detail.model));
    }
  });
  Object.keys(officialDefaults).forEach((key) => keys.add(key as PriceKey));
  Object.keys(userOverrides).forEach((key) => keys.add(key as PriceKey));

  return Array.from(keys)
    .map((key) => {
      const [provider, ...modelParts] = key.split(':');
      const model = modelParts.join(':');
      const resolved = resolveModelPrice(provider === 'legacy' ? '' : provider, model, userOverrides);
      const hasUserOverride = Boolean(userOverrides[key]);
      return {
        key,
        model,
        provider,
        label: provider === 'legacy' ? model : `${provider}:${model}`,
        source: resolved.source,
        price: resolved.price,
        hasOfficialDefault: resolved.hasOfficialDefault,
        hasUserOverride,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

export interface UsageCatalogPriceEntry {
  id?: string;
  label?: string;
  price_key?: string;
  provider?: string;
}

/** Build the all-history price selector from the immutable catalog. */
export function getPriceOptionsFromCatalog(
  catalog: unknown,
  userOverrides: ModelPriceOverrides
): PriceOption[] {
  const record = isRecord(catalog) ? catalog : {};
  const entries = [
    ...(Array.isArray(record.models) ? record.models : []),
    ...(Array.isArray(record.price_keys) ? record.price_keys : []),
  ].filter(isRecord) as UsageCatalogPriceEntry[];
  const keys = new Set<PriceKey>();
  const labels = new Map<PriceKey, string>();

  entries.forEach((entry) => {
    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    const provider = typeof entry.provider === 'string' ? entry.provider.trim() : '';
    const rawPriceKey = typeof entry.price_key === 'string' ? entry.price_key.trim() : '';
    const key = (rawPriceKey || buildPriceKey(provider, id)) as PriceKey;
    if (!key || key.endsWith(':-')) return;
    keys.add(key);
    const label = typeof entry.label === 'string' ? entry.label.trim() : '';
    if (label && !labels.has(key)) labels.set(key, label);
  });

  Object.keys(officialDefaults).forEach((key) => keys.add(key as PriceKey));
  Object.keys(userOverrides).forEach((key) => keys.add(key as PriceKey));

  return Array.from(keys)
    .map((key) => {
      const [providerPart, ...modelParts] = key.split(':');
      const provider = providerPart === 'legacy' ? '' : providerPart;
      const model = modelParts.join(':');
      const resolved = resolveModelPrice(provider, model, userOverrides);
      return {
        key,
        model,
        provider: providerPart,
        label: labels.get(key) || (providerPart === 'legacy' ? model : `${providerPart}:${model}`),
        source: resolved.source,
        price: resolved.price,
        hasOfficialDefault: resolved.hasOfficialDefault,
        hasUserOverride: Boolean(userOverrides[key]),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function hasAnyResolvedCost(usageCosts: NormalizedUsageCost[]): boolean {
  return usageCosts.some((cost) => cost.totalCostUsd !== null);
}
