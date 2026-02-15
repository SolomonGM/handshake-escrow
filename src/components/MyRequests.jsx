import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import axios from "axios";
import Section from "./Section";
import Heading from "./Heading";
import TicketInvitationCard from "./TicketInvitationCard";
import CreateTradeModal from "./CreateTradeModal";
import { toast } from "../utils/toast";

const API_URL = import.meta.env.VITE_API_URL || '/api';

const MyRequests = () => {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [myTickets, setMyTickets] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [activeTickets, setActiveTickets] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('invitations'); // 'invitations', 'my-tickets', 'active'
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  // Pagination state
  const [myTicketsPage, setMyTicketsPage] = useState(1);
  const [activeTicketsPage, setActiveTicketsPage] = useState(1);
  const [invitationIndex, setInvitationIndex] = useState(0);
  const ITEMS_PER_PAGE = 10;
  const MAX_TICKETS = 50;
  const MAX_INVITATIONS = 10;

  useEffect(() => {
    fetchTickets();
  }, [token]);

  const fetchTickets = async () => {
    if (!token) {
      navigate('/');
      return;
    }

    try {
      const response = await axios.get(`${API_URL}/tickets/my-tickets`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Limit to max 50 tickets (most recent)
      setMyTickets(response.data.myTickets.slice(0, MAX_TICKETS));
      
      // Limit invitations to max 10, auto-decline the rest
      const allInvitations = response.data.invitations;
      const keptInvitations = allInvitations.slice(0, MAX_INVITATIONS);
      const excessInvitations = allInvitations.slice(MAX_INVITATIONS);
      
      // Auto-decline excess invitations
      if (excessInvitations.length > 0) {
        console.log(`Auto-declining ${excessInvitations.length} excess invitations`);
        for (const invitation of excessInvitations) {
          try {
            await axios.post(
              `${API_URL}/tickets/${invitation.ticketId}/respond`,
              { action: 'decline' },
              { headers: { Authorization: `Bearer ${token}` } }
            );
          } catch (err) {
            console.error('Error auto-declining invitation:', err);
          }
        }
      }
      
      setInvitations(keptInvitations);
      setActiveTickets(response.data.activeTickets.slice(0, MAX_TICKETS));
      
      // Reset to first page when data refreshes
      setMyTicketsPage(1);
      setActiveTicketsPage(1);
      setInvitationIndex(0);
    } catch (error) {
      console.error('Error fetching tickets:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRespondToInvitation = async (ticketId, action) => {
    try {
      // Immediately remove invitation from state
      setInvitations(prev => prev.filter(inv => inv.ticketId !== ticketId));
      
      // URL encode the ticketId to handle the # symbol
      const encodedTicketId = encodeURIComponent(ticketId);
      await axios.post(
        `${API_URL}/tickets/${encodedTicketId}/respond`,
        { action },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Refresh tickets after responding
      fetchTickets();
      
      if (action === 'accept') {
        // Navigate to the ticket
        navigate(`/trade-ticket?ticketId=${encodeURIComponent(ticketId)}`);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to respond to invitation');
      // Re-fetch to restore state if there was an error
      fetchTickets();
    }
  };

  const cryptoColors = {
    'bitcoin': '#F7931A',
    'ethereum': '#627EEA',
    'litecoin': '#345D9D',
    'solana': '#14F195',
    'usdt-erc20': '#26A17B',
    'usdc-erc20': '#2775CA',
  };

  const cryptoSymbols = {
    'bitcoin': 'BTC',
    'ethereum': 'ETH',
    'litecoin': 'LTC',
    'solana': 'SOL',
    'usdt-erc20': 'USDT',
    'usdc-erc20': 'USDC',
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'completed':
        return 'bg-green-500/20 text-green-400 border border-green-500/50';
      case 'cancelled':
        return 'bg-red-500/20 text-red-400 border border-red-500/50';
      case 'in-progress':
      case 'pending':
        return 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50';
      case 'awaiting-close':
      case 'closing':
        return 'bg-blue-500/20 text-blue-400 border border-blue-500/50';
      case 'refunded':
        return 'bg-purple-500/20 text-purple-400 border border-purple-500/50';
      case 'open':
        return 'bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/50';
      default:
        return 'bg-n-6 text-n-3';
    }
  };

  const getStatusLabel = (status, isActiveTab) => {
    if (isActiveTab && status === 'in-progress') {
      return 'IN-PROGRESS';
    }
    if (status === 'awaiting-close') {
      return 'AWAITING CLOSE';
    }
    if (status === 'closing') {
      return 'CLOSING';
    }
    return status.toUpperCase();
  };

  // Pagination helper
  const getPaginatedItems = (items, page) => {
    const startIndex = (page - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return items.slice(startIndex, endIndex);
  };

  const getTotalPages = (itemsCount) => {
    return Math.ceil(itemsCount / ITEMS_PER_PAGE);
  };

  // Pagination component
  const PaginationControls = ({ currentPage, totalItems, onPageChange }) => {
    const totalPages = getTotalPages(totalItems);
    if (totalPages <= 1) return null;

    return (
      <div className="flex items-center justify-center gap-4 py-4">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
            currentPage === 1
              ? 'bg-n-7 text-n-5 cursor-not-allowed'
              : 'bg-n-7 text-n-3 hover:bg-[#10B981] hover:text-white'
          }`}
        >
          Previous
        </button>
        <span className="text-n-3 text-sm">
          Page {currentPage} of {totalPages}
        </span>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
            currentPage === totalPages
              ? 'bg-n-7 text-n-5 cursor-not-allowed'
              : 'bg-n-7 text-n-3 hover:bg-[#10B981] hover:text-white'
          }`}
        >
          Next
        </button>
      </div>
    );
  };

  const getCryptoBadgeStyle = (crypto) => {
    const styles = {
      'bitcoin': 'bg-gradient-to-r from-[#F7931A] to-[#FFA726] text-white shadow-lg shadow-[#F7931A]/20',
      'ethereum': 'bg-gradient-to-r from-[#627EEA] to-[#8C9EFF] text-white shadow-lg shadow-[#627EEA]/20',
      'litecoin': 'bg-gradient-to-r from-[#345D9D] to-[#5E7FB8] text-white shadow-lg shadow-[#345D9D]/20',
      'solana': 'bg-gradient-to-r from-[#14F195] to-[#9945FF] text-white shadow-lg shadow-[#14F195]/20',
      'usdt-erc20': 'bg-gradient-to-r from-[#26A17B] to-[#50AF95] text-white shadow-lg shadow-[#26A17B]/20',
      'usdc-erc20': 'bg-gradient-to-r from-[#2775CA] to-[#5B9BD5] text-white shadow-lg shadow-[#2775CA]/20',
    };
    return styles[crypto] || 'bg-gradient-to-r from-[#10B981] to-[#059669] text-white shadow-lg shadow-[#10B981]/20';
  };

  const renderTicketCard = (ticket, showInvitationActions = false, isActiveTab = false, isMyTicketsTab = false) => {
    // For active tab or my tickets, get the other participant
    const otherParticipant = ticket.participants.length > 0 
      ? ticket.participants.find(p => p.user && p.status === 'accepted')?.user 
      : null;

    return (
    <div key={ticket._id} className="p-6 bg-n-7 border border-n-6 rounded-xl hover:border-[#10B981] transition-colors">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <span 
            className={`px-2.5 py-1 rounded-md text-xs font-bold ${getCryptoBadgeStyle(ticket.cryptocurrency)}`}
          >
            {cryptoSymbols[ticket.cryptocurrency] || 'CRYPTO'}
          </span>
          <span className="font-code text-sm text-n-4">{ticket.ticketId}</span>
        </div>
        <span className={`px-3 py-1 rounded-lg text-xs font-semibold ${getStatusColor(isActiveTab && ticket.status === 'in-progress' ? 'in-progress' : ticket.status)}`}>
          {getStatusLabel(ticket.status, isActiveTab)}
        </span>
      </div>

      <div className="mb-4 space-y-2">
        <p className="text-sm text-n-3">
          <span className="font-semibold">Cryptocurrency:</span> {ticket.cryptocurrency.toUpperCase()}
        </p>
        {(isActiveTab || isMyTicketsTab) && otherParticipant ? (
          <p className="text-sm text-n-3">
            <span className="font-semibold">Deal with:</span> @{otherParticipant.username}
          </p>
        ) : null}
        {isMyTicketsTab && (
          <>
            <p className="text-sm text-n-3">
              <span className="font-semibold">Creator:</span> @{ticket.creator.username}
            </p>
            {ticket.senderTransactionId && (
              <p className="text-sm text-n-3">
                <span className="font-semibold">Sender TX:</span>{' '}
                <span className="font-mono text-xs">{ticket.senderTransactionId}</span>
              </p>
            )}
            {ticket.receiverTransactionId && (
              <p className="text-sm text-n-3">
                <span className="font-semibold">Receiver TX:</span>{' '}
                <span className="font-mono text-xs">{ticket.receiverTransactionId}</span>
              </p>
            )}
          </>
        )}
        <p className="text-sm text-n-3">
          <span className="font-semibold">Created:</span> {new Date(ticket.createdAt).toLocaleDateString()}
        </p>
      </div>

      {showInvitationActions ? (
        <div className="flex gap-3">
          <button
            onClick={() => handleRespondToInvitation(ticket.ticketId, 'accept')}
            className="flex-1 py-2 bg-[#10B981] hover:bg-[#059669] text-white rounded-lg font-semibold transition-colors"
          >
            Accept
          </button>
          <button
            onClick={() => handleRespondToInvitation(ticket.ticketId, 'decline')}
            className="flex-1 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-600/50 text-red-400 rounded-lg font-semibold transition-colors"
          >
            Decline
          </button>
        </div>
      ) : (
        <button
          onClick={() => navigate(`/trade-ticket?ticketId=${encodeURIComponent(ticket.ticketId)}${isMyTicketsTab ? '&readonly=true' : ''}`)}
          className="w-full py-2 bg-n-6 hover:bg-[#10B981] hover:text-white text-n-3 rounded-lg font-semibold transition-colors"
        >
          {isActiveTab ? 'Open Chat' : 'View Ticket'}
        </button>
      )}
    </div>
    );
  };

  if (isLoading) {
    return (
      <Section className="pt-[12rem] -mt-[5.25rem] pb-12 flex-1" crosses crossesOffset="lg:translate-y-[5.25rem]" customPaddings>
        <div className="container relative z-2 flex items-center justify-center min-h-[600px]">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-[#10B981] border-t-transparent rounded-full animate-spin"></div>
            <p className="text-n-3">Loading requests...</p>
          </div>
        </div>
      </Section>
    );
  }

  return (
    <Section className="pt-[12rem] -mt-[5.25rem] pb-12 flex-1" crosses crossesOffset="lg:translate-y-[5.25rem]" customPaddings>
      <div className="container relative z-2">
        <Heading
          className="md:max-w-md lg:max-w-2xl"
          title="My Requests"
          text="View active deals and completed ticket history"
        />

        {/* Tabs */}
        <div className="flex gap-4 mb-8 max-w-4xl mx-auto">
          <button
            onClick={() => setActiveTab('invitations')}
            className={`flex-1 py-3 px-6 rounded-lg font-semibold transition-all ${
              activeTab === 'invitations'
                ? 'bg-[#10B981] text-white shadow-lg shadow-[#10B981]/20'
                : 'bg-n-7 text-n-3 hover:bg-n-6 border border-n-6'
            }`}
          >
            Invitations {invitations.length > 0 && `(${invitations.length})`}
          </button>
          <button
            onClick={() => setActiveTab('my-tickets')}
            className={`flex-1 py-3 px-6 rounded-lg font-semibold transition-all ${
              activeTab === 'my-tickets'
                ? 'bg-[#10B981] text-white shadow-lg shadow-[#10B981]/20'
                : 'bg-n-7 text-n-3 hover:bg-n-6 border border-n-6'
            }`}
          >
            My Tickets {myTickets.length > 0 && `(${myTickets.length})`}
          </button>
          <button
            onClick={() => setActiveTab('active')}
            className={`flex-1 py-3 px-6 rounded-lg font-semibold transition-all ${
              activeTab === 'active'
                ? 'bg-[#10B981] text-white shadow-lg shadow-[#10B981]/20'
                : 'bg-n-7 text-n-3 hover:bg-n-6 border border-n-6'
            }`}
          >
            Active {activeTickets.length > 0 && `(${activeTickets.length})`}
          </button>
        </div>

        {/* Content */}
        <div className="max-w-4xl mx-auto">
          {activeTab === 'invitations' && (
            <div>
              {invitations.length === 0 ? (
                <div className="text-center py-20">
                  <p className="text-n-3 mb-4">No pending invitations</p>
                </div>
              ) : (
                <>
                  {/* Navigation buttons at top */}
                  {invitations.length > 1 && (
                    <div className="flex items-center justify-between mb-4">
                      <button
                        onClick={() => setInvitationIndex(Math.max(0, invitationIndex - 1))}
                        disabled={invitationIndex === 0}
                        className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                          invitationIndex === 0
                            ? 'bg-n-7 text-n-5 cursor-not-allowed'
                            : 'bg-n-7 text-n-3 hover:bg-[#10B981] hover:text-white'
                        }`}
                      >
                        Previous
                      </button>
                      <span className="text-n-3 text-sm">
                        Invitation {invitationIndex + 1} of {invitations.length}
                      </span>
                      <button
                        onClick={() => setInvitationIndex(Math.min(invitations.length - 1, invitationIndex + 1))}
                        disabled={invitationIndex === invitations.length - 1}
                        className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                          invitationIndex === invitations.length - 1
                            ? 'bg-n-7 text-n-5 cursor-not-allowed'
                            : 'bg-n-7 text-n-3 hover:bg-[#10B981] hover:text-white'
                        }`}
                      >
                        Next
                      </button>
                    </div>
                  )}
                  
                  {/* Show only current invitation */}
                  <TicketInvitationCard
                    key={invitations[invitationIndex]._id}
                    ticket={invitations[invitationIndex]}
                    onRespond={(action) => handleRespondToInvitation(invitations[invitationIndex].ticketId, action)}
                  />
                  
                  {/* Navigation buttons at bottom */}
                  {invitations.length > 1 && (
                    <div className="flex items-center justify-between mt-4">
                      <button
                        onClick={() => setInvitationIndex(Math.max(0, invitationIndex - 1))}
                        disabled={invitationIndex === 0}
                        className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                          invitationIndex === 0
                            ? 'bg-n-7 text-n-5 cursor-not-allowed'
                            : 'bg-n-7 text-n-3 hover:bg-[#10B981] hover:text-white'
                        }`}
                      >
                        Previous
                      </button>
                      <span className="text-n-3 text-sm">
                        Invitation {invitationIndex + 1} of {invitations.length}
                      </span>
                      <button
                        onClick={() => setInvitationIndex(Math.min(invitations.length - 1, invitationIndex + 1))}
                        disabled={invitationIndex === invitations.length - 1}
                        className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                          invitationIndex === invitations.length - 1
                            ? 'bg-n-7 text-n-5 cursor-not-allowed'
                            : 'bg-n-7 text-n-3 hover:bg-[#10B981] hover:text-white'
                        }`}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'my-tickets' && (
            <div>
              {myTickets.length === 0 ? (
                <div className="text-center py-20">
                  <p className="text-n-3 mb-2">No completed tickets yet</p>
                  <p className="text-xs text-n-4 mb-4">Finished tickets will appear here</p>
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="px-6 py-3 bg-[#10B981] hover:bg-[#059669] text-white rounded-lg transition-colors"
                  >
                    Create Ticket
                  </button>
                </div>
              ) : (
                <>
                  {/* Top Pagination */}
                  <PaginationControls 
                    currentPage={myTicketsPage}
                    totalItems={myTickets.length}
                    onPageChange={setMyTicketsPage}
                  />
                  
                  {/* Tickets Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {getPaginatedItems(myTickets, myTicketsPage).map(ticket => 
                      renderTicketCard(ticket, false, false, true)
                    )}
                  </div>
                  
                  {/* Bottom Pagination */}
                  <PaginationControls 
                    currentPage={myTicketsPage}
                    totalItems={myTickets.length}
                    onPageChange={setMyTicketsPage}
                  />
                </>
              )}
            </div>
          )}

          {activeTab === 'active' && (
            <div>
              {activeTickets.length === 0 ? (
                <div className="text-center py-20">
                  <p className="text-n-3 mb-4">No active deals</p>
                </div>
              ) : (
                <>
                  {/* Top Pagination */}
                  <PaginationControls 
                    currentPage={activeTicketsPage}
                    totalItems={activeTickets.length}
                    onPageChange={setActiveTicketsPage}
                  />
                  
                  {/* Tickets Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {getPaginatedItems(activeTickets, activeTicketsPage).map(ticket => 
                      renderTicketCard(ticket, false, true, false)
                    )}
                  </div>
                  
                  {/* Bottom Pagination */}
                  <PaginationControls 
                    currentPage={activeTicketsPage}
                    totalItems={activeTickets.length}
                    onPageChange={setActiveTicketsPage}
                  />
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create Trade Modal */}
      <CreateTradeModal 
        isOpen={showCreateModal} 
        onClose={() => {
          setShowCreateModal(false);
          fetchTickets(); // Refresh tickets after creating
        }} 
      />
    </Section>
  );
};

export default MyRequests;
