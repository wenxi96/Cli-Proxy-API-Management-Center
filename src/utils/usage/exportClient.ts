import {
  EXPORT_BLOB_LIMIT_BYTES,
  EXPORT_DERIVATION_PROFILE,
  EXPORT_SCHEMA_VERSION,
  type ExportProfileSnapshot,
} from './exportProfile';
import type { ModelPriceOverrides } from './cost';
import type { UsageCatalogPayload, UsageExportEstimatePayload, UsageExportRequestOptions } from '@/services/api/usage';
import { usageApi } from '@/services/api/usage';

export interface ExportSink {
  readonly atomicCommit: boolean;
  begin: (metadata: { filename: string; mimeType: string; maxBytes?: number }) => Promise<void>;
  write: (chunk: string) => Promise<void>;
  commit: () => Promise<void>;
  abort: (reason?: unknown) => Promise<void>;
}

export type ExportSinkSuccessTranslationKey =
  | 'usage_stats.export_saved'
  | 'usage_stats.export_download_stream_complete';

export const getExportSinkSuccessTranslationKey = (
  sink: Pick<ExportSink, 'atomicCommit'>
): ExportSinkSuccessTranslationKey =>
  sink.atomicCommit
    ? 'usage_stats.export_saved'
    : 'usage_stats.export_download_stream_complete';

export interface ExportEstimateResult {
  estimate: UsageExportEstimatePayload;
  clientDerivedBytesUpperBound: number;
  estimatedBytesUpperBound: number;
  complete: boolean;
  snapshot: ExportProfileSnapshot;
}

export const validateExportControlRecord = (
  value: unknown,
  profile: ExportProfileSnapshot,
  expectedEventCount?: number
): string | null => {
  if (!isRecord(value) || value.record_type !== 'end') return 'export_missing_end';
  if (value.complete !== true) return String(value.code || 'export_incomplete');
  if (value.schema_version !== 1) return 'export_control_schema_mismatch';
  if (value.export_schema_version !== EXPORT_SCHEMA_VERSION) return 'export_control_schema_mismatch';
  if (value.export_derivation_profile !== EXPORT_DERIVATION_PROFILE) {
    return 'export_control_profile_mismatch';
  }
  if (profile.exportSnapshotId && value.export_snapshot_id !== profile.exportSnapshotId) {
    return 'export_snapshot_mismatch';
  }
  if (!profile.snapshotFactsHash || value.snapshot_facts_hash !== profile.snapshotFactsHash) {
    return 'export_snapshot_facts_mismatch';
  }
  if (profile.profileFingerprint && value.profile_fingerprint !== profile.profileFingerprint) {
    return 'export_control_fingerprint_mismatch';
  }
  if (profile.catalogFingerprint && value.catalog_fingerprint !== profile.catalogFingerprint) {
    return 'export_control_fingerprint_mismatch';
  }
  if (
    profile.priceSnapshotFingerprint &&
    value.price_snapshot_fingerprint !== profile.priceSnapshotFingerprint
  ) {
    return 'export_control_fingerprint_mismatch';
  }
  if (expectedEventCount !== undefined) {
    const eventCount = safeInteger(value.event_count);
    if (eventCount === undefined) return 'export_event_count_mismatch';
    if (profile.eventCountExact === true && eventCount !== expectedEventCount) {
      return 'export_event_count_mismatch';
    }
    if (profile.eventCountExact !== true && eventCount > expectedEventCount) {
      return 'export_event_count_mismatch';
    }
  }
  if (
    profile.serverBytesUpperBoundComplete === true &&
    safeInteger(value.server_bytes_upper_bound) !== profile.serverBytesUpperBound
  ) {
    return 'export_control_bytes_mismatch';
  }
  if (
    profile.serverBytesUpperBoundComplete === true &&
    value.server_bytes_upper_bound_complete !== true
  ) {
    return 'export_control_bytes_mismatch';
  }
  if (
    profile.maxBytesUpperBound !== undefined &&
    value.bytes_upper_bound_complete === true &&
    safeInteger(value.estimated_bytes_upper_bound) !== profile.maxBytesUpperBound
  ) {
    return 'export_control_bytes_mismatch';
  }
  return null;
};

