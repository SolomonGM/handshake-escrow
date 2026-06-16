import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminAPI } from '../services/api';
import Button from './Button';

const PAGE_SIZE = 10;

const ticketStatusOptions = [
  ['all', 'All Statuses'],
  ['open', 'Open'],
  ['in-progress', 'In Progress'],
  ['awaiting-close', 'Awaiting Close'],
  ['closing', 'Closing'],
  ['completed', 'Completed'],
  ['cancelled', 'Cancelled'],
  ['disputed', 'Disputed'],
  ['refunded', 'Refunded']
];

const ModeratorPanel = () => {
  const [overview, setOverview] = useState(null);
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
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTicketSearch(ticketSearchTerm.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [ticketSearchTerm]);

  const loadOverview = async () => {
    const overviewData = await adminAPI.getOverview();
    setOverview(overviewData);
  };

  const loadTickets = async ({ showLoading = true } = {}) => {
    try {
      if (showLoading) setLoading(true);
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
      setLastRefreshedAt(new Date());
    } catch (error) {
      setMessage('Error loading tickets: ' + (error.response?.data?.message || error.message));
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const refreshAll = async ({ showLoading = true } = {}) => {
    try {
      if (showLoading) setLoading(true);
      await Promise.all([loadOverview(), loadTickets({ showLoading: false })]);
      setLastRefreshedAt(new Date());
    } catch (error) {
      setMessage('Error loading moderator console: ' + (error.response?.data?.message || error.message));
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    refreshAll();
  }, []);

  useEffect(() => {
    if (loading) return;
    loadTickets({ showLoading: false });
  }, [debouncedTicketSearch, ticketsPage, ticketStatusFilter, ticketSortBy, ticketSortOrder]);

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

  const formatNumber = (value) => Number(value || 0).toLocaleString();
  const lastRefreshLabel = lastRefreshedAt
    ? lastRefreshedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'Not refreshed yet';

  const setQuickStatus = (status) => {
    setTicketStatusFilter(status);
    setTicketsPage(1);
  };

  const renderMetricCard = ({ label, value, detail, status, tone = 'neutral' }) => {
    const toneClass = {
      neutral: 'border-n-5 bg-n-7/70',
      green: 'border-[#10B981]/30 bg-[#10B981]/10',
      amber: 'border-amber-400/30 bg-amber-400/10',
      red: 'border-red-400/30 bg-red-400/10',
      purple: 'border-purple-400/30 bg-purple-400/10'
    }[tone] || 'border-n-5 bg-n-7/70';

    return (
      <button
        type="button"
        onClick={() => status && setQuickStatus(status)}
        className={`rounded-lg border p-4 text-left transition-colors hover:border-n-3 ${toneClass}`}
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-n-4">{label}</p>
        <p className="mt-3 text-2xl font-semibold text-n-1">{value}</p>
        <p className="mt-1 text-xs text-n-3">{detail}</p>
      </button>
    );
  };

  const renderPagination = ({ page, totalPages, totalCount, onPageChange }) => {
    if (totalPages <= 1) return null;
    return (
      <div className="mt-4 flex items-center justify-between">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            page <= 1 ? 'cursor-not-allowed bg-n-6 text-n-4' : 'bg-n-7 text-n-1 hover:bg-n-5'
          }`}
        >
          Previous
        </button>
        <div className="text-sm text-n-4">
          Page <span className="font-semibold text-n-1">{page}</span> of{' '}
          <span className="font-semibold text-n-1">{totalPages}</span>
          {Number.isFinite(totalCount) && totalCount > 0 ? (
            <span className="ml-2 text-n-5">({totalCount} total)</span>
          ) : null}
        </div>
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            page >= totalPages ? 'cursor-not-allowed bg-n-6 text-n-4' : 'bg-n-7 text-n-1 hover:bg-n-5'
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
        <div className="text-n-3">Loading moderator console...</div>
      </div>
    );
  }

  return (
    <div className="min-w-0 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 border-b border-n-6 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 inline-flex rounded-md border border-[#10B981]/30 bg-[#10B981]/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-[#10B981]">
            Staff Console
          </div>
          <h2 className="text-2xl font-semibold text-n-1 md:text-3xl">Moderator Operations</h2>
          <p className="mt-1 text-sm text-n-4">Live ticket queue, escalation review, and staff handoff context.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-n-4">Last refresh: <span className="text-n-2">{lastRefreshLabel}</span></span>
          <Button onClick={() => refreshAll({ showLoading: false })}>Refresh Queue</Button>
        </div>
      </div>

      {message && (
        <div className="mb-6 rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-400">
          {message}
        </div>
      )}

      <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {renderMetricCard({
          label: 'Open',
          value: formatNumber(overview?.tickets?.open),
          detail: 'New tickets waiting for progress',
          status: 'open',
          tone: 'green'
        })}
        {renderMetricCard({
          label: 'In Progress',
          value: formatNumber(overview?.tickets?.inProgress),
          detail: 'Active escrow workflows',
          status: 'in-progress',
          tone: 'neutral'
        })}
        {renderMetricCard({
          label: 'Awaiting Close',
          value: formatNumber(overview?.tickets?.awaitingClose),
          detail: 'Needs completion attention',
          status: 'awaiting-close',
          tone: 'amber'
        })}
        {renderMetricCard({
          label: 'Disputed',
          value: formatNumber(overview?.tickets?.disputed),
          detail: `${formatNumber(overview?.tickets?.recentlyUpdated)} tickets updated in 24h`,
          status: 'disputed',
          tone: overview?.tickets?.disputed ? 'red' : 'purple'
        })}
      </div>

      <div className="rounded-lg border border-n-5 bg-n-6">
        <div className="border-b border-n-5 px-5 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-base font-semibold text-n-1">Ticket Queue</h3>
              <p className="text-xs text-n-4">Search by ticket ID, sender, or receiver.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {['all', 'open', 'in-progress', 'awaiting-close', 'disputed'].map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setQuickStatus(status)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                    ticketStatusFilter === status
                      ? 'bg-n-1 text-n-8'
                      : 'bg-n-7 text-n-3 hover:bg-n-5 hover:text-n-1'
                  }`}
                >
                  {status.replaceAll('-', ' ')}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <input
              type="text"
              placeholder="Search tickets by sender, receiver, or ticket ID..."
              value={ticketSearchTerm}
              onChange={(event) => {
                setTicketSearchTerm(event.target.value);
                setTicketsPage(1);
              }}
              className="w-full rounded-lg border border-n-5 bg-n-7 px-4 py-3 text-n-1 placeholder-n-4 transition-all focus:border-[#10B981] focus:outline-none focus:ring-1 focus:ring-[#10B981] xl:col-span-2"
            />
            <select
              value={ticketStatusFilter}
              onChange={(event) => {
                setTicketStatusFilter(event.target.value);
                setTicketsPage(1);
              }}
              className="w-full rounded-lg border border-n-5 bg-n-7 px-4 py-3 text-n-1 transition-all focus:border-[#10B981] focus:outline-none focus:ring-1 focus:ring-[#10B981]"
            >
              {ticketStatusOptions.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <div className="flex gap-3 md:col-span-2">
              <select
                value={ticketSortBy}
                onChange={(event) => {
                  setTicketSortBy(event.target.value);
                  setTicketsPage(1);
                }}
                className="w-full rounded-lg border border-n-5 bg-n-7 px-4 py-3 text-n-1 transition-all focus:border-[#10B981] focus:outline-none focus:ring-1 focus:ring-[#10B981]"
              >
                <option value="updatedAt">Sort: Updated</option>
                <option value="createdAt">Sort: Created</option>
                <option value="status">Sort: Status</option>
                <option value="ticketId">Sort: Ticket ID</option>
                <option value="cryptocurrency">Sort: Coin</option>
              </select>
              <select
                value={ticketSortOrder}
                onChange={(event) => {
                  setTicketSortOrder(event.target.value);
                  setTicketsPage(1);
                }}
                className="rounded-lg border border-n-5 bg-n-7 px-4 py-3 text-n-1 transition-all focus:border-[#10B981] focus:outline-none focus:ring-1 focus:ring-[#10B981]"
              >
                <option value="desc">Desc</option>
                <option value="asc">Asc</option>
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px]">
            <thead className="border-b border-n-5 bg-n-7">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-n-3">Ticket ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-n-3">Sender</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-n-3">Receiver</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-n-3">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-n-3">Crypto</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-n-3">Updated</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-n-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-n-5">
              {tickets.map((ticket) => (
                <tr key={ticket._id} className="transition-colors hover:bg-n-7/50">
                  <td className="whitespace-nowrap px-4 py-4 font-mono text-xs text-n-2">{ticket.ticketId}</td>
                  <td className="max-w-[220px] whitespace-nowrap px-4 py-4 text-sm text-n-1">
                    <span className="block truncate" title={ticket.sender?.username ? `@${ticket.sender.username}` : 'Pending'}>
                      {ticket.sender?.username ? `@${ticket.sender.username}` : 'Pending'}
                    </span>
                  </td>
                  <td className="max-w-[220px] whitespace-nowrap px-4 py-4 text-sm text-n-1">
                    <span className="block truncate" title={ticket.receiver?.username ? `@${ticket.receiver.username}` : 'Pending'}>
                      {ticket.receiver?.username ? `@${ticket.receiver.username}` : 'Pending'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4">
                    <span className={`rounded px-2 py-1 text-xs font-semibold capitalize ${getTicketStatusStyle(ticket.status)}`}>
                      {ticket.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-sm uppercase text-n-2">{ticket.cryptocurrency}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-sm text-n-3">
                    {ticket.updatedAt ? new Date(ticket.updatedAt).toLocaleString() : 'N/A'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4">
                    <button
                      onClick={() => navigate(`/trade-ticket?ticketId=${encodeURIComponent(ticket.ticketId)}`)}
                      className="text-sm font-semibold text-color-4 hover:text-color-4/80"
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

      {tickets.length === 0 && (
        <div className="py-8 text-center text-n-4">No trade tickets found matching your filters.</div>
      )}
    </div>
  );
};

export default ModeratorPanel;
