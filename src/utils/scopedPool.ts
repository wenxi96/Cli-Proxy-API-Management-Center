import type {
  ScopedPoolAuthRuntimeStatus,
  ScopedPoolProviderRuntimeStatus,
  ScopedPoolStatusResponse,
  GeminiKeyConfig,
  OpenAIProviderConfig,
  ProviderKeyConfig,
} from '@/types';
import { normalizeAuthIndex } from '@/utils/usage';

type ProviderBindingInput = {
  geminiKeys: GeminiKeyConfig[];
  codexConfigs: ProviderKeyConfig[];
  claudeConfigs: ProviderKeyConfig[];
  vertexConfigs: ProviderKeyConfig[];
  openaiProviders: OpenAIProviderConfig[];
};

export type ProviderScopedPoolBindings = {
  byAuthIndex: Map<string, ScopedPoolAuthRuntimeStatus>;
  gemini: Map<number, ScopedPoolAuthRuntimeStatus>;
  codex: Map<number, ScopedPoolAuthRuntimeStatus>;
  claude: Map<number, ScopedPoolAuthRuntimeStatus>;
  vertex: Map<number, ScopedPoolAuthRuntimeStatus>;
  openaiProviders: Map<string, ScopedPoolProviderRuntimeStatus>;
  openaiEntries: Map<string, Map<number, ScopedPoolAuthRuntimeStatus>>;
};

export const createEmptyScopedPoolBindings = (): ProviderScopedPoolBindings => ({
  byAuthIndex: new Map(),
  gemini: new Map(),
  codex: new Map(),
  claude: new Map(),
  vertex: new Map(),
  openaiProviders: new Map(),
  openaiEntries: new Map(),
});

const encoder = new TextEncoder();

const encodeHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');

const sha256Hex = async (value: string) => {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(value));
  return encodeHex(new Uint8Array(digest));
};

const trim = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const buildStableShortDigestInput = (kind: string, parts: string[]) =>
  [kind, ...parts.map((part) => trim(part))].join('\x00');

const buildScopedPoolSeed = (parts: string[]) => `config:${parts.join('\x00')}`;

const buildOccurrenceAwareSourceToken = async (
  counts: Map<string, number>,
  kind: string,
  parts: string[]
) => {
  const digest = await sha256Hex(buildStableShortDigestInput(kind, parts));
  const short = digest.slice(0, 12);
  const counterKey = `${kind}:${short}`;
  const occurrence = counts.get(counterKey) ?? 0;
  counts.set(counterKey, occurrence + 1);
  return occurrence > 0 ? `${short}-${occurrence}` : short;
};

const buildSeedParts = (input: {
  providerKey: string;
  compatName?: string;
  baseUrl?: string;
  proxyUrl?: string;
  apiKey?: string;
  source: string;
}) => {
  const parts = [`provider=${trim(input.providerKey).toLowerCase()}`];
  const compatName = trim(input.compatName).toLowerCase();
  const baseUrl = trim(input.baseUrl);
  const proxyUrl = trim(input.proxyUrl);
  const apiKey = trim(input.apiKey);
  const source = trim(input.source);

  if (compatName) parts.push(`compat=${compatName}`);
  if (baseUrl) parts.push(`base=${baseUrl}`);
  if (proxyUrl) parts.push(`proxy=${proxyUrl}`);
  if (apiKey) parts.push(`api_key=${apiKey}`);
  if (source) parts.push(`source=${source}`);

  return parts;
};

const buildAuthIndex = async (parts: string[]) => {
  const digest = await sha256Hex(buildScopedPoolSeed(parts));
  return digest.slice(0, 16);
};

const setBinding = (
  target: Map<number, ScopedPoolAuthRuntimeStatus>,
  index: number,
  authIndex: string | null,
  byAuthIndex: Map<string, ScopedPoolAuthRuntimeStatus>
) => {
  if (!authIndex) return;
  const status = byAuthIndex.get(authIndex);
  if (!status) return;
  target.set(index, status);
};

