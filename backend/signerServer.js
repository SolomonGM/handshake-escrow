import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import connectDB from './config/database.js';
import SignerTransfer from './models/SignerTransfer.js';
import WalletTransfer from './models/WalletTransfer.js';
import TradeTicket from './models/TradeTicket.js';
import PassOrder from './models/PassOrder.js';
import User from './models/User.js';
import {
  executeLocalTransfer,
  getPayoutConfirmationNetwork
} from './services/ticketPayoutService.js';
import { deriveAddressForChain, resolveDepositChain, selfTest as walletSelfTest } from './services/hdWalletService.js';
import { isStaffUser } from './utils/staffUtils.js';
import { MIN_SIGNER_SECRET_LENGTH, verifySignerRequest } from './utils/signerAuth.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.SIGNER_PORT || 5055);
const SIGNER_TOKEN = String(process.env.SIGNER_SERVICE_TOKEN || '').trim();
const SUPPORTED_CURRENCIES = new Set([
  'bitcoin',
  'litecoin',
  'ethereum',
  'solana',
  'usdt-erc20',
  'usdc-erc20',
  'usdt-spl',
  'usdc-spl'
]);

const MAX_TRANSFER_USD_BY_PURPOSE = {
  ticket_payout: Number(process.env.SIGNER_MAX_TICKET_PAYOUT_USD || process.env.MAX_TICKET_PAYOUT_USD || 2500),
  ticket_refund: Number(process.env.SIGNER_MAX_TICKET_REFUND_USD || process.env.MAX_TICKET_REFUND_USD || 2500),
  pass_refund: Number(process.env.SIGNER_MAX_PASS_REFUND_USD || process.env.MAX_PASS_REFUND_USD || 500)
};

const fail = (res, status, code, message) => res.status(status).json({
  success: false,
  code,
  message
});

const requireSignerAuth = (req, res, next) => {
  if (!SIGNER_TOKEN) {
    return fail(res, 503, 'SIGNER_TOKEN_MISSING', 'Signer token is not configured.');
  }

  const verification = verifySignerRequest({
    secret: SIGNER_TOKEN,
    timestamp: req.headers['x-signer-timestamp'],
    signature: req.headers['x-signer-signature'],
    method: req.method,
    path: req.path,
    body: req.rawBody || ''
  });
  if (!verification.ok) {
    return fail(res, 401, verification.code, 'Unauthorized or expired signer request.');
  }

  return next();
};

const normalizeTransferRequest = (body, idempotencyHeader) => {
  const request = {
    transferId: String(body?.transferId || '').trim(),
    idempotencyKey: String(idempotencyHeader || body?.idempotencyKey || '').trim(),
    purpose: String(body?.purpose || '').trim(),
    currency: String(body?.currency || '').trim().toLowerCase(),
    chain: String(body?.chain || '').trim().toLowerCase(),
    token: String(body?.token || '').trim().toLowerCase(),
    networkMode: String(body?.networkMode || '').trim().toLowerCase(),
    fromAddress: String(body?.fromAddress || body?.depositAddress || '').trim(),
    derivationIndex: Number(body?.derivationIndex),
    toAddress: String(body?.toAddress || '').trim(),
    amountCrypto: String(body?.amountCrypto || '').trim(),
    amountUsd: Number(body?.amountUsd),
    sourceType: String(body?.sourceType || '').trim(),
    sourceId: String(body?.sourceId || '').trim()
  };

  const errors = [];
  if (!request.transferId) errors.push('transferId');
  if (!request.idempotencyKey) errors.push('idempotencyKey');
  if (!['ticket_payout', 'ticket_refund', 'pass_refund'].includes(request.purpose)) errors.push('purpose');
  if (!SUPPORTED_CURRENCIES.has(request.currency)) errors.push('currency');
  if (!['mainnet', 'testnet', 'devnet'].includes(request.networkMode)) errors.push('networkMode');
  if (!Number.isInteger(request.derivationIndex) || request.derivationIndex < 0) errors.push('derivationIndex');
  if (!request.toAddress) errors.push('toAddress');
  if (!/^\d+(\.\d+)?$/.test(request.amountCrypto)) errors.push('amountCrypto');
  if (!Number.isFinite(request.amountUsd) || request.amountUsd <= 0) errors.push('amountUsd');
  if (!request.sourceType || !request.sourceId) errors.push('source');

  const maxUsd = MAX_TRANSFER_USD_BY_PURPOSE[request.purpose] || 0;
  if (Number.isFinite(request.amountUsd) && maxUsd > 0 && request.amountUsd > maxUsd) {
    errors.push(`amountUsd>${maxUsd}`);
  }

  return { request, errors };
};

