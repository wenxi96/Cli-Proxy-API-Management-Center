export const USAGE_EXPORT_SINK_PROTOCOL = 'usage-events-v2-sink-v1' as const;
export const USAGE_EXPORT_SINK_PATH = '/__usage-events-v2-sink';
export const SERVICE_WORKER_MAX_CHUNK_BYTES = 64 * 1024;
export const SERVICE_WORKER_SINK_TTL_MS = 30_000;

export const getUsageExportSinkPathForScope = (scope: string): string => {
  const scopeURL = new URL(scope || '/', 'http://localhost/');
  const scopePath = scopeURL.pathname.endsWith('/') ? scopeURL.pathname : scopeURL.pathname + '/';
  return scopePath + '__usage-events-v2-sink';
};

type Reply =
  | { ok: true; protocol?: string; maxChunkBytes?: number; atomic_commit: false; download_url?: string }
  | { ok: false; code: string };

type PortLike = {
  onmessage: ((event: { data: unknown }) => void) | null;
  postMessage: (message: Reply) => void;
  start?: () => void;
  close?: () => void;
};

type MessageEventLike = {
  data: unknown;
  ports?: readonly PortLike[];
  source?: { id?: string } | null;
};

type FetchRequestLike = {
  url: string;
  method?: string;
};

type ExportMetadata = {
  filename: string;
  mimeType: string;
  maxBytes?: number;
};

type PendingWrite = {
  value: Uint8Array;
  reply: (message: Reply) => void;
};

type PendingCommit = {
  reply: (message: Reply) => void;
};

type Session = {
  id: string;
  clientId: string | undefined;
  port: PortLike;
  metadata: ExportMetadata;
  begun: boolean;
  fetched: boolean;
  terminal: boolean;
  committed: boolean;
  bytes: number;
  controller: ReadableStreamDefaultController<Uint8Array> | null;
  pendingWrites: PendingWrite[];
  pendingCommit: PendingCommit | null;
  timer: ReturnType<typeof setTimeout> | null;
};

export interface UsageExportSinkReceiverOptions {
  maxChunkBytes?: number;
  sessionTtlMs?: number;
  maxPendingChunks?: number;
  idFactory?: () => string;
  origin?: string;
  path?: string;
}

type ReceiverState = {
  maxChunkBytes: number;
  sessionTtlMs: number;
  maxPendingChunks: number;
  idFactory: () => string;
  origin: string | undefined;
  path: string;
  sessions: Map<string, Session>;
};

const receiverStates = new WeakMap<object, ReceiverState>();

const encoder = new TextEncoder();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isSafeNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const readMetadata = (value: unknown): ExportMetadata | null => {
  if (!isRecord(value)) return null;
  const filename = typeof value.filename === 'string' ? value.filename.trim() : '';
  const mimeType = typeof value.mimeType === 'string' ? value.mimeType.trim() : '';
  const maxBytes = value.maxBytes;
  if (!filename || !mimeType) return null;
  if (maxBytes !== undefined && !isSafeNonNegativeInteger(maxBytes)) return null;
  return { filename, mimeType, ...(maxBytes === undefined ? {} : { maxBytes }) };
};

const sameMetadata = (left: ExportMetadata, right: ExportMetadata): boolean =>
  left.filename === right.filename &&
  left.mimeType === right.mimeType &&
  left.maxBytes === right.maxBytes;

