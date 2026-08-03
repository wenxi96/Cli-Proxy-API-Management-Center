import type { ReactElement } from 'react';

export interface QuotaProgressBarProps {
  percent: number | null;
  highThreshold: number;
  mediumThreshold: number;
}

/** Compatibility contract for the legacy quota configuration renderers. */
export interface QuotaRenderHelpers {
  styles: Record<string, string>;
  QuotaProgressBar: (props: QuotaProgressBarProps) => ReactElement;
}