const signerPolicyError = (message, code = 'SIGNER_POLICY_REJECTED') => {
  const error = new Error(message);
  error.code = code;
  return error;
};

const sameText = (left, right) => String(left ?? '').trim().toLowerCase() === String(right ?? '').trim().toLowerCase();
const nearlyEqual = (left, right, tolerance = 0.005) => {
  const a = Number(left);
  const b = Number(right);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.max(Math.abs(b) * tolerance, 1e-8);
};

const validateTransferLedgerRecord = async (request) => {
  const transfer = await WalletTransfer.findOne({
    transferId: request.transferId,
    idempotencyKey: request.idempotencyKey
  });
  if (!transfer) {
    throw signerPolicyError('No matching API transfer ledger record exists.', 'SIGNER_LEDGER_RECORD_MISSING');
  }

  const exactFields = ['purpose', 'currency', 'chain', 'token', 'networkMode', 'fromAddress', 'toAddress', 'sourceType', 'sourceId'];
  if (exactFields.some((field) => !sameText(transfer[field], request[field]))) {
    throw signerPolicyError('Transfer request does not match the API transfer ledger.', 'SIGNER_LEDGER_MISMATCH');
  }
  if (Number(transfer.derivationIndex) !== request.derivationIndex || !nearlyEqual(transfer.amountCrypto, request.amountCrypto, 0)) {
    throw signerPolicyError('Transfer amount or derivation index does not match the API ledger.', 'SIGNER_LEDGER_MISMATCH');
  }
  if (!nearlyEqual(transfer.amountUsd, request.amountUsd, 0)) {
    throw signerPolicyError('Transfer USD value does not match the API ledger.', 'SIGNER_LEDGER_MISMATCH');
  }
  if (!['pending', 'failed'].includes(transfer.status)) {
    throw signerPolicyError(`Transfer ledger is already ${transfer.status}.`, 'SIGNER_LEDGER_STATE_INVALID');
  }

  return transfer;
};

const validateDerivedSourceAddress = (request) => {
  const resolved = resolveDepositChain(request.currency);
  if (resolved.chain !== request.chain || resolved.token !== request.token) {
    throw signerPolicyError('Currency does not match the requested chain and token.', 'SIGNER_ASSET_MISMATCH');
  }

  const derivedAddress = deriveAddressForChain(request.chain, request.derivationIndex);
  if (!sameText(derivedAddress, request.fromAddress)) {
    throw signerPolicyError('Source address does not match the signer-derived deposit address.', 'SIGNER_SOURCE_ADDRESS_MISMATCH');
  }
};

const requireStaffActor = async (transfer) => {
  const actor = transfer.actor ? await User.findById(transfer.actor).select('role rank') : null;
  if (!actor || !isStaffUser(actor)) {
    throw signerPolicyError('Refund transfer does not have an authorized staff actor.', 'SIGNER_STAFF_APPROVAL_REQUIRED');
  }
};

