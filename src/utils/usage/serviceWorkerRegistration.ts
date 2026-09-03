export type UsageExportServiceWorkerContainer = {
  register: (
    scriptURL: string | URL,
    options?: Record<string, unknown>
  ) => Promise<unknown>;
};

const getDefaultContainer = (): UsageExportServiceWorkerContainer | null => {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return null;
  return navigator.serviceWorker as unknown as UsageExportServiceWorkerContainer;
};

const getDocumentBaseURI = (): string =>
  typeof document === 'undefined' ? 'http://localhost/' : document.baseURI;

export const getUsageExportServiceWorkerScope = (baseURI = getDocumentBaseURI()): string =>
  new URL('./', new URL(baseURI, 'http://localhost/')).pathname;

export const getUsageExportServiceWorkerURL = (baseURI = getDocumentBaseURI()): string => {
  const documentURL = new URL(baseURI, 'http://localhost/');
  const scopeURL = new URL(getUsageExportServiceWorkerScope(baseURI), documentURL);
  return new URL('usageExportSink.service-worker.js', scopeURL).pathname;
};

export const registerUsageExportServiceWorker = async (
  container: UsageExportServiceWorkerContainer | null | undefined = getDefaultContainer()
): Promise<unknown | null> => {
  if (!container) return null;
  const baseURI = typeof document === 'undefined' ? 'http://localhost/' : document.baseURI;
  const scriptURL = getUsageExportServiceWorkerURL(baseURI);
  try {
    return await container.register(scriptURL, {
      type: 'module',
      scope: getUsageExportServiceWorkerScope(baseURI),
      updateViaCache: 'none',
    });
  } catch {
    return null;
  }
};
