import { useState, useEffect, useRef, useMemo } from 'react';
import PropTypes from 'prop-types';

const VirtualizedMessageList = ({ 
  messages, 
  renderMessage, 
  itemHeight = 80, 
  overscan = 5,
  containerHeight 
}) => {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef(null);

  // Calculate visible range
  const visibleRange = useMemo(() => {
    const visibleStart = Math.floor(scrollTop / itemHeight);
    const visibleEnd = Math.ceil((scrollTop + containerHeight) / itemHeight);
    
    return {
      start: Math.max(0, visibleStart - overscan),
      end: Math.min(messages.length, visibleEnd + overscan)
    };
  }, [scrollTop, containerHeight, itemHeight, messages.length, overscan]);

  // Get visible messages
  const visibleMessages = useMemo(() => {
    return messages.slice(visibleRange.start, visibleRange.end);
  }, [messages, visibleRange]);

  // Total height of all messages
  const totalHeight = messages.length * itemHeight;

  // Offset for visible messages
  const offsetY = visibleRange.start * itemHeight;

  // Handle scroll
  const handleScroll = (e) => {
    setScrollTop(e.target.scrollTop);
    // Pass scroll event to parent if needed
    if (containerRef.current?.onScroll) {
      containerRef.current.onScroll(e);
    }
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="overflow-y-auto custom-scrollbar"
      style={{ height: containerHeight }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {visibleMessages.map((message, index) => (
            <div
              key={message.id}
              style={{ 
                height: itemHeight,
                position: 'relative'
              }}
            >
              {renderMessage(message, visibleRange.start + index)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

VirtualizedMessageList.propTypes = {
  messages: PropTypes.array.isRequired,
  renderMessage: PropTypes.func.isRequired,
  itemHeight: PropTypes.number,
  overscan: PropTypes.number,
  containerHeight: PropTypes.number.isRequired
};

export default VirtualizedMessageList;
