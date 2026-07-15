import type { PriceOption } from './cost';
import { parseNonNegativeNumber } from './normalization';
import type { UserModelPriceOverride } from './pricingDefaults';

export interface PriceFormState {
  input: string;
  output: string;
  cacheRead: string;
  cacheCreation: string;
}

export const EMPTY_PRICE_FORM: PriceFormState = {
  input: '',
  output: '',
  cacheRead: '',
  cacheCreation: '',
};

const parsePriceComponent = (value: string): number | undefined => {
  const parsed = parseNonNegativeNumber(value);
  return parsed === null ? undefined : parsed;
};

const formatPriceComponent = (value: number | undefined): string =>
  typeof value === 'number' && Number.isFinite(value) ? value.toString() : '';

export const buildPriceOverride = (form: PriceFormState): UserModelPriceOverride | null => {
  const inputUsdPer1M = parsePriceComponent(form.input);
  const outputUsdPer1M = parsePriceComponent(form.output);
  const cacheReadUsdPer1M = parsePriceComponent(form.cacheRead);
  const cacheCreationUsdPer1M = parsePriceComponent(form.cacheCreation);

  if (
    inputUsdPer1M === undefined &&
    outputUsdPer1M === undefined &&
    cacheReadUsdPer1M === undefined &&
    cacheCreationUsdPer1M === undefined
  ) {
    return null;
  }

  return {
    ...(inputUsdPer1M !== undefined ? { inputUsdPer1M } : {}),
    ...(outputUsdPer1M !== undefined ? { outputUsdPer1M } : {}),
    ...(cacheReadUsdPer1M !== undefined ? { cacheReadUsdPer1M } : {}),
    ...(cacheCreationUsdPer1M !== undefined ? { cacheCreationUsdPer1M } : {}),
  };
};

export const priceOptionToFormState = (option: PriceOption | undefined): PriceFormState => {
  if (!option?.price) return EMPTY_PRICE_FORM;
  return {
    input: formatPriceComponent(option.price.inputUsdPer1M),
    output: formatPriceComponent(option.price.outputUsdPer1M),
    cacheRead: formatPriceComponent(option.price.cacheReadUsdPer1M),
    cacheCreation: formatPriceComponent(option.price.cacheCreationUsdPer1M),
  };
};
