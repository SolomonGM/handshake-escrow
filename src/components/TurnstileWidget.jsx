import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';

const TURNSTILE_SCRIPT_ID = 'cloudflare-turnstile-script';
const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let turnstileScriptPromise = null;

const loadTurnstileScript = () => {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Turnstile is only available in the browser'));
  }

  if (window.turnstile) {
    return Promise.resolve(window.turnstile);
  }

  if (turnstileScriptPromise) {
    return turnstileScriptPromise;
  }

  turnstileScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById(TURNSTILE_SCRIPT_ID);
    if (existingScript) {
      if (window.turnstile) {
        resolve(window.turnstile);
        return;
      }

      existingScript.addEventListener('load', () => resolve(window.turnstile), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Failed to load Turnstile script')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = TURNSTILE_SCRIPT_ID;
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.turnstile) {
        resolve(window.turnstile);
        return;
      }

      reject(new Error('Turnstile script loaded but API is unavailable'));
    };
    script.onerror = () => reject(new Error('Failed to load Turnstile script'));
    document.head.appendChild(script);
  });

  return turnstileScriptPromise;
};

const TurnstileWidget = ({ siteKey, onTokenChange, onError, className }) => {
  const widgetContainerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const onTokenChangeRef = useRef(onTokenChange);
  const onErrorRef = useRef(onError);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    onTokenChangeRef.current = onTokenChange;
  }, [onTokenChange]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    let cancelled = false;

    const mountWidget = async () => {
      try {
        setLoadError('');
        const turnstile = await loadTurnstileScript();
        if (cancelled || !widgetContainerRef.current) {
          return;
        }

        widgetIdRef.current = turnstile.render(widgetContainerRef.current, {
          sitekey: siteKey,
          callback: (token) => {
            onTokenChangeRef.current(String(token || ''));
          },
          'expired-callback': () => {
            onTokenChangeRef.current('');
          },
          'error-callback': () => {
            onTokenChangeRef.current('');
            const message = 'Security check failed to load. Please refresh and try again.';
            setLoadError(message);
            if (onErrorRef.current) {
              onErrorRef.current(message);
            }
          }
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message = 'Security check failed to load. Please refresh and try again.';
        setLoadError(message);
        if (onErrorRef.current) {
          onErrorRef.current(message);
        }
      }
    };

    mountWidget();

    return () => {
      cancelled = true;

      if (widgetIdRef.current !== null && window.turnstile?.remove) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
    };
  }, [siteKey]);

  return (
    <div className={className}>
      <div ref={widgetContainerRef} />
      {loadError && (
        <p className="text-xs text-color-3 mt-2">
          {loadError}
        </p>
      )}
    </div>
  );
};

TurnstileWidget.propTypes = {
  siteKey: PropTypes.string.isRequired,
  onTokenChange: PropTypes.func.isRequired,
  onError: PropTypes.func,
  className: PropTypes.string
};

TurnstileWidget.defaultProps = {
  onError: undefined,
  className: ''
};

export default TurnstileWidget;
