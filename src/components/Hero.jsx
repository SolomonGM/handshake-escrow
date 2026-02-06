import { robot } from "../assets";
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

const Hero = () => {
  const parallaxRef = useRef(null);
  
  // Initialize dark mode from localStorage, default to true (dark mode)
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('coinGeckoDarkMode');
    return saved !== null ? JSON.parse(saved) : true;
  });
  
  // Initialize currency from localStorage, default to "gbp"
  const [selectedCurrency, setSelectedCurrency] = useState(() => {
    const saved = localStorage.getItem('selectedCurrency');
    return saved || "gbp";
  });

  // Widget refresh key to force re-render
  const [widgetKey, setWidgetKey] = useState(0);

  // Bitcoin confetti state - simple approach without queue
  const [activeConfetti, setActiveConfetti] = useState(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const confettiIdRef = useRef(0);

  // Function to refresh the widget
  const handleRefreshWidget = () => {
    setWidgetKey(prev => prev + 1);
  };

  // Function to trigger confetti with animation lock
  const triggerConfetti = (direction, type) => {
    // Don't trigger if animation is already running
    if (isAnimating) {
      console.log('Animation already running, ignoring click');
      return;
    }
    
    console.log('Triggering confetti:', { direction, type });
    setIsAnimating(true);
    
    // Create unique confetti instance
    const confettiId = confettiIdRef.current++;
    setActiveConfetti({ id: confettiId, direction, type });
    
    // Clear after animation completes
    setTimeout(() => {
      setActiveConfetti(null);
      setIsAnimating(false);
      console.log('Animation complete, ready for next click');
    }, 2200);
  };

  // Save dark mode preference to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('coinGeckoDarkMode', JSON.stringify(isDarkMode));
  }, [isDarkMode]);

  // Save currency preference to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('selectedCurrency', selectedCurrency);
  }, [selectedCurrency]);

  useEffect(() => {
    // Load CoinGecko coin list widget script
    const script = document.createElement('script');
    script.src = 'https://widgets.coingecko.com/gecko-coin-list-widget.js';
    script.async = true;
    document.body.appendChild(script);

    return () => {
      // Cleanup script on unmount
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  return (
    <Section
      className="pt-[12rem] -mt-[5.25rem]"
      crosses
      crossesOffset="lg:translate-y-[5.25rem]"
      customPaddings
      id="hero"
    >
      <div className="container relative" ref={parallaxRef}>
        <div className="relative z-1 max-w-[62rem] mx-auto text-center mb-[3.875rem] md:mb-20 lg:mb-[6.25rem]">
          <h1 className="h1 mb-6">
            Ultra-Secure Cryptocurreny Exchanges with {` `}
            <span className="inline-block relative">
              Handshake
            </span>
          </h1>
          <Button href="/trade-hub" white>
            Trade Hub
          </Button>
        </div>
        <div className="relative max-w-[23rem] mx-auto md:max-w-5xl xl:mb-24 overflow-visible">
          <div className="relative z-1 p-0.5 rounded-2xl bg-conic-gradient overflow-visible">
            <div className="relative bg-n-8 rounded-[1rem] overflow-visible">
              <div className="rounded-[0.9rem] overflow-hidden h-[510px] md:h-[500px] lg:h-[500px] flex items-stretch relative">
                <div className="w-full min-w-[300px] flex flex-col relative disable-widget-links" key={`${selectedCurrency}-${widgetKey}`}>
                  {/* CoinGecko Coin List Widget */}
                  {/* Key prop forces re-render when currency changes or refresh is triggered */}
                  <gecko-coin-list-widget 
                    locale="en" 
                    coin-ids="bitcoin,ethereum,tether,polygon-ecosystem-token,binancecoin,ripple,avalanche-2,solana,hyperliquid,cardano,litecoin" 
                    initial-currency={selectedCurrency}
                    dark-mode={isDarkMode ? "true" : "false"}
                    style={{ width: "100%", height: "100%", minHeight: "450px", pointerEvents: "none" }}
                  ></gecko-coin-list-widget>
                </div>

                <WidgetControls 
                  className="absolute left-4 right-4 bottom-5 md:left-1/2 md:right-auto md:bottom-8 md:w-[31rem] md:-translate-x-1/2 z-10"
                  isDarkMode={isDarkMode}
                  onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
                  onRefresh={handleRefreshWidget}
                />
              </div>

              <div className="absolute -left-[5.5rem] bottom-[7.5rem] hidden xl:block" style={{ zIndex: 100 }}>
                <ul className="flex px-1 py-1 bg-n-9/40 backdrop-blur border border-n-1/10 rounded-2xl">
                  {heroIcons.map((icon, index) => (
                    <li className="p-5" key={index}>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log('Button clicked:', index);
                          if (index === 0) {
                            console.log('Buy button - triggering up/buy');
                            triggerConfetti("up", "buy");
                          } else if (index === 2) {
                            console.log('Sell button - triggering down/sell');
                            triggerConfetti("down", "sell");
                          } else {
                            console.log('Other button clicked - no action');
                          }
                        }}
                        className={`transition-all duration-200 hover:scale-110 active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-n-9 ${
                          index === 0 ? "focus:ring-green-500/50" : 
                          index === 2 ? "focus:ring-red-500/50" : 
                          "focus:ring-n-1/20"
                        } rounded-lg cursor-pointer ${
                          isAnimating && (index === 0 || index === 2) ? "opacity-50 cursor-wait" : ""
                        }`}
                        disabled={isAnimating && (index === 0 || index === 2)}
                      >
                        <img 
                          src={icon} 
                          width={24} 
                          height={24} 
                          alt={index === 0 ? "Buy" : index === 2 ? "Sell" : `Icon ${index}`}
                          style={{ pointerEvents: 'none' }}
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <ScrollParallax isAbsolutelyPositioned>
                <div className="z-[9999]">
                  <CurrencySelector
                    className="hidden absolute -right-[5.5rem] bottom-[11rem] w-[20rem] xl:flex z-[9999]"
                    selectedCurrency={selectedCurrency}
                    onCurrencyChange={setSelectedCurrency}
                  />
                </div>
              </ScrollParallax>
            </div>

            <Gradient />
          </div>

          <BackgroundCircles />
        </div>

        <TransactionLiveFeed className="hidden relative z-10 mt-20 lg:block" />
      </div>

      <BottomLine />

      {/* Bitcoin Confetti Animation */}
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
