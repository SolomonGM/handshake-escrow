import Button from "./Button";
import Section from "./Section";
import { BackgroundCircles, BottomLine, Gradient } from "./design/Hero";
import { heroIcons } from "../constants";
import { ScrollParallax } from "react-just-parallax";
import { useRef, useEffect, useState } from "react";
import WidgetControls from "./WidgetControls";
import CurrencySelector from "./CurrencySelector";
import TransactionLiveFeed from "./TransactionLiveFeed";
import BitcoinConfetti from "./BitcoinConfetti";
import { handshakeSymbol } from "../assets";
import btcLogo from "../assets/svg/bitcoin-btc-logo.png";
import ethLogo from "../assets/svg/ethereum-eth-logo.png";
import ltcLogo from "../assets/svg/litecoin-ltc-logo.png";
import solLogo from "../assets/svg/solana-sol-logo.png";
import usdtLogo from "../assets/svg/tether-usdt-logo.png";
import usdcLogo from "../assets/svg/usd-coin-usdc-logo.png";

const exchangeStats = [
  { value: "8+", label: "Networks" },
  { value: "24/7", label: "Live escrow" },
  { value: "P2P", label: "Private liquidity" },
];

const assetChips = [
  { symbol: "BTC", logo: btcLogo },
  { symbol: "ETH", logo: ethLogo },
  { symbol: "LTC", logo: ltcLogo },
  { symbol: "SOL", logo: solLogo },
  { symbol: "USDT", logo: usdtLogo },
  { symbol: "USDC", logo: usdcLogo },
];