export const normalizeScopedPoolStatusResponse = (raw: unknown): ScopedPoolStatusResponse => {
  const response: ScopedPoolStatusResponse = {
    strategy: 'round-robin',
    generated: false,
    providers: {},
    auths: {},
  };

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return response;
  }

  const payload = raw as Record<string, unknown>;
  if (typeof payload.strategy === 'string' && payload.strategy.trim()) {
    response.strategy = payload.strategy;
  }
  if (typeof payload.generated === 'boolean') {
    response.generated = payload.generated;
  }
  if (typeof payload.generatedAt === 'string' && payload.generatedAt.trim()) {
    response.generatedAt = payload.generatedAt;
  }

  const providers = payload.providers;
  if (providers && typeof providers === 'object' && !Array.isArray(providers)) {
    Object.entries(providers as Record<string, unknown>).forEach(([providerKey, value]) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      const record = value as Record<string, unknown>;
      const auths: Record<string, ScopedPoolAuthRuntimeStatus> = {};

      if (record.auths && typeof record.auths === 'object' && !Array.isArray(record.auths)) {
        Object.entries(record.auths as Record<string, unknown>).forEach(([authId, authValue]) => {
          if (!authValue || typeof authValue !== 'object' || Array.isArray(authValue)) return;
          auths[authId] = normalizeScopedPoolAuthStatus(authValue as Record<string, unknown>);
        });
      }

      response.providers[providerKey] = {
        provider: typeof record.provider === 'string' ? record.provider : providerKey,
        configured: record.configured === true,
        effective: record.effective === true,
        reason: typeof record.reason === 'string' ? record.reason : '',
        limit: Number.isFinite(record.limit) ? Number(record.limit) : 0,
        candidateCount: Number.isFinite(record.candidate_count)
          ? Number(record.candidate_count)
          : Number.isFinite(record.candidateCount)
            ? Number(record.candidateCount)
            : 0,
        activeCount: Number.isFinite(record.active_count)
          ? Number(record.active_count)
          : Number.isFinite(record.activeCount)
            ? Number(record.activeCount)
            : 0,
        standbyCount: Number.isFinite(record.standby_count)
          ? Number(record.standby_count)
          : Number.isFinite(record.standbyCount)
            ? Number(record.standbyCount)
            : 0,
        penalizedCount: Number.isFinite(record.penalized_count)
          ? Number(record.penalized_count)
          : Number.isFinite(record.penalizedCount)
            ? Number(record.penalizedCount)
            : 0,
        ejectedCount: Number.isFinite(record.ejected_count)
          ? Number(record.ejected_count)
          : Number.isFinite(record.ejectedCount)
            ? Number(record.ejectedCount)
            : 0,
        disabledCount: Number.isFinite(record.disabled_count)
          ? Number(record.disabled_count)
          : Number.isFinite(record.disabledCount)
            ? Number(record.disabledCount)
            : 0,
        activeAuthIds: Array.isArray(record.active_auth_ids)
          ? record.active_auth_ids.map((item) => String(item ?? '').trim()).filter(Boolean)
          : Array.isArray(record.activeAuthIds)
            ? record.activeAuthIds.map((item) => String(item ?? '').trim()).filter(Boolean)
            : [],
        auths,
      };
    });
  }

  const auths = payload.auths;
  if (auths && typeof auths === 'object' && !Array.isArray(auths)) {
    Object.entries(auths as Record<string, unknown>).forEach(([authId, value]) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      response.auths[authId] = normalizeScopedPoolAuthStatus(value as Record<string, unknown>);
    });
  }

  return response;
};

