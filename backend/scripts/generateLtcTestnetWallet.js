// Generates a fresh LTC testnet mnemonic + derives the account-level tpub
// at m/84'/1'/0' (BIP84, Native SegWit, testnet coin_type).
//
// Run with:
//   node backend/scripts/generateLtcTestnetWallet.js
//
// Writes nothing to disk. Outputs to your terminal — copy the mnemonic to
// paper FIRST, then copy the tpub into HD_LTC_XPUB in your .env.

import * as bitcoin from 'bitcoinjs-lib';
import { BIP32Factory } from 'bip32';
import * as ecc from 'tiny-secp256k1';
import { generateMnemonic, mnemonicToSeedSync } from 'bip39';

bitcoin.initEccLib(ecc);
const bip32 = BIP32Factory(ecc);

// Litecoin testnet network params (matches the network object in hdWalletService).
const LITECOIN_TESTNET = {
  messagePrefix: '\x19Litecoin Signed Message:\n',
  bech32: 'tltc',
  bip32: { public: 0x043587cf, private: 0x04358394 },
  pubKeyHash: 0x6f,
  scriptHash: 0x3a,
  wif: 0xef
};

const mnemonic = generateMnemonic(128); // 12 words
const seed = mnemonicToSeedSync(mnemonic);
const root = bip32.fromSeed(seed, LITECOIN_TESTNET);

// BIP84 path on testnet: m/84' / 1' / 0'  (purpose / coin_type=testnet / account=0)
const account = root.derivePath("m/84'/1'/0'").neutered();
const tpub = account.toBase58();

// Also derive address index 0 so we can sanity-check it later.
const firstAddress = bitcoin.payments.p2wpkh({
  pubkey: Buffer.from(account.derive(0).derive(0).publicKey),
  network: LITECOIN_TESTNET
}).address;

console.log('\n=== LTC TESTNET WALLET ===\n');
console.log('Mnemonic (write on paper, label "LTC TESTNET"):');
console.log('  ' + mnemonic);
console.log('\nAccount xpub (paste into HD_LTC_XPUB in backend/.env):');
console.log('  ' + tpub);
console.log('\nFirst receive address (sanity check — testnet faucets will send here):');
console.log('  ' + firstAddress);
console.log('\nDONE. Save the mnemonic to paper before closing this terminal.\n');
