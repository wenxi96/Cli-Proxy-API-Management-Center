import type { ReactNode } from 'react';
import styles from '@/pages/AuthFilesPage.module.scss';

/**
 * 认证文件额度区共享卡片外壳。
 *
 * 统一「批量检查概览」与「额度概览」（单文件刷新）两入口的外壳结构：
 * header（标题 + 右侧 badges）→ meta（时间等辅助信息）→ children（额度区）。
 * 复用现有 batchCheckInline* 样式类（通用结构样式，非批量检查专属语义）。
 */
export type QuotaCardShellProps = {
  title: string;
  badges?: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function QuotaCardShell({ title, badges, meta, children, className }: QuotaCardShellProps) {
  const cardClass = className
    ? `${styles.batchCheckInlineCard} ${className}`
    : styles.batchCheckInlineCard;

  return (
    <div className={cardClass}>
      <div className={styles.batchCheckInlineHeader}>
        <span className={styles.batchCheckInlineTitle}>{title}</span>
        {badges && <div className={styles.batchCheckInlineBadges}>{badges}</div>}
      </div>
      {meta && <div className={styles.batchCheckInlineMeta}>{meta}</div>}
      {children}
    </div>
  );
}
