import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import { IconChevronDown, IconChevronUp } from '@/components/ui/icons';
import type { AuthFileBatchCheckResult } from '@/types/authFile';
import styles from '@/pages/AuthFilesPage.module.scss';

interface ReenableTieredModalProps {
  open: boolean;
  results: AuthFileBatchCheckResult[];
  reenableNames: string[];
  onConfirm: (selectedNames: string[]) => Promise<void> | void;
  onClose: () => void;
  loading?: boolean;
}

type TierId = 'full' | 'substantial' | 'some';

interface Tier {
  id: TierId;
  labelKey: string;
  accounts: AuthFileBatchCheckResult[];
}

const classifyTier = (percent: number): TierId | null => {
  if (percent >= 98) return 'full';
  if (percent >= 50) return 'substantial';
  if (percent >= 10) return 'some';
  return null;
};

const buildTiers = (
  results: AuthFileBatchCheckResult[],
  reenableNames: string[]
): Tier[] => {
  const resultMap = new Map<string, AuthFileBatchCheckResult>();
  for (const r of results) {
    resultMap.set(r.name, r);
  }
  const buckets: Record<TierId, AuthFileBatchCheckResult[]> = {
    full: [],
    substantial: [],
    some: [],
  };
  for (const name of reenableNames) {
    const result = resultMap.get(name);
    if (!result || result.remaining_percent == null) continue;
    const tier = classifyTier(result.remaining_percent);
    if (tier) buckets[tier].push(result);
  }
  const sortAccounts = (arr: AuthFileBatchCheckResult[]) =>
    arr.sort((a, b) => {
      const ap = a.remaining_percent ?? 0;
      const bp = b.remaining_percent ?? 0;
      if (bp !== ap) return bp - ap;
      return a.name.localeCompare(b.name);
    });
  return [
    {
      id: 'full',
      labelKey: 'auth_files.batch_check_reenable_tier_full',
      accounts: sortAccounts(buckets.full),
    },
    {
      id: 'substantial',
      labelKey: 'auth_files.batch_check_reenable_tier_substantial',
      accounts: sortAccounts(buckets.substantial),
    },
    {
      id: 'some',
      labelKey: 'auth_files.batch_check_reenable_tier_some',
      accounts: sortAccounts(buckets.some),
    },
  ];
};

const computeInitialExpansion = (tiers: Tier[]): Set<TierId> => {
  const firstNonEmpty = tiers.find((tier) => tier.accounts.length > 0);
  return firstNonEmpty ? new Set([firstNonEmpty.id]) : new Set();
};

