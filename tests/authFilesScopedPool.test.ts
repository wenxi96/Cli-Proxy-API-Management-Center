import { beforeAll, describe, expect, mock, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '../src/i18n';
import { getAuthFilePoolStatus } from '@/features/authFiles/logic';
import type { AuthFileItem } from '@/types';

mock.module('@/features/authFiles/components/AuthFileQuotaSection', () => ({
  AuthFileQuotaSection: () => null,
}));

const { AuthFileCard } = await import('../src/features/authFiles/components/AuthFileCard');
type AuthFileCardProps = Parameters<typeof AuthFileCard>[0];

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

const buildCardProps = (file: AuthFileItem): AuthFileCardProps => ({
  file,
  compact: false,
  selected: false,
  resolvedTheme: 'light',
  disableControls: false,
  deleting: null,
  statusUpdating: {},
  manualRefreshing: {},
  quotaFilterType: null,
  statusBarCache: new Map(),
  onShowModels: () => {},
  onDownload: () => {},
  onManualRefresh: () => {},
  onOpenPrefixProxyEditor: () => {},
  onDelete: () => {},
  onToggleStatus: () => {},
  onToggleSelect: () => {},
});

describe('auth-file scoped pool badges', () => {
  test('normalizes snake_case pool status, reason, and remaining quota', () => {
    const status = getAuthFilePoolStatus({
      name: 'codex.json',
      type: 'codex',
      pool_enabled: true,
      pool_state: 'standby',
      pool_reason: 'low_quota',
      pool_remaining_percent: 24,
    });

    expect(status).toEqual({
      enabled: true,
      state: 'standby',
      reason: 'low_quota',
      remainingPercent: 24,
      visible: true,
    });
  });

  test('accepts camelCase pool fields and hides the badge when the response has none', () => {
    const camelCaseStatus = getAuthFilePoolStatus({
      name: 'claude.json',
      type: 'claude',
      poolEnabled: true,
      poolState: 'in_pool',
      poolReason: 'healthy',
      poolRemainingPercent: 88,
    });
    const plainStatus = getAuthFilePoolStatus({ name: 'plain.json', type: 'codex' });

    expect(camelCaseStatus).toMatchObject({
      enabled: true,
      state: 'in_pool',
      reason: 'healthy',
      remainingPercent: 88,
      visible: true,
    });
    expect(plainStatus.visible).toBe(false);
  });

  test('renders the scoped-pool state, reason, and remaining-quota badges on the auth-file card', () => {
    const markup = renderToStaticMarkup(
      createElement(
        AuthFileCard,
        buildCardProps({
          name: 'codex.json',
          type: 'codex',
          pool_enabled: true,
          pool_state: 'standby',
          pool_reason: 'low_quota',
          pool_remaining_percent: 24,
        })
      )
    );

    expect(markup).toContain('Standby');
    expect(markup).toContain('Below Quota Threshold');
    expect(markup).toContain('Quota 24%');
  });
});
