export type PayloadParamValueType = 'string' | 'number' | 'boolean' | 'json';
export type DisableImageGenerationMode = 'false' | 'true' | 'chat';
export type PluginStoreAuthType = 'none' | 'bearer' | 'basic' | 'header' | 'github-token';
export type PluginStoreAuthApplyTo = 'registry' | 'metadata' | 'artifact';
export type PayloadParamValidationErrorCode =
  | 'payload_invalid_number'
  | 'payload_invalid_boolean'
  | 'payload_invalid_json';

export type VisualScopedPoolNumericField =
  | 'limit'
  | 'quotaThresholdPercent'
  | 'consecutiveErrorThreshold'
  | 'penaltyWindowSeconds'
  | 'quotaSnapshotTTLSeconds'
  | 'idleLogThrottleSeconds';

export type VisualConfigFieldPath =
  | 'port'
  | 'errorLogsMaxFiles'
  | 'logsMaxTotalSizeMb'
  | 'redisUsageQueueRetentionSeconds'
  | 'requestRetry'
  | 'maxRetryCredentials'
  | 'maxRetryInterval'
  | 'authAutoRefreshWorkers'
  | 'quotaAutoDisableAuthFileQuotaThresholdPercent'
  | 'routingScopedPoolDefaultsLimit'
  | 'routingScopedPoolDefaultsQuotaThresholdPercent'
  | 'routingScopedPoolDefaultsConsecutiveErrorThreshold'
  | 'routingScopedPoolDefaultsPenaltyWindowSeconds'
  | 'routingScopedPoolDefaultsQuotaSnapshotTTLSeconds'
  | 'routingScopedPoolDefaultsIdleLogThrottleSeconds'
  | 'routingScopedPoolEnabled'
  | 'routingScopedPoolProviders'
  | 'streaming.keepaliveSeconds'
  | 'streaming.bootstrapRetries'
  | 'streaming.nonstreamKeepaliveInterval';

export type VisualConfigValidationErrorCode =
  | 'port_range'
  | 'non_negative_integer'
  | 'quota_threshold_percent_range'
  | 'duplicate_provider_key';

export type VisualConfigValidationErrors = Partial<
  Record<VisualConfigFieldPath, VisualConfigValidationErrorCode>
>;

export type PayloadParamEntry = {
  id: string;
  path: string;
  valueType: PayloadParamValueType;
  value: string;
};

export type PayloadHeaderEntry = {
  id: string;
  name: string;
  value: string;
};

export type PayloadModelEntry = {
  id: string;
  name: string;
  protocol?: string;
  fromProtocol?: string;
  headers?: PayloadHeaderEntry[];
  match?: PayloadParamEntry[];
  notMatch?: PayloadParamEntry[];
  exist?: string[];
  notExist?: string[];
};

export type PayloadRule = {
  id: string;
  models: PayloadModelEntry[];
  params: PayloadParamEntry[];
};

export type PayloadFilterRule = {
  id: string;
  models: PayloadModelEntry[];
  params: string[];
};

export interface StreamingConfig {
  keepaliveSeconds: string;
  bootstrapRetries: string;
  nonstreamKeepaliveInterval: string;
}

export interface VisualScopedPoolProviderEntry {
  id: string;
  provider: string;
  enabled: boolean;
  limit: string;
  quotaThresholdPercent: string;
  consecutiveErrorThreshold: string;
  penaltyWindowSeconds: string;
  quotaSnapshotTTLSeconds: string;
  idleLogThrottleSeconds: string;
}

export type PluginStoreAuthRule = {
  id: string;
  match: string;
  applyTo: PluginStoreAuthApplyTo[];
  type: PluginStoreAuthType;
  tokenEnv: string;
  usernameEnv: string;
  passwordEnv: string;
  headerName: string;
  headerValueEnv: string;
  allowInsecure: boolean;
};

