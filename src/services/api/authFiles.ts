/**
 * 认证文件与 OAuth 排除模型相关 API
 */

import { apiClient } from './client';
import type {
  AuthFileBatchCheckJobCreateResponse,
  AuthFileBatchCheckJobResponse,
  AuthFilesBatchCheckResponse,
  AuthFilesResponse,
} from '@/types/authFile';
import type { OAuthModelAliasEntry } from '@/types';

type StatusError = { status?: number };
type AuthFileStatusResponse = { status: string; disabled: boolean };
type AuthFileEntry = AuthFilesResponse['files'][number];
type AuthFileBatchFailure = { name: string; error: string };
type AuthFileBatchUploadResponse = {
  status?: string;
  uploaded?: number;
  files?: unknown;
  failed?: unknown;
};
type AuthFileBatchDeleteResponse = {
  status?: string;
  deleted?: number;
  files?: unknown;
  failed?: unknown;
};
type AuthFileBatchUploadResult = {
  status: string;
  uploaded: number;
  files: string[];
  failed: AuthFileBatchFailure[];
};
type AuthFileBatchDeleteResult = {
  status: string;
  deleted: number;
  files: string[];
  failed: AuthFileBatchFailure[];
};
type BatchCheckArrayPayload<T> = T[] | null | undefined;

export const AUTH_FILE_INVALID_JSON_OBJECT_ERROR = 'AUTH_FILE_INVALID_JSON_OBJECT';

const getStatusCode = (err: unknown): number | undefined => {
  if (!err || typeof err !== 'object') return undefined;
  if ('status' in err) return (err as StatusError).status;
  return undefined;
};

const normalizeRequestedAuthFileNames = (names: string[]): string[] => {
  const seen = new Set<string>();
  const normalized: string[] = [];

  names.forEach((name) => {
    const trimmed = String(name ?? '').trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    normalized.push(trimmed);
  });

  return normalized;
};

const normalizeBatchFileNames = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return normalizeRequestedAuthFileNames(value.map((item) => String(item ?? '')));
};

const normalizeBatchFailures = (value: unknown): AuthFileBatchFailure[] => {
  if (!Array.isArray(value)) return [];

  return value.reduce<AuthFileBatchFailure[]>((result, item) => {
    if (!item || typeof item !== 'object') return result;
    const entry = item as Record<string, unknown>;
    const name = String(entry.name ?? '').trim();
    const error =
      typeof entry.error === 'string'
        ? entry.error.trim()
        : typeof entry.message === 'string'
          ? entry.message.trim()
          : '';

    if (!name && !error) return result;
    result.push({ name, error: error || 'Unknown error' });
    return result;
  }, []);
};

const deriveSuccessfulFileNames = (
  requestedNames: string[],
  failed: AuthFileBatchFailure[]
): string[] => {
  const failedNames = new Set(failed.map((entry) => entry.name.trim()).filter(Boolean));

  if (failedNames.size === 0) {
    return [...requestedNames];
  }

  return requestedNames.filter((name) => !failedNames.has(name));
};

const normalizeBatchUploadResponse = (
  payload: AuthFileBatchUploadResponse | undefined,
  requestedNames: string[]
): AuthFileBatchUploadResult => {
  const failed = normalizeBatchFailures(payload?.failed);
  const uploadedFilesFromPayload = normalizeBatchFileNames(payload?.files);
  const uploaded =
    typeof payload?.uploaded === 'number'
      ? payload.uploaded
      : uploadedFilesFromPayload.length > 0
        ? uploadedFilesFromPayload.length
        : requestedNames.length === 1 && failed.length === 0
          ? 1
          : 0;

  let uploadedFiles = uploadedFilesFromPayload;
  if (uploadedFiles.length === 0 && uploaded > 0) {
    if (failed.length === 0 && uploaded === requestedNames.length) {
      uploadedFiles = [...requestedNames];
    } else {
      const derivedNames = deriveSuccessfulFileNames(requestedNames, failed);
      if (derivedNames.length === uploaded) {
        uploadedFiles = derivedNames;
      }
    }
  }

  return {
    status:
      typeof payload?.status === 'string' ? payload.status : failed.length > 0 ? 'partial' : 'ok',
    uploaded,
    files: uploadedFiles,
    failed,
  };
};