const validateExportProfile = (profile: ExportProfileSnapshot): string | null => {
  if (profile.exportSnapshotId && !profile.exportSnapshotId.trim()) return 'export_snapshot_mismatch';
  if (profile.exportSchemaVersion && profile.exportSchemaVersion !== EXPORT_SCHEMA_VERSION) {
    return 'export_control_schema_mismatch';
  }
  if (profile.exportDerivationProfile && profile.exportDerivationProfile !== EXPORT_DERIVATION_PROFILE) {
    return 'export_control_profile_mismatch';
  }
  if (!profile.snapshotFactsHash || profile.snapshotFactsHash.length !== 64) {
    return 'export_snapshot_facts_mismatch';
  }
  return null;
};

const encoder = new TextEncoder();

const EXPORT_CATALOG_FINGERPRINT = 'projection-catalog-v1';
const EXPORT_PRICE_FINGERPRINT = 'client-owned';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const safeInteger = (value: unknown): number | undefined => {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return undefined;
  try {
    const integer = BigInt(value.trim());
    return integer <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(integer) : undefined;
  } catch {
    return undefined;
  }
};

const exportAbortError = (signal: AbortSignal): Error => {
  const reason = signal.reason;
  if (reason instanceof Error) return reason;
  if (typeof reason === 'string' && reason.trim()) return new Error(reason);
  return new Error('export_aborted');
};

export interface ExportLabelOverrides {
  sourceLabels?: Record<string, string>;
  modelLabels?: Record<string, string>;
}

const utf8Length = (value: string): number => encoder.encode(value).byteLength;

export const nextExportByteCount = (
  current: number,
  chunk: string,
  maxBytes?: number
): number | null => {
  if (!Number.isSafeInteger(current) || current < 0) return null;
  const chunkBytes = utf8Length(chunk);
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes < 0) return null;
  const next = current + chunkBytes;
  if (!Number.isSafeInteger(next)) return null;
  if (maxBytes !== undefined && (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || next > maxBytes)) {
    return null;
  }
  return next;
};

const jsonEscapedLength = (value: string): number => utf8Length(JSON.stringify(value));
const csvEscapedLength = (value: string): number => {
  const safe = /^[=+\-@]/.test(value.trimStart()) ? `'${value}` : value;
  return utf8Length(`"${safe.replace(/"/g, '""')}"`);
};

