import { useTranslation } from 'react-i18next';
import type { ScopedPoolAuthRuntimeStatus } from '@/types';
import { getScopedPoolReasonKey, getScopedPoolStateKey } from '@/utils/scopedPool';
import styles from '@/pages/AiProvidersPage.module.scss';

interface ScopedPoolAuthBadgeProps {
  status?: ScopedPoolAuthRuntimeStatus | null;
}

export function ScopedPoolAuthBadge({ status }: ScopedPoolAuthBadgeProps) {
  const { t } = useTranslation();

  if (!status?.configured && !status?.poolEnabled && !status?.state && !status?.reason) {
    return null;
  }

  const stateKey = status?.poolEnabled
    ? getScopedPoolStateKey(status.state)
    : status?.configured
      ? 'configured'
      : 'unmanaged';
  const reasonKey = getScopedPoolReasonKey(status?.reason);
  const stateLabel =
    stateKey === 'configured'
      ? t('ai_providers.scoped_pool_state_configured')
      : t(`ai_providers.scoped_pool_state_${stateKey}`);
  const reasonLabel =
    reasonKey !== 'none' ? t(`ai_providers.scoped_pool_reason_${reasonKey}`) : '';
  const primaryClass =
    status?.poolEnabled && status?.inPool
      ? styles.scopedPoolBadgeSuccess
      : status?.poolEnabled && stateKey === 'standby'
        ? styles.scopedPoolBadgeOutline
        : status?.poolEnabled && stateKey === 'penalized'
          ? styles.scopedPoolBadgeWarning
          : status?.poolEnabled
            ? styles.scopedPoolBadgeDanger
            : styles.scopedPoolBadgeMuted;
  const secondaryClass =
    reasonKey === 'healthy' || reasonKey === 'pool_full'
      ? styles.scopedPoolBadgeOutline
      : reasonKey === 'strategy_incompatible' || reasonKey === 'not_enabled'
        ? styles.scopedPoolBadgeMuted
        : reasonKey === 'none'
          ? styles.scopedPoolBadgeOutline
          : styles.scopedPoolBadgeWarning;

  return (
    <div className={styles.scopedPoolBadgeRow}>
      <span className={`${styles.scopedPoolBadge} ${primaryClass}`}>{stateLabel}</span>
      {reasonLabel ? (
        <span className={`${styles.scopedPoolBadge} ${secondaryClass}`}>{reasonLabel}</span>
      ) : null}
      {typeof status?.remainingPercent === 'number' ? (
        <span className={`${styles.scopedPoolBadge} ${styles.scopedPoolBadgeOutline}`}>
          {t('ai_providers.scoped_pool_remaining_percent', { value: status.remainingPercent })}
        </span>
      ) : null}
    </div>
  );
}
