import { handshakeSymbol } from "../assets";
import { collabApps, collabText } from "../constants";
import Button from "./Button";
import Section from "./Section";
import { LeftCurve, RightCurve } from "./design/BlockchainVerification";

const proofPoints = [
  "Real-time tracking",
  "Full transparency",
  "Multi-chain support",
  "Explorer-backed proof",
];

const BlockchainVerification = () => {
  return (
    <Section className="overflow-hidden" crosses id="how-to-verify">
      <div className="container relative z-2">
        <div className="pointer-events-none absolute left-1/2 top-16 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-radial-gradient from-[#10B981]/12 to-transparent blur-2xl" />

        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div className="relative overflow-hidden rounded-3xl border border-n-1/10 bg-n-8/70 p-6 backdrop-blur md:p-8 lg:p-10">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#10B981]/70 to-transparent" />
            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-[#10B981]/10 px-3 py-1.5 text-xs font-code font-bold uppercase tracking-wider text-[#6EE7B7]">
              <span className="h-2 w-2 rounded-full bg-[#10B981]" />
              On-chain verification
            </div>

            <h2 className="h2 mb-5">
              Trade across 8+ major blockchain networks seamlessly
            </h2>

            <p className="body-2 mb-8 text-n-3">{collabText}</p>

            <div className="mb-9 grid gap-3 sm:grid-cols-2">
              {proofPoints.map((point) => (
                <div
                  key={point}
                  className="flex items-center gap-3 rounded-2xl border border-n-1/10 bg-n-7/40 px-4 py-3"
                >
                  <div className="h-2.5 w-2.5 rounded-full bg-[#10B981] shadow-[0_0_12px_rgba(16,185,129,0.75)]" />
                  <span className="body-2 text-n-2">{point}</span>
                </div>
              ))}
            </div>

            <Button href="/trade-hub">Try it now</Button>
          </div>

          <div className="relative">
            <p className="body-2 mx-auto mb-10 max-w-[32rem] text-center text-n-3 lg:mb-12">
              Each completed trade can be checked against public infrastructure,
              so users can verify funds, confirmations, and status outside the
              app.
            </p>

            <div className="relative left-1/2 flex w-[19rem] aspect-square -translate-x-1/2 rounded-full border border-n-1/10 bg-n-8/50 shadow-[0_30px_100px_rgba(0,0,0,0.35)] backdrop-blur sm:w-[22rem]">
              <div className="m-auto flex w-52 aspect-square rounded-full border border-n-1/10 bg-n-7/25 sm:w-60">
                <div className="m-auto w-[6rem] aspect-square rounded-full bg-conic-gradient p-[0.2rem] shadow-[0_0_50px_rgba(16,185,129,0.18)]">
                  <div className="flex h-full w-full items-center justify-center rounded-full bg-n-8">
                    <img
                      src={handshakeSymbol}
                      width={48}
                      height={48}
                      alt="Handshake"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                </div>
              </div>

              <ul>
                {collabApps.map((app, index) => (
                  <li
                    key={app.id}
                    className={`absolute top-0 left-1/2 h-1/2 -ml-[1.6rem] origin-bottom rotate-${
                      index * 45
                    }`}
                  >
                    <a
                      href={app.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`relative -top-[1.6rem] flex h-[3.2rem] w-[3.2rem] rounded-xl border border-n-1/10 bg-n-7 shadow-lg transition-all hover:-translate-y-1 hover:border-[#10B981]/40 hover:bg-n-6 -rotate-${
                        index * 45
                      }`}
                      title={app.title}
                    >
                      <img
                        className="m-auto"
                        width={app.width}
                        height={app.height}
                        alt={app.title}
                        src={app.icon}
                        loading="lazy"
                        decoding="async"
                      />
                    </a>
                  </li>
                ))}
              </ul>

              <LeftCurve />
              <RightCurve />
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
};

export default BlockchainVerification;