const readCatalogEntries = (
  catalog: UsageCatalogPayload | null,
  overrides: ExportLabelOverrides = {}
) => {
  const sourceEntries = Array.isArray(catalog?.sources) ? catalog.sources : [];
  const modelEntries = Array.isArray(catalog?.models) ? catalog.models : [];
  const sourceLabels: Record<string, string> = {};
  const sourceKeys: Record<string, string> = {};
  const modelLabels: Record<string, string> = {};
  const modelPriceKeys: Record<string, string> = {};
  const labelCounts = new Map<string, number>();

  sourceEntries.forEach((raw) => {
    if (!isRecord(raw)) return;
    const id = typeof raw.source_id === 'string' ? raw.source_id.trim() : '';
    if (!id) return;
    const sourceKey = typeof raw.source_key === 'string' ? raw.source_key.trim() : '';
    const label = typeof raw.label === 'string' && raw.label.trim()
      ? raw.label.trim()
      : sourceKey || id;
    sourceKeys[id] = sourceKey;
    sourceLabels[id] = label;
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  });
  Object.entries(sourceLabels).forEach(([id, label]) => {
    if ((labelCounts.get(label) ?? 0) > 1) {
      sourceLabels[id] = `${label} [${sourceKeys[id] || id}]`;
    }
  });
  Object.entries(overrides.sourceLabels ?? {}).forEach(([id, label]) => {
    if (typeof label === 'string' && label.trim() && sourceLabels[id]) {
      sourceLabels[id] = label.trim();
    }
  });
  const effectiveSourceLabels = new Map<string, string>();
  Object.entries(sourceLabels).forEach(([id, label]) => {
    effectiveSourceLabels.set(id, label);
  });
  const effectiveLabelCounts = new Map<string, number>();
  effectiveSourceLabels.forEach((label) => {
    effectiveLabelCounts.set(label, (effectiveLabelCounts.get(label) ?? 0) + 1);
  });
  effectiveSourceLabels.forEach((label, id) => {
    if ((effectiveLabelCounts.get(label) ?? 0) > 1) {
      sourceLabels[id] = `${label} [${sourceKeys[id] || id}]`;
    }
  });
  modelEntries.forEach((raw) => {
    if (!isRecord(raw)) return;
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    if (!id) return;
    modelLabels[id] = typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : id;
    modelPriceKeys[id] = typeof raw.price_key === 'string' ? raw.price_key.trim() : '';
  });
  Object.entries(overrides.modelLabels ?? {}).forEach(([id, label]) => {
    if (typeof label === 'string' && label.trim() && modelLabels[id]) {
      modelLabels[id] = label.trim();
    }
  });
  return { sourceLabels, sourceKeys, modelLabels, modelPriceKeys };
};

const decimalMax = '9'.repeat(20) + '.' + '9'.repeat(8);
const maxJsonCostLength = (priceKey: string): number => {
  const missingComponents = [
    'input',
    'output',
    'reasoning',
    'cache_read',
    'cache_creation',
    'cache_unsplit',
  ].map((component) => `${priceKey}:${component}`);
  const costObject = [
    `"input_cost_usd":${decimalMax}`,
    `"output_cost_usd":${decimalMax}`,
    `"cache_cost_usd":${decimalMax}`,
    `"total_cost_usd":${decimalMax}`,
    `"cost_status":${JSON.stringify('policy_unavailable')}`,
    `"missing_price_models":[${JSON.stringify(priceKey)}]`,
    `"missing_price_components":${JSON.stringify(missingComponents)}`,
  ].join(',');
  return utf8Length(`"cost":{${costObject}}`);
};

const maxCsvCostLength = (priceKey: string): number => {
  const csv = (value: string) => csvEscapedLength(value);
  return [
    decimalMax, decimalMax, decimalMax, decimalMax, 'policy_unavailable', priceKey,
    ['input', 'output', 'reasoning', 'cache_read', 'cache_creation', 'cache_unsplit']
      .map((component) => `${priceKey}:${component}`)
      .join('|'),
  ].map(csv).reduce((sum, value) => sum + value, 0);
};

const isSafeCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const addBound = (left: number, right: number): number | null => {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right) || right < 0) return null;
  const result = left + right;
  return Number.isSafeInteger(result) ? result : null;
};

const multiplyBound = (left: number, right: number): number | null => {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right) || left < 0 || right < 0) return null;
  const result = left * right;
  return Number.isSafeInteger(result) ? result : null;
};

const clonePriceOverrides = (overrides: ModelPriceOverrides): ModelPriceOverrides =>
  Object.fromEntries(
    Object.entries(overrides).map(([key, value]) => [key, { ...value }])
  ) as ModelPriceOverrides;

