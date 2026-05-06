/**
 * 批量检查状态跨页面持久化 store
 *
 * 把批量检查的结果数据从 useAuthFilesBatchCheck hook 提升到全局 store，
 * 使用户切换到其他功能页面再回到认证文件页时，仍能看到上一次的检查结果。
 *
 * 数据仅在 SPA 会话内保留（不持久化到 localStorage）：
 * - 切换页面：保留 ✓
 * - 刷新浏览器：清空（避免显示过期数据）
 */

import { create } from 'zustand';
import type {
  AuthFileBatchCheckJobResponse,
  AuthFilesBatchCheckResponse,
} from '@/types';

interface BatchCheckState {
  checking: boolean;
  activeJobId: string | null;
  batchCheckJob: AuthFileBatchCheckJobResponse | null;
  batchCheckResponse: AuthFilesBatchCheckResponse | null;
  lastRequestedNames: string[];
  setChecking: (value: boolean) => void;
  setActiveJobId: (value: string | null) => void;
  setBatchCheckJob: (value: AuthFileBatchCheckJobResponse | null) => void;
  setBatchCheckResponse: (value: AuthFilesBatchCheckResponse | null) => void;
  setLastRequestedNames: (value: string[]) => void;
  clear: () => void;
}

const initialState = {
  checking: false,
  activeJobId: null as string | null,
  batchCheckJob: null as AuthFileBatchCheckJobResponse | null,
  batchCheckResponse: null as AuthFilesBatchCheckResponse | null,
  lastRequestedNames: [] as string[],
};

export const useBatchCheckStore = create<BatchCheckState>((set) => ({
  ...initialState,
  setChecking: (value) => set({ checking: value }),
  setActiveJobId: (value) => set({ activeJobId: value }),
  setBatchCheckJob: (value) => set({ batchCheckJob: value }),
  setBatchCheckResponse: (value) => set({ batchCheckResponse: value }),
  setLastRequestedNames: (value) => set({ lastRequestedNames: value }),
  clear: () => set({ ...initialState }),
}));
