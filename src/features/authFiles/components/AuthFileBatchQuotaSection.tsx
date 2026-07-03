import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { AuthFileBatchCheckResult } from '@/types';
import { batchResultToQuotaView } from '@/features/authFiles/utils/quotaView';
import { QuotaRowsView } from '@/features/authFiles/components/QuotaRowsView';
import styles from '@/pages/AuthFilesPage.module.scss';

export type AuthFileBatchQuotaSectionProps = {
  result: AuthFileBatchCheckResult;
};

export function AuthFileBatchQuotaSection({ result }: AuthFileBatchQuotaSectionProps) {
  const { t } = useTranslation();
  const view = useMemo(() => batchResultToQuotaView(result, t), [result, t]);

  return (
    <div className={`${styles.quotaSection} ${styles.batchCheckQuotaSection}`}>
      <QuotaRowsView view={view} />
    </div>
  );
}
