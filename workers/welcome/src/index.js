import { json } from '../../shared/utils.js';
import { listDynamicPeers, pickNearestPeer, formatPeer } from '../../shared/peers.js';

const DEFAULT_ORIGIN = 'origin.odin.dns:53';

function injectOrigin(html, originDns) {
  return html.replace(/\{\{ORIGIN_DNS\}\}/g, originDns);
}

async function handlePeerRegister(request, env) {
  if (!env.ODIN_PEERS) return json({ error: 'Peer registry not configured' }, 503);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const { host, port = 53, colo, lat, lon, id } = body;
  if (!host) return json({ error: 'host required' }, 400);
  const peerId = id || host.replace(/[^a-z0-9]/gi, '-');
  await env.ODIN_PEERS.put(
    `peer:${peerId}`,
    JSON.stringify({ host, port, colo, lat, lon, registeredAt: Date.now() }),
    { expirationTtl: 3600 }
  );
  return json({ success: true, id: peerId });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/nearest-peer' && request.method === 'GET') {
      const peers = await listDynamicPeers(env.ODIN_PEERS);
      const nearest = pickNearestPeer(request, peers);
      const result = formatPeer(nearest) || { endpoint: null };
      result.peerCount = peers.length;
      return json(result);
    }

    if (url.pathname === '/api/peers' && request.method === 'GET') {
      const peers = await listDynamicPeers(env.ODIN_PEERS);
      return json({ count: peers.length, peers: peers.map((p) => ({ host: p.host, port: p.port ?? 53 })) });
    }

    if (url.pathname === '/api/peers/register' && request.method === 'POST') {
      return handlePeerRegister(request, env);
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      const asset = await env.ASSETS.fetch(new URL('/index.html', request.url));
      if (!asset.ok) return asset;

      const originDns = env.ORIGIN_DNS || DEFAULT_ORIGIN;
      const html = injectOrigin(await asset.text(), originDns);

      return new Response(html, {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
