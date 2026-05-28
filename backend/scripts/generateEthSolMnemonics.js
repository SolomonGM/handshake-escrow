// Generates two fresh 12-word mnemonics — one for ETH (covers USDT-ERC20 +
// USDC-ERC20) and one for SOL (covers USDT-SPL + USDC-SPL). Also derives the
// index-0 address for each so you can sanity-check the same address shows
// up when the backend allocates a deposit.
//
// Run with:
//   node backend/scripts/generateEthSolMnemonics.js
//
// Writes nothing to disk. Copy each mnemonic to paper FIRST, then paste into
// HD_ETH_MNEMONIC / HD_SOL_MNEMONIC in backend/.env.

import { generateMnemonic, mnemonicToSeedSync } from 'bip39';
import { ethers } from 'ethers';
import { Keypair } from '@solana/web3.js';
import { derivePath } from 'ed25519-hd-key';

// ---- ETH ----
const ethMnemonic = generateMnemonic(128);
const ethWalletAt0 = ethers.HDNodeWallet.fromPhrase(ethMnemonic, undefined, "m/44'/60'/0'/0/0");
const ethAddressAt0 = ethers.getAddress(ethWalletAt0.address);

// ---- SOL ----
const solMnemonic = generateMnemonic(128);
const solSeed = mnemonicToSeedSync(solMnemonic, '');
const solKeyAt0 = derivePath("m/44'/501'/0'/0'", solSeed.toString('hex')).key;
const solAddressAt0 = Keypair.fromSeed(solKeyAt0).publicKey.toBase58();

console.log('\n=== ETH WALLET (covers ETH + USDT-ERC20 + USDC-ERC20) ===\n');
console.log('Mnemonic (write on paper, label "ETH SEPOLIA"):');
console.log('  ' + ethMnemonic);
console.log('\nFor HD_ETH_MNEMONIC in backend/.env:');
console.log('  ' + ethMnemonic);
console.log('\nFirst receive address (sanity check):');
console.log('  ' + ethAddressAt0);

console.log('\n=== SOL WALLET (covers SOL + USDT-SPL + USDC-SPL) ===\n');
console.log('Mnemonic (write on paper, label "SOL DEVNET"):');
console.log('  ' + solMnemonic);
console.log('\nFor HD_SOL_MNEMONIC in backend/.env:');
console.log('  ' + solMnemonic);
console.log('\nFirst receive address (sanity check):');
console.log('  ' + solAddressAt0);

console.log('\nDONE. Save BOTH mnemonics to paper before closing this terminal.\n');
