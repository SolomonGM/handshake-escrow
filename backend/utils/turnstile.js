import axios from 'axios';

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const normalizeFlag = (value) => String(value || '').trim().toLowerCase();

export const isTurnstileEnabled = () => {
  const configuredFlag = normalizeFlag(process.env.TURNSTILE_ENABLED);

  if (configuredFlag === 'true') {
    return true;
  }

  if (configuredFlag === 'false') {
    return false;
  }

  return Boolean(process.env.TURNSTILE_SECRET_KEY);
};

export const getTurnstileClientConfig = () => {
  const enabled = isTurnstileEnabled();
  const siteKey = String(process.env.TURNSTILE_SITE_KEY || process.env.VITE_TURNSTILE_SITE_KEY || '').trim();

  return {
    enabled,
    siteKey: siteKey || null
  };
};

export const verifyTurnstileToken = async ({ token, remoteIp }) => {
  const enabled = isTurnstileEnabled();
  if (!enabled) {
    return {
      enabled: false,
      success: true
    };
  }

  const secret = String(process.env.TURNSTILE_SECRET_KEY || '').trim();
  if (!secret) {
    return {
      enabled: true,
      success: false,
      reason: 'turnstile_secret_missing'
    };
  }

  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) {
    return {
      enabled: true,
      success: false,
      reason: 'turnstile_token_missing'
    };
  }

  try {
    const payload = new URLSearchParams();
    payload.set('secret', secret);
    payload.set('response', normalizedToken);

    if (remoteIp) {
      payload.set('remoteip', remoteIp);
    }

    const response = await axios.post(TURNSTILE_VERIFY_URL, payload.toString(), {
      timeout: 5000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    return {
      enabled: true,
      success: Boolean(response.data?.success),
      errorCodes: response.data?.['error-codes'] || []
    };
  } catch (error) {
    return {
      enabled: true,
      success: false,
      reason: 'turnstile_verify_request_failed',
      error
    };
  }
};