const normalizeBatchDeleteResponse = (
  payload: AuthFileBatchDeleteResponse | undefined,
  requestedNames: string[]
): AuthFileBatchDeleteResult => {
  const failed = normalizeBatchFailures(payload?.failed);
  const deletedFilesFromPayload = normalizeBatchFileNames(payload?.files);
  const deleted =
    typeof payload?.deleted === 'number'
      ? payload.deleted
      : deletedFilesFromPayload.length > 0
        ? deletedFilesFromPayload.length
        : requestedNames.length === 1 && failed.length === 0
          ? 1
          : 0;

  let deletedFiles = deletedFilesFromPayload;
  if (deletedFiles.length === 0 && deleted > 0) {
    if (failed.length === 0 && deleted === requestedNames.length) {
      deletedFiles = [...requestedNames];
    } else {
      const derivedNames = deriveSuccessfulFileNames(requestedNames, failed);
      if (derivedNames.length === deleted) {
        deletedFiles = derivedNames;
      }
    }
  }

  return {
    status:
      typeof payload?.status === 'string' ? payload.status : failed.length > 0 ? 'partial' : 'ok',
    deleted,
    files: deletedFiles,
    failed,
  };
};

const normalizeBatchCheckResults = (
  value: BatchCheckArrayPayload<AuthFilesBatchCheckResponse['results'][number]>
): AuthFilesBatchCheckResponse['results'] => (Array.isArray(value) ? value : []);

const normalizeBatchCheckSkipped = (
  value: BatchCheckArrayPayload<AuthFilesBatchCheckResponse['skipped'][number]>
): AuthFilesBatchCheckResponse['skipped'] => (Array.isArray(value) ? value : []);

const BATCH_CHECK_HEALTH_BUCKET_KEYS = [
  'full',
  'very_high',
  'high',
  'usable',
  'fair',
  'alert',
  'danger',
  'exhausted',
  'unknown',
] as const;

const BATCH_CHECK_REFRESH_WINDOW_KEYS = [
  '已到刷新时间',
  '1小时内',
  '1-3小时',
  '3-6小时',
  '6-12小时',
  '12-24小时',
  '1-3天',
  '3-7天',
  '下周及以后',
  '未知',
] as const;

const normalizeNumberRecord = (
  value: unknown,
  defaults: readonly string[] = []
): Record<string, number> => {
  const result: Record<string, number> = {};
  defaults.forEach((key) => {
    result[key] = 0;
  });

  if (!value || typeof value !== 'object') {
    return result;
  }

  Object.entries(value as Record<string, unknown>).forEach(([key, raw]) => {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return;
    result[key] = raw;
  });

  return result;
};

