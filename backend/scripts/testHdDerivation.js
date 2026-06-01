// Verifies that the HD wallet env vars are wired correctly. Run with:
//   node backend/scripts/testHdDerivation.js
// Should print one address per chain. If any chain shows "ok: false" the env
// var named in `envKey` is missing or malformed.

import dotenv from 'dotenv';
dotenv.config();

import { selfTest, deriveAddressForChain } from '../services/hdWalletService.js';

const results = selfTest({ force: true });
console.log('\nHD Derivation Self-Test');
console.log('=======================\n');

for (const [chain, result] of Object.entries(results)) {
  if (result.ok) {
    console.log(`[OK]   ${chain.padEnd(10)} idx 0 -> ${result.addressAtIndex0}`);
  } else {
    console.log(`[FAIL] ${chain.padEnd(10)} ${result.error}`);
  }
}

console.log('\nSecond address per chain (should differ from index 0):\n');
for (const chain of ['bitcoin', 'litecoin', 'ethereum', 'solana']) {
  try {
    const addr = deriveAddressForChain(chain, 1);
    console.log(`[OK]   ${chain.padEnd(10)} idx 1 -> ${addr}`);
  } catch (error) {
    console.log(`[FAIL] ${chain.padEnd(10)} ${error.message}`);
  }
}

console.log('\nDone. If all chains show [OK] you can proceed.\n');
