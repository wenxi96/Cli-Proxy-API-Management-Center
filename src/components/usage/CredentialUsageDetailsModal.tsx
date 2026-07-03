import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { usageApi, type AuthUsageRequestsParams } from '@/services/api/usage';
import { getErrorMessage } from '@/utils/helpers';
import { formatDurationMs } from '@/utils/usage';
import styles from '@/pages/UsagePage.module.scss';
import {
  buildCredentialRequestRowsFromAuthItems,
  formatCredentialCostLabel,
  type CredentialUsageBuildContext,
  type CredentialUsageRequestRow,
  type CredentialUsageRow,
} from './credentialUsage';

interface CredentialUsageDetailsModalProps {
  open: boolean;
  credential: CredentialUsageRow | null;
  context: CredentialUsageBuildContext;
  requestWindow?: Pick<AuthUsageRequestsParams, 'from' | 'to'>;
  onClose: () => void;
}

const PAGE_SIZE = 50;
const LOCAL_FALLBACK_LIMIT = 500;

const getCostStatusLabelKey = (status: CredentialUsageRow['cost']['costStatus']) => {
  if (status === 'partial') return 'usage_stats.cost_status_partial';
  if (status === 'unconfigured') return 'usage_stats.cost_status_unconfigured';
  return 'usage_stats.cost_status_complete';
};