const normalizeBatchCheckAggregate = (
  value: AuthFilesBatchCheckResponse['aggregate'] | null | undefined
): AuthFilesBatchCheckResponse['aggregate'] => ({
  capacity_overview: {
    remaining_total: value?.capacity_overview?.remaining_total ?? 0,
    total_capacity: value?.capacity_overview?.total_capacity ?? 0,
    remaining_percent: value?.capacity_overview?.remaining_percent ?? 0,
    used_total: value?.capacity_overview?.used_total ?? 0,
    used_percent: value?.capacity_overview?.used_percent ?? 0,
    equivalent_full_accounts: value?.capacity_overview?.equivalent_full_accounts ?? 0,
    average_remaining: value?.capacity_overview?.average_remaining,
    median_remaining: value?.capacity_overview?.median_remaining,
    unknown_remaining_count: value?.capacity_overview?.unknown_remaining_count ?? 0,
  },
  risk_overview: {
    invalidated_401_count: value?.risk_overview?.invalidated_401_count ?? 0,
    no_quota_count: value?.risk_overview?.no_quota_count ?? 0,
    api_error_count: value?.risk_overview?.api_error_count ?? 0,
    request_failed_count: value?.risk_overview?.request_failed_count ?? 0,
    exhausted_count: value?.risk_overview?.exhausted_count ?? 0,
    low_remaining_1_29_count: value?.risk_overview?.low_remaining_1_29_count ?? 0,
    mid_low_remaining_1_49_count: value?.risk_overview?.mid_low_remaining_1_49_count ?? 0,
  },
  health_buckets: normalizeNumberRecord(value?.health_buckets, BATCH_CHECK_HEALTH_BUCKET_KEYS),
  scope_overview: {
    total_count: value?.scope_overview?.total_count ?? 0,
    enabled_count: value?.scope_overview?.enabled_count ?? 0,
    disabled_count: value?.scope_overview?.disabled_count ?? 0,
    processed_count: value?.scope_overview?.processed_count ?? 0,
    skipped_count: value?.scope_overview?.skipped_count ?? 0,
  },
  refresh_overview: {
    next_refresh_at: value?.refresh_overview?.next_refresh_at,
    highlight_windows: Array.isArray(value?.refresh_overview?.highlight_windows)
      ? value?.refresh_overview?.highlight_windows.filter((item) => item && typeof item.label === 'string')
      : [],
    refresh_window_counts: normalizeNumberRecord(
      value?.refresh_overview?.refresh_window_counts,
      BATCH_CHECK_REFRESH_WINDOW_KEYS
    ),
  },
  plan_distribution: {
    plan_type_counts: normalizeNumberRecord(value?.plan_distribution?.plan_type_counts),
    primary_cycle_counts: normalizeNumberRecord(value?.plan_distribution?.primary_cycle_counts),
    secondary_cycle_counts: normalizeNumberRecord(value?.plan_distribution?.secondary_cycle_counts),
  },
  diagnosis: Array.isArray(value?.diagnosis)
    ? value.diagnosis.map((item) => ({
        label: typeof item?.label === 'string' ? item.label : '',
        count: typeof item?.count === 'number' && Number.isFinite(item.count) ? item.count : 0,
        note: typeof item?.note === 'string' ? item.note : '',
        examples: Array.isArray(item?.examples)
          ? item.examples
              .map((entry) => String(entry ?? '').trim())
              .filter(Boolean)
          : [],
      }))
    : [],
  action_candidates: {
    invalidated_401_names: normalizeBatchFileNames(value?.action_candidates?.invalidated_401_names),
    disable_exhausted_names: normalizeBatchFileNames(value?.action_candidates?.disable_exhausted_names),
    reenable_names: normalizeBatchFileNames(value?.action_candidates?.reenable_names),
    reenable_threshold_bucket:
      typeof value?.action_candidates?.reenable_threshold_bucket === 'string'
        ? value.action_candidates.reenable_threshold_bucket
        : 'danger',
  },
});

const normalizeBatchCheckResponse = (
  payload: AuthFilesBatchCheckResponse
): AuthFilesBatchCheckResponse => ({
  ...payload,
  aggregate: normalizeBatchCheckAggregate(payload?.aggregate),
  results: normalizeBatchCheckResults(payload?.results),
  skipped: normalizeBatchCheckSkipped(payload?.skipped),
});

const normalizeBatchCheckJobResponse = (
  payload: AuthFileBatchCheckJobResponse
): AuthFileBatchCheckJobResponse => ({
  ...payload,
  aggregate: normalizeBatchCheckAggregate(payload?.aggregate),
  results: normalizeBatchCheckResults(payload?.results),
  skipped: normalizeBatchCheckSkipped(payload?.skipped),
});

const readTextField = (entry: AuthFileEntry, key: string): string => {
  const value = entry[key];
  return typeof value === 'string' ? value.trim() : '';
};

const readDateField = (entry: AuthFileEntry): number => {
  const candidates = [entry['modtime'], entry.modified, entry['updated_at'], entry['last_refresh']];

  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value < 1e12 ? value * 1000 : value;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) continue;
      const asNumber = Number(trimmed);
      if (Number.isFinite(asNumber)) {
        return asNumber < 1e12 ? asNumber * 1000 : asNumber;
      }
      const parsed = Date.parse(trimmed);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }

  return 0;
};

const isRuntimeOnlyEntry = (entry: AuthFileEntry): boolean => {
  const value = entry['runtime_only'] ?? entry.runtimeOnly;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
  return false;
};

const hasMeaningfulValue = (value: unknown): boolean => {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
};

const countMeaningfulFields = (entry: AuthFileEntry): number =>
  Object.values(entry).reduce<number>(
    (count, value) => count + (hasMeaningfulValue(value) ? 1 : 0),
    0
  );