export const normalizeScopedPoolAuthStatus = (
  record: Record<string, unknown>
): ScopedPoolAuthRuntimeStatus => ({
  authId:
    typeof record.auth_id === 'string'
      ? record.auth_id
      : typeof record.authId === 'string'
        ? record.authId
        : '',
  authIndex:
    typeof record.auth_index === 'string'
      ? record.auth_index
      : typeof record.authIndex === 'string'
        ? record.authIndex
        : undefined,
  provider: typeof record.provider === 'string' ? record.provider : '',
  configured: record.configured === true,
  poolEnabled: record.pool_enabled === true || record.poolEnabled === true,
  inPool: record.in_pool === true || record.inPool === true,
  state:
    typeof record.pool_state === 'string'
      ? record.pool_state
      : typeof record.state === 'string'
        ? record.state
        : 'unmanaged',
  reason:
    typeof record.pool_reason === 'string'
      ? record.pool_reason
      : typeof record.reason === 'string'
        ? record.reason
        : '',
  runtimeOnly: record.runtime_only === true || record.runtimeOnly === true,
  disabled: record.disabled === true,
  supportsQuotaCheck:
    record.supports_quota_check === true || record.supportsQuotaCheck === true,
  remainingPercent:
    typeof record.remaining_percent === 'number'
      ? record.remaining_percent
      : typeof record.remainingPercent === 'number'
        ? record.remainingPercent
        : undefined,
  lastQuotaCheckedAt:
    typeof record.last_quota_checked_at === 'string'
      ? record.last_quota_checked_at
      : typeof record.lastQuotaCheckedAt === 'string'
        ? record.lastQuotaCheckedAt
        : undefined,
  consecutiveErrors:
    typeof record.consecutive_errors === 'number'
      ? record.consecutive_errors
      : typeof record.consecutiveErrors === 'number'
        ? record.consecutiveErrors
        : undefined,
  recentTimeoutCount:
    typeof record.recent_timeout_count === 'number'
      ? record.recent_timeout_count
      : typeof record.recentTimeoutCount === 'number'
        ? record.recentTimeoutCount
        : undefined,
  penaltyScore:
    typeof record.penalty_score === 'number'
      ? record.penalty_score
      : typeof record.penaltyScore === 'number'
        ? record.penaltyScore
        : undefined,
  penaltyUntil:
    typeof record.penalty_until === 'string'
      ? record.penalty_until
      : typeof record.penaltyUntil === 'string'
        ? record.penaltyUntil
        : undefined,
  lastSelectedAt:
    typeof record.last_selected_at === 'string'
      ? record.last_selected_at
      : typeof record.lastSelectedAt === 'string'
        ? record.lastSelectedAt
        : undefined,
  lastPoolEventAt:
    typeof record.last_pool_event_at === 'string'
      ? record.last_pool_event_at
      : typeof record.lastPoolEventAt === 'string'
        ? record.lastPoolEventAt
        : undefined,
  lastTransitionAt:
    typeof record.last_transition_at === 'string'
      ? record.last_transition_at
      : typeof record.lastTransitionAt === 'string'
        ? record.lastTransitionAt
        : undefined,
});

