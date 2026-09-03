/**
 * 认证文件列表纯逻辑：通配搜索、字段匹配、排序。
 * React-free —— 由 tests/authFilesListLogic.test.ts 直接消费。
 */

import type { AuthFileItem } from '@/types';
import { isRuntimeOnlyAuthFile, normalizeProviderKey } from './constants';
import { deriveAuthFileIdentity } from './identity';
import type { AuthFilesSortMode } from './uiState';

export type AuthFileDownloadPlan =
  | { kind: 'single'; name: string }
  | { kind: 'archive'; names: string[] };

export type AuthFileDownloadActions = {
  downloadSingle: (name: string) => Promise<void>;
  downloadArchive: (names: string[]) => Promise<void>;
};

export const createAuthFileDownloadPlan = (
  names: Iterable<string>
): AuthFileDownloadPlan | null => {
  const seen = new Set<string>();
  const uniqueNames: string[] = [];

  for (const rawName of names) {
    const name = String(rawName ?? '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    uniqueNames.push(name);
  }

  if (uniqueNames.length === 0) return null;
  if (uniqueNames.length === 1) return { kind: 'single', name: uniqueNames[0] };
  return { kind: 'archive', names: uniqueNames };
};

export const executeAuthFileDownloadPlan = async (
  names: Iterable<string>,
  actions: AuthFileDownloadActions
): Promise<AuthFileDownloadPlan | null> => {
  const plan = createAuthFileDownloadPlan(names);
  if (!plan) return null;

  if (plan.kind === 'single') {
    await actions.downloadSingle(plan.name);
  } else {
    await actions.downloadArchive(plan.names);
  }

  return plan;
};

export const mergeVisibleAuthFileSelection = (
  selectedNames: Iterable<string>,
  visibleFiles: AuthFileItem[]
): Set<string> => {
  const next = new Set(selectedNames);
  visibleFiles.forEach((file) => {
    if (!isRuntimeOnlyAuthFile(file)) next.add(file.name);
  });
  return next;
};

export type AuthFilePoolStatus = {
  enabled: boolean;
  state: string;
  reason: string;
  remainingPercent: number | undefined;
  visible: boolean;
};

export const getAuthFilePoolStatus = (file: AuthFileItem): AuthFilePoolStatus => {
  const enabled = file.poolEnabled === true || file['pool_enabled'] === true;
  const state = String(file.poolState ?? file['pool_state'] ?? '').trim();
  const reason = String(file.poolReason ?? file['pool_reason'] ?? '').trim();
  const remainingPercent =
    typeof file.poolRemainingPercent === 'number'
      ? file.poolRemainingPercent
      : typeof file['pool_remaining_percent'] === 'number'
        ? (file['pool_remaining_percent'] as number)
        : undefined;

  return {
    enabled,
    state,
    reason,
    remainingPercent,
    visible: Boolean(enabled || state || reason || remainingPercent !== undefined),
  };
};

const escapeWildcardSearchSegment = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 不含 '*' 时返回 null（走 includes 路径）。刻意不加 ^/$ 锚点——保持子串语义。 */
export const buildWildcardSearch = (value: string): RegExp | null => {
  if (!value.includes('*')) return null;
  const pattern = value.split('*').map(escapeWildcardSearchSegment).join('.*');
  return new RegExp(pattern, 'i');
};

/**
 * 搜索 haystack：文件名 + 类型 + 提供方 + 账号邮箱 + 项目 ID。
 * 显式不含 account —— api-key 凭证的 account 就是 API key 本身，见 identity.ts。
 */
export const matchesAuthFileSearch = (
  file: AuthFileItem,
  term: string,
  wildcard: RegExp | null
): boolean => {
  if (!term) return true;
  const needle = term.toLowerCase();
  return [file.name, file.type, file.provider, file.email, file.projectId].some((value) => {
    const content = (value || '').toString();
    return wildcard ? wildcard.test(content) : content.toLowerCase().includes(needle);
  });
};

/** 返回新数组，不改动入参。未知 mode 原序返回拷贝。 */
export const sortAuthFiles = (files: AuthFileItem[], mode: AuthFilesSortMode): AuthFileItem[] => {
  const copy = [...files];
  if (mode === 'default') {
    copy.sort((a, b) => {
      const providerA = normalizeProviderKey(String(a.provider ?? a.type ?? 'unknown'));
      const providerB = normalizeProviderKey(String(b.provider ?? b.type ?? 'unknown'));
      const providerCompare = providerA.localeCompare(providerB);
      if (providerCompare !== 0) return providerCompare;
      return a.name.localeCompare(b.name);
    });
  } else if (mode === 'az') {
    // 按卡片主行排（有账号时即 email），所见即所排；同值用文件名决胜。
    // 装饰一次，避免在比较器里重复派生。
    const keys = new Map(copy.map((file) => [file, deriveAuthFileIdentity(file).primary]));
    copy.sort(
      (a, b) => (keys.get(a) ?? '').localeCompare(keys.get(b) ?? '') || a.name.localeCompare(b.name)
    );
  } else if (mode === 'priority') {
    copy.sort((a, b) => {
      const pa = typeof a.priority === 'number' ? a.priority : 0;
      const pb = typeof b.priority === 'number' ? b.priority : 0;
      return pb - pa; // 高优先级排前面
    });
  }
  return copy;
};
