import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import useTransactionFeed from "../hooks/useTransactionFeed";
import Section from "./Section";
import { currencyFlags } from "../assets/currencies";
import { formatTransactionId, getExplorerUrl, getExplorerName } from "../utils/blockchainUtils";

const BASE_COIN_FILTERS = ["BTC", "ETH", "LTC", "SOL", "USDT", "USDC"];

const RecentTransactions = () => {
  const navigate = useNavigate();
  const { transactions } = useTransactionFeed({ includePlaceholders: false, limit: 30 });
  const [sortBy, setSortBy] = useState("recent"); // "recent" or "price"
  const [filterCoin, setFilterCoin] = useState("all"); // "all", "BTC", "ETH", "LTC", "SOL"

  const getCoinLogo = (coin) => {
    const coinKey = String(coin || "").trim().toLowerCase();
    if (coinKey === "usdc") return currencyFlags.usdt;
    return currencyFlags[coinKey] || currencyFlags.btc;
  };

  // Get unique coins from transactions
  const availableCoins = useMemo(() => {
    const dynamicCoins = transactions
      .map((transaction) => String(transaction.coinReceived || "").toUpperCase())
      .filter(Boolean);

    const merged = Array.from(new Set([...BASE_COIN_FILTERS, ...dynamicCoins]));
    return merged.sort((left, right) => {
      const leftIndex = BASE_COIN_FILTERS.indexOf(left);
      const rightIndex = BASE_COIN_FILTERS.indexOf(right);
      if (leftIndex !== -1 && rightIndex !== -1) return leftIndex - rightIndex;
      if (leftIndex !== -1) return -1;
      if (rightIndex !== -1) return 1;
      return left.localeCompare(right);
    });
  }, [transactions]);

  // Filter and sort transactions
  const filteredTransactions = useMemo(() => {
    let filtered = [...transactions];

    // Filter by coin
    if (filterCoin !== "all") {
      filtered = filtered.filter(
        (transaction) => String(transaction.coinReceived || "").toUpperCase() === filterCoin
      );
    }

    // Sort by price or recent
    if (sortBy === "price") {
      filtered.sort((a, b) => b.usdValue - a.usdValue);
    }

    return filtered;
  }, [sortBy, filterCoin, transactions]);

  return (
    <Section className="overflow-hidden" id="recent-transactions">
      <div className="container relative z-2">
        <div className="text-center mb-[3rem] md:mb-12 lg:mb-[4rem]">
          <h2 className="h2 mb-4">Recent Exchanges</h2>
          <p className="body-2 text-n-3">
            Live transactions from our peer-to-peer exchange platform
          </p>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center justify-center gap-4 mb-10 max-w-[60rem] mx-auto">
          {/* Sort By Filter */}
          <div className="flex items-center gap-2">
            <span className="text-n-3 text-sm font-code">Sort by:</span>
            <div className="flex gap-2">
              <button
                onClick={() => setSortBy("recent")}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  sortBy === "recent"
                    ? "bg-[#0D5C3D] text-n-1"
                    : "bg-n-7 text-n-3 hover:bg-n-6"
                }`}
              >
                Recent
              </button>
              <button
                onClick={() => setSortBy("price")}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  sortBy === "price"
                    ? "bg-[#0D5C3D] text-n-1"
                    : "bg-n-7 text-n-3 hover:bg-n-6"
                }`}
              >
                Top Deals
              </button>
            </div>
          </div>

          {/* Coin Filter */}
          <div className="flex items-center gap-2">
            <span className="text-n-3 text-sm font-code">Coin:</span>
            <select
              value={filterCoin}
              onChange={(e) => setFilterCoin(e.target.value)}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-n-7 text-n-1 border border-n-6 hover:border-n-5 transition-colors cursor-pointer focus:outline-none focus:border-[#0D5C3D]"
            >
              <option value="all">All Coins</option>
              {availableCoins.map((coin) => (
                <option key={coin} value={coin}>
                  {coin}
                </option>
              ))}
            </select>
          </div>

          {/* Results Count */}
          <div className="text-n-4 text-sm">
            {filteredTransactions.length} {filteredTransactions.length === 1 ? 'transaction' : 'transactions'}
          </div>
        </div>

        <div className="flex flex-wrap gap-6 justify-center max-w-[80rem] mx-auto">
          {filteredTransactions.length > 0 ? (
            filteredTransactions.map((transaction) => (
              <div
                key={transaction.id}
                className="relative bg-n-8 border border-n-6 rounded-3xl p-6 w-full md:w-[calc(50%-0.75rem)] lg:w-[calc(33.333%-1rem)] hover:border-n-5 transition-colors"
              >
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-code text-n-3 uppercase tracking-wider">
                    {transaction.blockchain}
                  </span>
                  <span className="inline-flex items-center px-2 py-1 bg-[#0D5C3D]/20 text-[#0D5C3D] text-xs rounded-lg font-bold">
                    APP
                  </span>
                </div>
                <span className="text-xs text-n-4">{transaction.timestamp}</span>
              </div>

              {/* Title */}
              <h3 className="h5 mb-6 text-[#0D5C3D]">
                {transaction.coinReceived} Deal Complete
              </h3>

              {/* Coin Logo */}
              <div className="flex justify-end mb-6">
                <div className="w-24 h-24 flex-shrink-0 rounded-2xl flex items-center justify-center">
                  <img
                    src={getCoinLogo(transaction.coinReceived)}
                    alt={transaction.coinReceived}
                    className="w-24 h-24 object-contain"
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                </div>
              </div>

              {/* Amount */}
              <div className="mb-6">
                <h6 className="font-semibold text-n-3 text-sm mb-2">Amount</h6>
                <p className="text-n-1 text-lg">
                  {transaction.amount} {transaction.coinReceived}{" "}
                  <span className="text-n-4 text-sm">
                    (${transaction.usdValue.toFixed(2)} USD)
                  </span>
                </p>
              </div>

              {/* Sender & Receiver */}
              <div className="flex justify-between mb-6">
                <div className="flex-1">
                  <h6 className="font-semibold text-n-3 text-sm mb-2">Sender</h6>
                  <p className="text-n-1 text-sm break-all">
                    {transaction.sender === "Anonymous" ? (
                      <span className="text-n-4">Anonymous</span>
                    ) : (
                      <span className="text-[#4A9EFF]">{transaction.sender}</span>
                    )}
                  </p>
                </div>
                <div className="flex-1 ml-4">
                  <h6 className="font-semibold text-n-3 text-sm mb-2">Receiver</h6>
                  <p className="text-n-1 text-sm break-all">
                    {transaction.receiver === "Anonymous" ? (
                      <span className="text-n-4">Anonymous</span>
                    ) : (
                      <span className="text-[#4A9EFF]">{transaction.receiver}</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Transaction ID with Link */}
              <div className="mb-4">
                <h6 className="font-semibold text-n-3 text-sm mb-2">Transaction</h6>
                <div className="flex items-center justify-between">
                  {transaction.transactionId && transaction.transactionId !== 'N/A' ? (
                    <>
                      <code className="text-n-1 text-sm font-mono">
                        {formatTransactionId(transaction.transactionId)}
                      </code>
                      <a
                        href={getExplorerUrl(transaction.blockchain, transaction.transactionId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#4A9EFF] hover:text-[#6BB6FF] transition-colors text-sm font-semibold ml-2"
                      >
                        (View on {getExplorerName(transaction.blockchain)})
                      </a>
                    </>
                  ) : (
                    <span className="text-n-4 text-sm">N/A</span>
                  )}
                </div>
              </div>
            </div>
          ))
          ) : (
            <div className="w-full text-center py-20">
              <p className="text-n-3 text-lg">No transactions found matching your filters.</p>
              <button
                onClick={() => {
                  setSortBy("recent");
                  setFilterCoin("all");
                }}
                className="mt-4 text-[#4A9EFF] hover:text-[#6BB6FF] transition-colors font-semibold"
              >
                Clear Filters
              </button>
            </div>
          )}
        </div>

        {/* View More Button */}
        <div className="flex justify-center mt-10">
          <button
            onClick={() => navigate("/transactions")}
            className="button relative inline-flex items-center justify-center h-11 px-7 text-n-1 transition-colors hover:text-color-1"
          >
            View All Transactions
          </button>
        </div>
      </div>
    </Section>
  );
};

export default RecentTransactions;
