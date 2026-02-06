// Toast notification utility
let toastContainer = null;
let toastQueue = [];
let currentToast = null;

const getToastContainer = () => {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.style.cssText = 'position: fixed; top: 24px; right: 24px; z-index: 9999;';
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
};

const showNextToast = () => {
  if (toastQueue.length === 0) {
    currentToast = null;
    return;
  }

  const toast = toastQueue.shift();
  currentToast = toast;
  
  const container = getToastContainer();
  container.appendChild(toast.element);

  // Auto remove
  setTimeout(() => {
    removeToast(toast.element);
  }, toast.duration);
};

const removeToast = (element) => {
  element.style.animation = 'slideOutRight 0.3s ease-out forwards';
  setTimeout(() => {
    if (element.parentNode) {
      element.parentNode.removeChild(element);
    }
    showNextToast();
  }, 300);
};

const createToast = (message, type = 'info', duration = 3000) => {
  const typeStyles = {
    success: {
      gradient: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
      border: '#10B981',
      icon: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
      </svg>`
    },
    error: {
      gradient: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)',
      border: '#DC2626',
      icon: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>`
    },
    warning: {
      gradient: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
      border: '#F59E0B',
      icon: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>`
    },
    info: {
      gradient: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
      border: '#3B82F6',
      icon: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>`
    }
  };

  const style = typeStyles[type] || typeStyles.info;

  const toastElement = document.createElement('div');
  toastElement.style.cssText = `
    display: flex;
    align-items: center;
    gap: 12px;
    background: ${style.gradient};
    border: 2px solid ${style.border};
    border-radius: 12px;
    padding: 16px 20px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2);
    backdrop-filter: blur(8px);
    min-width: 300px;
    max-width: 500px;
    animation: slideInRight 0.3s ease-out forwards;
    margin-bottom: 12px;
  `;

  toastElement.innerHTML = `
    <div style="flex-shrink: 0; color: white;">
      ${style.icon}
    </div>
    <p style="color: white; font-weight: 500; font-size: 14px; flex: 1; margin: 0; line-height: 1.5;">
      ${message}
    </p>
    <button 
      style="flex-shrink: 0; color: white; background: transparent; border: none; cursor: pointer; padding: 0; display: flex; align-items: center; transition: opacity 0.2s;"
      onmouseover="this.style.opacity='0.8'"
      onmouseout="this.style.opacity='1'"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  `;

  const closeButton = toastElement.querySelector('button');
  closeButton.onclick = () => removeToast(toastElement);

  return { element: toastElement, duration };
};

// Add CSS animations if not already present
const addToastStyles = () => {
  if (document.getElementById('toast-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'toast-styles';
  style.textContent = `
    @keyframes slideInRight {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    
    @keyframes slideOutRight {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(400px);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
};

export const toast = {
  success: (message, duration = 3000) => {
    addToastStyles();
    const toastObj = createToast(message, 'success', duration);
    if (currentToast === null) {
      showNextToast();
    }
    toastQueue.push(toastObj);
    if (currentToast === null) {
      showNextToast();
    }
  },
  error: (message, duration = 4000) => {
    addToastStyles();
    const toastObj = createToast(message, 'error', duration);
    if (currentToast === null) {
      showNextToast();
    }
    toastQueue.push(toastObj);
    if (currentToast === null) {
      showNextToast();
    }
  },
  warning: (message, duration = 3500) => {
    addToastStyles();
    const toastObj = createToast(message, 'warning', duration);
    if (currentToast === null) {
      showNextToast();
    }
    toastQueue.push(toastObj);
    if (currentToast === null) {
      showNextToast();
    }
  },
  info: (message, duration = 3000) => {
    addToastStyles();
    const toastObj = createToast(message, 'info', duration);
    if (currentToast === null) {
      showNextToast();
    }
    toastQueue.push(toastObj);
    if (currentToast === null) {
      showNextToast();
    }
  }
};
