import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { AuthUsageRequestsParams } from '@/services/api/usage';
import { authFilesApi } from '@/services/api/authFiles';
import type { GeminiKeyConfig, OpenAIProviderConfig, ProviderKeyConfig } from '@/types';
import type { AuthFileItem } from '@/types/authFile';
import type { CredentialInfo } from '@/types/sourceInfo';
import { buildSourceInfoMap } from '@/utils/sourceResolver';
import {
  formatCompactNumber,
  normalizeAuthIndex,
  type ModelPrice,
} from '@/utils/usage';
import type { UsagePayload } from './hooks/useUsageData';
import { CredentialUsageDetailsModal } from './CredentialUsageDetailsModal';
import {
  buildCredentialUsageRows,
  formatCredentialCostLabel,
  type CredentialCostStatus,
  type CredentialUsageRow,
} from './credentialUsage';
import styles from '@/pages/UsagePage.module.scss';

export interface CredentialStatsCardProps {
  usage: UsagePayload | null;
  loading: boolean;
  geminiKeys: GeminiKeyConfig[];
  claudeConfigs: ProviderKeyConfig[];
  codexConfigs: ProviderKeyConfig[];
  vertexConfigs: ProviderKeyConfig[];
  openaiProviders: OpenAIProviderConfig[];
  modelPrices: Record<string, ModelPrice>;
  hasPrices: boolean;
  requestWindow?: Pick<AuthUsageRequestsParams, 'from' | 'to'>;
}

const getCostStatusLabelKey = (status: CredentialCostStatus) => {
  if (status === 'partial') return 'usage_stats.cost_status_partial';
  if (status === 'unconfigured') return 'usage_stats.cost_status_unconfigured';
  return 'usage_stats.cost_status_complete';
};