export function ReenableTieredModal({
  open,
  results,
  reenableNames,
  onConfirm,
  onClose,
  loading = false,
}: ReenableTieredModalProps) {
  const { t } = useTranslation();

  // The parent owns a session key that bumps on each open; passing it as React `key`
  // forces a fresh mount, which makes the useState initializers below run again with
  // clean state. This avoids the react-hooks/set-state-in-effect anti-pattern.
  const tiers = useMemo<Tier[]>(
    () => buildTiers(results, reenableNames),
    [results, reenableNames]
  );
  const [selectedNames, setSelectedNames] = useState<Set<string>>(() => new Set());
  const [expandedTiers, setExpandedTiers] = useState<Set<TierId>>(() =>
    computeInitialExpansion(buildTiers(results, reenableNames))
  );

  const totalCandidates = useMemo(
    () => tiers.reduce((sum, tier) => sum + tier.accounts.length, 0),
    [tiers]
  );

  const toggleTier = useCallback((id: TierId) => {
    setExpandedTiers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAccount = useCallback((name: string, checked: boolean) => {
    setSelectedNames((prev) => {
      const next = new Set(prev);
      if (checked) next.add(name);
      else next.delete(name);
      return next;
    });
  }, []);

  const tierSelectionState = useCallback(
    (tier: Tier): 'none' | 'partial' | 'all' => {
      if (tier.accounts.length === 0) return 'none';
      let selectedCount = 0;
      for (const account of tier.accounts) {
        if (selectedNames.has(account.name)) selectedCount++;
      }
      if (selectedCount === 0) return 'none';
      if (selectedCount === tier.accounts.length) return 'all';
      return 'partial';
    },
    [selectedNames]
  );

  const toggleTierSelectAll = useCallback(
    (tier: Tier) => {
      const state = tierSelectionState(tier);
      setSelectedNames((prev) => {
        const next = new Set(prev);
        if (state === 'all') {
          for (const account of tier.accounts) next.delete(account.name);
        } else {
          for (const account of tier.accounts) next.add(account.name);
        }
        return next;
      });
    },
    [tierSelectionState]
  );

  const handleConfirm = useCallback(async () => {
    if (selectedNames.size === 0 || loading) return;
    await onConfirm(Array.from(selectedNames));
  }, [loading, onConfirm, selectedNames]);

  const footer = (
    <>
      <Button variant="secondary" size="sm" onClick={onClose} disabled={loading}>
        {t('common.cancel')}
      </Button>
      <Button
        size="sm"
        onClick={handleConfirm}
        disabled={selectedNames.size === 0 || loading}
        loading={loading}
      >
        {t('auth_files.batch_check_reenable_confirm_count', { count: selectedNames.size })}
      </Button>
    </>
  );

  return (
    <Modal
      open={open}
      onClose={loading ? () => undefined : onClose}
      closeDisabled={loading}
      title={t('auth_files.batch_check_action_reenable_available')}
      width={620}
      footer={footer}
    >
      {totalCandidates === 0 ? (
        <div className={styles.reenableTieredEmpty}>
          {t('auth_files.batch_check_reenable_no_candidates')}
        </div>
      ) : (
        <div className={styles.reenableTieredList}>
          <p className={styles.reenableTieredHint}>
            {t('auth_files.batch_check_action_reenable_available_hint')}
          </p>
          {tiers.map((tier) => {
            const isExpanded = expandedTiers.has(tier.id);
            const selectionState = tierSelectionState(tier);
            const isEmpty = tier.accounts.length === 0;
            return (
              <div
                key={tier.id}
                className={`${styles.reenableTierCard}${isEmpty ? ` ${styles.reenableTierCardEmpty}` : ''}`}
              >
                <div className={styles.reenableTierHeader}>
                  <SelectionCheckbox
                    checked={selectionState === 'all'}
                    indeterminate={selectionState === 'partial'}
                    onChange={() => toggleTierSelectAll(tier)}
                    disabled={isEmpty || loading}
                    ariaLabel={t(
                      selectionState === 'all'
                        ? 'auth_files.batch_check_reenable_deselect_all'
                        : 'auth_files.batch_check_reenable_select_all'
                    )}
                  />
                  <button
                    type="button"
                    className={styles.reenableTierTitleButton}
                    onClick={() => !isEmpty && toggleTier(tier.id)}
                    disabled={isEmpty}
                    aria-expanded={isExpanded}
                  >
                    <span className={styles.reenableTierTitle}>{t(tier.labelKey)}</span>
                    <span className={styles.reenableTierCount}>
                      {t('auth_files.batch_check_reenable_tier_count', { count: tier.accounts.length })}
                      {selectionState === 'partial' || selectionState === 'all' ? (
                        <span className={styles.reenableTierSelected}>
                          {' · '}
                          {Array.from(selectedNames).filter((n) =>
                            tier.accounts.some((a) => a.name === n)
                          ).length}
                          {' / '}
                          {tier.accounts.length}
                        </span>
                      ) : null}
                    </span>
                    {!isEmpty ? (
                      <span className={styles.reenableTierChevron}>
                        {isExpanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
                      </span>
                    ) : null}
                  </button>
                </div>
                {isExpanded && !isEmpty ? (
                  <div className={styles.reenableTierBody}>
                    {tier.accounts.map((account) => {
                      const isChecked = selectedNames.has(account.name);
                      const handleRowToggle = () => {
                        if (loading) return;
                        toggleAccount(account.name, !isChecked);
                      };
                      const handleRowKeyDown = (
                        event: React.KeyboardEvent<HTMLDivElement>
                      ) => {
                        if (loading) return;
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          toggleAccount(account.name, !isChecked);
                        }
                      };
                      return (
                        <div
                          key={account.name}
                          className={styles.reenableAccountRow}
                          role="button"
                          tabIndex={loading ? -1 : 0}
                          aria-pressed={isChecked}
                          onClick={handleRowToggle}
                          onKeyDown={handleRowKeyDown}
                        >
                          <span
                            // 拦截 checkbox 区域的点击冒泡，避免行 onClick 与 checkbox 自身 onChange 双重 toggle
                            onClick={(event) => event.stopPropagation()}
                          >
                            <SelectionCheckbox
                              checked={isChecked}
                              onChange={(checked) => toggleAccount(account.name, checked)}
                              disabled={loading}
                              ariaLabel={account.name}
                            />
                          </span>
                          <span className={styles.reenableAccountName} title={account.name}>
                            {account.name}
                          </span>
                          <span className={styles.reenableAccountPercent}>
                            {t('auth_files.batch_check_reenable_remaining', {
                              percent: account.remaining_percent ?? 0,
                            })}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