export const deriveClientBytes = (
  estimate: UsageExportEstimatePayload,
  catalog: UsageCatalogPayload | null,
  priceOverrides: ModelPriceOverrides,
  labelOverrides: ExportLabelOverrides = {}
): { bytes: number; complete: boolean; snapshot: ExportProfileSnapshot } => {
  const entries = readCatalogEntries(catalog, labelOverrides);
  const sourceCounts = estimate.matched_source_id_counts ?? {};
  const modelCounts = estimate.matched_model_counts ?? {};
  const eventCountUpperBound = safeInteger(estimate.event_count_upper_bound);
  let complete = isSafeCount(eventCountUpperBound) &&
    catalog?.billable_policy_version === 'v1' &&
    catalog?.source_key_algorithm === 'usage_source_key_v1' &&
    estimate.export_derivation_profile === EXPORT_DERIVATION_PROFILE &&
    estimate.export_schema_version === EXPORT_SCHEMA_VERSION &&
    typeof estimate.export_snapshot_id === 'string' &&
    estimate.export_snapshot_id.trim().length > 0 &&
    typeof estimate.snapshot_facts_hash === 'string' &&
    estimate.snapshot_facts_hash.trim().length === 64 &&
    estimate.catalog_fingerprint === EXPORT_CATALOG_FINGERPRINT &&
    estimate.price_snapshot_fingerprint === EXPORT_PRICE_FINGERPRINT &&
    estimate.profile_fingerprint === EXPORT_DERIVATION_PROFILE;
  let bytes = 0;
  let sourceCountTotal = 0;
  let modelCountTotal = 0;
  const format = estimate.format;
  Object.entries(sourceCounts).forEach(([sourceID, count]) => {
    const label = entries.sourceLabels[sourceID];
    const sourceKey = entries.sourceKeys[sourceID];
    if (!label || !sourceKey || !isSafeCount(count)) {
      complete = false;
      return;
    }
    const nextSourceCount = addBound(sourceCountTotal, count);
    if (nextSourceCount === null) {
      complete = false;
      return;
    }
    sourceCountTotal = nextSourceCount;
    const perEvent = format === 'json'
      ? utf8Length('"source":') + jsonEscapedLength(label)
      : csvEscapedLength(label);
    const contribution = multiplyBound(perEvent, count);
    const next = contribution === null ? null : addBound(bytes, contribution);
    if (next === null) complete = false;
    else bytes = next;
  });
  Object.entries(modelCounts).forEach(([modelID, count]) => {
    const priceKey = entries.modelPriceKeys[modelID];
    if (!priceKey || !entries.modelLabels[modelID] || !isSafeCount(count)) {
      complete = false;
      return;
    }
    const nextModelCount = addBound(modelCountTotal, count);
    if (nextModelCount === null) {
      complete = false;
      return;
    }
    modelCountTotal = nextModelCount;
    const perEvent = format === 'json'
      ? maxJsonCostLength(priceKey)
      : maxCsvCostLength(priceKey) + 2;
    const contribution = multiplyBound(perEvent, count);
    const next = contribution === null ? null : addBound(bytes, contribution);
    if (next === null) complete = false;
    else bytes = next;
  });
  if (format !== 'json' && format !== 'csv') complete = false;
  if (sourceCountTotal !== eventCountUpperBound || modelCountTotal !== eventCountUpperBound) {
    complete = false;
  }
  return {
    bytes,
    complete,
    snapshot: {
      sourceLabels: entries.sourceLabels,
      sourceKeys: entries.sourceKeys,
      modelLabels: entries.modelLabels,
      modelPriceKeys: entries.modelPriceKeys,
      priceOverrides: clonePriceOverrides(priceOverrides),
      billablePolicyVersion: catalog?.billable_policy_version,
      sourceKeyAlgorithm: catalog?.source_key_algorithm,
      catalogFingerprint: estimate.catalog_fingerprint,
      priceSnapshotFingerprint: estimate.price_snapshot_fingerprint,
      profileFingerprint: estimate.profile_fingerprint,
      snapshotFactsHash: estimate.snapshot_facts_hash,
      exportSnapshotId: estimate.export_snapshot_id,
      exportSchemaVersion: estimate.export_schema_version,
      exportDerivationProfile: estimate.export_derivation_profile,
      strictMappings: true,
      eventCountUpperBound,
      eventCountExact: estimate.event_count_exact,
      maxBytesUpperBound: safeInteger(estimate.estimated_bytes_upper_bound),
      serverBytesUpperBound: safeInteger(estimate.server_bytes_upper_bound),
      serverBytesUpperBoundComplete: estimate.server_bytes_upper_bound_complete,
    },
  };
};