const defaultIdFactory = (): string => {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (typeof randomUUID === 'function') return randomUUID.call(globalThis.crypto);
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

const safeHeaderValue = (value: string, fallback: string): string => {
  const cleaned = value.replace(/[\r\n"\\/]/g, '_').trim();
  return cleaned || fallback;
};

const errorResponse = (status: number, code: string): Response =>
  new Response(code, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain;charset=utf-8',
    },
  });

export class UsageExportSinkReceiver {
  constructor(options: UsageExportSinkReceiverOptions = {}) {
    receiverStates.set(this, {
      maxChunkBytes: options.maxChunkBytes ?? SERVICE_WORKER_MAX_CHUNK_BYTES,
      sessionTtlMs: options.sessionTtlMs ?? SERVICE_WORKER_SINK_TTL_MS,
      maxPendingChunks: options.maxPendingChunks ?? 2,
      idFactory: options.idFactory ?? defaultIdFactory,
      origin: options.origin,
      path: options.path ?? USAGE_EXPORT_SINK_PATH,
      sessions: new Map<string, Session>(),
    });
  }

  private get state(): ReceiverState {
    const state = receiverStates.get(this);
    if (!state) throw new Error('export_service_worker_receiver_uninitialized');
    return state;
  }

  handleMessage(event: MessageEventLike): void {
    if (!isRecord(event.data)) return;
    if (event.data.type !== 'usage-export-capability') return;
    const port = event.ports?.[0];
    const protocol = event.data.protocol;
    const metadata = readMetadata(event.data.metadata);
    if (!port || protocol !== USAGE_EXPORT_SINK_PROTOCOL || !metadata) {
      port?.postMessage({ ok: false, code: 'export_service_worker_capability_unavailable' });
      return;
    }

    let id = this.state.idFactory();
    while (this.state.sessions.has(id)) id = this.state.idFactory();
    const session: Session = {
      id,
      clientId: event.source?.id,
      port,
      metadata,
      begun: false,
      fetched: false,
      terminal: false,
      committed: false,
      bytes: 0,
      controller: null,
      pendingWrites: [],
      pendingCommit: null,
      timer: null,
    };
    this.state.sessions.set(id, session);
    port.onmessage = (messageEvent) => {
      void this.handlePortMessage(session, messageEvent.data);
    };
    port.start?.();
    this.armTimeout(session);
  }

  handleFetch(request: FetchRequestLike, clientId?: string): Response | null {
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return null;
    }
    if (url.pathname !== this.state.path) return null;
    if ((request.method ?? 'GET').toUpperCase() !== 'GET') {
      return errorResponse(405, 'export_service_worker_method_not_allowed');
    }
    if (this.state.origin && url.origin !== this.state.origin) {
      return errorResponse(403, 'export_service_worker_origin_mismatch');
    }
    const sinkID = url.searchParams.get('sink_id');
    if (!sinkID) return errorResponse(404, 'export_service_worker_sink_not_found');
    const session = this.state.sessions.get(sinkID);
    if (!session || session.terminal) return errorResponse(404, 'export_service_worker_sink_not_found');
    if (!session.clientId || !clientId || session.clientId !== clientId) {
      return errorResponse(403, 'export_service_worker_client_mismatch');
    }
    if (!session.begun) return errorResponse(409, 'export_sink_not_open');
    if (session.fetched) return errorResponse(409, 'export_service_worker_sink_in_use');

    session.fetched = true;
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        session.controller = controller;
        this.flush(session);
      },
      pull: () => {
        this.flush(session);
      },
      cancel: (reason) => {
        if (!session.terminal && !session.committed) {
          this.failSession(session, 'export_service_worker_stream_cancelled', reason);
        }
      },
    });
    const filename = safeHeaderValue(session.metadata.filename, 'usage-events.bin');
    const mimeType = safeHeaderValue(session.metadata.mimeType, 'application/octet-stream');
    return new Response(stream, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'X-Usage-Export-Sink': USAGE_EXPORT_SINK_PROTOCOL,
      },
    });
  }

  dispose(): void {
    [...this.state.sessions.values()].forEach((session) => {
      this.failSession(session, 'export_service_worker_disposed');
    });
  }

  private async handlePortMessage(session: Session, value: unknown): Promise<void> {
    if (!isRecord(value) || typeof value.type !== 'string') {
      this.post(session, { ok: false, code: 'export_service_worker_message_invalid' });
      return;
    }
    this.armTimeout(session);
    switch (value.type) {
      case 'capability':
        this.post(session, {
          ok: true,
          protocol: USAGE_EXPORT_SINK_PROTOCOL,
          maxChunkBytes: this.state.maxChunkBytes,
          atomic_commit: false,
        });
        return;
      case 'begin':
        this.begin(session, value.value);
        return;
      case 'write':
        this.write(session, value.value);
        return;
      case 'commit':
        this.commit(session);
        return;
      case 'abort':
        this.abort(session);
        return;
      default:
        this.post(session, { ok: false, code: 'export_service_worker_message_invalid' });
    }
    await Promise.resolve();
  }

  private begin(session: Session, value: unknown): void {
    if (session.terminal || session.begun || !sameMetadata(session.metadata, readMetadata(value) ?? {} as ExportMetadata)) {
      this.post(session, { ok: false, code: 'export_service_worker_metadata_mismatch' });
      return;
    }
    session.begun = true;
    this.post(session, {
      ok: true,
      atomic_commit: false,
      download_url: this.state.path + '?sink_id=' + encodeURIComponent(session.id),
    });
  }

  private write(session: Session, value: unknown): void {
    if (session.terminal || !session.begun || session.committed) {
      this.post(session, { ok: false, code: 'export_sink_not_open' });
      return;
    }
    if (typeof value !== 'string') {
      this.post(session, { ok: false, code: 'export_service_worker_chunk_invalid' });
      return;
    }
    const bytes = encoder.encode(value);
    const nextBytes = session.bytes + bytes.byteLength;
    if (
      bytes.byteLength > this.state.maxChunkBytes ||
      !Number.isSafeInteger(nextBytes) ||
      (session.metadata.maxBytes !== undefined && nextBytes > session.metadata.maxBytes)
    ) {
      this.post(session, { ok: false, code: 'export_size_limit_exceeded' });
      return;
    }
    if (session.pendingWrites.length >= this.state.maxPendingChunks) {
      this.post(session, { ok: false, code: 'export_service_worker_backpressure' });
      return;
    }
    session.bytes = nextBytes;
    session.pendingWrites.push({
      value: bytes,
      reply: (message) => this.post(session, message),
    });
    this.flush(session);
  }

  private commit(session: Session): void {
    if (session.terminal || !session.begun || session.committed) {
      this.post(session, { ok: false, code: 'export_sink_not_open' });
      return;
    }
    if (session.pendingCommit) {
      this.post(session, { ok: false, code: 'export_service_worker_message_invalid' });
      return;
    }
    session.pendingCommit = { reply: (message) => this.post(session, message) };
    this.flush(session);
  }

  private abort(session: Session): void {
    if (session.terminal || session.committed) {
      this.post(session, { ok: false, code: 'export_sink_not_open' });
      return;
    }
    this.failSession(session, 'export_service_worker_aborted');
    this.post(session, { ok: true, atomic_commit: false });
  }

  private flush(session: Session): void {
    const controller = session.controller;
    if (!controller || session.terminal) return;
    try {
      while (
        session.pendingWrites.length > 0 &&
        (controller.desiredSize === null || controller.desiredSize > 0)
      ) {
        const pending = session.pendingWrites.shift();
        if (!pending) break;
        controller.enqueue(pending.value);
        pending.reply({ ok: true, atomic_commit: false });
      }
      if (session.pendingCommit && session.pendingWrites.length === 0) {
        const pendingCommit = session.pendingCommit;
        session.pendingCommit = null;
        controller.close();
        session.committed = true;
        session.terminal = true;
        pendingCommit.reply({ ok: true, atomic_commit: false });
        this.deleteSession(session);
      }
    } catch {
      this.failSession(session, 'export_service_worker_stream_error');
    }
  }

  private failSession(session: Session, code: string, _reason?: unknown): void {
    if (session.terminal) {
      this.deleteSession(session);
      return;
    }
    session.terminal = true;
    session.controller?.error(new Error(code));
    session.pendingWrites.splice(0).forEach((pending) => {
      pending.reply({ ok: false, code });
    });
    if (session.pendingCommit) {
      const pendingCommit = session.pendingCommit;
      session.pendingCommit = null;
      pendingCommit.reply({ ok: false, code });
    }
    this.deleteSession(session);
  }

  private post(session: Session, message: Reply): void {
    try {
      session.port.postMessage(message);
    } catch {
      this.deleteSession(session);
    }
  }

  private armTimeout(session: Session): void {
    if (session.timer) clearTimeout(session.timer);
    session.timer = setTimeout(() => {
      this.failSession(session, 'export_service_worker_timeout');
    }, this.state.sessionTtlMs);
  }

  private deleteSession(session: Session): void {
    if (session.timer) clearTimeout(session.timer);
    session.timer = null;
    this.state.sessions.delete(session.id);
    setTimeout(() => session.port.close?.(), 0);
  }
}
