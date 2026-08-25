import crypto from 'crypto';

const SIGNER_CLOCK_SKEW_MS = 30_000;

const normalizeBody = (body) => (
  typeof body === 'string' ? body : JSON.stringify(body ?? {})
);

const buildPayload = ({ timestamp, method, path, body }) => [
  String(timestamp),
  String(method || 'POST').toUpperCase(),
  String(path || '/'),
  normalizeBody(body)
].join('\n');

export const createSignerSignature = ({ secret, timestamp, method, path, body }) => (
  crypto
    .createHmac('sha256', String(secret || ''))
    .update(buildPayload({ timestamp, method, path, body }))
    .digest('hex')
);

export const buildSignerAuthHeaders = ({ secret, method, path, body }) => {
  const timestamp = Date.now().toString();
  return {
    'x-signer-timestamp': timestamp,
    'x-signer-signature': createSignerSignature({ secret, timestamp, method, path, body })
  };
};

const timingSafeHexEqual = (left, right) => {
  if (!/^[a-f0-9]{64}$/i.test(String(left || '')) || !/^[a-f0-9]{64}$/i.test(String(right || ''))) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
};

export const verifySignerRequest = ({ secret, timestamp, signature, method, path, body, now = Date.now() }) => {
  const numericTimestamp = Number(timestamp);
  if (!Number.isFinite(numericTimestamp) || Math.abs(now - numericTimestamp) > SIGNER_CLOCK_SKEW_MS) {
    return { ok: false, code: 'SIGNER_REQUEST_EXPIRED' };
  }

  const expected = createSignerSignature({ secret, timestamp, method, path, body });
  if (!timingSafeHexEqual(signature, expected)) {
    return { ok: false, code: 'SIGNER_SIGNATURE_INVALID' };
  }

  return { ok: true };
};

export const MIN_SIGNER_SECRET_LENGTH = 32;
