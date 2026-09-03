type EventRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is EventRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const stableSerialize = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};

export const usageEventIdentityKey = (item: unknown): string => {
  const record = isRecord(item) ? item : {};
  const stableID = typeof record.stable_event_id === 'string' ? record.stable_event_id.trim() : '';
  if (stableID) return `stable:${stableID}`;
  const requestID = typeof record.request_id === 'string' ? record.request_id.trim() : '';
  if (requestID) {
    const role = typeof record.detail_role === 'string' ? record.detail_role.trim() : '';
    const sequence = typeof record.detail_sequence === 'string'
      ? record.detail_sequence.trim()
      : typeof record.detail_sequence === 'number' && Number.isSafeInteger(record.detail_sequence)
        ? String(record.detail_sequence)
        : '';
    if (role || sequence) return `request:${requestID}\u001frole:${role}\u001fsequence:${sequence}`;
    return `request:${requestID}\u001fpayload:${stableSerialize(record)}`;
  }
  return `payload:${stableSerialize(record)}`;
};

/** Add a deterministic occurrence suffix only when the payload has no server identity. */
export const usageEventOccurrenceKey = (item: unknown, occurrence: number): string => {
  const identity = usageEventIdentityKey(item);
  const record = isRecord(item) ? item : {};
  const hasServerIdentity =
    (typeof record.stable_event_id === 'string' && record.stable_event_id.trim() !== '') ||
    (typeof record.request_id === 'string' && record.request_id.trim() !== '' &&
      (typeof record.detail_role === 'string' && record.detail_role.trim() !== '' ||
        typeof record.detail_sequence === 'string' && record.detail_sequence.trim() !== '' ||
        typeof record.detail_sequence === 'number' && Number.isSafeInteger(record.detail_sequence)));
  if (hasServerIdentity) return identity;
  const ordinal = Number.isSafeInteger(occurrence) && occurrence >= 0 ? occurrence : 0;
  return `${identity}\u001foccurrence:${ordinal}`;
};

export const compareUsageEventIdentity = (left: unknown, right: unknown): number =>
  usageEventIdentityKey(left).localeCompare(usageEventIdentityKey(right));
