import PropTypes from 'prop-types';
import { grid, handshakeSymbol } from '../assets';

const sizeClasses = {
  page: 'min-h-[45vh] px-5 py-16',
  section: 'min-h-[320px] px-5 py-12',
  panel: 'min-h-[220px] px-5 py-10'
};

const LoadingState = ({
  label = 'Loading Handshake',
  detail = 'Preparing your secure exchange workspace.',
  variant = 'section',
  className = ''
}) => {
  const isPage = variant === 'page';

  return (
    <div
      className={`relative isolate flex items-center justify-center overflow-hidden rounded-none bg-[linear-gradient(180deg,#0E0C15_0%,#12111C_50%,#0E0C15_100%)] ${sizeClasses[variant] || sizeClasses.section} ${className}`}
      role="status"
      aria-live="polite"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{ backgroundImage: `url(${grid})`, backgroundSize: isPage ? '520px 520px' : '420px 420px' }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:48px_48px] opacity-25" />

      <div className="relative z-1 flex w-full max-w-md flex-col items-center text-center">
        <div className="relative mb-6 flex h-28 w-28 items-center justify-center sm:h-32 sm:w-32">
          <div className="absolute inset-0 rounded-full border border-[#10B981]/25 bg-[#10B981]/5" />
          <div className="absolute inset-3 animate-spin rounded-full border border-transparent border-t-[#10B981] border-r-[#10B981]/40" />
          <div className="absolute inset-5 rounded-full border border-n-1/10 bg-n-8/90 shadow-[0_18px_60px_rgba(0,0,0,0.45)]" />
          <img src={handshakeSymbol} alt="Handshake" className="relative h-14 w-14 sm:h-16 sm:w-16" />
        </div>

        <div className="mb-4 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#10B981] animate-pulse" />
          <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]/70 animate-pulse [animation-delay:120ms]" />
          <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]/40 animate-pulse [animation-delay:240ms]" />
        </div>

        <p className="font-code text-xs font-semibold uppercase tracking-wider text-[#10B981]">
          {label}
        </p>
        {detail ? (
          <p className="mt-3 max-w-sm text-sm leading-6 text-n-3">
            {detail}
          </p>
        ) : null}
      </div>
    </div>
  );
};

LoadingState.propTypes = {
  label: PropTypes.string,
  detail: PropTypes.string,
  variant: PropTypes.oneOf(['page', 'section', 'panel']),
  className: PropTypes.string
};

export default LoadingState;
