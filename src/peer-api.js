const DEFAULT_ORIGIN = 'odin-lohs.onrender.com:3001';

async function handlePeerRoutes(req, res, parsed, { parseBody, json }) {
  const peerRegistry = require('./peer-registry');
  const { pickNearestPeer, formatPeer } = await import('../workers/shared/peers.js');

  if (parsed.pathname === '/api/config' && req.method === 'GET') {
    json(res, 200, { originDns: process.env.ORIGIN_DNS || DEFAULT_ORIGIN });
    return true;
  }

  if (parsed.pathname === '/api/peers/register' && req.method === 'POST') {
    const body = await parseBody(req);
    const id = peerRegistry.registerPeer(body);
    if (!id) {
      json(res, 400, { error: 'host required' });
      return true;
    }
    json(res, 200, { success: true, id });
    return true;
  }

  if (parsed.pathname === '/api/peers' && req.method === 'GET') {
    const peers = peerRegistry.listActivePeers();
    json(res, 200, {
      count: peers.length,
      peers: peers.map((p) => ({ host: p.host, port: p.port ?? 53 })),
    });
    return true;
  }

  if (parsed.pathname === '/api/nearest-peer' && req.method === 'GET') {
    const peers = peerRegistry.listActivePeers();
    const nearest = pickNearestPeer({ cf: {} }, peers);
    const result = formatPeer(nearest) || { endpoint: null };
    result.peerCount = peers.length;
    json(res, 200, result);
    return true;
  }

  return false;
}

module.exports = { handlePeerRoutes };
