import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { currencyFlags } from "../assets/currencies";

const currencies = [
  { code: "usd", name: "US Dollar", flag: currencyFlags.usd, symbol: "$" },
  { code: "gbp", name: "British Pound", flag: currencyFlags.gbp, symbol: "£" },
  { code: "eur", name: "Euro", flag: currencyFlags.eur, symbol: "€" },
  { code: "jpy", name: "Japanese Yen", flag: currencyFlags.jpy, symbol: "¥" },
  { code: "cad", name: "Canadian Dollar", flag: currencyFlags.cad, symbol: "$" },
  { code: "aud", name: "Australian Dollar", flag: currencyFlags.aud, symbol: "$" },
  { code: "chf", name: "Swiss Franc", flag: currencyFlags.chf, symbol: "₣" },
  { code: "cny", name: "Chinese Yuan", flag: currencyFlags.cny, symbol: "¥" },
  { code: "inr", name: "Indian Rupee", flag: currencyFlags.inr, symbol: "₹" },
];

const CurrencySelector = ({ className, selectedCurrency, onCurrencyChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });
  const buttonRef = useRef(null);
  
  const currentCurrency = currencies.find(c => c.code === selectedCurrency) || currencies[1];

  const handleCurrencySelect = (currency) => {
    onCurrencyChange(currency.code);
    setIsOpen(false);
  };

  useEffect(() => {
    const updatePosition = () => {
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        setDropdownPosition({
          top: rect.bottom + 8,
          right: window.innerWidth - rect.right,
        });
      }
    };

    if (isOpen) {
      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [isOpen]);

  return (
    <div
      className={`${
        className || ""
      } flex items-center p-4 pr-6 bg-n-9/40 backdrop-blur border border-n-1/10 rounded-2xl gap-5 transition-all duration-300 hover:bg-transparent hover:border-transparent hover:backdrop-blur-none group`}
      onMouseEnter={() => !isOpen && setIsOpen(false)}
    >
      <div className="flex-1 transition-opacity duration-300 group-hover:opacity-0">
        <div className="mb-1 text-base font-semibold text-n-1">
          Currency Settings
        </div>
      </div>

        <div className="relative z-[100]">
          <button
            ref={buttonRef}
            onClick={() => setIsOpen(!isOpen)}
            onMouseEnter={() => setIsOpen(false)}
            className="flex items-center gap-2 px-4 py-2 bg-n-7 hover:bg-n-6 rounded-lg transition-all duration-300 border border-n-1/10 group-hover:opacity-100"
          >
            <img src={currentCurrency.flag} alt={currentCurrency.code} className="w-6 h-6 rounded object-cover" />
            <span className="text-n-1 font-semibold">{currentCurrency.code.toUpperCase()}</span>
            <svg
              className={`w-4 h-4 text-n-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {isOpen && createPortal(
            <div 
              className="fixed w-48 bg-n-8 border border-n-1/10 rounded-lg shadow-lg z-40 max-h-64 overflow-y-auto"
              style={{ 
                top: `${dropdownPosition.top}px`, 
                right: `${dropdownPosition.right}px` 
              }}
            >
              {currencies.map((currency) => (
                <button
                  key={currency.code}
                  onClick={() => handleCurrencySelect(currency)}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-n-7 transition-colors ${
                    currency.code === selectedCurrency ? 'bg-n-7' : ''
                  }`}
                >
                  <img src={currency.flag} alt={currency.code} className="w-8 h-8 rounded object-cover" />
                  <div className="flex-1 text-left">
                    <div className="text-n-1 font-semibold">{currency.code.toUpperCase()}</div>
                    <div className="text-xs text-n-3">{currency.name}</div>
                  </div>
                  {currency.code === selectedCurrency && (
                    <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))}
            </div>,
            document.body
          )}
        </div>
    </div>
  );
};

export default CurrencySelector;
