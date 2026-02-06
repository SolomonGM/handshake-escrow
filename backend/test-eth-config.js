#!/usr/bin/env node

/**
 * Quick Configuration Test for Ethereum Sepolia Testing
 * Run this before testing to verify everything is configured correctly
 */

import { BOT_WALLETS, ETH_RPC_CONFIG, ETH_NETWORK_MODE, EXCHANGE_RATES } from './config/wallets.js';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

console.log('\n🧪 ETHEREUM SEPOLIA TEST CONFIGURATION CHECK\n');
console.log('='.repeat(60));

// 1. Check Network Mode
console.log('\n1️⃣  Network Mode');
console.log(`   Mode: ${ETH_NETWORK_MODE}`);
console.log(`   ✅ Should be: "testnet"`);
if (ETH_NETWORK_MODE !== 'testnet') {
  console.log(`   ⚠️  WARNING: Network mode is "${ETH_NETWORK_MODE}", should be "testnet"`);
}

// 2. Check Wallet Address
console.log('\n2️⃣  Bot Wallet Address');
console.log(`   Ethereum: ${BOT_WALLETS.ethereum}`);
console.log(`   ✅ Expected: 0x55058382068dEB5E4EFDDbdd5A69D2771C7Cf80E`);
if (BOT_WALLETS.ethereum !== '0x55058382068dEB5E4EFDDbdd5A69D2771C7Cf80E') {
  console.log(`   ⚠️  WARNING: Wallet address doesn't match!`);
}

// 3. Check RPC Configuration
console.log('\n3️⃣  RPC Configuration');
const config = ETH_RPC_CONFIG[ETH_NETWORK_MODE];
console.log(`   Network: ${config.name}`);
console.log(`   Chain ID: ${config.chainId}`);
const rpcUrl = process.env.SEPOLIA_RPC_URL || config.rpcUrl;
console.log(`   RPC URL: ${rpcUrl.substring(0, 50)}...`);
console.log(`   Block Explorer: ${config.blockExplorer}`);
console.log(`   Confirmations Required: ${config.confirmationsRequired}`);

// 4. Check Exchange Rate
console.log('\n4️⃣  Exchange Rate (TESTING)');
console.log(`   1 ETH = $${EXCHANGE_RATES.ethereum} USD`);
console.log(`   ✅ This allows 0.1 ETH to buy passes!`);

// 5. Calculate Pass Costs
console.log('\n5️⃣  Pass Costs in Sepolia ETH');
const passes = [
  { name: 'Single Pass', price: 1 },
  { name: 'Premium Pass', price: 5 },
  { name: 'Rhino Pass', price: 12 }
];

passes.forEach(pass => {
  const ethCost = (pass.price / EXCHANGE_RATES.ethereum).toFixed(8);
  const withinBudget = parseFloat(ethCost) <= 0.1 ? '✅' : '❌';
  console.log(`   ${pass.name} ($${pass.price}): ${ethCost} ETH ${withinBudget}`);
});

// 6. Test RPC Connection
console.log('\n6️⃣  Testing RPC Connection...');
try {
  const rpcUrl = process.env.SEPOLIA_RPC_URL || config.rpcUrl;
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const blockNumber = await provider.getBlockNumber();
  console.log(`   ✅ Connected! Current block: ${blockNumber}`);
  
  // Check wallet balance
  const balance = await provider.getBalance(BOT_WALLETS.ethereum);
  const balanceETH = ethers.formatEther(balance);
  console.log(`   💰 Wallet Balance: ${balanceETH} SepoliaETH`);
  
  if (parseFloat(balanceETH) === 0) {
    console.log(`   ⚠️  WARNING: Wallet has 0 balance. This is OK for receiving, but you won't be able to send.`);
  }
} catch (error) {
  console.log(`   ❌ RPC Connection Failed: ${error.message}`);
  console.log(`   Check your SEPOLIA_RPC_URL in .env file`);
}

// 7. Summary
console.log('\n7️⃣  Testing Instructions');
console.log('   ━'.repeat(60));
console.log(`   1. Get 0.1 SepoliaETH from faucet (you already have this)`);
console.log(`   2. Start your backend: npm start`);
console.log(`   3. Create a pass order (any type will cost ≤ 0.1 ETH)`);
console.log(`   4. Send EXACT amount shown to: ${BOT_WALLETS.ethereum}`);
console.log(`   5. Wait ~30 seconds for detection`);
console.log(`   6. Wait ~1 minute for 2 confirmations`);
console.log(`   7. Check logs for: "✅ Ethereum payment found!"`);
console.log(`   8. Verify on: ${config.blockExplorer}/address/${BOT_WALLETS.ethereum}`);

console.log('\n' + '='.repeat(60));
console.log('✅ Configuration check complete!\n');

process.exit(0);
