import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type {
  VisualConfigValidationErrors,
  VisualConfigValues,
  VisualScopedPoolProviderEntry,
} from '@/types/visualConfig';
import { makeClientId } from '@/types/visualConfig';
import { FieldAnchor, FieldGrid, FieldStack, ToggleRow } from '../fields/FieldPrimitives';
import { getValidationMessage } from './shared';
import styles from './Blocks.module.scss';

const createProviderEntry = (): VisualScopedPoolProviderEntry => ({
  id: makeClientId(),
  provider: '',
  enabled: true,
  limit: '',
  quotaThresholdPercent: '',
  consecutiveErrorThreshold: '',
  penaltyWindowSeconds: '',
  quotaSnapshotTTLSeconds: '',
  idleLogThrottleSeconds: '',
});

type ScopedPoolEditorProps = {
  values: VisualConfigValues;
  validationErrors?: VisualConfigValidationErrors;
  disabled: boolean;
  onChange: (patch: Partial<VisualConfigValues>) => void;
};

export const ScopedPoolEditor = memo(function ScopedPoolEditor({
  values,
  validationErrors,
  disabled,
  onChange,
}: ScopedPoolEditorProps) {
  const { t } = useTranslation();
  const defaultsLimitError = getValidationMessage(
    t,
    validationErrors?.routingScopedPoolDefaultsLimit
  );
  const defaultsQuotaThresholdError = getValidationMessage(
    t,
    validationErrors?.routingScopedPoolDefaultsQuotaThresholdPercent
  );
  const defaultsConsecutiveError = getValidationMessage(
    t,
    validationErrors?.routingScopedPoolDefaultsConsecutiveErrorThreshold
  );
  const defaultsPenaltyWindowError = getValidationMessage(
    t,
    validationErrors?.routingScopedPoolDefaultsPenaltyWindowSeconds
  );
  const defaultsQuotaSnapshotTTLError = getValidationMessage(
    t,
    validationErrors?.routingScopedPoolDefaultsQuotaSnapshotTTLSeconds
  );
  const defaultsIdleLogThrottleError = getValidationMessage(
    t,
    validationErrors?.routingScopedPoolDefaultsIdleLogThrottleSeconds
  );
  const providersError = getValidationMessage(t, validationErrors?.routingScopedPoolProviders);

  const updateProvider = (id: string, patch: Partial<VisualScopedPoolProviderEntry>) => {
    onChange({
      routingScopedPoolProviders: values.routingScopedPoolProviders.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry
      ),
    });
  };
  const addProvider = () => {
    onChange({
      routingScopedPoolProviders: [...values.routingScopedPoolProviders, createProviderEntry()],
    });
  };
  const removeProvider = (id: string) => {
    onChange({
      routingScopedPoolProviders: values.routingScopedPoolProviders.filter((entry) => entry.id !== id),
    });
  };

  return (
    <FieldStack>
      <FieldAnchor fieldId="routingScopedPoolEnabled">
        <ToggleRow
          title={t('config_management.visual.sections.network.scoped_pool_enabled')}
          description={t('config_management.visual.sections.network.scoped_pool_enabled_desc')}
          checked={values.routingScopedPoolEnabled}
          disabled={disabled}
          onChange={(routingScopedPoolEnabled) => onChange({ routingScopedPoolEnabled })}
        />
      </FieldAnchor>

      {values.routingScopedPoolEnabled ? (
        <>
          <FieldGrid>
            <FieldAnchor fieldId="routingScopedPoolDefaultsLimit">
              <Input
                label={t('config_management.visual.sections.network.scoped_pool_defaults_limit')}
                type="number"
                placeholder="5"
                value={values.routingScopedPoolDefaultsLimit}
                onChange={(event) =>
                  onChange({ routingScopedPoolDefaultsLimit: event.target.value })
                }
                disabled={disabled}
                error={defaultsLimitError}
              />
            </FieldAnchor>
            <FieldAnchor fieldId="routingScopedPoolDefaultsQuotaThresholdPercent">
              <Input
                label={t(
                  'config_management.visual.sections.network.scoped_pool_defaults_quota_threshold_percent'
                )}
                type="number"
                placeholder="0"
                value={values.routingScopedPoolDefaultsQuotaThresholdPercent}
                onChange={(event) =>
                  onChange({ routingScopedPoolDefaultsQuotaThresholdPercent: event.target.value })
                }
                disabled={disabled}
                hint={t(
                  'config_management.visual.sections.network.scoped_pool_defaults_quota_threshold_percent_hint'
                )}
                error={defaultsQuotaThresholdError}
              />
            </FieldAnchor>
            <FieldAnchor fieldId="routingScopedPoolDefaultsConsecutiveErrorThreshold">
              <Input
                label={t(
                  'config_management.visual.sections.network.scoped_pool_defaults_consecutive_error_threshold'
                )}
                type="number"
                placeholder="3"
                value={values.routingScopedPoolDefaultsConsecutiveErrorThreshold}
                onChange={(event) =>
                  onChange({ routingScopedPoolDefaultsConsecutiveErrorThreshold: event.target.value })
                }
                disabled={disabled}
                error={defaultsConsecutiveError}
              />
            </FieldAnchor>
            <FieldAnchor fieldId="routingScopedPoolDefaultsPenaltyWindowSeconds">
              <Input
                label={t(
                  'config_management.visual.sections.network.scoped_pool_defaults_penalty_window_seconds'
                )}
                type="number"
                placeholder="300"
                value={values.routingScopedPoolDefaultsPenaltyWindowSeconds}
                onChange={(event) =>
                  onChange({ routingScopedPoolDefaultsPenaltyWindowSeconds: event.target.value })
                }
                disabled={disabled}
                error={defaultsPenaltyWindowError}
              />
            </FieldAnchor>
            <FieldAnchor fieldId="routingScopedPoolDefaultsQuotaSnapshotTTLSeconds">
              <Input
                label={t(
                  'config_management.visual.sections.network.scoped_pool_defaults_quota_snapshot_ttl_seconds'
                )}
                type="number"
                placeholder="300"
                value={values.routingScopedPoolDefaultsQuotaSnapshotTTLSeconds}
                onChange={(event) =>
                  onChange({ routingScopedPoolDefaultsQuotaSnapshotTTLSeconds: event.target.value })
                }
                disabled={disabled}
                error={defaultsQuotaSnapshotTTLError}
              />
            </FieldAnchor>
            <FieldAnchor fieldId="routingScopedPoolDefaultsIdleLogThrottleSeconds">
              <Input
                label={t(
                  'config_management.visual.sections.network.scoped_pool_defaults_idle_log_throttle_seconds'
                )}
                type="number"
                placeholder="60"
                value={values.routingScopedPoolDefaultsIdleLogThrottleSeconds}
                onChange={(event) =>
                  onChange({ routingScopedPoolDefaultsIdleLogThrottleSeconds: event.target.value })
                }
                disabled={disabled}
                error={defaultsIdleLogThrottleError}
              />
            </FieldAnchor>
          </FieldGrid>

          <FieldAnchor fieldId="routingScopedPoolProviders">
            <div className={styles.blockStack}>
              <div className={styles.blockHeaderRow}>
                <div>
                  <div className={styles.blockLabel}>
                    {t('config_management.visual.sections.network.scoped_pool_providers_title')}
                  </div>
                  <div className="hint">
                    {t('config_management.visual.sections.network.scoped_pool_providers_desc')}
                  </div>
                </div>
                <Button type="button" variant="secondary" size="sm" onClick={addProvider} disabled={disabled}>
                  {t('config_management.visual.sections.network.scoped_pool_providers_add')}
                </Button>
              </div>

              {providersError ? <div className="error-box">{providersError}</div> : null}

              {values.routingScopedPoolProviders.length === 0 ? (
                <div className={styles.emptyState}>
                  {t('config_management.visual.sections.network.scoped_pool_providers_empty')}
                </div>
              ) : (
                values.routingScopedPoolProviders.map((entry, index) => (
                  <div key={entry.id} className={styles.ruleCard}>
                    <div className={styles.ruleCardHeader}>
                      <div className={styles.ruleCardTitle}>
                        {entry.provider.trim() ||
                          t('config_management.visual.sections.network.scoped_pool_provider_title', {
                            index: index + 1,
                          })}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeProvider(entry.id)}
                        disabled={disabled}
                      >
                        {t('config_management.visual.sections.network.scoped_pool_provider_remove')}
                      </Button>
                    </div>

                    <ToggleRow
                      title={t('config_management.visual.sections.network.scoped_pool_provider_enabled')}
                      description={t(
                        'config_management.visual.sections.network.scoped_pool_provider_enabled_desc'
                      )}
                      checked={entry.enabled}
                      disabled={disabled}
                      onChange={(enabled) => updateProvider(entry.id, { enabled })}
                    />

                    <FieldGrid>
                      <Input
                        label={t('config_management.visual.sections.network.scoped_pool_provider_name')}
                        hint={t('config_management.visual.sections.network.scoped_pool_provider_name_hint')}
                        placeholder={t(
                          'config_management.visual.sections.network.scoped_pool_provider_name_placeholder'
                        )}
                        value={entry.provider}
                        onChange={(event) => updateProvider(entry.id, { provider: event.target.value })}
                        disabled={disabled}
                      />
                      <Input
                        label={t('config_management.visual.sections.network.scoped_pool_defaults_limit')}
                        type="number"
                        placeholder="5"
                        value={entry.limit}
                        onChange={(event) => updateProvider(entry.id, { limit: event.target.value })}
                        disabled={disabled}
                      />
                      <Input
                        label={t(
                          'config_management.visual.sections.network.scoped_pool_defaults_quota_threshold_percent'
                        )}
                        type="number"
                        placeholder="0"
                        value={entry.quotaThresholdPercent}
                        onChange={(event) =>
                          updateProvider(entry.id, { quotaThresholdPercent: event.target.value })
                        }
                        disabled={disabled}
                      />
                      <Input
                        label={t(
                          'config_management.visual.sections.network.scoped_pool_defaults_consecutive_error_threshold'
                        )}
                        type="number"
                        placeholder="3"
                        value={entry.consecutiveErrorThreshold}
                        onChange={(event) =>
                          updateProvider(entry.id, { consecutiveErrorThreshold: event.target.value })
                        }
                        disabled={disabled}
                      />
                      <Input
                        label={t(
                          'config_management.visual.sections.network.scoped_pool_defaults_penalty_window_seconds'
                        )}
                        type="number"
                        placeholder="300"
                        value={entry.penaltyWindowSeconds}
                        onChange={(event) =>
                          updateProvider(entry.id, { penaltyWindowSeconds: event.target.value })
                        }
                        disabled={disabled}
                      />
                      <Input
                        label={t(
                          'config_management.visual.sections.network.scoped_pool_defaults_quota_snapshot_ttl_seconds'
                        )}
                        type="number"
                        placeholder="300"
                        value={entry.quotaSnapshotTTLSeconds}
                        onChange={(event) =>
                          updateProvider(entry.id, { quotaSnapshotTTLSeconds: event.target.value })
                        }
                        disabled={disabled}
                      />
                      <Input
                        label={t(
                          'config_management.visual.sections.network.scoped_pool_defaults_idle_log_throttle_seconds'
                        )}
                        type="number"
                        placeholder="60"
                        value={entry.idleLogThrottleSeconds}
                        onChange={(event) =>
                          updateProvider(entry.id, { idleLogThrottleSeconds: event.target.value })
                        }
                        disabled={disabled}
                      />
                    </FieldGrid>
                  </div>
                ))
              )}
            </div>
          </FieldAnchor>
        </>
      ) : null}
    </FieldStack>
  );
});