export function CredentialStatsCard({
  usage,
  loading,
  geminiKeys,
  claudeConfigs,
  codexConfigs,
  vertexConfigs,
  openaiProviders,
  modelPrices,
  hasPrices,
  requestWindow,
}: CredentialStatsCardProps) {
  const { t } = useTranslation();
  const [authFileMap, setAuthFileMap] = useState<Map<string, CredentialInfo>>(new Map());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    authFilesApi
      .list()
      .then((res) => {
        if (cancelled) return;

        const files = Array.isArray(res) ? res : (res as { files?: AuthFileItem[] })?.files;
        if (!Array.isArray(files)) return;

        const map = new Map<string, CredentialInfo>();
        files.forEach((file) => {
          const key = normalizeAuthIndex(file['auth_index'] ?? file.authIndex);
          if (!key) return;

          map.set(key, {
            name: file.name || key,
            type: (file.type || file.provider || '').toString(),
          });
        });
        setAuthFileMap(map);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const sourceInfoMap = useMemo(
    () =>
      buildSourceInfoMap({
        geminiApiKeys: geminiKeys,
        claudeApiKeys: claudeConfigs,
        codexApiKeys: codexConfigs,
        vertexApiKeys: vertexConfigs,
        openaiCompatibility: openaiProviders,
      }),
    [claudeConfigs, codexConfigs, geminiKeys, openaiProviders, vertexConfigs]
  );

  const credentialContext = useMemo(
    () => ({
      sourceInfoMap,
      authFileMap,
      modelPrices,
    }),
    [authFileMap, modelPrices, sourceInfoMap]
  );

  const rows = useMemo(
    (): CredentialUsageRow[] => (usage ? buildCredentialUsageRows(usage, credentialContext) : []),
    [credentialContext, usage]
  );
  const selectedCredential = useMemo(
    () => rows.find((row) => row.key === selectedKey) ?? null,
    [rows, selectedKey]
  );
  const detailsModalKey = selectedCredential
    ? [
        selectedCredential.key,
        requestWindow?.from ?? 'all',
        requestWindow?.to ?? '',
      ].join('|')
    : 'closed';

  const hasTokenRows = rows.some((row) => row.tokens.totalTokens > 0);

  const renderCostCell = (row: CredentialUsageRow) => {
    const missingModelsLabel = row.cost.missingPriceModels.join(', ');
    return (
      <span className={styles.credentialCostCell}>
        <span>{formatCredentialCostLabel(row.cost)}</span>
        <span
          className={
            row.cost.costStatus === 'complete'
              ? styles.costStatusComplete
              : row.cost.costStatus === 'partial'
                ? styles.costStatusPartial
                : styles.costStatusUnconfigured
          }
          title={missingModelsLabel || undefined}
        >
          {t(getCostStatusLabelKey(row.cost.costStatus))}
          {row.cost.missingPriceModels.length > 0
            ? ` · ${t('usage_stats.missing_price_models_count', {
                count: row.cost.missingPriceModels.length,
              })}`
            : ''}
        </span>
      </span>
    );
  };

  return (
    <>
      <Card title={t('usage_stats.credential_stats')} className={styles.detailsFixedCard}>
        {loading ? (
          <div className={styles.hint}>{t('common.loading')}</div>
        ) : rows.length > 0 ? (
          <div className={styles.detailsScroll}>
            {!hasPrices && hasTokenRows && (
              <div className={styles.detailsNote}>{t('usage_stats.cost_need_price')}</div>
            )}
            <div className={styles.tableWrapper}>
              <table className={`${styles.table} ${styles.credentialStatsTable}`}>
                <thead>
                  <tr>
                    <th>{t('usage_stats.credential_name')}</th>
                    <th>{t('usage_stats.requests_count')}</th>
                    <th>{t('usage_stats.success_rate')}</th>
                    <th>{t('usage_stats.input_tokens')}</th>
                    <th>{t('usage_stats.output_tokens')}</th>
                    <th>{t('usage_stats.reasoning_tokens')}</th>
                    <th>{t('usage_stats.cached_tokens')}</th>
                    <th>{t('usage_stats.total_tokens')}</th>
                    <th>{t('usage_stats.estimated_cost')}</th>
                    <th>{t('usage_stats.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.key}>
                      <td className={styles.modelCell}>
                        <span>{row.displayName}</span>
                        {row.type && <span className={styles.credentialType}>{row.type}</span>}
                      </td>
                      <td>
                        <span className={styles.requestCountCell}>
                          <span>{formatCompactNumber(row.total)}</span>
                          <span className={styles.requestBreakdown}>
                            (
                            <span className={styles.statSuccess}>
                              {row.success.toLocaleString()}
                            </span>{' '}
                            <span className={styles.statFailure}>
                              {row.failure.toLocaleString()}
                            </span>
                            )
                          </span>
                        </span>
                      </td>
                      <td>
                        <span
                          className={
                            row.successRate >= 95
                              ? styles.statSuccess
                              : row.successRate >= 80
                                ? styles.statNeutral
                                : styles.statFailure
                          }
                        >
                          {row.successRate.toFixed(1)}%
                        </span>
                      </td>
                      <td className={styles.tokenNumberCell}>
                        {row.tokens.inputTokens.toLocaleString()}
                      </td>
                      <td className={styles.tokenNumberCell}>
                        {row.tokens.outputTokens.toLocaleString()}
                      </td>
                      <td className={styles.tokenNumberCell}>
                        {row.tokens.reasoningTokens.toLocaleString()}
                      </td>
                      <td className={styles.tokenNumberCell}>
                        {row.tokens.cachedTokens.toLocaleString()}
                      </td>
                      <td className={styles.tokenNumberCell}>
                        {row.tokens.totalTokens.toLocaleString()}
                      </td>
                      <td>{renderCostCell(row)}</td>
                      <td>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedKey(row.key)}
                          aria-label={t('usage_stats.view_credential_details_for', {
                            name: row.displayName,
                          })}
                        >
                          {t('usage_stats.view_details')}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className={styles.hint}>{t('usage_stats.no_data')}</div>
        )}
      </Card>

      <CredentialUsageDetailsModal
        key={detailsModalKey}
        open={Boolean(selectedCredential)}
        credential={selectedCredential}
        context={credentialContext}
        requestWindow={requestWindow}
        onClose={() => setSelectedKey(null)}
      />
    </>
  );
}