export async function estimateUsageEventsExport(
  options: UsageExportRequestOptions,
  catalog: UsageCatalogPayload | null,
  priceOverrides: ModelPriceOverrides,
  labelOverrides: ExportLabelOverrides = {}
): Promise<ExportEstimateResult> {
  const estimate = await usageApi.getUsageEventsExportEstimate(options);
  const derived = deriveClientBytes(estimate, catalog, priceOverrides, labelOverrides);
  const serverBytes = safeInteger(estimate.server_bytes_upper_bound);
  const complete = Boolean(
    isSafeCount(serverBytes) && estimate.server_bytes_upper_bound_complete && derived.complete
  );
  const combinedBytes = complete && isSafeCount(serverBytes)
    ? addBound(serverBytes, derived.bytes)
    : null;
  const estimatedBytesUpperBound = combinedBytes ?? 0;
  const snapshot = {
    ...derived.snapshot,
    maxBytesUpperBound: estimatedBytesUpperBound,
  };
  return {
    estimate: {
      ...estimate,
      client_derived_bytes_upper_bound: derived.bytes,
      client_derived_bytes_upper_bound_complete: derived.complete,
      estimated_bytes_upper_bound: estimatedBytesUpperBound,
      bytes_upper_bound_complete: complete,
    },
    clientDerivedBytesUpperBound: derived.bytes,
    estimatedBytesUpperBound,
    complete,
    snapshot,
  };
}

export const createBlobSink = (
  filename: string,
  mimeType: string,
  initialMaxBytes?: number
): ExportSink & { blob: () => Blob } => {
  const chunks: string[] = [];
  let started = false;
  let committed = false;
  let bytes = 0;
  let maxBytes = initialMaxBytes;
  return {
    atomicCommit: false,
    async begin(metadata) {
      chunks.length = 0;
      started = true;
      committed = false;
      bytes = 0;
      maxBytes = metadata.maxBytes ?? initialMaxBytes;
    },
    async write(chunk) {
      if (!started || committed) throw new Error('export_sink_not_open');
      const next = nextExportByteCount(bytes, chunk, maxBytes);
      if (next === null) throw new Error('export_size_limit_exceeded');
      chunks.push(chunk);
      bytes = next;
    },
    async commit() {
      if (!started) throw new Error('export_sink_not_open');
      committed = true;
    },
    async abort() {
      chunks.length = 0;
      started = false;
      committed = false;
      bytes = 0;
    },
    blob() {
      if (!committed) throw new Error('export_sink_not_committed');
      return new Blob(chunks, { type: mimeType });
    },
  };
  void filename;
};

type FileSystemWritable = {
  write: (value: string) => Promise<void>;
  close: () => Promise<void>;
  abort?: (reason?: unknown) => Promise<void>;
};

type FileSystemPicker = (options: {
  suggestedName: string;
  types?: Array<{ description: string; accept: Record<string, string[]> }>;
}) => Promise<{ createWritable: () => Promise<FileSystemWritable> }>;

export const createFileSystemSink = (initialMaxBytes?: number): ExportSink | null => {
  const picker = (globalThis as unknown as { showSaveFilePicker?: FileSystemPicker }).showSaveFilePicker;
  if (typeof picker !== 'function') return null;
  let writable: FileSystemWritable | null = null;
  let bytes = 0;
  let maxBytes = initialMaxBytes;
  return {
    atomicCommit: true,
    async begin(metadata) {
      const handle = await picker({ suggestedName: metadata.filename });
      writable = await handle.createWritable();
      bytes = 0;
      maxBytes = metadata.maxBytes ?? initialMaxBytes;
    },
    async write(chunk) {
      if (!writable) throw new Error('export_sink_not_open');
      const next = nextExportByteCount(bytes, chunk, maxBytes);
      if (next === null) throw new Error('export_size_limit_exceeded');
      await writable.write(chunk);
      bytes = next;
    },
    async commit() {
      if (!writable) throw new Error('export_sink_not_open');
      await writable.close();
      writable = null;
    },
    async abort(reason) {
      try {
        await writable?.abort?.(reason);
      } finally {
        writable = null;
        bytes = 0;
      }
    },
  };
};

