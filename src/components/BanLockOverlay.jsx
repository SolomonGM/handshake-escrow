import PropTypes from 'prop-types';

const formatDateTime = (value) => {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString();
};

const BanLockOverlay = ({ banDetails }) => {
  if (!banDetails) {
    return null;
  }

  const {
    reason,
    issuedAt,
    expiresAt,
    isPermanent,
    bannedBy
  } = banDetails;

  const moderatorLabel = bannedBy?.username
    ? `@${bannedBy.username}`
    : (bannedBy?.userId ? `User ${bannedBy.userId}` : 'Staff');

  return (
    <div className="fixed inset-0 z-[200] bg-n-8/95 backdrop-blur-sm px-4 py-8">
      <div className="mx-auto flex min-h-full w-full max-w-2xl items-center justify-center">
        <div className="w-full overflow-hidden rounded-2xl border border-red-500/40 bg-gradient-to-b from-[#1b0d11] via-[#130f16] to-[#0d1017] shadow-[0_30px_100px_rgba(0,0,0,0.65)]">
          <div className="border-b border-red-500/30 bg-red-500/10 px-6 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-300">Account Restricted</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Your account is currently banned</h2>
          </div>

          <div className="space-y-4 px-6 py-6">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-n-4">Reason</p>
              <p className="mt-2 text-base text-n-1">{reason || 'No reason provided.'}</p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-n-4">Issued</p>
                <p className="mt-2 text-sm text-n-1">{formatDateTime(issuedAt)}</p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-n-4">Expires</p>
                <p className={`mt-2 text-sm font-semibold ${isPermanent ? 'text-red-300' : 'text-n-1'}`}>
                  {isPermanent ? 'Permanent (No expiration)' : formatDateTime(expiresAt)}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-n-4">Moderator</p>
              <p className="mt-2 text-sm text-n-1">{moderatorLabel}</p>
            </div>

            <p className="text-xs text-n-4">
              This restriction is enforced globally and blocks access to platform functionality until the ban is lifted.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

BanLockOverlay.propTypes = {
  banDetails: PropTypes.shape({
    reason: PropTypes.string,
    issuedAt: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
    expiresAt: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
    isPermanent: PropTypes.bool,
    bannedBy: PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
      userId: PropTypes.string,
      username: PropTypes.string
    })
  })
};

BanLockOverlay.defaultProps = {
  banDetails: null
};

export default BanLockOverlay;
