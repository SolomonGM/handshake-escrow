import axios from 'axios';

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TURNSTILE_TEST_SITE_KEY = '1x00000000000000000000AA';
const TURNSTILE_TEST_SECRET_KEY = '1x0000000000000000000000000000000AA';

const normalizeFlag = (value) => String(value || '').trim().toLowerCase();
const getNodeEnv = () => normalizeFlag(process.env.NODE_ENV);

const getConfiguredSiteKey = () => String(
  process.env.TURNSTILE_SITE_KEY || process.env.VITE_TURNSTILE_SITE_KEY || ''
).trim();
const getConfiguredSecretKey = () => String(process.env.TURNSTILE_SECRET_KEY || '').trim();

const getResolvedKeys = () => {
  const configuredSiteKey = getConfiguredSiteKey();
  const configuredSecretKey = getConfiguredSecretKey();
  const isProduction = getNodeEnv() === 'production';
  const hasAnyConfiguredKey = Boolean(configuredSiteKey || configuredSecretKey);

  // In non-production, default to Cloudflare's documented test keys only when neither key is set.
  if (!isProduction && !hasAnyConfiguredKey) {
    return {
      siteKey: TURNSTILE_TEST_SITE_KEY,
      secretKey: TURNSTILE_TEST_SECRET_KEY,
      usingTestKeys: true
    };
  }

  return {
    siteKey: configuredSiteKey,
    secretKey: configuredSecretKey,
    usingTestKeys: false
  };
};

const getTurnstileConfig = () => {
  const configuredFlag = normalizeFlag(process.env.TURNSTILE_ENABLED);
  const { siteKey, secretKey, usingTestKeys } = getResolvedKeys();
  const hasSiteKey = Boolean(siteKey);
  const hasSecretKey = Boolean(secretKey);

  if (configuredFlag === 'false') {
    return {
      enabled: false,
      ready: false,
      siteKey: hasSiteKey ? siteKey : null,
      secretKey,
      hasSiteKey,
      hasSecretKey,
      usingTestKeys
    };
  }

  if (configuredFlag === 'true') {
    return {
      enabled: true,
      ready: hasSiteKey && hasSecretKey,
      siteKey: hasSiteKey ? siteKey : null,
      secretKey,
      hasSiteKey,
      hasSecretKey,
      usingTestKeys
    };
  }

  // Auto-enable when secret key exists (including dev test key fallback).
  const enabled = hasSecretKey;
  return {
    enabled,
    ready: enabled && hasSiteKey,
    siteKey: hasSiteKey ? siteKey : null,
    secretKey,
    hasSiteKey,
    hasSecretKey,
    usingTestKeys
  };
};

export const isTurnstileEnabled = () => {
  return getTurnstileConfig().enabled;
};

export const getTurnstileClientConfig = () => {
  const turnstileConfig = getTurnstileConfig();

  return {
    enabled: turnstileConfig.enabled,
    ready: turnstileConfig.ready,
    provider: 'turnstile',
    mode: turnstileConfig.usingTestKeys ? 'test' : 'live',
    siteKey: turnstileConfig.siteKey
  };
};

export const verifyTurnstileToken = async ({ token, remoteIp }) => {
  const turnstileConfig = getTurnstileConfig();
  if (!turnstileConfig.enabled) {
    return {
      enabled: false,
      success: true
    };
  }

  if (!turnstileConfig.ready) {
    return {
      enabled: true,
      success: false,
      reason: 'turnstile_not_configured'
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
    payload.set('secret', turnstileConfig.secretKey);
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
      errorCodes: response.data?.['error-codes'] || [],
      mode: turnstileConfig.usingTestKeys ? 'test' : 'live'
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
