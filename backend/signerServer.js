import express from 'express';
import helmet from 'helmet';
import dotenv from 'dotenv';
import connectDB from './config/database.js';
import SignerTransfer from './models/SignerTransfer.js';
import {
  executeLocalTransfer,
  getPayoutConfirmationNetwork
} from './services/ticketPayoutService.js';

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

  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (token !== SIGNER_TOKEN) {
    return fail(res, 401, 'SIGNER_UNAUTHORIZED', 'Unauthorized signer request.');
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
  if (!request.sourceType || !request.sourceId) errors.push('source');

  const maxUsd = MAX_TRANSFER_USD_BY_PURPOSE[request.purpose] || 0;
  if (Number.isFinite(request.amountUsd) && maxUsd > 0 && request.amountUsd > maxUsd) {
    errors.push(`amountUsd>${maxUsd}`);
  }

  return { request, errors };
};

app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(express.json({ limit: '128kb' }));

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'wallet-signer',
    timestamp: new Date().toISOString()
  });
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

connectDB();

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Wallet signer listening on http://127.0.0.1:${PORT}`);
});
