import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import socketService from "../services/socket";
import { currencyFlags } from "../assets/currencies";
import { formatTransactionId, getExplorerName, getExplorerUrl } from "../utils/blockchainUtils";

const API_URL = import.meta.env.VITE_API_URL || "/api";
const PAGE_SIZE = 10;
const LIVE_REFRESH_INTERVAL_MS = 30000;
const COIN_FILTERS = [
  { value: "all", label: "All Coins" },
  { value: "BTC", label: "BTC" },
  { value: "ETH", label: "ETH" },
  { value: "LTC", label: "LTC" },
  { value: "SOL", label: "SOL" },
  { value: "USDT", label: "USDT" },
  { value: "USDC", label: "USDC" }
];

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const resolveCoinAssetKey = (coin) => {
  const value = String(coin || "").trim().toLowerCase();
  const map = {
    btc: "btc",
    eth: "eth",
    ltc: "ltc",
    sol: "sol",
    usdt: "usdt",
    usdc: "usdt"
  };

  return map[value] || "btc";
};

const formatTimestamp = (completedAt, fallback) => {
  if (!completedAt) return fallback || "N/A";

  const date = new Date(completedAt);
  if (Number.isNaN(date.getTime())) return fallback || "N/A";

  return date.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
};

const AllTransactions = () => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [coinFilter, setCoinFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    totalPages: 1
  });
  const [lastUpdatedAt, setLastUpdatedAt] = useState("");

  const fetchTransactions = useCallback(async () => {
    try {
      setError("");
      setLoading(true);

      const response = await axios.get(`${API_URL}/transactions/all`, {
        params: {
          page,
          pageSize: PAGE_SIZE,
          search: searchQuery || undefined,
          coin: coinFilter
        }
      });

      const payload = response.data || {};
      setTransactions(payload.transactions || []);
      setPagination(payload.pagination || { page, pageSize: PAGE_SIZE, total: 0, totalPages: 1 });
      setLastUpdatedAt(new Date().toISOString());
    } catch (fetchError) {
      console.error("Failed to load all transactions:", fetchError);
      setTransactions([]);
      setError(fetchError.response?.data?.message || "Failed to load transactions");
    } finally {
      setLoading(false);
    }
  }, [coinFilter, page, searchQuery]);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      setPage(1);
      setSearchQuery(searchInput.trim());
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [searchInput]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  useEffect(() => {
    socketService.connect();

    const handleTransactionCompleted = () => {
      fetchTransactions();
    };

    socketService.on("transaction_completed", handleTransactionCompleted);
    const intervalId = setInterval(fetchTransactions, LIVE_REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
      if (socketService.socket) {
        socketService.socket.off("transaction_completed", handleTransactionCompleted);
      }
    };
  }, [fetchTransactions]);

  const paddedRows = useMemo(() => {
    if (transactions.length >= PAGE_SIZE) return transactions;

    const placeholdersNeeded = PAGE_SIZE - transactions.length;
    const placeholders = Array.from({ length: placeholdersNeeded }, (_, index) => ({
      id: `placeholder-row-${index + 1}`,
      isPlaceholder: true
    }));
    return [...transactions, ...placeholders];
  }, [transactions]);

  const pageLabel = `${pagination.page} / ${pagination.totalPages}`;

  return (
    <section className="h-full overflow-hidden">
      <div className="container h-full">
        <div className="h-full flex flex-col rounded-2xl border border-n-6 bg-n-8/80 backdrop-blur-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-n-6 bg-gradient-to-r from-n-8 via-n-7 to-n-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold text-n-1">All Transactions</h1>
                <p className="text-sm text-n-3">
                  Live feed of completed user trades. Newest transactions appear first.
                </p>
              </div>
              <Link
                to="/#recent-transactions"
                className="text-sm font-semibold text-[#10B981] hover:text-[#34D399] transition-colors"
              >
                Back to Home
              </Link>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search by user, coin, tx hash, or ticket..."
                className="flex-1 min-w-[16rem] px-4 py-2 rounded-lg bg-n-7 border border-n-6 text-n-1 placeholder-n-4 focus:outline-none focus:border-[#10B981]"
              />
              <select
                value={coinFilter}
                onChange={(event) => {
                  setCoinFilter(event.target.value);
                  setPage(1);
                }}
                className="px-4 py-2 rounded-lg bg-n-7 border border-n-6 text-n-1 focus:outline-none focus:border-[#10B981]"
              >
                {COIN_FILTERS.map((filter) => (
                  <option key={filter.value} value={filter.value}>
                    {filter.label}
                  </option>
                ))}
              </select>
              <span className="text-xs text-n-4 whitespace-nowrap">
                {pagination.total} total
              </span>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden">
            <div className="grid grid-cols-[0.8fr_1fr_1fr_0.9fr_1fr_0.9fr_1.2fr] items-center gap-3 px-6 py-3 text-xs font-semibold uppercase tracking-wide text-n-3 bg-[#191a44] border-b border-[#2c2d6b]">
              <span>Coin</span>
              <span>Sender</span>
              <span>Receiver</span>
              <span>Time</span>
              <span>Amount</span>
              <span>Value</span>
              <span>Transaction</span>
            </div>

            <div className="h-full overflow-hidden">
              {loading ? (
                <div className="h-full flex items-center justify-center text-n-3">Loading transactions...</div>
              ) : (
                paddedRows.map((transaction) => {
                  if (transaction.isPlaceholder) {
                    return (
                      <div
                        key={transaction.id}
                        className="grid grid-cols-[0.8fr_1fr_1fr_0.9fr_1fr_0.9fr_1.2fr] items-center gap-3 px-6 h-12 border-b border-n-7 text-n-5"
                      >
                        <span>-</span>
                        <span>-</span>
                        <span>-</span>
                        <span>-</span>
                        <span>-</span>
                        <span>-</span>
                        <span>-</span>
                      </div>
                    );
                  }

                  const coinKey = resolveCoinAssetKey(transaction.coinReceived);
                  const coinLogo = currencyFlags[coinKey] || currencyFlags.btc;

                  return (
                    <div
                      key={transaction.id}
                      className="grid grid-cols-[0.8fr_1fr_1fr_0.9fr_1fr_0.9fr_1.2fr] items-center gap-3 px-6 h-12 border-b border-n-7 hover:bg-n-7/40 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <img src={coinLogo} alt={transaction.coinReceived} className="w-6 h-6 object-contain" />
                        <span className="text-sm font-semibold text-n-1 truncate">{transaction.coinReceived}</span>
                      </div>
                      <span className="text-sm text-n-2 truncate">{transaction.sender}</span>
                      <span className="text-sm text-n-2 truncate">{transaction.receiver}</span>
                      <span className="text-sm text-n-3">{formatTimestamp(transaction.completedAt, transaction.timestamp)}</span>
                      <span className="text-sm font-semibold text-[#4ADE80] truncate">
                        {transaction.amount} {transaction.coinReceived}
                      </span>
                      <span className="text-sm font-semibold text-[#22D3EE]">
                        {usdFormatter.format(Number(transaction.usdValue || 0))}
                      </span>
                      {transaction.transactionId && transaction.transactionId !== "N/A" ? (
                        <a
                          href={getExplorerUrl(transaction.blockchain, transaction.transactionId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-[#60A5FA] hover:text-[#93C5FD] truncate"
                          title={`Open in ${getExplorerName(transaction.blockchain)}`}
                        >
                          {formatTransactionId(transaction.transactionId)}
                        </a>
                      ) : (
                        <span className="text-xs text-n-4">N/A</span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="px-6 py-4 border-t border-n-6 bg-n-8/90">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-n-4">
                {error ? error : `Last sync: ${lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleTimeString() : "N/A"}`}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                  disabled={pagination.page <= 1 || loading}
                  className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-n-7 text-n-2 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-n-6 transition-colors"
                >
                  Prev
                </button>
                <span className="text-sm text-n-3 min-w-[4rem] text-center">{pageLabel}</span>
                <button
                  onClick={() => setPage((prev) => Math.min(prev + 1, pagination.totalPages))}
                  disabled={pagination.page >= pagination.totalPages || loading}
                  className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-n-7 text-n-2 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-n-6 transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AllTransactions;
