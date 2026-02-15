/**
 * Generates the blockchain explorer URL based on the blockchain type and transaction ID
 * @param {string} blockchain - The blockchain type (e.g., 'litecoin', 'ethereum', 'bitcoin', 'solana')
 * @param {string} transactionId - The full transaction ID/hash
 * @returns {string} The complete explorer URL
 */
export const getExplorerUrl = (blockchain, transactionId) => {
  const normalizeNetworkMode = (value, fallback) => {
    const mode = String(value || '').trim().toLowerCase();
    return mode === 'mainnet' || mode === 'testnet' ? mode : fallback;
  };

  const btcMode = normalizeNetworkMode(import.meta.env.VITE_BTC_NETWORK_MODE, 'testnet');
  const ltcMode = normalizeNetworkMode(import.meta.env.VITE_LTC_NETWORK_MODE, 'mainnet');
  const resolvedLtcMode = ltcMode === 'testnet' ? 'mainnet' : ltcMode;

  const btcExplorerBase = btcMode === 'mainnet'
    ? 'https://live.blockcypher.com/btc'
    : 'https://live.blockcypher.com/btc-testnet';

  const ltcExplorerBase = resolvedLtcMode === 'mainnet'
    ? 'https://live.blockcypher.com/ltc'
    : 'https://live.blockcypher.com/ltc-testnet';

  const explorerMap = {
    litecoin: `${ltcExplorerBase}/tx/${transactionId}/`,
    bitcoin: `${btcExplorerBase}/tx/${transactionId}/`,
    ethereum: `https://etherscan.io/tx/${transactionId}`,
    solana: `https://solscan.io/tx/${transactionId}`,
    polygon: `https://polygonscan.com/tx/${transactionId}`,
    bsc: `https://bscscan.com/tx/${transactionId}`,
    arbitrum: `https://arbiscan.io/tx/${transactionId}`,
    avalanche: `https://snowtrace.io/tx/${transactionId}`,
    optimism: `https://optimistic.etherscan.io/tx/${transactionId}`,
  };

  return explorerMap[blockchain.toLowerCase()] || `#`;
};

/**
 * Formats a transaction ID for display (truncates long IDs)
 * @param {string} transactionId - The full transaction ID
 * @param {number} prefixLength - Number of characters to show at the start (default: 6)
 * @param {number} suffixLength - Number of characters to show at the end (default: 6)
 * @returns {string} Formatted transaction ID (e.g., "5eaa74...5d064b")
 */
export const formatTransactionId = (transactionId, prefixLength = 6, suffixLength = 6) => {
  if (!transactionId) return '';
  
  if (transactionId.length <= prefixLength + suffixLength + 3) {
    return transactionId;
  }
  
  return `${transactionId.slice(0, prefixLength)}...${transactionId.slice(-suffixLength)}`;
};

/**
 * Gets the explorer name based on blockchain type
 * @param {string} blockchain - The blockchain type
 * @returns {string} The name of the blockchain explorer
 */
export const getExplorerName = (blockchain) => {
  const explorerNames = {
    litecoin: 'BlockCypher',
    bitcoin: 'BlockCypher',
    ethereum: 'Etherscan',
    solana: 'Solscan',
    polygon: 'Polygonscan',
    bsc: 'BscScan',
    arbitrum: 'Arbiscan',
    avalanche: 'Snowtrace',
    optimism: 'Optimism Etherscan',
  };

  return explorerNames[blockchain.toLowerCase()] || 'Explorer';
};
