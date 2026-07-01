const DEFAULT_WELCOME_URL = 'https://odin-welcome.openwebweb4.workers.dev';

function stripProtocol(url) {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function hostFromOriginDns(originDns) {
  if (!originDns) return null;
  const host = originDns.split(':')[0];
  return host || null;
}

function detectPublicHost() {
  if (process.env.PEER_HOST) return process.env.PEER_HOST;

  if (process.env.RENDER_EXTERNAL_HOSTNAME) return process.env.RENDER_EXTERNAL_HOSTNAME;
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return process.env.RAILWAY_PUBLIC_DOMAIN;
  if (process.env.FLY_APP_NAME) return `${process.env.FLY_APP_NAME}.fly.dev`;
  if (process.env.HEROKU_APP_NAME) return `${process.env.HEROKU_APP_NAME}.herokuapp.com`;
  if (process.env.VERCEL_URL) return stripProtocol(process.env.VERCEL_URL);

  const fromOrigin = hostFromOriginDns(process.env.ORIGIN_DNS);
  if (fromOrigin) return fromOrigin;

  return null;
}

function isPublicHost(host) {
  if (!host) return false;
  const h = host.toLowerCase();
  return h !== 'localhost' && h !== '127.0.0.1' && !h.endsWith('.local') && h !== '0.0.0.0';
}

function resolveRegisterUrl() {
  if (process.env.PEER_REGISTER_URL) return process.env.PEER_REGISTER_URL;

  const welcomeBase =
    process.env.WELCOME_URL ||
    process.env.ODIN_WELCOME_URL ||
    DEFAULT_WELCOME_URL;

  return `${welcomeBase.replace(/\/$/, '')}/api/peers/register`;
}

function resolvePeerConfig() {
  if (process.env.PEER_AUTO_REGISTER === 'false' || process.env.PEER_AUTO_REGISTER === '0') {
    return { enabled: false, registerUrl: null, host: null, reason: 'PEER_AUTO_REGISTER=false' };
  }

  const registerUrl = resolveRegisterUrl();
  const host = detectPublicHost();

  if (!isPublicHost(host)) {
    return {
      enabled: false,
      registerUrl,
      host,
      reason: 'no public host detected (set PEER_HOST)',
    };
  }

  return { enabled: true, registerUrl, host };
}

module.exports = { resolvePeerConfig, DEFAULT_WELCOME_URL };
