import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminAPI } from '../services/api';
import Button from './Button';

const ModeratorPanel = () => {
  const [tickets, setTickets] = useState([]);
  const [ticketSearchTerm, setTicketSearchTerm] = useState('');
  const [debouncedTicketSearch, setDebouncedTicketSearch] = useState('');
  const [ticketsPage, setTicketsPage] = useState(1);
  const [ticketsTotalPages, setTicketsTotalPages] = useState(1);
  const [ticketsTotalCount, setTicketsTotalCount] = useState(0);
  const [ticketsRestricted, setTicketsRestricted] = useState(false);
  const [ticketStatusFilter, setTicketStatusFilter] = useState('all');
  const [ticketSortBy, setTicketSortBy] = useState('updatedAt');
  const [ticketSortOrder, setTicketSortOrder] = useState('desc');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const PAGE_SIZE = 25;
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTicketSearch(ticketSearchTerm.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [ticketSearchTerm]);

  const loadTickets = async () => {
    try {
      setLoading(true);
      const tradeTicketsData = await adminAPI.getTradeTickets({
        search: debouncedTicketSearch,
        page: ticketsPage,
        pageSize: PAGE_SIZE,
        status: ticketStatusFilter,
        sortBy: ticketSortBy,
        sortOrder: ticketSortOrder
      });
      setTickets(tradeTicketsData.tickets || []);
      setTicketsTotalPages(tradeTicketsData.totalPages || 1);
      setTicketsTotalCount(tradeTicketsData.totalCount || 0);
      setTicketsRestricted(Boolean(tradeTicketsData.restricted));
      if (tradeTicketsData.page && tradeTicketsData.page !== ticketsPage) {
        setTicketsPage(tradeTicketsData.page);
      }
    } catch (error) {
      setMessage('Error loading tickets: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, [debouncedTicketSearch, ticketsPage, ticketStatusFilter, ticketSortBy, ticketSortOrder]);

  const filteredTickets = tickets;

  const getTicketStatusStyle = (status) => {
    const styles = {
      open: 'bg-blue-500/20 text-blue-400',
      'in-progress': 'bg-emerald-500/20 text-emerald-400',
      'awaiting-close': 'bg-amber-500/20 text-amber-400',
      closing: 'bg-orange-500/20 text-orange-400',
      completed: 'bg-green-500/20 text-green-400',
      cancelled: 'bg-red-500/20 text-red-400',
      disputed: 'bg-purple-500/20 text-purple-400',
      refunded: 'bg-slate-500/20 text-slate-400'
    };
    return styles[status] || 'bg-n-5 text-n-3';
  };

  const renderPagination = ({ page, totalPages, totalCount, onPageChange }) => {
    if (totalPages <= 1) return null;
    return (
      <div className="mt-4 flex items-center justify-between">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            page <= 1
              ? 'bg-n-6 text-n-4 cursor-not-allowed'
              : 'bg-n-7 text-n-1 hover:bg-n-5'
          }`}
        >
          Previous
        </button>
        <div className="text-n-4 text-sm">
          Page <span className="text-n-1 font-semibold">{page}</span> of{' '}
          <span className="text-n-1 font-semibold">{totalPages}</span>
          {Number.isFinite(totalCount) && totalCount > 0 ? (
            <span className="ml-2 text-n-5">({totalCount} total)</span>
          ) : null}
        </div>
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            page >= totalPages
              ? 'bg-n-6 text-n-4 cursor-not-allowed'
              : 'bg-n-7 text-n-1 hover:bg-n-5'
          }`}
        >
          Next
        </button>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-n-3">Loading moderator panel...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="h3 text-[#10B981]">Moderator Panel</h2>
          <p className="text-n-4 text-sm">Review trade tickets and assist live</p>
        </div>
        <Button onClick={loadTickets}>Refresh Tickets</Button>
      </div>

      {message && (
        <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/50 text-red-400">
          {message}
        </div>
      )}

      <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <input
          type="text"
          placeholder="Search tickets by sender, receiver, or ticket ID..."
          value={ticketSearchTerm}
          onChange={(e) => {
            setTicketSearchTerm(e.target.value);
            setTicketsPage(1);
          }}
          className="w-full xl:col-span-2 px-4 py-3 bg-n-6 border border-n-6 rounded-lg text-n-1 placeholder-n-4 focus:outline-none focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] transition-all"
        />
        <select
          value={ticketStatusFilter}
          onChange={(e) => {
            setTicketStatusFilter(e.target.value);
            setTicketsPage(1);
          }}
          className="w-full px-4 py-3 bg-n-6 border border-n-6 rounded-lg text-n-1 focus:outline-none focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] transition-all"
        >
          <option value="all">All Statuses</option>
          <option value="open">Open</option>
          <option value="in-progress">In Progress</option>
          <option value="awaiting-close">Awaiting Close</option>
          <option value="closing">Closing</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="disputed">Disputed</option>
          <option value="refunded">Refunded</option>
        </select>
        <div className="flex gap-3 md:col-span-2">
          <select
            value={ticketSortBy}
            onChange={(e) => {
              setTicketSortBy(e.target.value);
              setTicketsPage(1);
            }}
            className="w-full px-4 py-3 bg-n-6 border border-n-6 rounded-lg text-n-1 focus:outline-none focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] transition-all"
          >
            <option value="updatedAt">Sort: Updated</option>
            <option value="createdAt">Sort: Created</option>
            <option value="status">Sort: Status</option>
            <option value="ticketId">Sort: Ticket ID</option>
            <option value="cryptocurrency">Sort: Coin</option>
          </select>
          <select
            value={ticketSortOrder}
            onChange={(e) => {
              setTicketSortOrder(e.target.value);
              setTicketsPage(1);
            }}
            className="px-4 py-3 bg-n-6 border border-n-6 rounded-lg text-n-1 focus:outline-none focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] transition-all"
          >
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>
        </div>
      </div>

      <div className="bg-n-6 rounded-lg border border-n-5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-n-7 border-b border-n-5">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Ticket ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Sender</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Receiver</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Crypto</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Updated</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-n-3 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-n-5">
              {filteredTickets.map((ticket) => (
                <tr key={ticket._id} className="hover:bg-n-7/50 transition-colors">
                  <td className="px-4 py-4 whitespace-nowrap text-xs text-n-2 font-mono">
                    {ticket.ticketId}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-n-1">
                    {ticket.sender?.username ? `@${ticket.sender.username}` : 'Pending'}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-n-1">
                    {ticket.receiver?.username ? `@${ticket.receiver.username}` : 'Pending'}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded text-xs font-semibold capitalize ${getTicketStatusStyle(ticket.status)}`}>
                      {ticket.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-n-2 uppercase">
                    {ticket.cryptocurrency}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-n-3">
                    {ticket.updatedAt ? new Date(ticket.updatedAt).toLocaleDateString() : 'N/A'}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <button
                      onClick={() => navigate(`/trade-ticket?ticketId=${encodeURIComponent(ticket.ticketId)}`)}
                      className="text-color-4 hover:text-color-4/80 text-sm font-semibold"
                    >
                      View Ticket
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {ticketsRestricted && !debouncedTicketSearch && ticketStatusFilter === 'all' && (
        <div className="mt-3 text-xs text-n-4">
          Showing the 10 most recent pages. Use search to access older tickets.
        </div>
      )}

      {renderPagination({
        page: ticketsPage,
        totalPages: ticketsTotalPages,
        totalCount: ticketsTotalCount,
        onPageChange: setTicketsPage
      })}

      {filteredTickets.length === 0 && (
        <div className="text-center py-8 text-n-4">
          No trade tickets found matching your search.
        </div>
      )}
    </div>
  );
};

export default ModeratorPanel;
