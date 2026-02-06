import { useState } from 'react';

const EmojiPicker = ({ onSelect, onClose }) => {
  const [activeCategory, setActiveCategory] = useState('smileys');

  const emojiCategories = {
    smileys: {
      name: 'Smileys & Emotion',
      emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴']
    },
    gestures: {
      name: 'Hand Gestures',
      emojis: ['👋', '🤚', '🖐', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏']
    },
    symbols: {
      name: 'Symbols',
      emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓']
    },
    crypto: {
      name: 'Crypto & Money',
      emojis: ['💰', '💴', '💵', '💶', '💷', '💸', '💳', '🪙', '💎', '⚖️', '🔒', '🔓', '🔐', '🔑', '🗝', '📈', '📉', '💹', '🚀', '🌙', '⭐', '✨', '💫', '🔥', '⚡']
    },
    objects: {
      name: 'Objects',
      emojis: ['🎮', '🎯', '🎲', '🎰', '🎳', '🎪', '🎨', '🎭', '🎬', '🎤', '🎧', '🎼', '🎹', '🥁', '🎷', '🎺', '🎸', '🪕', '🎻', '📱', '💻', '⌨️', '🖥', '🖨', '🖱', '🖲', '🕹', '🗜', '💾', '💿', '📀', '📼', '📷', '📸', '📹', '🎥', '📽', '🎞', '📞', '☎️', '📟', '📠', '📺', '📻', '🎙', '⏱', '⏲', '⏰', '🕰']
    }
  };

  return (
    <div className="absolute bottom-full left-0 mb-2 w-80 bg-n-7 border border-n-6 rounded-lg shadow-xl overflow-hidden z-50">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-n-6">
        <h4 className="text-n-1 font-semibold text-sm">Emojis</h4>
        <button onClick={onClose} className="text-n-4 hover:text-n-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Categories */}
      <div className="flex gap-1 p-2 border-b border-n-6 overflow-x-auto custom-scrollbar">
        {Object.entries(emojiCategories).map(([key, category]) => (
          <button
            key={key}
            onClick={() => setActiveCategory(key)}
            className={`px-3 py-1 rounded text-xs font-semibold whitespace-nowrap transition-colors ${
              activeCategory === key
                ? 'bg-color-4 text-n-8'
                : 'bg-n-6 text-n-3 hover:bg-n-5'
            }`}
          >
            {category.emojis[0]}
          </button>
        ))}
      </div>

      {/* Emoji Grid */}
      <div className="p-3 h-64 overflow-y-auto custom-scrollbar">
        <div className="grid grid-cols-8 gap-2">
          {emojiCategories[activeCategory].emojis.map((emoji, idx) => (
            <button
              key={idx}
              onClick={() => {
                onSelect(emoji);
                onClose();
              }}
              className="text-2xl hover:bg-n-6 rounded p-1 transition-colors"
              title={emoji}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default EmojiPicker;
