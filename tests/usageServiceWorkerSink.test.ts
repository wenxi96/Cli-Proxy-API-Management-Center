import { describe, expect, test } from 'bun:test';
import {
  SERVICE_WORKER_MAX_CHUNK_BYTES,
  getUsageExportSinkPathForScope,
  USAGE_EXPORT_SINK_PATH,
  USAGE_EXPORT_SINK_PROTOCOL,
  UsageExportSinkReceiver,
} from '../src/utils/usage/serviceWorkerReceiver';

const metadata = {
  filename: 'usage-events.json',
  mimeType: 'application/json;charset=utf-8',
  maxBytes: 32,
};

const waitForPortMessage = (port: MessagePort): Promise<Record<string, unknown>> =>
  new Promise((resolve) => {
    port.addEventListener('message', (event) => resolve(event.data as Record<string, unknown>), {
      once: true,
    });
    port.start();
  });

const request = async (
  port: MessagePort,
  message: Record<string, unknown>
): Promise<Record<string, unknown>> => {
  const response = waitForPortMessage(port);
  port.postMessage(message);
  return response;
};

const createReceiverSession = () => {
  const receiver = new UsageExportSinkReceiver({
    idFactory: () => 'sink-test-1',
    origin: 'https://app.test',
  });
  const channel = new MessageChannel();
  receiver.handleMessage({
    data: {
      type: 'usage-export-capability',
      protocol: USAGE_EXPORT_SINK_PROTOCOL,
      metadata,
    },
    ports: [channel.port2],
    source: { id: 'client-1' },
  });
  return { receiver, channel };
};

describe('usage-events-v2 service-worker sink receiver', () => {
  test('derives a sink endpoint inside the worker scope', () => {
    expect(getUsageExportSinkPathForScope('https://app.test/management/')).toBe(
      '/management/__usage-events-v2-sink'
    );
    expect(getUsageExportSinkPathForScope('https://app.test/')).toBe(USAGE_EXPORT_SINK_PATH);
  });

  test('handshakes, streams chunks, and closes only on commit', async () => {
    const { receiver, channel } = createReceiverSession();
    const capability = await request(channel.port1, { type: 'capability' });

    expect(capability).toMatchObject({
      ok: true,
      protocol: USAGE_EXPORT_SINK_PROTOCOL,
      maxChunkBytes: SERVICE_WORKER_MAX_CHUNK_BYTES,
      atomic_commit: false,
    });

    const begin = await request(channel.port1, { type: 'begin', value: metadata });
    expect(begin).toMatchObject({ ok: true, atomic_commit: false });
    expect(begin.download_url).toBe(`${USAGE_EXPORT_SINK_PATH}?sink_id=sink-test-1`);

    const response = receiver.handleFetch(
      new Request(`https://app.test${begin.download_url as string}`),
      'client-1'
    );
    expect(response?.status).toBe(200);
    expect(response?.headers.get('content-disposition')).toContain('usage-events.json');

    const reader = response?.body?.getReader();
    expect(reader).toBeDefined();
    const write = request(channel.port1, { type: 'write', value: 'hello' });
    expect(await write).toMatchObject({ ok: true, atomic_commit: false });
    expect(new TextDecoder().decode((await reader!.read()).value)).toBe('hello');

    const commit = await request(channel.port1, { type: 'commit' });
    expect(commit).toEqual({ ok: true, atomic_commit: false });
    expect((await reader!.read()).done).toBe(true);
  });

  test('rejects a different client and enforces bounded chunks and bytes', async () => {
    const { receiver, channel } = createReceiverSession();
    await request(channel.port1, { type: 'capability' });
    const begin = await request(channel.port1, { type: 'begin', value: metadata });
    const response = receiver.handleFetch(
      new Request(`https://app.test${begin.download_url as string}`),
      'other-client'
    );
    expect(response?.status).toBe(403);

    const acceptedResponse = receiver.handleFetch(
      new Request(`https://app.test${begin.download_url as string}`),
      'client-1'
    );
    const reader = acceptedResponse?.body?.getReader();
    expect(reader).toBeDefined();
    const tooLarge = await request(channel.port1, {
      type: 'write',
      value: 'x'.repeat(SERVICE_WORKER_MAX_CHUNK_BYTES + 1),
    });
    expect(tooLarge).toEqual({ ok: false, code: 'export_size_limit_exceeded' });

    const withinChunkButOverBudget = await request(channel.port1, {
      type: 'write',
      value: 'x'.repeat(metadata.maxBytes + 1),
    });
    expect(withinChunkButOverBudget).toEqual({ ok: false, code: 'export_size_limit_exceeded' });
    await reader?.cancel();
  });

  test('rejects a fetch that omits the bound client identity', async () => {
    const { receiver, channel } = createReceiverSession();
    await request(channel.port1, { type: 'capability' });
    const begin = await request(channel.port1, { type: 'begin', value: metadata });
    const response = receiver.handleFetch(
      new Request(`https://app.test${begin.download_url as string}`)
    );
    expect(response?.status).toBe(403);
  });

  test('rejects a session that has no bound client identity', async () => {
    const receiver = new UsageExportSinkReceiver({
      idFactory: () => 'sink-unbound-1',
      origin: 'https://app.test',
    });
    const channel = new MessageChannel();
    receiver.handleMessage({
      data: {
        type: 'usage-export-capability',
        protocol: USAGE_EXPORT_SINK_PROTOCOL,
        metadata,
      },
      ports: [channel.port2],
    });
    await request(channel.port1, { type: 'capability' });
    const begin = await request(channel.port1, { type: 'begin', value: metadata });
    const response = receiver.handleFetch(
      new Request(`https://app.test${begin.download_url as string}`),
      'client-1'
    );
    expect(response?.status).toBe(403);
  });

  test('abort errors the response and never reports atomic commit', async () => {
    const { receiver, channel } = createReceiverSession();
    await request(channel.port1, { type: 'capability' });
    const begin = await request(channel.port1, { type: 'begin', value: metadata });
    const response = receiver.handleFetch(
      new Request(`https://app.test${begin.download_url as string}`),
      'client-1'
    );
    const reader = response?.body?.getReader();
    expect(reader).toBeDefined();

    const abort = await request(channel.port1, { type: 'abort', value: 'cancelled' });
    expect(abort).toEqual({ ok: true, atomic_commit: false });
    await expect(reader!.read()).rejects.toBeDefined();
  });
});
