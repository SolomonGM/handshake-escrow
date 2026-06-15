import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import useTransactionFeed from "../hooks/useTransactionFeed";
import Section from "./Section";
import { currencyFlags } from "../assets/currencies";
import {
  formatTransactionId,
  getExplorerUrl,
  getExplorerName,
} from "../utils/blockchainUtils";

const BASE_COIN_FILTERS = ["BTC", "ETH", "LTC", "SOL", "USDT", "USDC"];

const RecentTransactions = () => {
  const navigate = useNavigate();
  const { transactions, loading } = useTransactionFeed({
    includePlaceholders: false,
    limit: 30,
  });
  const [sortBy, setSortBy] = useState("recent");
  const [filterCoin, setFilterCoin] = useState("all");

  const getCoinLogo = (coin) => {
    const coinKey = String(coin || "").trim().toLowerCase();
    if (coinKey === "usdc") return currencyFlags.usdc;
    return currencyFlags[coinKey] || currencyFlags.btc;
  };

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

  const filteredTransactions = useMemo(() => {
    let filtered = [...transactions];

    if (filterCoin !== "all") {
      filtered = filtered.filter(
        (transaction) =>
          String(transaction.coinReceived || "").toUpperCase() === filterCoin
      );
    }

    if (sortBy === "price") {
      filtered.sort((a, b) => b.usdValue - a.usdValue);
    }

    return filtered;
  }, [sortBy, filterCoin, transactions]);

  return (
    <Section className="overflow-hidden" id="recent-transactions">
      <div className="container relative z-2">
        <div className="pointer-events-none absolute inset-x-5 top-12 h-40 rounded-full bg-radial-gradient from-[#10B981]/10 to-transparent blur-2xl" />

        <div className="relative mb-8 overflow-hidden rounded-3xl border border-n-1/10 bg-n-8/70 p-5 backdrop-blur md:p-8 lg:p-10">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#10B981]/70 to-transparent" />

          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-[42rem]">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#10B981]/10 px-3 py-1.5 text-xs font-code font-bold uppercase tracking-wider text-[#6EE7B7]">
                <span className="h-2 w-2 rounded-full bg-[#10B981]" />
                Live settlement feed
              </div>
              <h2 className="h2 mb-4">Recent Exchanges</h2>
              <p className="body-2 text-n-3">
                Completed trades from the Handshake network, with explorer
                links for independent blockchain verification.
              </p>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap lg:justify-end">
              <div className="rounded-2xl border border-n-1/10 bg-n-7/45 p-2">
                <div className="mb-2 px-2 text-[0.65rem] font-code uppercase tracking-wider text-n-4">
                  Sort by
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: "recent", label: "Recent" },
                    { value: "price", label: "Top Deals" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setSortBy(option.value)}
                      className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                        sortBy === option.value
                          ? "bg-[#0D5C3D] text-n-1 shadow-[0_0_24px_rgba(16,185,129,0.16)]"
                          : "text-n-3 hover:bg-n-6 hover:text-n-1"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-n-1/10 bg-n-7/45 p-2">
                <label
                  htmlFor="recent-coin-filter"
                  className="mb-2 block px-2 text-[0.65rem] font-code uppercase tracking-wider text-n-4"
                >
                  Asset
                </label>
                <select
                  id="recent-coin-filter"
                  value={filterCoin}
                  onChange={(event) => setFilterCoin(event.target.value)}
                  className="h-10 min-w-[10rem] rounded-xl border border-n-1/10 bg-n-8 px-4 text-sm font-semibold text-n-1 outline-none transition-colors hover:border-n-5 focus:border-[#10B981]"
                >
                  <option value="all">All Coins</option>
                  {availableCoins.map((coin) => (
                    <option key={coin} value={coin}>
                      {coin}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex min-w-[8rem] items-center justify-center rounded-2xl border border-n-1/10 bg-n-7/45 px-5 py-4 text-center">
                <div>
                  <div className="text-2xl font-semibold text-n-1">
                    {filteredTransactions.length}
                  </div>
                  <div className="text-[0.65rem] font-code uppercase tracking-wider text-n-4">
                    Results
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredTransactions.length > 0 ? (
            filteredTransactions.slice(0, 9).map((transaction) => (
              <article
                key={transaction.id}
                className="group relative overflow-hidden rounded-2xl border border-n-1/10 bg-n-8/80 p-5 shadow-[0_18px_70px_rgba(0,0,0,0.25)] backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-[#10B981]/35"
              >
                <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-radial-gradient from-[#10B981]/18 to-transparent blur-xl transition-opacity group-hover:opacity-100" />

                <div className="relative mb-6 flex items-start justify-between gap-4">
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-n-1/10 bg-n-7/70 px-3 py-1 text-[0.65rem] font-code uppercase tracking-wider text-n-3">
                        {transaction.blockchain}
                      </span>
                      <span className="rounded-full bg-[#10B981]/15 px-3 py-1 text-[0.65rem] font-code font-bold uppercase tracking-wider text-[#6EE7B7]">
                        Complete
                      </span>
                    </div>
                    <h3 className="text-xl font-semibold text-n-1">
                      {transaction.coinReceived} Deal Complete
                    </h3>
                  </div>

                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-n-7/70">
                    <img
                      src={getCoinLogo(transaction.coinReceived)}
                      alt={transaction.coinReceived}
                      className="h-14 w-14 object-contain"
                      loading="lazy"
                      decoding="async"
                      onError={(event) => {
                        event.target.style.display = "none";
                      }}
                    />
                  </div>
                </div>

                <div className="relative mb-5 rounded-2xl border border-n-1/10 bg-n-7/35 p-4">
                  <div className="mb-1 text-xs font-code uppercase tracking-wider text-n-4">
                    Amount settled
                  </div>
                  <div className="text-lg font-semibold text-n-1">
                    {transaction.amount} {transaction.coinReceived}
                  </div>
                  <div className="text-sm text-n-4">
                    ${transaction.usdValue.toFixed(2)} USD
                  </div>
                </div>

                <div className="relative mb-5 grid gap-3 sm:grid-cols-2">
                  {[
                    { label: "Sender", value: transaction.sender },
                    { label: "Receiver", value: transaction.receiver },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-xl border border-n-1/10 bg-n-7/25 p-3"
                    >
                      <div className="mb-1 text-xs font-code uppercase tracking-wider text-n-4">
                        {item.label}
                      </div>
                      <div className="truncate text-sm text-n-1">
                        {item.value === "Anonymous" ? (
                          <span className="text-n-4">Anonymous</span>
                        ) : (
                          <span className="text-[#4A9EFF]">{item.value}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="relative flex items-center justify-between gap-3 border-t border-n-1/10 pt-4">
                  <div className="min-w-0">
                    <div className="mb-1 text-xs font-code uppercase tracking-wider text-n-4">
                      Transaction
                    </div>
                    {transaction.transactionId &&
                    transaction.transactionId !== "N/A" ? (
                      <code className="block truncate text-sm text-n-2">
                        {formatTransactionId(transaction.transactionId)}
                      </code>
                    ) : (
                      <span className="text-sm text-n-4">N/A</span>
                    )}
                  </div>

                  {transaction.transactionId &&
                    transaction.transactionId !== "N/A" && (
                      <a
                        href={getExplorerUrl(
                          transaction.blockchain,
                          transaction.transactionId,
                          transaction.networkMode
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 rounded-full border border-[#4A9EFF]/25 bg-[#4A9EFF]/10 px-3 py-2 text-xs font-semibold text-[#6BB6FF] transition-colors hover:bg-[#4A9EFF]/20"
                      >
                        {getExplorerName(transaction.blockchain)}
                      </a>
                    )}
                </div>
              </article>
            ))
          ) : (
            <div className="col-span-full rounded-3xl border border-n-1/10 bg-n-8/70 py-16 text-center">
              <p className="text-lg text-n-3">
                {loading
                  ? "Loading recent exchanges..."
                  : "No transactions found matching your filters."}
              </p>
              {!loading && (
                <button
                  onClick={() => {
                    setSortBy("recent");
                    setFilterCoin("all");
                  }}
                  className="mt-4 font-semibold text-[#4A9EFF] transition-colors hover:text-[#6BB6FF]"
                >
                  Clear Filters
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-center mt-10">
          <button
            onClick={() => navigate("/transactions")}
            className="button inline-flex h-11 items-center justify-center rounded-full border border-n-1/10 bg-n-7/50 px-7 text-n-1 transition-all hover:border-[#10B981]/40 hover:bg-[#10B981]/10 hover:text-[#6EE7B7]"
          >
            View All Transactions
          </button>
        </div>
      </div>
    </Section>
  );
};

export default RecentTransactions;
