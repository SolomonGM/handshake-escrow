const axios = require('axios');

// Configuration
const BLOCKCYPHER_TOKEN = 'YOUR_BLOCKCYPHER_TOKEN'; // Get from https://www.blockcypher.com/
const TESTNET_API = 'https://api.blockcypher.com/v1/ltc/test3';

// Your testnet wallet private key (WIF format)
const SENDER_PRIVATE_KEY = 'YOUR_TESTNET_PRIVATE_KEY_WIF';

// Bot wallet address (from wallets.js)
const BOT_WALLET = 'YOUR_BOT_WALLET_ADDRESS';

// Amount to send (in LTC, not satoshis)
const AMOUNT_LTC = 0.00100000; // Example: 0.001 LTC

/**
 * Send Litecoin testnet transaction
 * 
 * This script demonstrates how to send a test transaction to the bot wallet.
 * 
 * Usage:
 * 1. Install dependencies: npm install axios
 * 2. Fill in your configuration above
 * 3. Run: node send-test-ltc.js
 */

async function sendTestTransaction() {
  try {
    console.log('🚀 Starting Litecoin testnet transaction...\n');

    // Step 1: Create unsigned transaction
    console.log('📝 Creating transaction...');
    
    const txData = {
      inputs: [{ addresses: [SENDER_ADDRESS] }],
      outputs: [{
        addresses: [BOT_WALLET],
        value: Math.floor(AMOUNT_LTC * 100000000) // Convert LTC to satoshis
      }]
    };

    const createTxResponse = await axios.post(
      `${TESTNET_API}/txs/new?token=${BLOCKCYPHER_TOKEN}`,
      txData
    );

    const unsignedTx = createTxResponse.data;
    console.log('✅ Transaction created');
    console.log(`   To: ${BOT_WALLET}`);
    console.log(`   Amount: ${AMOUNT_LTC} LTC`);
    console.log(`   Fee: ${unsignedTx.fees / 100000000} LTC\n`);

    // Step 2: Sign transaction (simplified - use proper wallet library in production)
    console.log('🔐 Signing transaction...');
    // NOTE: For actual implementation, use a proper signing library
    // This is just a placeholder - you'll need to implement signing with your wallet
    console.log('⚠️  Manual signing required. Use your wallet to sign and broadcast.\n');

    // Step 3: Send transaction (if using BlockCypher signing service)
    console.log('📤 Broadcasting transaction...');
    console.log('   Use your wallet application to broadcast the transaction.\n');

    console.log('✅ Done! Transaction should appear in ~30 seconds.');
    console.log('   Monitor at: https://live.blockcypher.com/ltc-testnet/\n');

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

// Alternative: Simple guide for manual testing
function printManualInstructions() {
  console.log('='.repeat(60));
  console.log('MANUAL TESTING GUIDE');
  console.log('='.repeat(60));
  console.log('\n1. Get testnet LTC from faucet:');
  console.log('   http://testnet.litecointools.com/');
  console.log('\n2. Use Electrum-LTC or online wallet:');
  console.log('   - Open your testnet wallet');
  console.log('   - Go to Send tab');
  console.log(`   - Address: ${BOT_WALLET}`);
  console.log(`   - Amount: ${AMOUNT_LTC} LTC`);
  console.log('   - Click Send');
  console.log('\n3. Wait 30-60 seconds for Handshake bot to detect');
  console.log('\n4. Check ticket chat for "Transaction Detected" message\n');
  console.log('='.repeat(60));
}

// For quick testing, just print manual instructions
printManualInstructions();

// Uncomment to try automated sending (requires proper wallet integration)
// sendTestTransaction();
