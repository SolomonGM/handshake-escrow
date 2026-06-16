import { useLocation, useNavigate } from 'react-router-dom';
import Button from './Button';
import { cryptocoins, file02, grid, handshakeSymbol, searchMd } from '../assets';

const NotFound = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const requestedPath = `${location.pathname}${location.search || ''}`;

  const goBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/');
  };

  return (
    <section className="relative isolate flex min-h-[calc(100vh-4.75rem)] flex-1 items-center overflow-hidden bg-[linear-gradient(180deg,#0E0C15_0%,#12111C_48%,#0E0C15_100%)] px-5 py-12 lg:min-h-[calc(100vh-5.25rem)] lg:px-8">
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{ backgroundImage: `url(${grid})`, backgroundSize: '520px 520px' }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:56px_56px] opacity-25" />

      <div className="container relative z-1">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.92fr)_minmax(360px,0.7fr)]">
          <div className="max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-md border border-[#10B981]/30 bg-[#10B981]/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#10B981]">
              <img src={searchMd} alt="" className="h-4 w-4" />
              Route not found
            </div>

            <h1 className="text-[3rem] font-semibold leading-none text-n-1 sm:text-[4.5rem] lg:text-[6rem]">
              404
            </h1>
            <p className="mt-5 max-w-2xl text-xl font-semibold leading-8 text-n-1 sm:text-2xl">
              This Handshake link does not point to an active page.
            </p>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-n-3 sm:text-base">
              The page may have moved, the address may be mistyped, or the route does not exist yet.
              Use Back to return to your previous screen or Home to restart from the main exchange page.
            </p>

            <div className="mt-5 max-w-2xl rounded-lg border border-n-6 bg-n-7/70 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-n-4">Requested path</p>
              <p className="mt-1 truncate font-mono text-sm text-n-2" title={requestedPath}>
                {requestedPath}
              </p>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button onClick={goBack} px="px-8">Back</Button>
              <Button href="/" white px="px-8">Home</Button>
            </div>
          </div>

          <div className="relative mx-auto aspect-square w-full max-w-[520px]">
            <div className="absolute inset-6 rounded-full border border-n-1/10 bg-n-7/60 shadow-[0_24px_90px_rgba(0,0,0,0.45)]" />
            <div className="absolute inset-0 rounded-full border border-[#10B981]/20" />
            <div className="absolute left-1/2 top-1/2 h-[64%] w-[64%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-n-1/10 bg-n-8/80" />

            <img
              src={cryptocoins}
              alt=""
              className="absolute left-1/2 top-[52%] w-[78%] -translate-x-1/2 -translate-y-1/2 object-contain opacity-95 drop-shadow-[0_24px_45px_rgba(0,0,0,0.45)]"
            />

            <div className="absolute left-1/2 top-1/2 flex h-28 w-28 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-n-1/10 bg-n-8/90 shadow-[0_18px_60px_rgba(0,0,0,0.5)] sm:h-32 sm:w-32">
              <img src={handshakeSymbol} alt="Handshake" className="h-16 w-16 sm:h-20 sm:w-20" />
            </div>

            <div className="absolute left-2 top-10 rounded-lg border border-n-5 bg-n-7/90 px-3 py-2 shadow-xl sm:left-8">
              <div className="flex items-center gap-2">
                <img src={file02} alt="" className="h-4 w-4 opacity-70" />
                <span className="font-mono text-xs text-n-2">route_miss</span>
              </div>
            </div>

            <div className="absolute bottom-8 right-2 rounded-lg border border-[#10B981]/30 bg-[#10B981]/10 px-3 py-2 text-xs font-semibold text-[#10B981] shadow-xl sm:right-8">
              Escrow secure
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default NotFound;
