import { describe, expect, test } from 'bun:test';
import type { TFunction } from 'i18next';
import type { XaiQuotaState } from '../src/types/quota';
import { providerStateToQuotaView } from '../src/features/authFiles/utils/quotaView';

const t = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key) as TFunction;

describe('xAI auth-file quota view parity', () => {
  test('includes weekly, product, on-demand, and monthly rows', () => {
    const quota: XaiQuotaState = {
      status: 'success',
      billing: {
        periodType: 'weekly',
        usagePercent: 25,
        periodEnd: '2026-07-20T00:00:00Z',
        productUsage: [{ product: 'grok-code', usagePercent: 40 }],
        monthlyLimitCents: 15_000,
        usedCents: 5_000,
        includedUsedCents: 5_000,
        onDemandCapCents: 10_000,
        onDemandUsedCents: 2_000,
        onDemandUsedPercent: 20,
        billingPeriodEnd: '2026-08-01T00:00:00Z',
        usedPercent: 100 / 3,
      },
    };

    const view = providerStateToQuotaView('xai', quota, t);

    expect(view.rows.map((row) => row.key)).toEqual([
      'weekly-limit',
      'product-grok-code',
      'pay-as-you-go',
      'monthly-credits',
    ]);
    expect(view.rows.map((row) => (row.kind === 'leaf' ? row.percent : null))).toEqual([
      75,
      60,
      80,
      100 - 100 / 3,
    ]);
    expect(view.plan?.items.map((item) => item.key)).toEqual(['plan']);
  });
});
