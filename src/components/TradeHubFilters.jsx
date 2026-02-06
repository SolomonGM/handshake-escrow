import { sliders04 } from "../assets";

const TradeHubFilters = ({ activeFilters, onFilterChange, onReset }) => {
  const cryptoOptions = [
    { value: "all", label: "All Cryptocurrencies" },
    { value: "bitcoin", label: "Bitcoin (BTC)" },
    { value: "ethereum", label: "Ethereum (ETH)" },
    { value: "litecoin", label: "Litecoin (LTC)" },
    { value: "solana", label: "Solana (SOL)" },
    { value: "usdt-erc20", label: "USDT (ERC-20)" },
    { value: "usdc-erc20", label: "USDC (ERC-20)" },
  ];

  const fiatOptions = [
    { value: "all", label: "All Currencies" },
    { value: "GBP", label: "British Pound (GBP)" },
    { value: "EUR", label: "Euro (EUR)" },
    { value: "USD", label: "US Dollar (USD)" },
  ];

  const sortOptions = [
    { value: "newest", label: "Newest First" },
    { value: "oldest", label: "Oldest First" },
    { value: "rate-high", label: "Highest Rate" },
    { value: "rate-low", label: "Lowest Rate" },
    { value: "reputation", label: "Highest Reputation" },
    { value: "expires-soon", label: "Expiring Soon" },
  ];


  return (
    <div className="mb-8">
      {/* Filter Header */}
      <div className="flex items-center gap-3 mb-6">
        <img src={sliders04} alt="Filters" className="w-5 h-5" />
        <h3 className="text-lg font-semibold text-n-1">Filters</h3>
      </div>

      {/* Filter Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        
        {/* Trade Type */}
        <div>
          <label className="block text-xs text-n-4 mb-2 font-semibold uppercase tracking-wider">
            Trade Type
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => onFilterChange("tradeType", "all")}
              className={`px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                activeFilters.tradeType === "all"
                  ? "bg-[#10B981] text-white shadow-lg shadow-[#10B981]/20"
                  : "bg-n-7 text-n-3 hover:bg-n-6 border border-n-6"
              }`}
            >
              All
            </button>
            <button
              onClick={() => onFilterChange("tradeType", "buying")}
              className={`px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                activeFilters.tradeType === "buying"
                  ? "bg-[#10B981] text-white shadow-lg shadow-[#10B981]/20"
                  : "bg-n-7 text-n-3 hover:bg-n-6 border border-n-6"
              }`}
            >
              Buy
            </button>
            <button
              onClick={() => onFilterChange("tradeType", "selling")}
              className={`px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                activeFilters.tradeType === "selling"
                  ? "bg-[#EF4444] text-white shadow-lg shadow-[#EF4444]/20"
                  : "bg-n-7 text-n-3 hover:bg-n-6 border border-n-6"
              }`}
            >
              Sell
            </button>
          </div>
        </div>

        {/* Cryptocurrency */}
        <div>
          <label className="block text-xs text-n-4 mb-2 font-semibold uppercase tracking-wider">
            Cryptocurrency
          </label>
          <select
            value={activeFilters.cryptoType}
            onChange={(e) => onFilterChange("cryptoType", e.target.value)}
            className="w-full px-4 py-2.5 bg-n-7 border border-n-6 rounded-lg text-n-1 text-sm focus:outline-none focus:border-[#10B981] transition-colors cursor-pointer"
          >
            {cryptoOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Fiat Currency */}
        <div>
          <label className="block text-xs text-n-4 mb-2 font-semibold uppercase tracking-wider">
            Fiat Currency
          </label>
          <select
            value={activeFilters.fiatCurrency}
            onChange={(e) => onFilterChange("fiatCurrency", e.target.value)}
            className="w-full px-4 py-2.5 bg-n-7 border border-n-6 rounded-lg text-n-1 text-sm focus:outline-none focus:border-[#10B981] transition-colors cursor-pointer"
          >
            {fiatOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Sort By */}
        <div className="md:col-span-2 lg:col-span-3">
          <label className="block text-xs text-n-4 mb-2 font-semibold uppercase tracking-wider">
            Sort By
          </label>
          <div className="flex flex-wrap gap-2">
            {sortOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => onFilterChange("sortBy", option.value)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  activeFilters.sortBy === option.value
                    ? "bg-[#10B981] text-white shadow-lg shadow-[#10B981]/20"
                    : "bg-n-7 text-n-3 hover:bg-n-6 border border-n-6"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* My Requests Only */}
        <div className="md:col-span-2 lg:col-span-3">
          <button
            onClick={() => onFilterChange("myRequestsOnly", !activeFilters.myRequestsOnly)}
            className={`w-full px-6 py-3 rounded-lg font-semibold transition-all ${
              activeFilters.myRequestsOnly
                ? 'bg-gradient-to-r from-[#10B981] to-[#059669] text-white shadow-lg'
                : 'bg-n-7 border border-n-6 text-n-1 hover:border-[#10B981]'
            }`}
          >
            {activeFilters.myRequestsOnly ? '✓ Showing My Requests Only' : 'Show Only My Requests'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TradeHubFilters;
