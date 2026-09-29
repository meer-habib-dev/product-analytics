type CryptoLike = { randomUUID?: () => string; getRandomValues?: <T extends ArrayBufferView>(array: T) => T };

/**
 * RFC 4122 v4 UUID. Hermes has no `crypto` by default, so this falls back to
 * Math.random; event ids only need to be unique per project for dedupe.
 */
export function uuid(): string {
  const cryptoApi = (globalThis as { crypto?: CryptoLike }).crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();

  const bytes = new Uint8Array(16);
  if (cryptoApi?.getRandomValues) cryptoApi.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);

  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function prefixedId(prefix: string): string {
  return `${prefix}_${uuid().replace(/-/g, "")}`;
}
