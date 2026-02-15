import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Section from "./Section";
import Heading from "./Heading";
import TradeHubFilters from "./TradeHubFilters";
import TradeRequestCard from "./TradeRequestCard";
import { GradientLight } from "./design/TradeHub";
import { searchMd, plusSquare } from "../assets";
import Button from "./Button";
import CreateTradeModal from "./CreateTradeModal";
import CreateTradeRequestModal from "./CreateTradeRequestModal";
import { useAuth } from "../context/AuthContext";
import axios from "axios";
import { toast } from "../utils/toast";

const API_URL = import.meta.env.VITE_API_URL || '/api';

const TradeHub = () => {
  const { user, token, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [tradeRequests, setTradeRequests] = useState([]);
  const [filteredRequests, setFilteredRequests] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState({
    tradeType: "all", // buy or sell
    cryptoType: "all",
    fiatCurrency: "all",
    sortBy: "newest",
    myRequestsOnly: false
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreateTradeRequestModalOpen, setIsCreateTradeRequestModalOpen] = useState(false);
  const [pendingInvitationsCount, setPendingInvitationsCount] = useState(0);
  
  const requireAuth = (message) => {
    if (isAuthenticated) return true;
    toast.error(message);
    return false;
  };

  // Mock data - will be replaced with API calls
  const mockTradeRequests = [
    {
      id: "TR-001",
      type: "sell", // User wants to sell crypto for fiat
      creator: {
        username: "CryptoWhale87",
        reputation: 98,
        totalTrades: 247,
        verified: true,
        memberSince: "2022-01",
        responseTime: "< 5 min"
      },
      cryptoType: "BTC",
      cryptoAmount: 0.5,
      fiatCurrency: "GBP",
      fiatAmount: 17710.25,
      rate: 35420.50,
      paymentMethods: ["Bank Transfer", "PayPal"],
      preferredPayment: "Bank Transfer",
      minTrade: 100,
      maxTrade: 5000,
      terms: "Quick release after payment confirmation. Bank transfers only from UK banks.",
      status: "open",
      expiresAt: "2025-10-23T10:30:00Z",
      createdAt: "2025-10-21T10:30:00Z"
    },
    {
      id: "TR-002",
      type: "buy", // User wants to buy crypto with fiat
      creator: {
        username: "EthTrader_Pro",
        reputation: 95,
        totalTrades: 183,
        verified: true,
        memberSince: "2022-06",
        responseTime: "< 10 min"
      },
      cryptoType: "ETH",
      cryptoAmount: 5.2,
      fiatCurrency: "USD",
      fiatAmount: 14797.90,
      rate: 2845.75,
      paymentMethods: ["Zelle", "Bank Transfer", "Wise"],
      preferredPayment: "Zelle",
      minTrade: 500,
      maxTrade: 10000,
      terms: "Looking to buy ETH. Have USD ready. Prefer Zelle for instant settlement.",
      status: "open",
      expiresAt: "2025-10-22T09:15:00Z",
      createdAt: "2025-10-21T09:15:00Z"
    },
    {
      id: "TR-003",
      type: "sell",
      creator: {
        username: "Anonymous",
        reputation: 92,
        totalTrades: 156,
        verified: false,
        memberSince: "2023-03",
        responseTime: "< 30 min"
      },
      cryptoType: "SOL",
      cryptoAmount: 120,
      fiatCurrency: "EUR",
      fiatAmount: 18276.00,
      rate: 152.30,
      paymentMethods: ["SEPA Transfer"],
      preferredPayment: "SEPA Transfer",
      minTrade: 200,
      maxTrade: 5000,
      terms: "SEPA transfers accepted. Will release within 1 hour of confirmed payment.",
      status: "open",
      expiresAt: "2025-10-24T08:45:00Z",
      createdAt: "2025-10-21T08:45:00Z"
    },
    {
      id: "TR-004",
      type: "sell",
      creator: {
        username: "LTCMaster",
        reputation: 89,
        totalTrades: 98,
        verified: true,
        memberSince: "2023-08",
        responseTime: "< 15 min"
      },
      cryptoType: "LTC",
      cryptoAmount: 45.8,
      fiatCurrency: "GBP",
      fiatAmount: 4511.30,
      rate: 98.50,
      paymentMethods: ["Bank Transfer", "Revolut"],
      preferredPayment: "Revolut",
      minTrade: 50,
      maxTrade: 2000,
      terms: "Fast trader. Revolut instant release. Bank transfer within 30 minutes.",
      status: "open",
      expiresAt: "2025-10-22T07:20:00Z",
      createdAt: "2025-10-21T07:20:00Z"
    },
    {
      id: "TR-005",
      type: "buy",
      creator: {
        username: "XRP_Trader_UK",
        reputation: 96,
        totalTrades: 312,
        verified: true,
        memberSince: "2021-11",
        responseTime: "< 5 min"
      },
      cryptoType: "XRP",
      cryptoAmount: 5000,
      fiatCurrency: "GBP",
      fiatAmount: 2600.00,
      rate: 0.52,
      paymentMethods: ["Bank Transfer", "PayPal", "Cash App"],
      preferredPayment: "Bank Transfer",
      minTrade: 100,
      maxTrade: 2000,
      terms: "Buying XRP in bulk. Multiple transactions available. Instant payment guarantee.",
      status: "open",
      expiresAt: "2025-10-23T06:10:00Z",
      createdAt: "2025-10-21T06:10:00Z"
    },
    {
      id: "TR-006",
      type: "sell",
      creator: {
        username: "PolygonPro",
        reputation: 94,
        totalTrades: 221,
        verified: true,
        memberSince: "2022-09",
        responseTime: "< 10 min"
      },
      cryptoType: "MATIC",
      cryptoAmount: 8500,
      fiatCurrency: "USD",
      fiatAmount: 5780.00,
      rate: 0.68,
      paymentMethods: ["Venmo", "Zelle", "Bank Transfer"],
      preferredPayment: "Zelle",
      minTrade: 250,
      maxTrade: 3000,
      terms: "Selling MATIC at market rate. Quick escrow release. US traders preferred.",
      status: "open",
      expiresAt: "2025-10-25T22:30:00Z",
      createdAt: "2025-10-20T22:30:00Z"
    }
  ];

  // Load trade requests on component mount
  useEffect(() => {
    fetchTradeRequests();
  }, [token]);

  const fetchTradeRequests = async () => {
    try {
      setIsLoading(true);
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      const response = await axios.get(
        `${API_URL}/trade-requests`,
        config
      );

      if (response.data.success) {
        setTradeRequests(response.data.tradeRequests);
        setFilteredRequests(response.data.tradeRequests);
      }
    } catch (err) {
      if (!token && err.response?.status === 401) {
        setTradeRequests([]);
        setFilteredRequests([]);
        return;
      }
      console.error('Error fetching trade requests:', err);
      toast.error('Failed to load trade requests');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch pending invitations count
  useEffect(() => {
    const fetchPendingInvitations = async () => {
      if (!token || !user) return;

      try {
        const response = await axios.get(
          `${API_URL}/tickets/my-tickets`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (response.data.success) {
          // Count pending invitations
          const pendingCount = response.data.invitations?.filter(
            ticket => ticket.participants?.some(
              p => p.user._id === user.id && p.status === 'pending'
            )
          ).length || 0;

          setPendingInvitationsCount(pendingCount);
        }
      } catch (err) {
        console.error('Error fetching pending invitations:', err);
      }
    };

    fetchPendingInvitations();

    // Refresh every 10 seconds to check for new invitations
    const interval = setInterval(fetchPendingInvitations, 10000);

    return () => clearInterval(interval);
  }, [token, user]);

  // Apply filters and search
  useEffect(() => {
    let result = [...tradeRequests];
    
    // Filter by my requests only
    if (activeFilters.myRequestsOnly && user) {
      result = result.filter(req => req.creator._id === user.id);
    }
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const cryptoSymbolMap = {
        bitcoin: "btc",
        ethereum: "eth",
        litecoin: "ltc",
        solana: "sol",
        "usdt-erc20": "usdt",
        "usdc-erc20": "usdc",
      };

      result = result.filter((request) => {
        const creatorName = request.creator?.username?.toLowerCase() || "";
        const itemOffered = request.itemOffered?.toLowerCase() || "";
        const itemDescription = request.itemDescription?.toLowerCase() || "";
        const priceCurrency = request.priceCurrency?.toLowerCase() || "";
        const cryptoOffered = request.cryptoOffered?.toLowerCase() || "";
        const cryptoSymbol = cryptoSymbolMap[cryptoOffered] || "";
        const requestId = request.requestId?.toLowerCase() || "";
        const recordId = request._id?.toLowerCase() || "";

        return (
          creatorName.includes(query) ||
          itemOffered.includes(query) ||
          itemDescription.includes(query) ||
          priceCurrency.includes(query) ||
          cryptoOffered.includes(query) ||
          cryptoSymbol.includes(query) ||
          requestId.includes(query) ||
          recordId.includes(query)
        );
      });
    }

    // Trade type filter
    if (activeFilters.tradeType !== "all") {
      result = result.filter(request => request.type === activeFilters.tradeType);
    }

    // Crypto type filter
    if (activeFilters.cryptoType !== "all") {
      result = result.filter(request => request.cryptoOffered === activeFilters.cryptoType);
    }

    // Fiat currency filter
    if (activeFilters.fiatCurrency !== "all") {
      result = result.filter(request => request.priceCurrency === activeFilters.fiatCurrency);
    }

    // Sorting
    switch (activeFilters.sortBy) {
      case "newest":
        result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        break;
      case "oldest":
        result.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        break;
      case "rate-low":
        result.sort((a, b) => a.rate - b.rate);
        break;
      case "rate-high":
        result.sort((a, b) => b.rate - a.rate);
        break;
      case "reputation":
        result.sort((a, b) => b.creator.reputation - a.creator.reputation);
        break;
      case "expires-soon":
        result.sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt));
        break;
      default:
        break;
    }

    setFilteredRequests(result);
  }, [searchQuery, activeFilters, tradeRequests]);

  const handleFilterChange = (filterName, value) => {
    setActiveFilters(prev => ({
      ...prev,
      [filterName]: value
    }));
  };

  const resetFilters = () => {
    setActiveFilters({
      tradeType: "all",
      cryptoType: "all",
      fiatCurrency: "all",
      sortBy: "newest",
      myRequestsOnly: false
    });
    setSearchQuery("");
  };

  return (
    <Section className="pt-[12rem] -mt-[5.25rem] pb-12 flex-1" crosses crossesOffset="lg:translate-y-[5.25rem]" customPaddings id="trade-hub">
      <div className="container relative z-2">
        <Heading
          className="md:max-w-md lg:max-w-2xl"
          title="Trade Hub"
          text="Browse active trade requests or create your own. Secure P2P cryptocurrency exchanges with automated escrow protection."
        />

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-4 mb-12">
          <Button 
            className="px-8" 
            white 
            onClick={() => {
              if (!requireAuth('Please sign in to create a ticket.')) return;
              setIsCreateModalOpen(true);
            }}
          >
            Create Ticket
          </Button>
          <div className="relative">
            <Button 
              className="px-8" 
              onClick={() => {
                if (!requireAuth('Please sign in to view your tickets.')) return;
                navigate('/my-requests');
              }}
            >
              View My Tickets
            </Button>
            {pendingInvitationsCount > 0 && (
              <div className="absolute -top-2 -right-2 flex items-center justify-center">
                <div className="relative">
                  {/* Pulsing ring animation */}
                  <div className="absolute inset-0 bg-red-500 rounded-full animate-ping opacity-75"></div>
                  {/* Notification badge */}
                  <div className="relative flex items-center justify-center w-6 h-6 bg-red-500 text-white text-xs font-bold rounded-full border-2 border-n-8 shadow-lg">
                    {pendingInvitationsCount > 9 ? '9+' : pendingInvitationsCount}
                  </div>
                </div>
              </div>
            )}
          </div>
          <Button 
            className="px-8" 
            onClick={() => {
              if (!requireAuth('Please sign in to create a trade request.')) return;
              setIsCreateTradeRequestModalOpen(true);
            }}
          >
            Create Trade Request
          </Button>
        </div>

        {/* Search Bar */}
        <div className="max-w-3xl mx-auto mb-12">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
              <img src={searchMd} alt="Search" className="w-5 h-5 opacity-50" />
            </div>
            <input
              type="text"
              placeholder="Search by username, crypto, request ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-n-7 border border-n-6 rounded-xl text-n-1 placeholder-n-4 focus:outline-none focus:border-[#10B981] transition-colors"
            />
          </div>
        </div>

        {/* Filters */}
        <TradeHubFilters 
          activeFilters={activeFilters}
          onFilterChange={handleFilterChange}
          onReset={resetFilters}
        />

        {/* Stats Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8 p-6 bg-n-7 border border-n-6 rounded-xl">
          <div className="flex items-center gap-2">
            <span className="text-n-3">Showing</span>
            <span className="font-bold text-[#10B981]">{filteredRequests.length}</span>
            <span className="text-n-3">of {tradeRequests.length} active requests</span>
          </div>
          {(searchQuery || activeFilters.tradeType !== "all" || activeFilters.cryptoType !== "all" || activeFilters.fiatCurrency !== "all") && (
            <button
              onClick={resetFilters}
              className="text-sm text-[#10B981] hover:text-[#34D399] transition-colors"
            >
              Clear all filters
            </button>
          )}
        </div>

        {/* Trade Requests Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-[#10B981] border-t-transparent rounded-full animate-spin"></div>
              <p className="text-n-3">Loading trade requests...</p>
            </div>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 mb-6 rounded-full bg-n-7 flex items-center justify-center">
              <img src={searchMd} alt="No results" className="w-8 h-8 opacity-30" />
            </div>
            <h3 className="h5 mb-2">No trade requests found</h3>
            <p className="text-n-3 mb-6">Try adjusting your filters or create a new trade request</p>
            <button
              onClick={resetFilters}
              className="px-6 py-3 bg-[#10B981] hover:bg-[#059669] text-white rounded-lg transition-colors"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredRequests.map((request) => (
              <TradeRequestCard 
                key={request._id} 
                request={request} 
                onUpdate={fetchTradeRequests}
                currentUser={user}
              />
            ))}
          </div>
        )}

        {/* Bottom gradient effect */}
        <div className="relative mt-20">
          <GradientLight />
        </div>
      </div>

      {/* Create Trade Modal */}
      <CreateTradeModal 
        isOpen={isCreateModalOpen} 
        onClose={() => setIsCreateModalOpen(false)} 
      />

      {/* Create Trade Request Modal */}
      <CreateTradeRequestModal 
        isOpen={isCreateTradeRequestModalOpen} 
        onClose={() => setIsCreateTradeRequestModalOpen(false)}
        onSuccess={fetchTradeRequests}
      />
    </Section>
  );
};

export default TradeHub;
