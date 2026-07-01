var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../shared/utils.js
function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders }
  });
}
__name(json, "json");

// ../shared/peers.js
var COLO_COORDS = {
  EWR: [40.69, -74.17],
  SJC: [37.36, -121.93],
  IAD: [38.95, -77.46],
  ORD: [41.98, -87.9],
  DFW: [32.9, -97.04],
  LAX: [33.94, -118.41],
  AMS: [52.31, 4.77],
  LHR: [51.47, -0.46],
  FRA: [50.04, 8.56],
  CDG: [49.01, 2.55],
  MAD: [40.47, -3.57],
  WAW: [52.17, 20.97],
  SIN: [1.36, 103.99],
  NRT: [35.76, 140.39],
  SYD: [-33.95, 151.18],
  GRU: [-23.43, -46.47],
  MIA: [25.79, -80.29],
  SEA: [47.45, -122.31],
  ATL: [33.64, -84.43],
  DEN: [39.86, -104.67],
  HKG: [22.31, 113.91]
};
function haversineKm(lat1, lon1, lat2, lon2) {
  const r = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
__name(haversineKm, "haversineKm");
function visitorCoords(request) {
  const cf = request.cf || {};
  if (cf.latitude && cf.longitude) {
    return { lat: parseFloat(cf.latitude), lon: parseFloat(cf.longitude), colo: cf.colo };
  }
  if (cf.colo && COLO_COORDS[cf.colo]) {
    const [lat, lon] = COLO_COORDS[cf.colo];
    return { lat, lon, colo: cf.colo };
  }
  return { lat: null, lon: null, colo: cf.colo || null };
}
__name(visitorCoords, "visitorCoords");
function peerCoords(peer) {
  if (peer.lat != null && peer.lon != null) {
    return { lat: peer.lat, lon: peer.lon };
  }
  if (peer.colo && COLO_COORDS[peer.colo]) {
    const [lat, lon] = COLO_COORDS[peer.colo];
    return { lat, lon };
  }
  return null;
}
__name(peerCoords, "peerCoords");
async function listDynamicPeers(kv) {
  if (!kv)
    return [];
  const listed = await kv.list({ prefix: "peer:" });
  const peers = [];
  for (const key of listed.keys) {
    const raw = await kv.get(key.name);
    if (!raw)
      continue;
    try {
      const peer = JSON.parse(raw);
      if (peer.host)
        peers.push(peer);
    } catch {
    }
  }
  return peers;
}
__name(listDynamicPeers, "listDynamicPeers");
function pickNearestPeer(request, peers) {
  if (!peers.length)
    return null;
  const visitor = visitorCoords(request);
  if (visitor.colo) {
    const coloMatch = peers.find((p) => p.colo === visitor.colo);
    if (coloMatch)
      return { ...coloMatch, matchedBy: "colo", peerCount: peers.length };
  }
  if (visitor.lat != null && visitor.lon != null) {
    let best = null;
    let bestDist = Infinity;
    for (const peer of peers) {
      const coords = peerCoords(peer);
      if (!coords)
        continue;
      const dist = haversineKm(visitor.lat, visitor.lon, coords.lat, coords.lon);
      if (dist < bestDist) {
        bestDist = dist;
        best = peer;
      }
    }
    if (best) {
      return { ...best, matchedBy: "distance", distanceKm: Math.round(bestDist), peerCount: peers.length };
    }
  }
  return { ...peers[0], matchedBy: "fallback", peerCount: peers.length };
}
__name(pickNearestPeer, "pickNearestPeer");
function formatPeer(peer) {
  if (!peer)
    return null;
  const port = peer.port ?? 53;
  return {
    host: peer.host,
    port,
    endpoint: port === 53 ? `${peer.host}:53` : `${peer.host}:${port}`,
    matchedBy: peer.matchedBy,
    distanceKm: peer.distanceKm,
    peerCount: peer.peerCount
  };
}
__name(formatPeer, "formatPeer");

// src/index.js
var DEFAULT_ORIGIN = "origin.odin.dns:53";
function injectOrigin(html, originDns) {
  return html.replace(/\{\{ORIGIN_DNS\}\}/g, originDns);
}
__name(injectOrigin, "injectOrigin");
async function handlePeerRegister(request, env) {
  if (!env.ODIN_PEERS)
    return json({ error: "Peer registry not configured" }, 503);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const { host, port = 53, colo, lat, lon, id } = body;
  if (!host)
    return json({ error: "host required" }, 400);
  const peerId = id || host.replace(/[^a-z0-9]/gi, "-");
  await env.ODIN_PEERS.put(
    `peer:${peerId}`,
    JSON.stringify({ host, port, colo, lat, lon, registeredAt: Date.now() }),
    { expirationTtl: 3600 }
  );
  return json({ success: true, id: peerId });
}
__name(handlePeerRegister, "handlePeerRegister");
var src_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/nearest-peer" && request.method === "GET") {
      const peers = await listDynamicPeers(env.ODIN_PEERS);
      const nearest = pickNearestPeer(request, peers);
      const result = formatPeer(nearest) || { endpoint: null };
      result.peerCount = peers.length;
      return json(result);
    }
    if (url.pathname === "/api/peers" && request.method === "GET") {
      const peers = await listDynamicPeers(env.ODIN_PEERS);
      return json({ count: peers.length, peers: peers.map((p) => ({ host: p.host, port: p.port ?? 53 })) });
    }
    if (url.pathname === "/api/peers/register" && request.method === "POST") {
      return handlePeerRegister(request, env);
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const asset = await env.ASSETS.fetch(new URL("/index.html", request.url));
      if (!asset.ok)
        return asset;
      const originDns = env.ORIGIN_DNS || DEFAULT_ORIGIN;
      const html = injectOrigin(await asset.text(), originDns);
      return new Response(html, {
        headers: { "Content-Type": "text/html;charset=UTF-8" }
      });
    }
    return env.ASSETS.fetch(request);
  }
};
export {
  src_default as default
};
//# sourceMappingURL=index.js.map
