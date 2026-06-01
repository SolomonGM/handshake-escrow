// Generates a fresh LTC MAINNET mnemonic + derives the account-level Ltub
// at m/84'/2'/0' (BIP84, Native SegWit, mainnet coin_type 2).
//
// Run with:
//   node backend/scripts/generateLtcMainnetWallet.js
//
// Writes nothing to disk. Outputs to your terminal — copy the mnemonic to
// paper FIRST, then copy the Ltub into HD_LTC_XPUB in your .env.

import * as bitcoin from 'bitcoinjs-lib';
import { BIP32Factory } from 'bip32';
import * as ecc from 'tiny-secp256k1';
import { generateMnemonic, mnemonicToSeedSync } from 'bip39';

bitcoin.initEccLib(ecc);
const bip32 = BIP32Factory(ecc);

// Litecoin mainnet network params (matches the LITECOIN_NETWORKS.mainnet
// object in services/hdWalletService.js so derived addresses line up exactly
// when the backend re-derives at higher indices).
const LITECOIN_MAINNET = {
  messagePrefix: '\x19Litecoin Signed Message:\n',
  bech32: 'ltc',
  bip32: { public: 0x019da462, private: 0x019d9cfe }, // Ltub / Ltpv
  pubKeyHash: 0x30,
  scriptHash: 0x32,
  wif: 0xb0
};

const mnemonic = generateMnemonic(128); // 12 words
const seed = mnemonicToSeedSync(mnemonic);
const root = bip32.fromSeed(seed, LITECOIN_MAINNET);

// BIP84 mainnet path: m/84' / 2' / 0'  (purpose=84 BIP84, coin_type=2 LTC, account=0)
const account = root.derivePath("m/84'/2'/0'").neutered();
const ltub = account.toBase58();

// Sanity-check the first address — bech32 ltc1q... format.
const firstAddress = bitcoin.payments.p2wpkh({
  pubkey: Buffer.from(account.derive(0).derive(0).publicKey),
  network: LITECOIN_MAINNET
}).address;

console.log('\n=== LTC MAINNET WALLET ===\n');
console.log('Mnemonic (write on paper, label "LTC MAINNET"):');
console.log('  ' + mnemonic);
console.log('\nAccount xpub (paste into HD_LTC_XPUB in backend/.env):');
console.log('  ' + ltub);
console.log('\nFirst receive address (sanity check — starts with ltc1q):');
console.log('  ' + firstAddress);
console.log('\nDONE. Save the mnemonic to paper before closing this terminal.\n');