export const buildScopedPoolBindings = async (
  status: ScopedPoolStatusResponse | null,
  input: ProviderBindingInput
): Promise<ProviderScopedPoolBindings> => {
  const result = createEmptyScopedPoolBindings();
  const byAuthIndex = result.byAuthIndex;

  if (!status) {
    return result;
  }

  Object.values(status.auths).forEach((authStatus) => {
    const authIndex = normalizeAuthIndex(authStatus.authIndex);
    if (!authIndex) return;
    byAuthIndex.set(authIndex, authStatus);
  });

  const counts = new Map<string, number>();

  for (let index = 0; index < input.geminiKeys.length; index += 1) {
    const entry = input.geminiKeys[index];
    const apiKey = trim(entry.apiKey);
    if (!apiKey) continue;
    const baseUrl = trim(entry.baseUrl);
    const proxyUrl = trim(entry.proxyUrl);
    const token = await buildOccurrenceAwareSourceToken(counts, 'gemini:apikey', [apiKey, baseUrl]);
    const authIndex = await buildAuthIndex(
      buildSeedParts({
        providerKey: 'gemini',
        baseUrl,
        proxyUrl,
        apiKey,
        source: `config:gemini[${token}]`,
      })
    );
    setBinding(result.gemini, index, authIndex, byAuthIndex);
  }

  for (let index = 0; index < input.claudeConfigs.length; index += 1) {
    const entry = input.claudeConfigs[index];
    const apiKey = trim(entry.apiKey);
    if (!apiKey) continue;
    const baseUrl = trim(entry.baseUrl);
    const proxyUrl = trim(entry.proxyUrl);
    const token = await buildOccurrenceAwareSourceToken(counts, 'claude:apikey', [apiKey, baseUrl]);
    const authIndex = await buildAuthIndex(
      buildSeedParts({
        providerKey: 'claude',
        baseUrl,
        proxyUrl,
        apiKey,
        source: `config:claude[${token}]`,
      })
    );
    setBinding(result.claude, index, authIndex, byAuthIndex);
  }

  for (let index = 0; index < input.codexConfigs.length; index += 1) {
    const entry = input.codexConfigs[index];
    const apiKey = trim(entry.apiKey);
    if (!apiKey) continue;
    const baseUrl = trim(entry.baseUrl);
    const proxyUrl = trim(entry.proxyUrl);
    const token = await buildOccurrenceAwareSourceToken(counts, 'codex:apikey', [apiKey, baseUrl]);
    const authIndex = await buildAuthIndex(
      buildSeedParts({
        providerKey: 'codex',
        baseUrl,
        proxyUrl,
        apiKey,
        source: `config:codex[${token}]`,
      })
    );
    setBinding(result.codex, index, authIndex, byAuthIndex);
  }

  for (let index = 0; index < input.vertexConfigs.length; index += 1) {
    const entry = input.vertexConfigs[index];
    const apiKey = trim(entry.apiKey);
    const baseUrl = trim(entry.baseUrl);
    const proxyUrl = trim(entry.proxyUrl);
    const token = await buildOccurrenceAwareSourceToken(counts, 'vertex:apikey', [
      apiKey,
      baseUrl,
      proxyUrl,
    ]);
    const authIndex = await buildAuthIndex(
      buildSeedParts({
        providerKey: 'vertex',
        baseUrl,
        proxyUrl,
        apiKey,
        source: `config:vertex-apikey[${token}]`,
      })
    );
    setBinding(result.vertex, index, authIndex, byAuthIndex);
  }

  for (const provider of input.openaiProviders) {
    const providerKey = trim(provider.name).toLowerCase() || 'openai-compatibility';
    const providerMap = new Map<number, ScopedPoolAuthRuntimeStatus>();
    result.openaiEntries.set(provider.name, providerMap);
    if (status.providers[providerKey]) {
      result.openaiProviders.set(provider.name, status.providers[providerKey]);
    }

    const baseUrl = trim(provider.baseUrl);
    const compatName = trim(provider.name);
    const entries = Array.isArray(provider.apiKeyEntries) ? provider.apiKeyEntries : [];

    if (entries.length === 0) {
      const token = await buildOccurrenceAwareSourceToken(
        counts,
        `openai-compatibility:${providerKey}`,
        [baseUrl]
      );
      const authIndex = await buildAuthIndex(
        buildSeedParts({
          providerKey,
          compatName,
          baseUrl,
          source: `config:${providerKey}[${token}]`,
        })
      );
      const authStatus = byAuthIndex.get(authIndex);
      if (authStatus) {
        providerMap.set(-1, authStatus);
      }
      continue;
    }

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const apiKey = trim(entry.apiKey);
      const proxyUrl = trim(entry.proxyUrl);
      const token = await buildOccurrenceAwareSourceToken(
        counts,
        `openai-compatibility:${providerKey}`,
        [apiKey, baseUrl, proxyUrl]
      );
      const authIndex = await buildAuthIndex(
        buildSeedParts({
          providerKey,
          compatName,
          baseUrl,
          proxyUrl,
          apiKey,
          source: `config:${providerKey}[${token}]`,
        })
      );
      const authStatus = byAuthIndex.get(authIndex);
      if (authStatus) {
        providerMap.set(index, authStatus);
      }
    }
  }

  return result;
};

export const getScopedPoolStateKey = (state?: string | null) => {
  switch ((state || '').trim()) {
    case 'in_pool':
      return 'in_pool';
    case 'standby':
      return 'standby';
    case 'penalized':
      return 'penalized';
    case 'ejected':
      return 'ejected';
    case 'disabled':
      return 'disabled';
    case 'unmanaged':
    default:
      return 'unmanaged';
  }
};

export const getScopedPoolReasonKey = (reason?: string | null) => {
  switch ((reason || '').trim()) {
    case 'healthy':
      return 'healthy';
    case 'pool_full':
      return 'pool_full';
    case 'not_enabled':
      return 'not_enabled';
    case 'strategy_incompatible':
      return 'strategy_incompatible';
    case 'disabled':
      return 'disabled';
    case 'unavailable':
      return 'unavailable';
    case 'penalty_window':
      return 'penalty_window';
    case 'consecutive_errors':
      return 'consecutive_errors';
    case 'request_timeout':
      return 'request_timeout';
    case 'low_quota':
      return 'low_quota';
    default:
      return 'none';
  }
};