const validateTicketSource = async (request, transfer) => {
  const ticket = await TradeTicket.findOne({ ticketId: request.sourceId });
  if (!ticket) {
    throw signerPolicyError('Ticket source was not found.', 'SIGNER_SOURCE_NOT_FOUND');
  }
  const ticketAddress = ticket.depositAddress || ticket.botWalletAddress;
  if (
    !sameText(ticket.cryptocurrency, request.currency) ||
    !sameText(ticketAddress, request.fromAddress) ||
    Number(ticket.depositIndex) !== request.derivationIndex
  ) {
    throw signerPolicyError('Ticket custody details do not match the transfer.', 'SIGNER_SOURCE_MISMATCH');
  }
  if (!ticket.transactionConfirmed) {
    throw signerPolicyError('Ticket deposit has not reached required confirmations.', 'SIGNER_DEPOSIT_UNCONFIRMED');
  }

  const maxCrypto = Number(ticket.expectedCryptoAmount || 0);
  if (!(maxCrypto > 0) || Number(request.amountCrypto) > maxCrypto * 1.005) {
    throw signerPolicyError('Transfer exceeds the ticket escrow amount.', 'SIGNER_AMOUNT_EXCEEDS_ESCROW');
  }

  if (request.purpose === 'ticket_payout') {
    if (
      !ticket.releaseInitiated ||
      !ticket.releaseAuthorization?.digest ||
      !ticket.payoutAuthorization?.digest ||
      ticket.fundsReleased ||
      !sameText(ticket.pendingPayoutAddress, request.toAddress) ||
      !sameText(ticket.payoutAuthorization?.payoutAddress, request.toAddress)
    ) {
      throw signerPolicyError('Ticket payout has not been authorized for this destination.', 'SIGNER_PAYOUT_NOT_AUTHORIZED');
    }
    if (!nearlyEqual(request.amountUsd, ticket.dealAmount, 0.001)) {
      throw signerPolicyError('Ticket payout does not equal the agreed principal.', 'SIGNER_PAYOUT_AMOUNT_INVALID');
    }
    return;
  }

  await requireStaffActor(transfer);
  if (ticket.fundsReleased || ['completed', 'refunded'].includes(ticket.status)) {
    throw signerPolicyError('Ticket is not eligible for a refund.', 'SIGNER_REFUND_NOT_ALLOWED');
  }
};

const validatePassOrderSource = async (request, transfer) => {
  const order = await PassOrder.findOne({ orderId: request.sourceId });
  if (!order) {
    throw signerPolicyError('Credit order source was not found.', 'SIGNER_SOURCE_NOT_FOUND');
  }
  if (
    request.purpose !== 'pass_refund' ||
    !sameText(order.cryptocurrency, request.currency) ||
    !sameText(order.paymentAddress, request.fromAddress) ||
    Number(order.depositIndex) !== request.derivationIndex
  ) {
    throw signerPolicyError('Credit order custody details do not match the refund.', 'SIGNER_SOURCE_MISMATCH');
  }
  await requireStaffActor(transfer);
  const received = Number(order.transactionDetails?.actualAmountReceivedCrypto || order.cryptoAmount || 0);
  if (!(received > 0) || Number(request.amountCrypto) > received * 1.005) {
    throw signerPolicyError('Refund exceeds the recorded credit-order payment.', 'SIGNER_AMOUNT_EXCEEDS_ESCROW');
  }
  if (order.status === 'refunded') {
    throw signerPolicyError('Credit order has already been refunded.', 'SIGNER_REFUND_NOT_ALLOWED');
  }
};

const validateSignerPolicy = async (request) => {
  const transfer = await validateTransferLedgerRecord(request);
  validateDerivedSourceAddress(request);
  if (request.sourceType === 'ticket') {
    await validateTicketSource(request, transfer);
  } else if (request.sourceType === 'pass-order') {
    await validatePassOrderSource(request, transfer);
  } else {
    throw signerPolicyError('Unsupported transfer source type.', 'SIGNER_SOURCE_INVALID');
  }
};

app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(express.json({
  limit: '128kb',
  verify: (req, res, buffer) => {
    void res;
    req.rawBody = buffer.toString('utf8');
  }
}));
app.use(rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false
}));

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'wallet-signer',
    timestamp: new Date().toISOString()
  });
});

app.post('/deposit-addresses/derive', requireSignerAuth, (req, res) => {
  const chain = String(req.body?.chain || '').trim().toLowerCase();
  const index = Number(req.body?.index);
  if (!['bitcoin', 'litecoin', 'ethereum', 'solana'].includes(chain) || !Number.isInteger(index) || index < 0) {
    return fail(res, 400, 'SIGNER_INVALID_DERIVATION_REQUEST', 'A supported chain and non-negative derivation index are required.');
  }

  try {
    return res.json({
      success: true,
      chain,
      index,
      address: deriveAddressForChain(chain, index)
    });
  } catch (error) {
    return fail(res, 500, error.code || 'SIGNER_DERIVATION_FAILED', 'Unable to derive deposit address.');
  }
});