export interface ServiceWorkerDownloadDocument {
  createElement: (tagName: string) => {
    href: string;
    download: string;
    rel: string;
    click: () => void;
  };
  body: {
    appendChild: (element: unknown) => void;
    removeChild: (element: unknown) => void;
  };
}

export const triggerServiceWorkerDownload = (
  downloadURL: string,
  filename: string,
  documentLike?: ServiceWorkerDownloadDocument
): void => {
  const targetDocument = documentLike ?? (
    typeof document !== 'undefined' ? document as unknown as ServiceWorkerDownloadDocument : null
  );
  if (!targetDocument) return;
  const anchor = targetDocument.createElement('a');
  anchor.href = downloadURL;
  anchor.download = filename;
  anchor.rel = 'noopener';
  targetDocument.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    targetDocument.body.removeChild(anchor);
  }
};

/**
 * A service-worker sink is deliberately opt-in: the worker must advertise the
 * bounded sink protocol before the page sends any export bytes.
 */
export const createServiceWorkerSink = (): ExportSink | null => {
  const controller = typeof navigator !== 'undefined' ? navigator.serviceWorker?.controller : null;
  if (!controller) return null;
  const channel = new MessageChannel();
  let ready = false;
  let committed = false;
  let started = false;
  let bytes = 0;
  let maxBytes: number | undefined;
  let maxChunkBytes = 0;
  const call = (type: string, value?: unknown) => new Promise<unknown>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('export_service_worker_timeout')), 30_000);
    channel.port1.onmessage = (event) => {
      window.clearTimeout(timeout);
      if (event.data?.ok === false) reject(new Error(String(event.data?.code || 'export_service_worker_error')));
      else resolve(event.data);
    };
    channel.port1.start();
    channel.port1.postMessage({ type, value });
  });
  return {
    atomicCommit: false,
    async begin(metadata) {
      started = true;
      maxBytes = metadata.maxBytes;
      bytes = 0;
      controller.postMessage({
        type: 'usage-export-capability',
        protocol: 'usage-events-v2-sink-v1',
        metadata,
      }, [channel.port2]);
      const capability = await call('capability') as Record<string, unknown> | undefined;
      if (capability?.protocol !== 'usage-events-v2-sink-v1' ||
        typeof capability.maxChunkBytes !== 'number' ||
        !Number.isSafeInteger(capability.maxChunkBytes) || capability.maxChunkBytes <= 0 ||
        capability.atomic_commit !== false) {
        throw new Error('export_service_worker_capability_unavailable');
      }
      maxChunkBytes = capability.maxChunkBytes;
      const beginResult = await call('begin', metadata) as Record<string, unknown> | undefined;
      if (typeof beginResult?.download_url !== 'string' || !beginResult.download_url) {
        throw new Error('export_service_worker_capability_unavailable');
      }
      triggerServiceWorkerDownload(beginResult.download_url, metadata.filename);
      ready = true;
      committed = false;
    },
    async write(chunk) {
      if (!ready || committed) throw new Error('export_sink_not_open');
      if (maxChunkBytes <= 0 || utf8Length(chunk) > maxChunkBytes) {
        throw new Error('export_size_limit_exceeded');
      }
      const next = nextExportByteCount(bytes, chunk, maxBytes);
      if (next === null) throw new Error('export_size_limit_exceeded');
      await call('write', chunk);
      bytes = next;
    },
    async commit() {
      if (!ready || committed) throw new Error('export_sink_not_open');
      await call('commit');
      committed = true;
    },
    async abort(reason) {
      if (!started || committed) return;
      if (!ready) {
        channel.port1.postMessage({
          type: 'abort',
          value: reason instanceof Error ? reason.message : reason,
        });
        channel.port1.close();
        ready = false;
        started = false;
        bytes = 0;
        maxChunkBytes = 0;
        return;
      }
      try {
        await call('abort', reason instanceof Error ? reason.message : reason);
      } finally {
        ready = false;
        started = false;
        bytes = 0;
        maxChunkBytes = 0;
      }
    },
  };
};

