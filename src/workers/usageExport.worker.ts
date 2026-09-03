import {
  buildExportRow,
  EXPORT_DERIVATION_PROFILE,
  EXPORT_SCHEMA_VERSION,
  serializeCsvHeader,
  serializeCsvRow,
  serializeJsonRow,
  type ExportProfileSnapshot,
} from '@/utils/usage/exportProfile';

type WorkerMessage =
  | { type: 'begin'; format: 'json' | 'csv'; snapshot: ExportProfileSnapshot }
  | { type: 'event'; event: unknown }
  | { type: 'end'; complete: boolean; code?: string; eventCount?: number }
  | { type: 'ack' }
  | { type: 'abort' };

type WorkerReply =
  | { type: 'chunk'; value: string }
  | { type: 'ready' }
  | {
      type: 'commit';
      eventCount: number;
      bytes: number;
      profile: string;
      schema: string;
      snapshotId: string;
      snapshotFactsHash: string;
    }
  | { type: 'error'; code: string };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null;
  postMessage: (message: WorkerReply) => void;
};

let format: 'json' | 'csv' | null = null;
let snapshot: ExportProfileSnapshot | null = null;
let eventCount = 0;
let bytes = 0;
let jsonStarted = false;
let jsonNeedsComma = false;
let terminal = false;
let awaitingAck = false;
let pendingCommit = false;
let maxBytes: number | null = null;

const encoder = new TextEncoder();

const isSafeNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const validateSnapshot = (value: ExportProfileSnapshot): void => {
  if (value.exportSchemaVersion !== EXPORT_SCHEMA_VERSION) throw new Error('export_control_schema_mismatch');
  if (value.exportDerivationProfile !== EXPORT_DERIVATION_PROFILE) throw new Error('export_control_profile_mismatch');
  if (!value.exportSnapshotId?.trim()) throw new Error('export_snapshot_mismatch');
  if (!value.snapshotFactsHash || !/^[0-9a-f]{64}$/i.test(value.snapshotFactsHash)) {
    throw new Error('export_snapshot_facts_mismatch');
  }
  if (!isSafeNonNegativeInteger(value.maxBytesUpperBound)) {
    throw new Error('export_bytes_bound_incomplete');
  }
  if (!isSafeNonNegativeInteger(value.eventCountUpperBound)) {
    throw new Error('export_event_count_mismatch');
  }
  maxBytes = value.maxBytesUpperBound;
};

const emitChunk = (value: string) => {
  const chunkBytes = encoder.encode(value).byteLength;
  const nextBytes = bytes + chunkBytes;
  if (!Number.isSafeInteger(nextBytes) || (maxBytes !== null && nextBytes > maxBytes)) {
    throw new Error('export_size_limit_exceeded');
  }
  bytes = nextBytes;
  scope.postMessage({ type: 'chunk', value });
};

scope.onmessage = (messageEvent) => {
  const message = messageEvent.data;
  try {
    if (message.type === 'abort') {
      terminal = true;
      format = null;
      snapshot = null;
      awaitingAck = false;
      pendingCommit = false;
      maxBytes = null;
      return;
    }
    if (message.type === 'begin') {
      format = message.format;
      snapshot = message.snapshot;
      validateSnapshot(snapshot);
      eventCount = 0;
      bytes = 0;
      jsonStarted = false;
      jsonNeedsComma = false;
      terminal = false;
      awaitingAck = false;
      pendingCommit = false;
      if (format === 'json') {
        emitChunk('[');
        jsonStarted = true;
      } else {
        emitChunk(serializeCsvHeader());
      }
      awaitingAck = true;
      return;
    }
    if (message.type === 'ack') {
      if (!awaitingAck) return;
      awaitingAck = false;
      if (pendingCommit) {
        const committedSnapshot = snapshot;
        if (!committedSnapshot) throw new Error('export_snapshot_mismatch');
        terminal = true;
        scope.postMessage({
          type: 'commit',
          eventCount,
          bytes,
          profile: EXPORT_DERIVATION_PROFILE,
          schema: EXPORT_SCHEMA_VERSION,
          snapshotId: committedSnapshot.exportSnapshotId as string,
          snapshotFactsHash: committedSnapshot.snapshotFactsHash as string,
        });
      } else {
        scope.postMessage({ type: 'ready' });
      }
      return;
    }
    if (terminal || !format || !snapshot) return;
    if (message.type === 'event') {
      if (awaitingAck) return;
      const row = buildExportRow(message.event, snapshot);
      if (format === 'json') {
        emitChunk(`${jsonNeedsComma ? ',' : ''}${serializeJsonRow(row)}`);
        jsonNeedsComma = true;
      } else {
        emitChunk(serializeCsvRow(row));
      }
      awaitingAck = true;
      eventCount += 1;
      return;
    }
    if (message.type === 'end') {
      if (!message.complete) {
        terminal = true;
        scope.postMessage({ type: 'error', code: message.code || 'export_incomplete' });
        return;
      }
      if (message.eventCount !== undefined && message.eventCount !== eventCount) {
        terminal = true;
        scope.postMessage({ type: 'error', code: 'export_event_count_mismatch' });
        return;
      }
      if (format === 'json' && jsonStarted) {
        emitChunk(']');
        awaitingAck = true;
        pendingCommit = true;
      } else {
        const committedSnapshot = snapshot;
        if (!committedSnapshot) throw new Error('export_snapshot_mismatch');
        terminal = true;
        scope.postMessage({
          type: 'commit',
          eventCount,
          bytes,
          profile: EXPORT_DERIVATION_PROFILE,
          schema: EXPORT_SCHEMA_VERSION,
          snapshotId: committedSnapshot.exportSnapshotId as string,
          snapshotFactsHash: committedSnapshot.snapshotFactsHash as string,
        });
      }
    }
  } catch (error: unknown) {
    terminal = true;
    const code = error instanceof Error && error.message.startsWith('export_')
      ? error.message
      : 'export_worker_error';
    scope.postMessage({ type: 'error', code });
  }
};
