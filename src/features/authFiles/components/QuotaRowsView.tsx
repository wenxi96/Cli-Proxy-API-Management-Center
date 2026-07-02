import { Fragment, type ReactNode } from 'react';
import { QuotaProgressBar } from '@/features/authFiles/components/QuotaProgressBar';
import type { NormalizedQuotaView } from '@/features/authFiles/utils/quotaView';
import styles from '@/pages/AuthFilesPage.module.scss';

const QUOTA_PROGRESS_HIGH_THRESHOLD = 70;
const QUOTA_PROGRESS_MEDIUM_THRESHOLD = 30;

export type QuotaRowsViewProps = {
  view: NormalizedQuotaView;
};

/**
 * 统一额度行视图。按 `row.kind` 分派渲染：
 * - `leaf`：label / percent / amount / reset + QuotaProgressBar，保留 `title={row.title ?? row.label}`（B 路径既有 tooltip 行为）。
 * - `group`：仅渲染 group header（label + 可选可见 description span），不渲染 percent / 进度条 / amount / reset
 *   （group header 本无进度条，且 QuotaProgressBar 在 null 时仍渲染 0 宽度容器），再循环 `nested` 渲染 leaf 子行。
 *
 * 空态：rows 为空且有 `view.empty` 时渲染 quotaMessage。
 */
export function QuotaRowsView({ view }: QuotaRowsViewProps) {
  const planItems = view.plan?.items ?? [];

  return (
    <Fragment>
      {planItems.length > 0 && (
        <div className={styles.codexPlan}>
          {planItems.map((item) => (
            // 容器恒为 codexPlanItem；premium 只作用于 value span（对齐 quotaConfigs.ts:925-945 的语义）。
            <span key={item.key} className={styles.codexPlanItem}>
              <span className={styles.codexPlanLabel}>{item.label}</span>
              <span className={item.premium ? styles.premiumPlanValue : styles.codexPlanValue}>
                {item.value}
              </span>
            </span>
          ))}
        </div>
      )}

      {view.rows.length > 0 ? (
        view.rows.map((row) =>
          row.kind === 'group' ? (
            <div key={row.key} className={styles.antigravityQuotaGroup}>
              <div className={styles.antigravityQuotaGroupHeader}>
                <span className={styles.antigravityQuotaGroupTitle}>{row.label}</span>
                {row.description && (
                  <span className={styles.antigravityQuotaGroupDescription}>{row.description}</span>
                )}
              </div>
              {row.nested.map((nestedRow) => renderLeafRow(nestedRow))}
            </div>
          ) : (
            renderLeafRow(row)
          )
        )
      ) : view.empty ? (
        <div className={styles.quotaMessage}>{view.empty}</div>
      ) : null}

      {view.resetCredits && view.resetCredits.items.length > 0 && (
        <div className={styles.codexResetCredits}>
          <div className={styles.codexResetCreditsTitle}>{view.resetCredits.title}</div>
          {view.resetCredits.items.map((item) => (
            <div key={item.key} className={styles.codexResetCreditRow}>
              <span className={styles.codexResetCreditLabel}>{item.label}</span>
              <span className={styles.codexResetCreditTime}>{item.time}</span>
            </div>
          ))}
        </div>
      )}

      {view.resetCredits?.error && (
        <div className={styles.codexResetCreditsError}>{view.resetCredits.error}</div>
      )}
    </Fragment>
  );
}

function renderLeafRow(row: NormalizedQuotaView['rows'][number] & { kind: 'leaf' }): ReactNode {
  return (
    <div key={row.key} className={styles.quotaRow}>
      <div className={styles.quotaRowHeader}>
        <span className={styles.quotaModel} title={row.title ?? row.label}>
          {row.label}
        </span>
        <div className={styles.quotaMeta}>
          <span className={styles.quotaPercent}>{row.percentLabel}</span>
          {row.amountLabel && <span className={styles.quotaAmount}>{row.amountLabel}</span>}
          {row.resetLabel && <span className={styles.quotaReset}>{row.resetLabel}</span>}
        </div>
      </div>
      <QuotaProgressBar
        percent={row.percent}
        highThreshold={QUOTA_PROGRESS_HIGH_THRESHOLD}
        mediumThreshold={QUOTA_PROGRESS_MEDIUM_THRESHOLD}
      />
    </div>
  );
}