const authFilePriorityScore = (entry: AuthFileEntry): number => {
  let score = 0;
  if (readTextField(entry, 'source').toLowerCase() === 'file') score += 32;
  if (readTextField(entry, 'path')) score += 16;
  if (!isRuntimeOnlyEntry(entry)) score += 8;
  if (entry.disabled !== true) score += 4;
  if (readDateField(entry) > 0) score += 2;
  return score;
};

const compareAuthFileEntries = (left: AuthFileEntry, right: AuthFileEntry): number => {
  const scoreDiff = authFilePriorityScore(right) - authFilePriorityScore(left);
  if (scoreDiff !== 0) return scoreDiff;

  const dateDiff = readDateField(right) - readDateField(left);
  if (dateDiff !== 0) return dateDiff;

  const fieldDiff = countMeaningfulFields(right) - countMeaningfulFields(left);
  if (fieldDiff !== 0) return fieldDiff;

  return 0;
};

const mergeAuthFileEntries = (entries: AuthFileEntry[]): AuthFileEntry => {
  const [primary, ...rest] = [...entries].sort(compareAuthFileEntries);
  const merged: AuthFileEntry = { ...primary };

  rest.forEach((entry) => {
    Object.entries(entry).forEach(([key, value]) => {
      if (!hasMeaningfulValue(merged[key]) && hasMeaningfulValue(value)) {
        merged[key] = value;
      }
    });
  });

  return merged;
};

const dedupeAuthFilesResponse = (payload: AuthFilesResponse): AuthFilesResponse => {
  const files = Array.isArray(payload?.files) ? payload.files : [];
  const grouped = new Map<string, AuthFileEntry[]>();

  files.forEach((entry) => {
    const name = readTextField(entry, 'name');
    const key = name || JSON.stringify(entry);
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.push(entry);
      return;
    }
    grouped.set(key, [entry]);
  });

  const normalizedFiles = Array.from(grouped.values()).map(mergeAuthFileEntries);
  normalizedFiles.sort((left, right) =>
    readTextField(left, 'name').localeCompare(readTextField(right, 'name'), undefined, {
      sensitivity: 'accent',
    })
  );

  return {
    ...payload,
    files: normalizedFiles,
    total: normalizedFiles.length,
  };
};

const parseAuthFileJsonObject = (rawText: string): Record<string, unknown> => {
  const trimmed = rawText.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error(AUTH_FILE_INVALID_JSON_OBJECT_ERROR);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(AUTH_FILE_INVALID_JSON_OBJECT_ERROR);
  }

  return { ...(parsed as Record<string, unknown>) };
};

const saveAuthFileText = async (name: string, text: string) => {
  const file = new File([text], name, { type: 'application/json' });
  await authFilesApi.upload(file);
};

export const isAuthFileInvalidJsonObjectError = (err: unknown): boolean =>
  err instanceof Error && err.message === AUTH_FILE_INVALID_JSON_OBJECT_ERROR;

const normalizeOauthExcludedModels = (payload: unknown): Record<string, string[]> => {
  if (!payload || typeof payload !== 'object') return {};

  const record = payload as Record<string, unknown>;
  const source = record['oauth-excluded-models'] ?? record.items ?? payload;
  if (!source || typeof source !== 'object') return {};

  const result: Record<string, string[]> = {};

  Object.entries(source as Record<string, unknown>).forEach(([provider, models]) => {
    const key = String(provider ?? '')
      .trim()
      .toLowerCase();
    if (!key) return;

    const rawList = Array.isArray(models)
      ? models
      : typeof models === 'string'
        ? models.split(/[\n,]+/)
        : [];

    const seen = new Set<string>();
    const normalized: string[] = [];
    rawList.forEach((item) => {
      const trimmed = String(item ?? '').trim();
      if (!trimmed) return;
      const modelKey = trimmed.toLowerCase();
      if (seen.has(modelKey)) return;
      seen.add(modelKey);
      normalized.push(trimmed);
    });

    result[key] = normalized;
  });

  return result;
};