export function CredentialUsageDetailsModal({
  open,
  credential,
  context,
  requestWindow,
  onClose,
}: CredentialUsageDetailsModalProps) {
  const { t, i18n } = useTranslation();
  const localRows = useMemo(
    () => (credential ? credential.details.slice(0, LOCAL_FALLBACK_LIMIT) : []),
    [credential]
  );
  const hasBackendDetails = Boolean(credential?.authIndex);
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<CredentialUsageRequestRow[]>(() =>
    hasBackendDetails ? [] : localRows.slice(0, PAGE_SIZE)
  );
  const [total, setTotal] = useState(() => (hasBackendDetails ? 0 : localRows.length));
  const [loading, setLoading] = useState(() => open && hasBackendDetails);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [source, setSource] = useState<'backend' | 'local'>('local');
  const hasLocalOverflow = Boolean(
    credential && credential.details.length > LOCAL_FALLBACK_LIMIT
  );

  useEffect(() => {
    if (!open || !credential) {
      return;
    }

    let cancelled = false;
    const applyLocalFallback = (message = '') => {
      const pagedRows = localRows.slice(offset, offset + PAGE_SIZE);
      setRows(pagedRows);
      setTotal(localRows.length);
      setSource('local');
      setError('');
      setNotice(message);
    };

    if (!credential.authIndex) {
      return () => {
        cancelled = true;
      };
    }

    usageApi
      .getAuthUsageRequests(credential.authIndex, {
        limit: PAGE_SIZE,
        offset,
        ...requestWindow,
      })
      .then((response) => {
        if (cancelled) return;
        const items = Array.isArray(response.items) ? response.items : [];
        setRows(buildCredentialRequestRowsFromAuthItems(items, context));
        setTotal(Number.isFinite(Number(response.total)) ? Math.max(Number(response.total), 0) : items.length);
        setSource('backend');
        setError('');
        setNotice('');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (localRows.length > 0) {
          applyLocalFallback(t('usage_stats.credential_details_fallback_notice'));
          return;
        }
        setRows([]);
        setTotal(0);
        setSource('local');
        setNotice('');
        setError(getErrorMessage(err, t('usage_stats.credential_details_load_failed')));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [context, credential, localRows, offset, open, requestWindow, t]);

  if (!credential) {
    return null;
  }

  const handleOffsetChange = (nextOffset: number) => {
    const normalizedOffset = Math.max(nextOffset, 0);
    setOffset(normalizedOffset);
    setError('');
    setNotice('');

    if (!credential.authIndex) {
      setRows(localRows.slice(normalizedOffset, normalizedOffset + PAGE_SIZE));
      setTotal(localRows.length);
      setSource('local');
      return;
    }

    setLoading(true);
  };

  const costLabel = formatCredentialCostLabel(credential.cost);
  const costStatusLabel = t(getCostStatusLabelKey(credential.cost.costStatus));
  const missingModels = credential.cost.missingPriceModels;
  const missingModelsLabel = missingModels.slice(0, 8).join(', ');
  const canGoPrev = offset > 0;
  const canGoNext = offset + PAGE_SIZE < total;
  const shownFrom = total > 0 ? offset + 1 : 0;
  const shownTo = Math.min(offset + rows.length, total);

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={1120}
      className={styles.credentialDetailsModal}
      title={
        <div className={styles.credentialDetailsTitle}>
          <span>{credential.displayName}</span>
          {credential.type && <span className={styles.credentialType}>{credential.type}</span>}
        </div>
      }
      footer={
        <div className={styles.credentialDetailsFooter}>
          <span className={styles.credentialDetailsPageInfo}>
            {t('usage_stats.credential_details_page_info', {
              from: shownFrom,
              to: shownTo,
              total,
            })}
          </span>
          <div className={styles.credentialDetailsPager}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => handleOffsetChange(offset - PAGE_SIZE)}
              disabled={!canGoPrev || loading}
            >
              {t('usage_stats.previous_page')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => handleOffsetChange(offset + PAGE_SIZE)}
              disabled={!canGoNext || loading}
            >
              {t('usage_stats.next_page')}
            </Button>
          </div>
        </div>
      }
    >
      <div className={styles.credentialDetailsBody}>
        <div className={styles.credentialDetailsSummary}>
          <div className={styles.credentialSummaryItem}>
            <span>{t('usage_stats.requests_count')}</span>
            <strong>{credential.total.toLocaleString()}</strong>
            <small>
              {t('usage_stats.credential_request_breakdown', {
                success: credential.success,
                failure: credential.failure,
              })}
            </small>
          </div>
          <div className={styles.credentialSummaryItem}>
            <span>{t('usage_stats.success_rate')}</span>
            <strong>{credential.successRate.toFixed(1)}%</strong>
          </div>
          <div className={styles.credentialSummaryItem}>
            <span>{t('usage_stats.total_tokens')}</span>
            <strong>{credential.tokens.totalTokens.toLocaleString()}</strong>
            <small>
              {t('usage_stats.credential_token_breakdown_short', {
                input: credential.tokens.inputTokens,
                output: credential.tokens.outputTokens,
                reasoning: credential.tokens.reasoningTokens,
                cached: credential.tokens.cachedTokens,
              })}
            </small>
          </div>
          <div className={styles.credentialSummaryItem}>
            <span>{t('usage_stats.estimated_cost')}</span>
            <strong>{costLabel}</strong>
            <small
              className={
                credential.cost.costStatus === 'complete'
                  ? styles.costStatusComplete
                  : credential.cost.costStatus === 'partial'
                    ? styles.costStatusPartial
                    : styles.costStatusUnconfigured
              }
              title={missingModelsLabel || undefined}
            >
              {costStatusLabel}
              {missingModels.length > 0
                ? ` · ${t('usage_stats.missing_price_models_count', { count: missingModels.length })}`
                : ''}
            </small>
          </div>
        </div>

        {notice && <div className={styles.credentialDetailsNotice}>{notice}</div>}
        {source === 'local' && hasLocalOverflow && (
          <div className={styles.credentialDetailsNotice}>
            {t('usage_stats.credential_details_local_limit_hint', {
              shown: LOCAL_FALLBACK_LIMIT,
              total: credential.details.length,
            })}
          </div>
        )}
        {missingModels.length > 0 && (
          <div className={styles.credentialMissingModels} title={missingModelsLabel}>
            {t('usage_stats.missing_price_models')}: {missingModelsLabel}
            {missingModels.length > 8 ? '...' : ''}
          </div>
        )}

        {loading && rows.length === 0 ? (
          <div className={styles.hint}>{t('common.loading')}</div>
        ) : error ? (
          <div className={styles.errorBox}>{error}</div>
        ) : rows.length === 0 ? (
          <EmptyState
            title={t('usage_stats.credential_details_empty_title')}
            description={t('usage_stats.credential_details_empty_desc')}
          />
        ) : (
          <div className={styles.credentialDetailsTableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('usage_stats.request_events_timestamp')}</th>
                  <th>{t('usage_stats.model_name')}</th>
                  <th>{t('usage_stats.request_events_source')}</th>
                  <th>{t('usage_stats.request_events_result')}</th>
                  <th>{t('usage_stats.time')}</th>
                  <th>{t('usage_stats.input_tokens')}</th>
                  <th>{t('usage_stats.output_tokens')}</th>
                  <th>{t('usage_stats.reasoning_tokens')}</th>
                  <th>{t('usage_stats.cached_tokens')}</th>
                  <th>{t('usage_stats.total_tokens')}</th>
                  <th>{t('usage_stats.estimated_cost')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const date = row.timestampMs > 0 ? new Date(row.timestampMs) : null;
                  const timestampLabel = date
                    ? date.toLocaleString(i18n.language)
                    : row.timestamp || '-';
                  const rowCostLabel = formatCredentialCostLabel(row.cost);
                  return (
                    <tr key={row.id}>
                      <td title={row.timestamp} className={styles.requestEventsTimestamp}>
                        {timestampLabel}
                      </td>
                      <td className={styles.modelCell}>{row.model}</td>
                      <td className={styles.requestEventsSourceCell} title={row.source}>
                        <span>{row.source}</span>
                        {row.sourceType && (
                          <span className={styles.credentialType}>{row.sourceType}</span>
                        )}
                      </td>
                      <td>
                        <span
                          className={
                            row.failed
                              ? styles.requestEventsResultFailed
                              : styles.requestEventsResultSuccess
                          }
                        >
                          {row.failed ? t('stats.failure') : t('stats.success')}
                        </span>
                      </td>
                      <td className={styles.durationCell}>{formatDurationMs(row.latencyMs)}</td>
                      <td>{row.tokens.inputTokens.toLocaleString()}</td>
                      <td>{row.tokens.outputTokens.toLocaleString()}</td>
                      <td>{row.tokens.reasoningTokens.toLocaleString()}</td>
                      <td>{row.tokens.cachedTokens.toLocaleString()}</td>
                      <td>{row.tokens.totalTokens.toLocaleString()}</td>
                      <td>
                        <span
                          className={
                            row.cost.costStatus === 'complete'
                              ? styles.costStatusComplete
                              : row.cost.costStatus === 'partial'
                                ? styles.costStatusPartial
                                : styles.costStatusUnconfigured
                          }
                          title={row.cost.missingPriceModels.join(', ') || undefined}
                        >
                          {rowCostLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}
