import { handshakeSymbol, check } from "../assets";
import { collabApps, collabContent, collabText } from "../constants";
import Button from "./Button";
import Section from "./Section";
import { LeftCurve, RightCurve } from "./design/BlockchainVerification";

const BlockchainVerification = () => {
  return (
    <Section crosses id="how-to-verify">
      <div className="container lg:flex">
        <div className="max-w-[25rem]">
          <h2 className="h2 mb-4 md:mb-8">
            Trade across 8+ major blockchain networks seamlessly
          </h2>

          <p className="body-2 mb-8 text-n-4">
            Our automated escrow system provides you with a unique transaction ID (TXN) for every trade. Use this ID on any of the blockchain explorers below to independently verify and track your funds, confirmations, and transaction status in real-time.
          </p>

          <div className="flex flex-wrap gap-4 mb-10">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-[#10B981] rounded-full"></div>
              <span className="body-2 text-n-3">Real-time tracking</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-[#10B981] rounded-full"></div>
              <span className="body-2 text-n-3">Full transparency</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-[#10B981] rounded-full"></div>
              <span className="body-2 text-n-3">Multi-chain support</span>
            </div>
          </div>

          <Button href="/trade-hub">Try it now</Button>
        </div>

        <div className="lg:ml-auto xl:w-[38rem] mt-4">
          <p className="body-2 mb-8 text-n-4 md:mb-16 lg:mb-32 lg:w-[22rem] lg:mx-auto">
            {collabText}
          </p>

          <div className="relative left-1/2 flex w-[22rem] aspect-square border border-n-6 rounded-full -translate-x-1/2 scale:75 md:scale-100">
            <div className="flex w-60 aspect-square m-auto border border-n-6 rounded-full">
              <div className="w-[6rem] aspect-square m-auto p-[0.2rem] bg-conic-gradient rounded-full">
                <div className="flex items-center justify-center w-full h-full bg-n-8 rounded-full">
                  <img
                    src={handshakeSymbol}
                    width={48}
                    height={48}
                    alt="brainwave"
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
                    className={`relative -top-[1.6rem] flex w-[3.2rem] h-[3.2rem] bg-n-7 border border-n-1/15 rounded-xl hover:bg-n-6 hover:border-n-1/25 transition-colors cursor-pointer -rotate-${
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
    </Section>
  );
};

export default BlockchainVerification;
