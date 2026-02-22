import useTransactionFeed from "../hooks/useTransactionFeed";
import { currencyFlags } from "../assets/currencies";
import { formatTransactionId, getExplorerUrl } from "../utils/blockchainUtils";

const TransactionLiveFeed = ({ className }) => {
  const { transactions } = useTransactionFeed({ includePlaceholders: true, minItems: 8, limit: 20 });

  const getCoinLogo = (coin) => {
    const coinKey = coin.toLowerCase();
    return currencyFlags[coinKey] || currencyFlags.btc;
  };

  // Render transaction card
  const TransactionCard = ({ transaction, index }) => {
    const isPlaceholder = transaction.isPlaceholder;
    const hasTxId = Boolean(transaction.transactionId && transaction.transactionId !== 'N/A');
    const amountDisplay = isPlaceholder ? 'N/A' : `${transaction.amount} ${transaction.coinReceived}`;
    const usdDisplay = isPlaceholder ? 'N/A' : `$${transaction.usdValue.toFixed(2)} USD`;

    return (
      <div
        key={`transaction-${transaction.id}-${index}`}
        className="flex-shrink-0 w-[280px] bg-n-7 border border-n-6 rounded-2xl p-4 hover:border-n-5 transition-colors"
      >
        {/* Header with coin logo */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 flex-shrink-0 rounded-xl flex items-center justify-center">
              {!isPlaceholder && (
                <img
                  src={getCoinLogo(transaction.coinReceived)}
                  alt={transaction.coinReceived}
                  className="w-14 h-14 object-contain"
                  onError={(e) => {
                    e.target.style.display = 'none';
                  }}
                />
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-n-1">
                {amountDisplay}
              </p>
              <p className="text-xs text-n-4">
                {usdDisplay}
              </p>
            </div>
          </div>
        </div>

      {/* Sender & Receiver */}
        <div className="space-y-2 mb-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-n-4">From:</span>
            <span
              className={
                transaction.sender === "Anonymous" || isPlaceholder
                  ? "text-n-3"
                  : "text-[#4A9EFF]"
              }
            >
              {isPlaceholder ? 'N/A' : transaction.sender}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-n-4">To:</span>
            <span
              className={
                transaction.receiver === "Anonymous" || isPlaceholder
                  ? "text-n-3"
                  : "text-[#4A9EFF]"
              }
            >
              {isPlaceholder ? 'N/A' : transaction.receiver}
            </span>
          </div>
        </div>

      {/* Transaction ID */}
        <div className="pt-3 border-t border-n-6">
          <div className="flex items-center justify-between">
            {hasTxId && !isPlaceholder ? (
              <a
                href={getExplorerUrl(transaction.blockchain, transaction.transactionId)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#4A9EFF] hover:text-[#6BB6FF] transition-colors"
              >
                <code className="text-xs font-mono">
                  {formatTransactionId(transaction.transactionId)}
                </code>
              </a>
            ) : (
              <span className="text-xs text-n-4">N/A</span>
            )}
            <span className="text-xs text-n-4">{isPlaceholder ? 'N/A' : transaction.timestamp}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={className}>
      <h5 className="tagline mb-6 text-center text-n-1/50">
        By using the site and creating an exchange, you agree to the Handshake&apos;s{" "}
        <a
          href="/docs/terms#user-responsibility"
          className="text-blue-500 hover:text-blue-400 underline"
        >
          Terms of Service
        </a>{" "}
        and{" "}
        <a
          href="/docs/other#security"
          className="text-blue-500 hover:text-blue-400 underline"
        >
          Privacy Policy
        </a>
      </h5>

      <div className="relative overflow-hidden">
        {/* Gradient overlays for smooth fade effect */}
        <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-n-8 to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-n-8 to-transparent z-10 pointer-events-none" />

        {/* Scrolling container with duplicate sets for seamless loop */}
        <div className="flex gap-6 animate-infinite-scroll">
          {/* First set */}
          {transactions.map((transaction, index) => (
            <TransactionCard key={`set1-${index}`} transaction={transaction} index={index} />
          ))}
          {/* Second set (duplicate for seamless loop) */}
          {transactions.map((transaction, index) => (
            <TransactionCard key={`set2-${index}`} transaction={transaction} index={index} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default TransactionLiveFeed;