const normalizeOauthModelAlias = (payload: unknown): Record<string, OAuthModelAliasEntry[]> => {
  if (!payload || typeof payload !== 'object') return {};

  const record = payload as Record<string, unknown>;
  const source = record['oauth-model-alias'] ?? record.items ?? payload;
  if (!source || typeof source !== 'object') return {};

  const result: Record<string, OAuthModelAliasEntry[]> = {};

  Object.entries(source as Record<string, unknown>).forEach(([channel, mappings]) => {
    const key = String(channel ?? '')
      .trim()
      .toLowerCase();
    if (!key) return;
    if (!Array.isArray(mappings)) return;

    const seen = new Set<string>();
    const normalized = mappings
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const entry = item as Record<string, unknown>;
        const name = String(entry.name ?? entry.id ?? entry.model ?? '').trim();
        const alias = String(entry.alias ?? '').trim();
        if (!name || !alias) return null;
        const fork = entry.fork === true;
        return fork ? { name, alias, fork } : { name, alias };
      })
      .filter(Boolean)
      .filter((entry) => {
        const aliasEntry = entry as OAuthModelAliasEntry;
        const dedupeKey = `${aliasEntry.name.toLowerCase()}::${aliasEntry.alias.toLowerCase()}::${aliasEntry.fork ? '1' : '0'}`;
        if (seen.has(dedupeKey)) return false;
        seen.add(dedupeKey);
        return true;
      }) as OAuthModelAliasEntry[];

    if (normalized.length) {
      result[key] = normalized;
    }
  });

  return result;
};

const OAUTH_MODEL_ALIAS_ENDPOINT = '/oauth-model-alias';

