import type { GeminiKeyConfig, OpenAIProviderConfig, ProviderKeyConfig } from '@/types';
import type { CredentialInfo, SourceInfo } from '@/types/sourceInfo';
import { buildCandidateUsageSourceIds, normalizeAuthIndex } from '@/utils/usage';

export interface SourceInfoMapInput {
  geminiApiKeys?: GeminiKeyConfig[];
  claudeApiKeys?: ProviderKeyConfig[];
  codexApiKeys?: ProviderKeyConfig[];
  vertexApiKeys?: ProviderKeyConfig[];
  openaiCompatibility?: OpenAIProviderConfig[];
  catalog?: unknown;
}

type SourceInfoEntry = Required<Pick<SourceInfo, 'displayName' | 'type' | 'identityKey'>>;

export interface SourceInfoMap {
  byAuthIndex: Map<string, SourceInfoEntry | null>;
  bySource: Map<string, SourceInfoEntry | null>;
  bySourceId?: Map<string, SourceInfoEntry | null>;
}

const buildProviderIdentityKey = (type: string, index: number) => `${type}:${index}`;

const registerIdentity = (
  map: Map<string, SourceInfoEntry | null>,
  key: string | null | undefined,
  entry: SourceInfoEntry
) => {
  if (!key) return;

  const existing = map.get(key);
  if (existing === undefined) {
    map.set(key, entry);
    return;
  }

  if (existing === null) {
    return;
  }

  if (existing.identityKey === entry.identityKey) {
    return;
  }

  map.set(key, null);
};

const formatRawSourceDisplayName = (source: string) => {
  if (!source) return '-';
  return source.startsWith('t:') ? source.slice(2) : source;
};

export function buildSourceInfoMap(input: SourceInfoMapInput): SourceInfoMap {
  const byAuthIndex = new Map<string, SourceInfoEntry | null>();
  const bySource = new Map<string, SourceInfoEntry | null>();
  const bySourceId = new Map<string, SourceInfoEntry | null>();

  const registerProvider = (
    entry: SourceInfoEntry,
    authIndices: Array<unknown>,
    candidates: Iterable<string>
  ) => {
    authIndices.forEach((authIndex) => {
      registerIdentity(byAuthIndex, normalizeAuthIndex(authIndex), entry);
    });

    Array.from(candidates).forEach((candidate) => {
      registerIdentity(bySource, candidate, entry);
    });
  };

  const providers: Array<{
    items: Array<{ apiKey?: string; prefix?: string; displayName?: string; authIndex?: string }>;
    type: string;
    label: string;
  }> = [
    { items: input.geminiApiKeys || [], type: 'gemini', label: 'Gemini' },
    { items: input.claudeApiKeys || [], type: 'claude', label: 'Claude' },
    { items: input.codexApiKeys || [], type: 'codex', label: 'Codex' },
    { items: input.vertexApiKeys || [], type: 'vertex', label: 'Vertex' },
  ];

  providers.forEach(({ items, type, label }) => {
    items.forEach((item, index) => {
      registerProvider(
        {
          // 优先用户自定义 displayName，其次 prefix（其本身为路由命名空间），最后回退 "{label} #N"
          displayName:
            item.displayName?.trim() || item.prefix?.trim() || `${label} #${index + 1}`,
          type,
          identityKey: buildProviderIdentityKey(type, index),
        },
        [item.authIndex],
        buildCandidateUsageSourceIds({ apiKey: item.apiKey, prefix: item.prefix })
      );
    });
  });

  (input.openaiCompatibility || []).forEach((provider, providerIndex) => {
    const candidates = new Set<string>();
    const authIndices: Array<unknown> = [provider.authIndex];

    buildCandidateUsageSourceIds({ prefix: provider.prefix }).forEach((id) => candidates.add(id));
    (provider.apiKeyEntries || []).forEach((entry) => {
      authIndices.push(entry.authIndex);
      buildCandidateUsageSourceIds({ apiKey: entry.apiKey }).forEach((id) => candidates.add(id));
    });

    registerProvider(
      {
        displayName: provider.prefix?.trim() || provider.name || `OpenAI #${providerIndex + 1}`,
        type: 'openai',
        identityKey: buildProviderIdentityKey('openai', providerIndex),
      },
      authIndices,
      candidates
    );
  });

  // Catalog labels are immutable all-history facts and take precedence over
  // labels derived only from the current page. They remain keyed by source_id.
  const catalog = input.catalog && typeof input.catalog === 'object' ? input.catalog as Record<string, unknown> : {};
  const catalogSources = Array.isArray(catalog.sources) ? catalog.sources : [];
  catalogSources.forEach((raw) => {
    if (!raw || typeof raw !== 'object') return;
    const entry = raw as Record<string, unknown>;
    const sourceId = typeof entry.source_id === 'string' ? entry.source_id.trim() : '';
    if (!sourceId) return;
    const sourceKey = typeof entry.source_key === 'string' ? entry.source_key.trim() : '';
    const label = typeof entry.label === 'string' ? entry.label.trim() : '';
    const provider = typeof entry.provider === 'string' ? entry.provider.trim() : '';
    const configEntry = sourceKey ? bySource.get(sourceKey) : undefined;
    const isCatalogFallbackLabel = !label || label === sourceKey || label === sourceId;
    const sourceEntry: SourceInfoEntry = {
      displayName: isCatalogFallbackLabel
        ? configEntry?.displayName || sourceKey || sourceId
        : label,
      type: provider || configEntry?.type || '',
      identityKey: `source:${sourceId}`,
    };
    registerIdentity(bySourceId, sourceId, sourceEntry);
    if (sourceKey) registerIdentity(bySource, sourceKey, sourceEntry);
  });

  return { byAuthIndex, bySource, bySourceId };
}

export function resolveSourceDisplay(
  sourceRaw: string,
  authIndex: unknown,
  sourceInfoMap: SourceInfoMap,
  authFileMap: Map<string, CredentialInfo>,
  sourceId?: unknown
): SourceInfo {
  const source = sourceRaw.trim();
  const sourceIdKey = typeof sourceId === 'string' ? sourceId.trim() : '';
  if (sourceIdKey) {
    const matchedBySourceId = sourceInfoMap.bySourceId?.get(sourceIdKey);
    if (matchedBySourceId) return matchedBySourceId;
  }
  const authIndexKey = normalizeAuthIndex(authIndex);

  if (authIndexKey) {
    const matchedByAuthIndex = sourceInfoMap.byAuthIndex.get(authIndexKey);
    if (matchedByAuthIndex) {
      return matchedByAuthIndex;
    }

    const authInfo = authFileMap.get(authIndexKey);
    if (authInfo) {
      return {
        displayName: authInfo.name || authIndexKey,
        type: authInfo.type,
        identityKey: `auth:${authIndexKey}`,
      };
    }
  }

  const matchedBySource = source ? sourceInfoMap.bySource.get(source) : null;
  if (matchedBySource) {
    return matchedBySource;
  }

  if (source) {
    return {
      displayName: formatRawSourceDisplayName(source),
      type: '',
      identityKey: `source:${source}`,
    };
  }

  if (authIndexKey) {
    return {
      displayName: authIndexKey,
      type: '',
      identityKey: `auth:${authIndexKey}`,
    };
  }

  return {
    displayName: '-',
    type: '',
    identityKey: 'source:-',
  };
}