export type VisualConfigValues = {
  host: string;
  port: string;
  tlsEnable: boolean;
  tlsCert: string;
  tlsKey: string;
  rmAllowRemote: boolean;
  rmSecretKey: string;
  rmDisableControlPanel: boolean;
  rmDisableAutoUpdatePanel: boolean;
  rmPanelRepo: string;
  authDir: string;
  apiKeysText: string;
  pluginsEnabled: boolean;
  pluginStoreSources: string[];
  pluginStoreAuth: PluginStoreAuthRule[];
  debug: boolean;
  commercialMode: boolean;
  loggingToFile: boolean;
  logsMaxTotalSizeMb: string;
  errorLogsMaxFiles: string;
  usageStatisticsEnabled: boolean;
  redisUsageQueueRetentionSeconds: string;
  proxyUrl: string;
  forceModelPrefix: boolean;
  passthroughHeaders: boolean;
  requestRetry: string;
  maxRetryCredentials: string;
  maxRetryInterval: string;
  disableCooling: boolean;
  disableImageGeneration: DisableImageGenerationMode;
  gptImage2BaseModel: string;
  authAutoRefreshWorkers: string;
  quotaSwitchProject: boolean;
  quotaSwitchPreviewModel: boolean;
  quotaAutoDisableAuthFileOnLowQuota: boolean;
  quotaAutoDisableAuthFileQuotaThresholdPercent: string;
  quotaAntigravityCredits: boolean;
  routingStrategy: 'round-robin' | 'fill-first';
  routingScopedPoolEnabled: boolean;
  routingScopedPoolDefaultsLimit: string;
  routingScopedPoolDefaultsQuotaThresholdPercent: string;
  routingScopedPoolDefaultsConsecutiveErrorThreshold: string;
  routingScopedPoolDefaultsPenaltyWindowSeconds: string;
  routingScopedPoolDefaultsQuotaSnapshotTTLSeconds: string;
  routingScopedPoolDefaultsIdleLogThrottleSeconds: string;
  routingScopedPoolProviders: VisualScopedPoolProviderEntry[];
  routingSessionAffinity: boolean;
  routingSessionAffinityTTL: string;
  wsAuth: boolean;
  antigravitySignatureCacheEnabled: boolean;
  antigravitySignatureBypassStrict: boolean;
  claudeHeaderUserAgent: string;
  claudeHeaderPackageVersion: string;
  claudeHeaderRuntimeVersion: string;
  claudeHeaderOs: string;
  claudeHeaderArch: string;
  claudeHeaderTimeout: string;
  claudeHeaderStabilizeDeviceProfile: boolean;
  codexHeaderUserAgent: string;
  codexHeaderBetaFeatures: string;
  codexIdentityConfuse: boolean;
  payloadDefaultRules: PayloadRule[];
  payloadDefaultRawRules: PayloadRule[];
  payloadOverrideRules: PayloadRule[];
  payloadOverrideRawRules: PayloadRule[];
  payloadFilterRules: PayloadFilterRule[];
  streaming: StreamingConfig;
};

export const makeClientId = () => {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};

export const DEFAULT_VISUAL_VALUES: VisualConfigValues = {
  host: '',
  port: '',
  tlsEnable: false,
  tlsCert: '',
  tlsKey: '',
  rmAllowRemote: false,
  rmSecretKey: '',
  rmDisableControlPanel: false,
  rmDisableAutoUpdatePanel: false,
  rmPanelRepo: '',
  authDir: '',
  apiKeysText: '',
  pluginsEnabled: false,
  pluginStoreSources: [],
  pluginStoreAuth: [],
  debug: false,
  commercialMode: false,
  loggingToFile: false,
  logsMaxTotalSizeMb: '',
  errorLogsMaxFiles: '',
  usageStatisticsEnabled: false,
  redisUsageQueueRetentionSeconds: '',
  proxyUrl: '',
  forceModelPrefix: false,
  passthroughHeaders: false,
  requestRetry: '',
  maxRetryCredentials: '',
  maxRetryInterval: '',
  disableCooling: false,
  disableImageGeneration: 'false',
  gptImage2BaseModel: '',
  authAutoRefreshWorkers: '',
  quotaSwitchProject: true,
  quotaSwitchPreviewModel: true,
  quotaAutoDisableAuthFileOnLowQuota: false,
  quotaAutoDisableAuthFileQuotaThresholdPercent: '0',
  quotaAntigravityCredits: false,
  routingStrategy: 'round-robin',
  routingScopedPoolEnabled: false,
  routingScopedPoolDefaultsLimit: '',
  routingScopedPoolDefaultsQuotaThresholdPercent: '',
  routingScopedPoolDefaultsConsecutiveErrorThreshold: '',
  routingScopedPoolDefaultsPenaltyWindowSeconds: '',
  routingScopedPoolDefaultsQuotaSnapshotTTLSeconds: '',
  routingScopedPoolDefaultsIdleLogThrottleSeconds: '',
  routingScopedPoolProviders: [],
  routingSessionAffinity: false,
  routingSessionAffinityTTL: '',
  wsAuth: false,
  antigravitySignatureCacheEnabled: true,
  antigravitySignatureBypassStrict: false,
  claudeHeaderUserAgent: '',
  claudeHeaderPackageVersion: '',
  claudeHeaderRuntimeVersion: '',
  claudeHeaderOs: '',
  claudeHeaderArch: '',
  claudeHeaderTimeout: '',
  claudeHeaderStabilizeDeviceProfile: false,
  codexHeaderUserAgent: '',
  codexHeaderBetaFeatures: '',
  codexIdentityConfuse: false,
  payloadDefaultRules: [],
  payloadDefaultRawRules: [],
  payloadOverrideRules: [],
  payloadOverrideRawRules: [],
  payloadFilterRules: [],
  streaming: {
    keepaliveSeconds: '',
    bootstrapRetries: '',
    nonstreamKeepaliveInterval: '',
  },
};
