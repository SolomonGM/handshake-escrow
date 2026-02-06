import { useEffect, useState } from "react";

const BitcoinConfetti = ({ direction = "up", type = "buy" }) => {
  const [particles, setParticles] = useState([]);

  useEffect(() => {
    console.log('BitcoinConfetti rendered with:', { direction, type });
    // Create particles - mix of crypto symbols and +/- signs
    const newParticles = Array.from({ length: 30 }, (_, i) => {
      let particleType;
      let cryptoVariant = null;
      
      if (type === "both") {
        // For "both" type, mix all 4 types evenly
        const typeIndex = i % 4;
        if (typeIndex === 0) {
          particleType = "crypto";
          cryptoVariant = "bitcoin";
        } else if (typeIndex === 1) {
          particleType = "crypto";
          cryptoVariant = "ethereum";
        } else if (typeIndex === 2) {
          particleType = "symbol";
          cryptoVariant = "plus";
        } else {
          particleType = "symbol";
          cryptoVariant = "minus";
        }
      } else {
        // For buy/sell, alternate between crypto and symbol
        const isCrypto = i % 2 === 0;
        particleType = isCrypto ? "crypto" : "symbol";
      }
      
      return {
        id: i,
        left: Math.random() * 100,
        delay: 0, // No delay - all particles start together
        duration: 1.8 + Math.random() * 0.7,
        rotation: Math.random() * 360,
        size: particleType === "crypto" ? 20 + Math.random() * 15 : 25 + Math.random() * 15,
        type: particleType,
        cryptoVariant: cryptoVariant,
        horizontalOffset: (Math.random() - 0.5) * 300, // Random horizontal movement
      };
    });
    setParticles(newParticles);
    console.log('Created particles:', newParticles.length, 'Type:', type, 'Direction:', direction);
  }, [type, direction]);

  const renderBitcoin = (particle) => (
    <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-lg">
      <defs>
        <linearGradient id={`bitcoin-gradient-${particle.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: "#F7931A", stopOpacity: 1 }} />
          <stop offset="100%" style={{ stopColor: "#FFA500", stopOpacity: 1 }} />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="16" fill={`url(#bitcoin-gradient-${particle.id})`} />
      <path
        d="M 22.5 13.5 C 22.9 11.3 21.3 10.1 19 9.4 L 19.6 7 L 18 6.6 L 17.4 9 C 17 8.9 16.6 8.8 16.2 8.7 L 16.8 6.3 L 15.2 5.9 L 14.6 8.3 C 14.3 8.2 13.9 8.2 13.6 8.1 L 13.6 8.1 L 11.5 7.6 L 11.1 9.3 C 11.1 9.3 12.3 9.6 12.3 9.6 C 12.9 9.7 13 10.1 13 10.4 L 12.3 13.1 C 12.4 13.1 12.4 13.1 12.5 13.2 L 12.3 13.1 L 11.3 17 C 11.2 17.3 11 17.6 10.5 17.5 C 10.5 17.5 9.3 17.2 9.3 17.2 L 8.6 19 L 10.6 19.5 C 10.9 19.6 11.2 19.6 11.6 19.7 L 11 22.1 L 12.6 22.5 L 13.2 20.1 C 13.6 20.2 14 20.3 14.4 20.4 L 13.8 22.8 L 15.4 23.2 L 16 20.8 C 18.9 21.3 21.1 21.1 22 18.5 C 22.7 16.5 22 15.3 20.5 14.6 C 21.6 14.3 22.3 13.6 22.5 13.5 Z M 19.2 17.3 C 18.7 19.3 15.2 18.2 14 17.9 L 14.8 14.6 C 16 14.9 19.7 15.2 19.2 17.3 Z M 19.7 13.5 C 19.2 15.3 16.4 14.4 15.4 14.2 L 16.1 11.2 C 17.1 11.4 20.2 11.6 19.7 13.5 Z"
        fill="white"
      />
    </svg>
  );

  const renderEthereum = (particle) => (
    <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-lg">
      <defs>
        <linearGradient id={`ethereum-gradient-${particle.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: "#627EEA", stopOpacity: 1 }} />
          <stop offset="100%" style={{ stopColor: "#8A9FF5", stopOpacity: 1 }} />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="16" fill={`url(#ethereum-gradient-${particle.id})`} />
      <g transform="translate(8, 4)">
        <polygon points="8,0 16,12 8,16" fill="white" fillOpacity="0.8" />
        <polygon points="8,0 0,12 8,16" fill="white" fillOpacity="0.6" />
        <polygon points="8,17.5 16,13.5 8,24" fill="white" fillOpacity="0.8" />
        <polygon points="8,17.5 0,13.5 8,24" fill="white" fillOpacity="0.6" />
      </g>
    </svg>
  );

  const renderPlusSign = (particle) => (
    <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-lg">
      <defs>
        <linearGradient id={`plus-gradient-${particle.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: "#10B981", stopOpacity: 1 }} />
          <stop offset="100%" style={{ stopColor: "#34D399", stopOpacity: 1 }} />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="16" fill={`url(#plus-gradient-${particle.id})`} />
      <path d="M 16 8 L 16 24 M 8 16 L 24 16" stroke="white" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );

  const renderMinusSign = (particle) => (
    <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-lg">
      <defs>
        <linearGradient id={`minus-gradient-${particle.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: "#EF4444", stopOpacity: 1 }} />
          <stop offset="100%" style={{ stopColor: "#F87171", stopOpacity: 1 }} />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="16" fill={`url(#minus-gradient-${particle.id})`} />
      <path d="M 8 16 L 24 16" stroke="white" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );

  return (
    <div className="fixed inset-0 pointer-events-none z-[10000] overflow-hidden">
      {particles.map((particle) => (
        <div
          key={particle.id}
          className={`absolute ${direction === "up" ? "bottom-0" : "top-0"}`}
          style={{
            left: `${particle.left}%`,
            animation: `confetti-${direction}-${particle.id} ${particle.duration}s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${particle.delay}s forwards`,
          }}
        >
          <div
            style={{
              width: `${particle.size}px`,
              height: `${particle.size}px`,
              animation: `confetti-spin ${particle.duration * 0.8}s linear infinite`,
            }}
          >
            {type === "both" ? (
              // For "both" type, use the specific variant
              particle.type === "crypto" ? (
                particle.cryptoVariant === "bitcoin" ? renderBitcoin(particle) : renderEthereum(particle)
              ) : (
                particle.cryptoVariant === "plus" ? renderPlusSign(particle) : renderMinusSign(particle)
              )
            ) : (
              // For buy/sell, use original logic
              particle.type === "crypto" ? (
                type === "buy" ? renderBitcoin(particle) : renderEthereum(particle)
              ) : (
                type === "buy" ? renderPlusSign(particle) : renderMinusSign(particle)
              )
            )}
          </div>
        </div>
      ))}
      <style>
        {particles.map((particle) => `
          @keyframes confetti-${direction}-${particle.id} {
            0% {
              transform: translateY(0) translateX(0) scale(0.3);
              opacity: 0;
            }
            10% {
              opacity: 1;
              transform: translateY(${direction === "up" ? "-10vh" : "10vh"}) translateX(${particle.horizontalOffset * 0.1}px) scale(1);
            }
            90% {
              opacity: 1;
            }
            100% {
              transform: translateY(${direction === "up" ? "-120vh" : "120vh"}) translateX(${particle.horizontalOffset}px) scale(0.8);
              opacity: 0;
            }
          }
        `).join('\n')}
        {`
          @keyframes confetti-spin {
            from {
              transform: rotate(0deg);
            }
            to {
              transform: rotate(360deg);
            }
          }
        `}
      </style>
    </div>
  );
};

export default BitcoinConfetti;
