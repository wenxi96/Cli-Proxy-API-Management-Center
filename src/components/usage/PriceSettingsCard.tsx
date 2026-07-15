import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import type {
  ModelPriceOverrides,
  PriceKey,
  PriceOption,
  PriceSource,
} from '@/utils/usage';
import {
  buildPriceOverride,
  EMPTY_PRICE_FORM,
  priceOptionToFormState,
  type PriceFormState,
} from '@/utils/usage/priceForm';
import styles from '@/pages/UsagePage.module.scss';

export interface PriceSettingsCardProps {
  priceOptions: PriceOption[];
  modelPrices: ModelPriceOverrides;
  onPricesChange: (prices: ModelPriceOverrides) => void;
}

const getSourceLabelKey = (source: PriceSource) => {
  if (source === 'official_default') return 'usage_stats.price_source_official';
  if (source === 'user_override') return 'usage_stats.price_source_override';
  if (source === 'legacy_fallback') return 'usage_stats.price_source_legacy';
  return 'usage_stats.price_source_unconfigured';
};

const formatUsdPer1M = (value: number | undefined): string =>
  typeof value === 'number' && Number.isFinite(value) ? `$${value.toFixed(4)}/1M` : '--';

export function PriceSettingsCard({
  priceOptions,
  modelPrices,
  onPricesChange,
}: PriceSettingsCardProps) {
  const { t } = useTranslation();
  const [selectedKey, setSelectedKey] = useState<PriceKey | ''>('');
  const [form, setForm] = useState<PriceFormState>(EMPTY_PRICE_FORM);
  const [editKey, setEditKey] = useState<PriceKey | null>(null);
  const [editForm, setEditForm] = useState<PriceFormState>(EMPTY_PRICE_FORM);

  const optionByKey = useMemo(
    () => new Map(priceOptions.map((option) => [option.key, option])),
    [priceOptions]
  );

  const options = useMemo(
    () => [
      { value: '', label: t('usage_stats.model_price_select_placeholder') },
      ...priceOptions.map((option) => ({ value: option.key, label: option.label })),
    ],
    [priceOptions, t]
  );

  const handleModelSelect = (value: string) => {
    const key = value as PriceKey | '';
    setSelectedKey(key);
    setForm(priceOptionToFormState(key ? optionByKey.get(key) : undefined));
  };

  const handleSavePrice = () => {
    if (!selectedKey) return;
    const override = buildPriceOverride(form);
    if (!override) return;
    onPricesChange({ ...modelPrices, [selectedKey]: override });
    setSelectedKey('');
    setForm(EMPTY_PRICE_FORM);
  };

  const handleDeleteOverride = (key: PriceKey) => {
    const next = { ...modelPrices };
    delete next[key];
    onPricesChange(next);
  };

  const handleOpenEdit = (key: PriceKey) => {
    setEditKey(key);
    setEditForm(priceOptionToFormState(optionByKey.get(key)));
  };

  const handleSaveEdit = () => {
    if (!editKey) return;
    const override = buildPriceOverride(editForm);
    if (!override) return;
    onPricesChange({ ...modelPrices, [editKey]: override });
    setEditKey(null);
  };

  const renderPriceFields = (
    state: PriceFormState,
    onChange: (next: PriceFormState) => void
  ) => (
    <>
      <div className={styles.formField}>
        <label>{t('usage_stats.model_price_input')} ($/1M)</label>
        <Input
          type="number"
          value={state.input}
          onChange={(e) => onChange({ ...state, input: e.target.value })}
          placeholder="0.00"
          step="0.0001"
        />
      </div>
      <div className={styles.formField}>
        <label>{t('usage_stats.model_price_output')} ($/1M)</label>
        <Input
          type="number"
          value={state.output}
          onChange={(e) => onChange({ ...state, output: e.target.value })}
          placeholder="0.00"
          step="0.0001"
        />
      </div>
      <div className={styles.formField}>
        <label>{t('usage_stats.model_price_cache_read')} ($/1M)</label>
        <Input
          type="number"
          value={state.cacheRead}
          onChange={(e) => onChange({ ...state, cacheRead: e.target.value })}
          placeholder="0.00"
          step="0.0001"
        />
      </div>
      <div className={styles.formField}>
        <label>{t('usage_stats.model_price_cache_creation')} ($/1M)</label>
        <Input
          type="number"
          value={state.cacheCreation}
          onChange={(e) => onChange({ ...state, cacheCreation: e.target.value })}
          placeholder="0.00"
          step="0.0001"
        />
      </div>
    </>
  );

  return (
    <Card title={t('usage_stats.model_price_settings')}>
      <div className={styles.pricingSection}>
        <div className={styles.priceForm}>
          <div className={styles.formRow}>
            <div className={styles.formField}>
              <label>{t('usage_stats.model_name')}</label>
              <Select
                value={selectedKey}
                options={options}
                onChange={handleModelSelect}
                placeholder={t('usage_stats.model_price_select_placeholder')}
              />
            </div>
            {renderPriceFields(form, setForm)}
            <Button variant="primary" onClick={handleSavePrice} disabled={!selectedKey}>
              {t('common.save')}
            </Button>
          </div>
        </div>

        <div className={styles.pricesList}>
          <h4 className={styles.pricesTitle}>{t('usage_stats.saved_prices')}</h4>
          {priceOptions.length > 0 ? (
            <div className={styles.pricesGrid}>
              {priceOptions.map((option) => (
                <div key={option.key} className={styles.priceItem}>
                  <div className={styles.priceInfo}>
                    <span className={styles.priceModel}>{option.label}</span>
                    <div className={styles.priceMeta}>
                      <span className={styles.priceSourceBadge}>
                        {t(getSourceLabelKey(option.source))}
                      </span>
                      <span>
                        {t('usage_stats.model_price_input')}:{' '}
                        {formatUsdPer1M(option.price?.inputUsdPer1M)}
                      </span>
                      <span>
                        {t('usage_stats.model_price_output')}:{' '}
                        {formatUsdPer1M(option.price?.outputUsdPer1M)}
                      </span>
                      <span>
                        {t('usage_stats.model_price_cache_read')}:{' '}
                        {formatUsdPer1M(option.price?.cacheReadUsdPer1M)}
                      </span>
                      <span>
                        {t('usage_stats.model_price_cache_creation')}:{' '}
                        {formatUsdPer1M(option.price?.cacheCreationUsdPer1M)}
                      </span>
                    </div>
                  </div>
                  <div className={styles.priceActions}>
                    <Button variant="secondary" size="sm" onClick={() => handleOpenEdit(option.key)}>
                      {option.hasUserOverride ? t('common.edit') : t('usage_stats.add_override')}
                    </Button>
                    {option.hasUserOverride && option.hasOfficialDefault && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleDeleteOverride(option.key)}
                      >
                        {t('usage_stats.restore_default')}
                      </Button>
                    )}
                    {option.hasUserOverride && !option.hasOfficialDefault && (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDeleteOverride(option.key)}
                      >
                        {t('usage_stats.delete_override')}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.hint}>{t('usage_stats.model_price_empty')}</div>
          )}
        </div>
      </div>

      <Modal
        open={editKey !== null}
        title={editKey ?? ''}
        onClose={() => setEditKey(null)}
        footer={
          <div className={styles.priceActions}>
            <Button variant="secondary" onClick={() => setEditKey(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={handleSaveEdit}>
              {t('common.save')}
            </Button>
          </div>
        }
        width={460}
      >
        <div className={styles.editModalBody}>{renderPriceFields(editForm, setEditForm)}</div>
      </Modal>
    </Card>
  );
}
