import {
 getUsageExportSinkPathForScope,
  UsageExportSinkReceiver,
  type UsageExportSinkReceiverOptions,
} from '@/utils/usage/serviceWorkerReceiver';

type ExtendableEventLike = {
  waitUntil: (promise: Promise<unknown>) => void;
};

type FetchEventLike = ExtendableEventLike & {
  request: { url: string; method?: string };
  clientId?: string;
  respondWith: (response: Response | Promise<Response>) => void;
};

type ServiceWorkerScopeLike = {
  addEventListener: (type: string, listener: (event: unknown) => void) => void;
  skipWaiting: () => Promise<void>;
  clients: { claim: () => Promise<void> };
  location: { origin: string };
  registration: { scope: string };
};

const scope = globalThis as unknown as ServiceWorkerScopeLike;
const receiverOptions: UsageExportSinkReceiverOptions = {
  origin: scope.location.origin,
  path: getUsageExportSinkPathForScope(scope.registration.scope),
};
const receiver = new UsageExportSinkReceiver(receiverOptions);

scope.addEventListener('install', (event: unknown) => {
  (event as ExtendableEventLike).waitUntil(scope.skipWaiting());
});

scope.addEventListener('activate', (event: unknown) => {
  (event as ExtendableEventLike).waitUntil(scope.clients.claim());
});

scope.addEventListener('message', (event: unknown) => {
  receiver.handleMessage(event as Parameters<UsageExportSinkReceiver['handleMessage']>[0]);
});

scope.addEventListener('fetch', (event: unknown) => {
  const fetchEvent = event as FetchEventLike;
  const response = receiver.handleFetch(fetchEvent.request, fetchEvent.clientId);
  if (response) fetchEvent.respondWith(response);
});
