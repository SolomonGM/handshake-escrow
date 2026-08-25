import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSignerAuthHeaders,
  verifySignerRequest
} from '../utils/signerAuth.js';
import {
  calculateFeeBreakdown,
  calculatePlatformFee
} from '../config/pricing.js';

test('signer authentication accepts an intact request and rejects body tampering', () => {
  const secret = 'test-secret-that-is-at-least-32-characters';
  const path = '/transfers';
  const body = JSON.stringify({ transferId: 'WTR-1', amountCrypto: '1.25' });
  const headers = buildSignerAuthHeaders({ secret, method: 'POST', path, body });

  assert.deepEqual(verifySignerRequest({
    secret,
    timestamp: headers['x-signer-timestamp'],
    signature: headers['x-signer-signature'],
    method: 'POST',
    path,
    body
  }), { ok: true });

  assert.equal(verifySignerRequest({
    secret,
    timestamp: headers['x-signer-timestamp'],
    signature: headers['x-signer-signature'],
    method: 'POST',
    path,
    body: `${body}tampered`
  }).code, 'SIGNER_SIGNATURE_INVALID');
});

test('signer authentication rejects stale requests', () => {
  const secret = 'test-secret-that-is-at-least-32-characters';
  const timestamp = '1000';
  const result = verifySignerRequest({
    secret,
    timestamp,
    signature: '0'.repeat(64),
    method: 'POST',
    path: '/transfers',
    body: '{}',
    now: 100_000
  });
  assert.equal(result.code, 'SIGNER_REQUEST_EXPIRED');
});

test('pricing boundaries and partial credits preserve principal', () => {
  assert.equal(calculatePlatformFee(50), 1.5);
  assert.equal(calculatePlatformFee(1000), 15);
  assert.equal(calculatePlatformFee(10000), 100);
  assert.deepEqual(calculateFeeBreakdown(1000, 12), {
    dealAmount: 1000,
    platformFee: 15,
    creditApplied: 12,
    feeDue: 3,
    totalDue: 1003
  });
});
