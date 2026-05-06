import { useEffect, useRef, type ChangeEvent, type ReactNode } from 'react';
import { IconCheck } from './icons';
import styles from './SelectionCheckbox.module.scss';

interface SelectionCheckboxProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: ReactNode;
  ariaLabel?: string;
  title?: string;
  disabled?: boolean;
  className?: string;
  labelClassName?: string;
  /**
   * 启用后，复选框显示半选状态（视觉横杠 + aria-checked="mixed"）。
   * 仅在 checked=false 时生效；checked=true 时仍按完全选中渲染。
   */
  indeterminate?: boolean;
}

export function SelectionCheckbox({
  checked,
  onChange,
  label,
  ariaLabel,
  title,
  disabled = false,
  className,
  labelClassName,
  indeterminate = false,
}: SelectionCheckboxProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const showIndeterminate = !checked && indeterminate;

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = showIndeterminate;
    }
  }, [showIndeterminate]);

  const rootClassName = [styles.root, disabled ? styles.disabled : '', className]
    .filter(Boolean)
    .join(' ');
  const boxClassName = [
    styles.box,
    checked ? styles.boxChecked : '',
    showIndeterminate ? styles.boxIndeterminate : '',
  ]
    .filter(Boolean)
    .join(' ');
  const textClassName = [styles.label, labelClassName].filter(Boolean).join(' ');

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.checked);
  };

  return (
    <label className={rootClassName} title={title}>
      <input
        ref={inputRef}
        className={styles.input}
        type="checkbox"
        checked={checked}
        onChange={handleChange}
        aria-label={ariaLabel}
        aria-checked={showIndeterminate ? 'mixed' : checked}
        disabled={disabled}
      />
      <span className={boxClassName}>{checked ? <IconCheck size={12} /> : null}</span>
      {label ? <div className={textClassName}>{label}</div> : null}
    </label>
  );
}