const Hero = () => {
  const parallaxRef = useRef(null);

  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem("coinGeckoDarkMode");
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [selectedCurrency, setSelectedCurrency] = useState(() => {
    const saved = localStorage.getItem("selectedCurrency");
    return saved || "gbp";
  });

  const [widgetKey, setWidgetKey] = useState(0);
  const [activeConfetti, setActiveConfetti] = useState(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showDesktopFeed, setShowDesktopFeed] = useState(false);
  const confettiIdRef = useRef(0);

  const handleRefreshWidget = () => {
    setWidgetKey((prev) => prev + 1);
  };

  const triggerConfetti = (direction, type) => {
    if (isAnimating) {
      return;
    }

    setIsAnimating(true);
    const confettiId = confettiIdRef.current++;
    setActiveConfetti({ id: confettiId, direction, type });

    setTimeout(() => {
      setActiveConfetti(null);
      setIsAnimating(false);
    }, 2200);
  };

  useEffect(() => {
    localStorage.setItem("coinGeckoDarkMode", JSON.stringify(isDarkMode));
  }, [isDarkMode]);

  useEffect(() => {
    localStorage.setItem("selectedCurrency", selectedCurrency);
  }, [selectedCurrency]);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://widgets.coingecko.com/gecko-coin-list-widget.js";
    script.async = true;
    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const updateFeedVisibility = () => setShowDesktopFeed(mediaQuery.matches);

    updateFeedVisibility();
    mediaQuery.addEventListener("change", updateFeedVisibility);

    return () => {
      mediaQuery.removeEventListener("change", updateFeedVisibility);
    };
  }, []);

  return (
    <Section
      className="relative -mt-[5.25rem] overflow-hidden pt-[8.5rem] sm:pt-[9.5rem] lg:pt-[11rem] xl:pt-[12rem]"
      crosses
      crossesOffset="lg:translate-y-[5.25rem]"
      customPaddings
      id="hero"
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-0 h-[42rem] w-[72rem] -translate-x-1/2 rounded-full bg-radial-gradient from-[#0D5C3D]/30 via-[#0E0C15]/20 to-transparent blur-2xl" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#10B981]/50 to-transparent" />
        <div className="absolute left-0 top-[18rem] h-[26rem] w-full bg-[linear-gradient(115deg,transparent_0%,rgba(16,185,129,0.06)_35%,transparent_70%)]" />
      </div>

      <div className="container relative min-w-0" ref={parallaxRef}>
        <div className="relative z-2 grid min-w-0 gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center xl:gap-14">
          <div className="relative min-w-0 text-center lg:text-left">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#10B981]/25 bg-[#10B981]/10 px-4 py-2 text-xs font-code font-bold uppercase tracking-wider text-[#6EE7B7] shadow-[0_0_34px_rgba(16,185,129,0.16)]">
              <span className="h-2 w-2 rounded-full bg-[#10B981] shadow-[0_0_12px_rgba(16,185,129,0.9)]" />
              Live P2P crypto exchange
            </div>

            <h1 className="mx-auto mb-6 max-w-[calc(100vw_-_2.5rem)] text-[2.25rem] font-semibold leading-[2.8rem] sm:max-w-[44rem] sm:text-[2.5rem] sm:leading-[3.25rem] md:text-[2.75rem] md:leading-[3.75rem] lg:mx-0 lg:text-[3.25rem] lg:leading-[4.0625rem] xl:text-[3.75rem] xl:leading-[4.5rem]">
              <span className="block">Ultra-secure</span>
              <span className="block">crypto</span>
              <span className="block">exchanges</span>
              <span className="block">
                with{" "}
                <span className="relative inline-block">
                  Handshake
                  <span className="absolute -bottom-1 left-0 h-0.5 w-full bg-gradient-to-r from-transparent via-[#10B981] to-transparent" />
                </span>
              </span>
            </h1>

            <p className="body-1 mx-auto mb-8 max-w-[20rem] text-n-3 sm:max-w-[37rem] lg:mx-0">
              Swap major coins with private counterparties, automated escrow,
              live transaction visibility, and independent blockchain
              verification on every completed deal.
            </p>

            <div className="mb-8 flex flex-col items-center justify-center gap-4 sm:flex-row lg:justify-start">
              <Button href="/trade-hub" white>
                Open Trade Hub
              </Button>
              <a
                href="#recent-transactions"
                className="button inline-flex h-11 items-center justify-center rounded-full border border-n-1/10 bg-n-7/50 px-7 text-n-1 transition-all hover:border-[#10B981]/50 hover:bg-[#10B981]/10 hover:text-[#6EE7B7]"
              >
                View live deals
              </a>
            </div>

            <div className="mx-auto grid w-full max-w-[20rem] overflow-hidden rounded-2xl border border-n-1/10 bg-n-8/70 backdrop-blur sm:max-w-[34rem] sm:grid-cols-3 lg:mx-0">
              {exchangeStats.map((stat) => (
                <div
                  key={stat.label}
                  className="border-b border-n-1/10 px-3 py-4 text-center last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 sm:px-5"
                >
                  <div className="text-xl font-semibold text-n-1 sm:text-2xl">
                    {stat.value}
                  </div>
                  <div className="mt-1 text-[0.65rem] font-code uppercase tracking-wider text-n-4 sm:text-xs">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>

            <div className="mx-auto mt-6 flex max-w-[20rem] flex-wrap items-center justify-center gap-2 lg:mx-0 lg:max-w-none lg:justify-start">
              {assetChips.map((asset) => (
                <div
                  key={asset.symbol}
                  className="flex items-center gap-2 rounded-full border border-n-1/10 bg-n-7/50 px-3 py-2"
                >
                  <img
                    src={asset.logo}
                    alt={asset.symbol}
                    className="h-5 w-5 object-contain"
                  />
                  <span className="text-xs font-code font-bold text-n-2">
                    {asset.symbol}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative min-w-0">
            <div className="absolute -left-6 top-8 hidden rounded-2xl border border-n-1/10 bg-n-8/80 p-4 shadow-2xl backdrop-blur xl:block">
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#10B981]/15">
                  <img src={handshakeSymbol} alt="" className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-n-1">
                    Escrow active
                  </p>
                  <p className="text-xs text-n-4">Protected settlement</p>
                </div>
              </div>
              <div className="h-2 w-44 overflow-hidden rounded-full bg-n-6">
                <div className="h-full w-[76%] rounded-full bg-gradient-to-r from-[#0D5C3D] to-[#10B981]" />
              </div>
            </div>

            <div className="absolute -right-3 bottom-16 hidden rounded-2xl border border-n-1/10 bg-n-8/80 p-4 shadow-2xl backdrop-blur xl:block">
              <p className="mb-2 text-xs font-code uppercase tracking-wider text-n-4">
                Settlement route
              </p>
              <div className="flex items-center gap-2">
                {[btcLogo, usdtLogo, solLogo].map(
                  (logo, index) => (
                    <div
                      key={index}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-n-7 ring-2 ring-n-8"
                    >
                      <img src={logo} alt="" className="h-7 w-7 object-contain" />
                    </div>
                  )
                )}
                <span className="ml-1 text-sm font-semibold text-[#6EE7B7]">
                  verified
                </span>
              </div>
            </div>

            <div className="relative mx-auto w-[calc(100vw_-_2.5rem)] min-w-0 max-w-full overflow-visible sm:w-full sm:max-w-[23rem] md:max-w-5xl">
              <div className="relative z-1 overflow-visible rounded-[1.65rem] border border-[#10B981]/20 bg-conic-gradient p-0.5 shadow-[0_28px_100px_rgba(0,0,0,0.55)]">
                <div className="relative overflow-visible rounded-[1.45rem] bg-n-8">
                  <div className="flex items-center justify-between border-b border-n-1/10 px-4 py-3 sm:px-5">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#FF776F]" />
                      <span className="h-2.5 w-2.5 rounded-full bg-[#FFC876]" />
                      <span className="h-2.5 w-2.5 rounded-full bg-[#10B981]" />
                    </div>
                    <span className="hidden text-[0.65rem] font-code uppercase tracking-wider text-n-4 sm:inline sm:text-xs">
                      Market terminal
                    </span>
                  </div>

                  <div className="relative flex h-[510px] items-stretch overflow-hidden rounded-b-[1.35rem] md:h-[500px] lg:h-[500px]">
                    <div
                      className="disable-widget-links relative flex w-full min-w-[300px] flex-col"
                      key={`${selectedCurrency}-${widgetKey}`}
                    >
                      <gecko-coin-list-widget
                        locale="en"
                        coin-ids="bitcoin,ethereum,tether,polygon-ecosystem-token,binancecoin,ripple,avalanche-2,solana,hyperliquid,cardano,litecoin"
                        initial-currency={selectedCurrency}
                        dark-mode={isDarkMode ? "true" : "false"}
                        style={{
                          width: "100%",
                          height: "100%",
                          minHeight: "450px",
                          pointerEvents: "none",
                        }}
                      ></gecko-coin-list-widget>
                    </div>

                    <WidgetControls
                      className="absolute bottom-4 left-3 right-3 z-10 md:bottom-7 md:left-1/2 md:right-auto md:w-[31rem] md:-translate-x-1/2"
                      isDarkMode={isDarkMode}
                      onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
                      onRefresh={handleRefreshWidget}
                    />
                  </div>

                  <div
                    className="absolute -left-[3.4rem] bottom-[4.5rem] hidden xl:block group"
                    style={{ zIndex: 100 }}
                  >
                    <ul className="flex flex-col gap-2 rounded-2xl border border-n-1/10 bg-n-9/50 p-2 shadow-2xl backdrop-blur transition-all duration-300 group-hover:border-[#10B981]/30">
                      {heroIcons.map((icon, index) => (
                        <li key={index}>
                          <button
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              if (index === 0) {
                                triggerConfetti("up", "buy");
                              } else if (index === 2) {
                                triggerConfetti("down", "sell");
                              }
                            }}
                            className={`relative z-10 flex h-12 w-12 cursor-pointer items-center justify-center rounded-xl border border-n-1/10 bg-n-8/70 transition-all duration-200 hover:scale-110 hover:border-[#10B981]/40 active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-n-9 ${
                              index === 0
                                ? "focus:ring-green-500/50"
                                : index === 2
                                ? "focus:ring-red-500/50"
                                : "focus:ring-n-1/20"
                            } ${
                              isAnimating && (index === 0 || index === 2)
                                ? "cursor-wait opacity-50"
                                : ""
                            }`}
                            disabled={isAnimating && (index === 0 || index === 2)}
                          >
                            <img
                              src={icon}
                              width={24}
                              height={24}
                              alt={
                                index === 0
                                  ? "Buy"
                                  : index === 2
                                  ? "Sell"
                                  : `Icon ${index}`
                              }
                              style={{ pointerEvents: "none" }}
                            />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <ScrollParallax isAbsolutelyPositioned>
                    <div className="z-[9999]">
                      <CurrencySelector
                        className="absolute -right-[4.5rem] bottom-[11rem] z-[9999] hidden w-[20rem] xl:flex"
                        selectedCurrency={selectedCurrency}
                        onCurrencyChange={setSelectedCurrency}
                      />
                    </div>
                  </ScrollParallax>
                </div>

                <Gradient />
              </div>

              <BackgroundCircles parallaxRef={parallaxRef} />
            </div>
          </div>
        </div>

        {showDesktopFeed && (
          <TransactionLiveFeed className="relative z-10 mt-20" />
        )}
      </div>

      <BottomLine />

      {activeConfetti && (
        <BitcoinConfetti
          key={activeConfetti.id}
          direction={activeConfetti.direction}
          type={activeConfetti.type}
        />
      )}
    </Section>
  );
};

export default Hero;