app.post('/transfers', requireSignerAuth, async (req, res) => {
  const { request, errors } = normalizeTransferRequest(req.body, req.headers['idempotency-key']);
  if (errors.length) {
    return fail(res, 400, 'SIGNER_INVALID_REQUEST', `Invalid transfer request fields: ${errors.join(', ')}`);
  }

  const existing = await SignerTransfer.findOne({ idempotencyKey: request.idempotencyKey });
  if (existing?.txHash) {
    return res.json({
      success: true,
      status: existing.status,
      txHash: existing.txHash,
      confirmationNetwork: existing.confirmationNetwork,
      transferId: existing.transferId,
      idempotent: true
    });
  }
  if (existing && existing.status === 'processing') {
    return res.status(409).json({
      success: false,
      code: 'SIGNER_TRANSFER_PROCESSING',
      message: 'Transfer is already being processed.',
      transferId: existing.transferId
    });
  }

  try {
    await validateSignerPolicy(request);
  } catch (error) {
    return fail(res, 403, error.code || 'SIGNER_POLICY_REJECTED', error.message);
  }

  const record = existing || await SignerTransfer.create({
    idempotencyKey: request.idempotencyKey,
    transferId: request.transferId,
    status: 'processing',
    request
  });

  try {
    record.status = 'processing';
    record.errorCode = null;
    record.errorMessage = null;
    await record.save();

    const result = await executeLocalTransfer({
      ticket: {
        cryptocurrency: request.currency,
        depositChain: request.chain,
        depositToken: request.token,
        depositIndex: request.derivationIndex,
        depositAddress: request.fromAddress,
        paymentAddress: request.fromAddress
      },
      toAddress: request.toAddress,
      amountCrypto: request.amountCrypto,
      networkMode: request.networkMode
    });

    record.status = 'broadcasted';
    record.txHash = result.txHash;
    record.confirmationNetwork = result.confirmationNetwork || getPayoutConfirmationNetwork(request.currency);
    record.signerResponse = result;
    record.broadcastedAt = new Date();
    await record.save();

    return res.json({
      success: true,
      status: record.status,
      txHash: record.txHash,
      confirmationNetwork: record.confirmationNetwork,
      transferId: record.transferId
    });
  } catch (error) {
    record.status = ['AUTOMATIC_PAYOUT_UNSUPPORTED', 'DEPOSIT_GAS_REQUIRED', 'TREASURY_GAS_UNCONFIGURED', 'ESCROW_BALANCE_INSUFFICIENT'].includes(error.code)
      ? 'rejected'
      : 'failed';
    record.errorCode = error.code || 'SIGNER_TRANSFER_FAILED';
    record.errorMessage = error.message;
    await record.save();

    return fail(res, record.status === 'rejected' ? 400 : 500, record.errorCode, record.errorMessage);
  }
});

const validateSignerStartup = () => {
  const errors = [];
  if (SIGNER_TOKEN.length < MIN_SIGNER_SECRET_LENGTH) {
    errors.push(`SIGNER_SERVICE_TOKEN must be at least ${MIN_SIGNER_SECRET_LENGTH} characters.`);
  }

  const enabledChains = String(process.env.SIGNER_ENABLED_CHAINS || 'bitcoin,litecoin,ethereum,solana')
    .split(',')
    .map((chain) => chain.trim().toLowerCase())
    .filter(Boolean);
  const tests = walletSelfTest({ force: true });
  enabledChains.forEach((chain) => {
    if (!tests[chain]?.ok) {
      errors.push(`${chain} signing key is unavailable: ${tests[chain]?.error || 'self-test failed'}`);
    }
  });

  if (errors.length) {
    const error = new Error(`Wallet signer configuration is unsafe:\n- ${errors.join('\n- ')}`);
    error.code = 'SIGNER_STARTUP_INVALID';
    throw error;
  }
};

const startSigner = async () => {
  validateSignerStartup();
  await connectDB();
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`Wallet signer listening on http://127.0.0.1:${PORT}`);
  });
};

startSigner().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