export async function streamUsageEventsExportToSink(
  options: UsageExportRequestOptions,
  profile: ExportProfileSnapshot,
  sink: ExportSink,
  filename: string,
  externalSignal?: AbortSignal
): Promise<{ eventCount: number; bytes: number }> {
  const mimeType = options.format === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8';
  const worker = new Worker(new URL('../../workers/usageExport.worker.ts', import.meta.url), { type: 'module' });
  const controller = new AbortController();
  const abortFromExternal = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) controller.abort(externalSignal.reason);
  else externalSignal?.addEventListener('abort', abortFromExternal, { once: true });
  let committed = false;
  let eventCount = 0;
  let bytes = 0;
  let sawEnd = false;
  let endPosted = false;
  const readyWaiters: Array<{
    resolve: () => void;
    reject: (error: unknown) => void;
  }> = [];
  let readyCount = 0;
  let workerFailure: Error | null = null;
  const failWorker = (error: unknown) => {
    if (workerFailure) return;
    workerFailure = error instanceof Error ? error : new Error(String(error || 'export_worker_error'));
    readyWaiters.splice(0).forEach(({ reject }) => reject(workerFailure));
    if (!controller.signal.aborted) controller.abort(workerFailure);
  };
  const finish = async (error?: unknown) => {
    worker.terminate();
    if (!committed) {
      try {
        await sink.abort(error);
      } catch {
        // Preserve the original stream/worker error after best-effort cleanup.
      }
    }
  };
  try {
    const profileError = validateExportProfile(profile);
    if (profileError) throw new Error(profileError);
    const beginPromise = sink.begin({ filename, mimeType, maxBytes: profile.maxBytesUpperBound });
    let abortListener: (() => void) | null = null;
    const abortPromise = new Promise<never>((_, reject) => {
      const onAbort = () => reject(exportAbortError(controller.signal));
      abortListener = onAbort;
      if (controller.signal.aborted) {
        onAbort();
        return;
      }
      controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      await Promise.race([beginPromise, abortPromise]);
    } catch (error: unknown) {
      // A picker or worker handshake may resolve after cancellation. Attach a
      // late cleanup so that it cannot leave a writable handle or sink session.
      if (controller.signal.aborted) {
        void beginPromise.then(
          () => sink.abort(controller.signal.reason).catch(() => {}),
          () => undefined
        );
      }
      throw error;
    } finally {
      if (abortListener) controller.signal.removeEventListener('abort', abortListener);
    }
    const commitPromise = new Promise<{ eventCount: number; bytes: number }>((resolve, reject) => {
      worker.onmessage = async (message: MessageEvent) => {
        const payload = message.data as Record<string, unknown>;
        try {
          if (payload.type === 'chunk') {
            const chunk = String(payload.value ?? '');
            const nextBytes = nextExportByteCount(bytes, chunk, profile.maxBytesUpperBound);
            if (nextBytes === null) throw new Error('export_size_limit_exceeded');
            await sink.write(chunk);
            bytes = nextBytes;
            worker.postMessage({ type: 'ack' });
          } else if (payload.type === 'ready') {
            const waiter = readyWaiters.shift();
            if (waiter) waiter.resolve();
            else readyCount += 1;
          } else if (payload.type === 'commit') {
            const committedEventCount = safeInteger(payload.eventCount);
            const workerBytes = safeInteger(payload.bytes);
            if (committedEventCount === undefined ||
              (profile.eventCountExact === true && committedEventCount !== profile.eventCountUpperBound) ||
              (profile.eventCountExact !== true && committedEventCount > (profile.eventCountUpperBound ?? Number.MAX_SAFE_INTEGER))) {
              reject(new Error('export_event_count_mismatch'));
              return;
            }
            eventCount = committedEventCount;
            if (
              workerBytes === undefined ||
              workerBytes !== bytes
            ) {
              reject(new Error('export_size_limit_exceeded'));
              return;
            }
            if (payload.profile !== EXPORT_DERIVATION_PROFILE ||
              payload.schema !== EXPORT_SCHEMA_VERSION ||
              payload.snapshotId !== profile.exportSnapshotId ||
              payload.snapshotFactsHash !== profile.snapshotFactsHash) {
              reject(new Error('export_control_fingerprint_mismatch'));
              return;
            }
            await sink.commit();
            committed = true;
            resolve({ eventCount, bytes });
          } else if (payload.type === 'error') {
            const error = new Error(String(payload.code ?? 'export_worker_error'));
            failWorker(error);
            reject(error);
          }
        } catch (error: unknown) {
          failWorker(error);
          reject(error);
        }
      };
      worker.onerror = (event) => {
        const error = new Error(event.message || 'export_worker_error');
        failWorker(error);
        reject(error);
      };
    });
    worker.postMessage({ type: 'begin', format: options.format, snapshot: profile });
    const waitReady = () => {
      if (workerFailure) return Promise.reject(workerFailure);
      if (readyCount > 0) {
        readyCount -= 1;
        return Promise.resolve();
      }
      return new Promise<void>((resolve, reject) => readyWaiters.push({ resolve, reject }));
    };
    const response = await usageApi.streamUsageEventsExport({
      ...options,
      export_snapshot_id: options.export_snapshot_id,
    }, controller.signal);
    if (!response.body) throw new Error('export_stream_unavailable');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    const postEnd = async (record: Record<string, unknown>) => {
      if (endPosted) throw new Error('export_duplicate_end');
      const controlError = validateExportControlRecord(
        record,
        profile,
        profile.eventCountUpperBound
      );
      if (controlError) throw new Error(controlError);
      sawEnd = true;
      endPosted = true;
      const endEventCount = safeInteger(record.event_count);
      await waitReady();
      worker.postMessage({
        type: 'end',
        complete: true,
        eventCount: endEventCount,
      });
    };
    for (;;) {
      const result = await reader.read();
      pending += decoder.decode(result.value ?? new Uint8Array(), { stream: !result.done });
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const record = JSON.parse(line) as Record<string, unknown>;
        if (record.record_type === 'end') {
          await postEnd(record);
        } else if (record.record_type === 'error') {
          throw new Error(String(record.code ?? 'export_error'));
        } else if (record.record_type === 'event') {
          if (endPosted) throw new Error('export_event_after_end');
          await waitReady();
          worker.postMessage({ type: 'event', event: record });
        } else {
          throw new Error('export_record_type_invalid');
        }
      }
      if (result.done) break;
    }
    if (pending.trim()) {
      const record = JSON.parse(pending) as Record<string, unknown>;
      if (record.record_type === 'end') {
        await postEnd(record);
      } else if (record.record_type === 'error') {
        throw new Error(String(record.code ?? 'export_error'));
      } else {
        throw new Error('export_missing_end');
      }
    }
    if (!sawEnd) throw new Error('export_missing_end');
    return await commitPromise;
  } catch (error: unknown) {
    const failure = workerFailure ?? error;
    if (!controller.signal.aborted) controller.abort(failure);
    await finish(failure);
    throw failure;
  } finally {
    externalSignal?.removeEventListener('abort', abortFromExternal);
    if (committed) worker.terminate();
  }
}

export const canUseBlobFallback = (estimate: ExportEstimateResult): boolean =>
  estimate.complete && estimate.estimatedBytesUpperBound <= EXPORT_BLOB_LIMIT_BYTES;