export const authFilesApi = {
  list: async () => dedupeAuthFilesResponse(await apiClient.get<AuthFilesResponse>('/auth-files')),

  batchCheck: async (
    names?: string[],
    includeDisabled = true,
    concurrency?: number
  ): Promise<AuthFilesBatchCheckResponse> => {
    const normalizedNames = normalizeRequestedAuthFileNames(names ?? []);
    const payload = await apiClient.post<AuthFilesBatchCheckResponse>('/auth-files/batch-check', {
      ...(normalizedNames.length > 0 ? { names: normalizedNames } : {}),
      include_disabled: includeDisabled,
      ...(typeof concurrency === 'number' && Number.isFinite(concurrency)
        ? { concurrency: Math.round(concurrency) }
        : {}),
    });
    return normalizeBatchCheckResponse(payload);
  },

  createBatchCheckJob: async (
    names?: string[],
    includeDisabled = true,
    concurrency?: number
  ): Promise<AuthFileBatchCheckJobCreateResponse> => {
    const normalizedNames = normalizeRequestedAuthFileNames(names ?? []);
    return apiClient.post<AuthFileBatchCheckJobCreateResponse>('/auth-files/batch-check-jobs', {
      ...(normalizedNames.length > 0 ? { names: normalizedNames } : {}),
      include_disabled: includeDisabled,
      ...(typeof concurrency === 'number' && Number.isFinite(concurrency)
        ? { concurrency: Math.round(concurrency) }
        : {}),
    });
  },

  getBatchCheckJob: async (jobId: string) => {
    const payload = await apiClient.get<AuthFileBatchCheckJobResponse>(
      `/auth-files/batch-check-jobs/${encodeURIComponent(jobId)}`
    );
    return normalizeBatchCheckJobResponse(payload);
  },

  setStatus: (name: string, disabled: boolean) =>
    apiClient.patch<AuthFileStatusResponse>('/auth-files/status', { name, disabled }),

  uploadFiles: async (files: File[]): Promise<AuthFileBatchUploadResult> => {
    const requestedNames = files.map((file) => file.name);
    if (requestedNames.length === 0) {
      return { status: 'ok', uploaded: 0, files: [], failed: [] };
    }

    const formData = new FormData();
    files.forEach((file) => {
      formData.append('file', file, file.name);
    });
    const payload = await apiClient.postForm<AuthFileBatchUploadResponse>('/auth-files', formData);
    return normalizeBatchUploadResponse(payload, requestedNames);
  },

  upload: (file: File) => authFilesApi.uploadFiles([file]),

  deleteFiles: async (names: string[]): Promise<AuthFileBatchDeleteResult> => {
    const requestedNames = normalizeRequestedAuthFileNames(names);
    if (requestedNames.length === 0) {
      return { status: 'ok', deleted: 0, files: [], failed: [] };
    }

    const payload = await apiClient.delete<AuthFileBatchDeleteResponse>('/auth-files', {
      data: { names: requestedNames },
    });
    return normalizeBatchDeleteResponse(payload, requestedNames);
  },

  deleteFile: (name: string) => authFilesApi.deleteFiles([name]),

  deleteAll: () => apiClient.delete('/auth-files', { params: { all: true } }),

  downloadText: async (name: string): Promise<string> => {
    const response = await apiClient.getRaw(
      `/auth-files/download?name=${encodeURIComponent(name)}`,
      {
        responseType: 'blob',
      }
    );
    const blob = response.data as Blob;
    return blob.text();
  },

  async downloadJsonObject(name: string): Promise<Record<string, unknown>> {
    const rawText = await authFilesApi.downloadText(name);
    return parseAuthFileJsonObject(rawText);
  },

  saveText: (name: string, text: string) => saveAuthFileText(name, text),

  saveJsonObject: (name: string, json: Record<string, unknown>) =>
    saveAuthFileText(name, JSON.stringify(json)),

  // OAuth 排除模型
  async getOauthExcludedModels(): Promise<Record<string, string[]>> {
    const data = await apiClient.get('/oauth-excluded-models');
    return normalizeOauthExcludedModels(data);
  },

  saveOauthExcludedModels: (provider: string, models: string[]) =>
    apiClient.patch('/oauth-excluded-models', { provider, models }),

  deleteOauthExcludedEntry: (provider: string) =>
    apiClient.delete(`/oauth-excluded-models?provider=${encodeURIComponent(provider)}`),

  replaceOauthExcludedModels: (map: Record<string, string[]>) =>
    apiClient.put('/oauth-excluded-models', normalizeOauthExcludedModels(map)),

  // OAuth 模型别名
  async getOauthModelAlias(): Promise<Record<string, OAuthModelAliasEntry[]>> {
    const data = await apiClient.get(OAUTH_MODEL_ALIAS_ENDPOINT);
    return normalizeOauthModelAlias(data);
  },

  saveOauthModelAlias: async (channel: string, aliases: OAuthModelAliasEntry[]) => {
    const normalizedChannel = String(channel ?? '')
      .trim()
      .toLowerCase();
    const normalizedAliases =
      normalizeOauthModelAlias({ [normalizedChannel]: aliases })[normalizedChannel] ?? [];
    await apiClient.patch(OAUTH_MODEL_ALIAS_ENDPOINT, {
      channel: normalizedChannel,
      aliases: normalizedAliases,
    });
  },

  deleteOauthModelAlias: async (channel: string) => {
    const normalizedChannel = String(channel ?? '')
      .trim()
      .toLowerCase();

    try {
      await apiClient.patch(OAUTH_MODEL_ALIAS_ENDPOINT, {
        channel: normalizedChannel,
        aliases: [],
      });
    } catch (err: unknown) {
      const status = getStatusCode(err);
      if (status !== 405) throw err;
      await apiClient.delete(
        `${OAUTH_MODEL_ALIAS_ENDPOINT}?channel=${encodeURIComponent(normalizedChannel)}`
      );
    }
  },

  // 获取认证凭证支持的模型
  async getModelsForAuthFile(
    name: string
  ): Promise<{ id: string; display_name?: string; type?: string; owned_by?: string }[]> {
    const data = await apiClient.get<Record<string, unknown>>(
      `/auth-files/models?name=${encodeURIComponent(name)}`
    );
    const models = data.models ?? data['models'];
    return Array.isArray(models)
      ? (models as { id: string; display_name?: string; type?: string; owned_by?: string }[])
      : [];
  },

  // 获取指定 channel 的模型定义
  async getModelDefinitions(
    channel: string
  ): Promise<{ id: string; display_name?: string; type?: string; owned_by?: string }[]> {
    const normalizedChannel = String(channel ?? '')
      .trim()
      .toLowerCase();
    if (!normalizedChannel) return [];
    const data = await apiClient.get<Record<string, unknown>>(
      `/model-definitions/${encodeURIComponent(normalizedChannel)}`
    );
    const models = data.models ?? data['models'];
    return Array.isArray(models)
      ? (models as { id: string; display_name?: string; type?: string; owned_by?: string }[])
      : [];
  },
};
