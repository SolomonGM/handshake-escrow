import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeTicketSafety,
  buildDealAgreementDigest,
  detectLiveSafetySignals,
  normalizeDealAgreement,
  validateDealAgreement
} from '../services/aiSafetyService.js';

const validAgreement = normalizeDealAgreement({
  category: 'tangible_goods',
  title: 'Used graphics card with recorded serial',
  description: 'A working used graphics card with the serial number and condition recorded before shipping.',
  deliverables: ['Graphics card matching the recorded serial', 'Original power adapter'],
  deliveryMethod: 'Tracked courier with signature, serial-number photos, and package-condition photos',
  deliveryDeadline: '2030-01-10T12:00:00.000Z',
  inspectionPeriodHours: 48,
  acceptanceCriteria: ['Serial number matches', 'Card powers on and passes the agreed benchmark'],
  refundTerms: 'Full refund after tracked return if the serial does not match or the card fails the agreed test.'
});

test('deal agreement digest is stable and changes when a material term changes', () => {
  assert.deepEqual(validateDealAgreement(validAgreement), []);
  const first = buildDealAgreementDigest(validAgreement);
  const second = buildDealAgreementDigest({ ...validAgreement });
  const revised = buildDealAgreementDigest({ ...validAgreement, inspectionPeriodHours: 24 });
  assert.equal(first, second);
  assert.notEqual(first, revised);
});

test('live safety rules detect wallet-secret and payment-diversion requests', () => {
  const signals = detectLiveSafetySignals(
    'Send me your seed phrase, then transfer directly to my new wallet address.'
  );
  assert.ok(signals.some((signal) => signal.code === 'SECRET_REQUEST'));
  assert.ok(signals.some((signal) => signal.code === 'OFF_PLATFORM_PAYMENT'));
});

test('safety analysis falls back to deterministic rules without an AI provider', async () => {
  const previousEnabled = process.env.AI_SAFETY_ENABLED;
  process.env.AI_SAFETY_ENABLED = 'false';
  try {
    const result = await analyzeTicketSafety({
      safetyIdentifier: 'test-user',
      ticket: {
        dealAmount: 500,
        cryptocurrency: 'usdc-erc20',
        dealAgreement: { ...validAgreement, digest: buildDealAgreementDigest(validAgreement) },
        messages: []
      }
    });
    assert.equal(result.status, 'complete');
    assert.equal(result.engine, 'rules-v1');
    assert.equal(result.dealDigest, buildDealAgreementDigest(validAgreement));
    assert.ok(['low', 'medium', 'high'].includes(result.riskLevel));
  } finally {
    if (previousEnabled === undefined) delete process.env.AI_SAFETY_ENABLED;
    else process.env.AI_SAFETY_ENABLED = previousEnabled;
  }
});
