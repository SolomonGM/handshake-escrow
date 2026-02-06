import { useState } from "react";

const WidgetControls = ({ className, isDarkMode, onToggleDarkMode, onRefresh }) => {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    // Trigger widget refresh through parent component
    if (onRefresh) {
      onRefresh();
    }
    // Stop spinning animation after 1 second
    setTimeout(() => {
      setIsRefreshing(false);
    }, 1000);
  };

  return (
    <div
      className={`flex items-center justify-between h-[3.5rem] px-6 bg-n-8/80 rounded-[1.7rem] ${
        className || ""
      } text-base`}
    >
      {/* Refresh Button */}
      <button
        onClick={handleRefresh}
        disabled={isRefreshing}
        className="flex items-center gap-2 hover:opacity-80 transition-opacity disabled:opacity-50"
      >
        <svg
          className={`w-4 h-4 text-[#10B981] ${isRefreshing ? 'animate-spin' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
        <span className="text-n-3 text-sm">Refresh Prices</span>
      </button>

      {/* Dark Mode Toggle */}
      <button
        onClick={onToggleDarkMode}
        className="flex items-center gap-3 hover:opacity-80 transition-opacity"
      >
        {/* Sun Icon */}
        <svg
          className={`w-5 h-5 transition-colors ${
            !isDarkMode ? "text-yellow-400" : "text-n-4"
          }`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"
            clipRule="evenodd"
          />
        </svg>

        {/* Toggle Switch */}
        <div className="relative w-11 h-6 bg-n-6 rounded-full transition-colors">
          <div
            className={`absolute top-1 left-1 w-4 h-4 bg-n-1 rounded-full transition-transform ${
              isDarkMode ? "translate-x-5" : ""
            }`}
          />
        </div>

        {/* Moon Icon */}
        <svg
          className={`w-5 h-5 transition-colors ${
            isDarkMode ? "text-blue-400" : "text-n-4"
          }`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
        </svg>
      </button>
    </div>
  );
};

export default WidgetControls;
