/**
 * Pure Web Crypto API Web Push sender (VAPID RFC 8292 + aes128gcm RFC 8291).
 * Zero Node.js dependencies — runs natively in Cloudflare Workers and modern JS runtimes.
 */

export interface PushAction {
  action: string;
  title: string;
}

export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
  actions?: PushAction[];
  ttlSeconds?: number;
  urgency?: 'very-low' | 'low' | 'normal' | 'high';
}

export interface PushSubscriptionKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export interface PushSendResult {
  ok: boolean;
  status: number;
  expired: boolean;
  retryable: boolean;
  errorMessage?: string;
  rttMs?: number;
  providerResponseAt?: string;
}

export function base64UrlToBytes(input: string): Uint8Array {
  const padded = input + '='.repeat((4 - (input.length % 4)) % 4);
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

async function hkdfExpand(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info,
    },
    key,
    length * 8
  );
  return new Uint8Array(bits);
}

/**
 * Generates an ES256 VAPID JWT signed with the private P-256 key.
 */
export async function createVapidJwt(
  endpoint: string,
  vapid: VapidConfig,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): Promise<string> {
  const pubBytes = base64UrlToBytes(vapid.publicKey);
  if (pubBytes.length !== 65 || pubBytes[0] !== 0x04) {
    throw new Error('Invalid VAPID public key format (expected 65-byte uncompressed P-256)');
  }
  const privBytes = base64UrlToBytes(vapid.privateKey);
  if (privBytes.length !== 32) {
    throw new Error('Invalid VAPID private key format (expected 32-byte P-256 scalar)');
  }

  const x = bytesToBase64Url(pubBytes.slice(1, 33));
  const y = bytesToBase64Url(pubBytes.slice(33, 65));
  const d = bytesToBase64Url(privBytes);

  const signingKey = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x, y, d },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const origin = new URL(endpoint).origin;
  const encoder = new TextEncoder();
  const headerB64 = bytesToBase64Url(
    encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))
  );
  const payloadB64 = bytesToBase64Url(
    encoder.encode(
      JSON.stringify({
        aud: origin,
        exp: nowSeconds + 12 * 3600,
        sub: vapid.subject,
      })
    )
  );

  const signingInput = `${headerB64}.${payloadB64}`;
  const sigBuf = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    signingKey,
    encoder.encode(signingInput)
  );

  const sigB64 = bytesToBase64Url(new Uint8Array(sigBuf));
  return `${signingInput}.${sigB64}`;
}

/**
 * Encrypts a push payload using RFC 8291 (`aes128gcm`) with ECDH P-256 + HKDF-SHA-256.
 */
export async function encryptWebPushPayload(
  payload: PushPayload,
  subscription: Pick<PushSubscriptionKeys, 'p256dh' | 'auth'>
): Promise<Uint8Array> {
  const uaPublicBytes = base64UrlToBytes(subscription.p256dh);
  const authSecret = base64UrlToBytes(subscription.auth);

  if (uaPublicBytes.length !== 65 || uaPublicBytes[0] !== 0x04) {
    throw new Error('Invalid subscriber p256dh key');
  }
  if (authSecret.length !== 16) {
    throw new Error('Invalid subscriber auth secret');
  }

  const uaPublicKey = await crypto.subtle.importKey(
    'raw',
    uaPublicBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  const asKeyPair = (await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  )) as CryptoKeyPair;

  const asPublicBytes = new Uint8Array(
    (await crypto.subtle.exportKey('raw', asKeyPair.publicKey)) as ArrayBuffer
  );

  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: uaPublicKey } as unknown as Parameters<typeof crypto.subtle.deriveBits>[0],
      asKeyPair.privateKey,
      256
    )
  );

  const encoder = new TextEncoder();
  const keyInfo = concatBytes(
    encoder.encode('WebPush: info\0'),
    uaPublicBytes,
    asPublicBytes
  );
  const ikm = await hkdfExpand(authSecret, ecdhSecret, keyInfo, 32);

  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);

  const cek = await hkdfExpand(
    salt,
    ikm,
    encoder.encode('Content-Encoding: aes128gcm\0'),
    16
  );
  const nonce = await hkdfExpand(
    salt,
    ikm,
    encoder.encode('Content-Encoding: nonce\0'),
    12
  );

  const plaintext = concatBytes(
    encoder.encode(JSON.stringify(payload)),
    new Uint8Array([0x02])
  );

  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, plaintext)
  );

  const header = new Uint8Array(21 + asPublicBytes.length);
  header.set(salt, 0);
  const view = new DataView(header.buffer);
  view.setUint32(16, 4096, false);
  header[20] = asPublicBytes.length;
  header.set(asPublicBytes, 21);

  return concatBytes(header, ciphertext);
}

export async function sendWebPushOnce(
  subscription: PushSubscriptionKeys,
  payload: PushPayload,
  vapid: VapidConfig
): Promise<PushSendResult> {
  const startedAt = Date.now();
  try {
    const [jwt, encryptedBody] = await Promise.all([
      createVapidJwt(subscription.endpoint, vapid),
      encryptWebPushPayload(payload, subscription),
    ]);

    const ttl = String(payload.ttlSeconds ?? 3600);
    const urgency = payload.urgency ?? 'normal';

    const res = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: ttl,
        Urgency: urgency,
      },
      body: encryptedBody,
    });
    const rttMs = Date.now() - startedAt;
    const providerResponseAt = new Date().toISOString();

    if (res.status >= 200 && res.status < 300) {
      return { ok: true, status: res.status, expired: false, retryable: false, rttMs, providerResponseAt };
    }

    const expired = res.status === 404 || res.status === 410;
    const retryable = res.status === 429 || res.status >= 500;
    return {
      ok: false,
      status: res.status,
      expired,
      retryable,
      rttMs,
      providerResponseAt,
      errorMessage: `Push service HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      expired: false,
      retryable: true,
      rttMs: Date.now() - startedAt,
      providerResponseAt: new Date().toISOString(),
      errorMessage: err instanceof Error ? err.message.slice(0, 160) : 'Network error',
    };
  }
}

export async function sendWebPushWithRetry(
  subscription: PushSubscriptionKeys,
  payload: PushPayload,
  vapid: VapidConfig,
  maxRetries: number = 2
): Promise<PushSendResult> {
  let attempt = 0;
  let lastResult: PushSendResult = {
    ok: false,
    status: 0,
    expired: false,
    retryable: false,
  };

  while (attempt <= maxRetries) {
    lastResult = await sendWebPushOnce(subscription, payload, vapid);
    if (lastResult.ok || !lastResult.retryable || attempt === maxRetries) {
      return lastResult;
    }
    attempt += 1;
    // Brief bounded backoff suitable for 10ms Worker CPU limits
    await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
  }

  return lastResult;
}
